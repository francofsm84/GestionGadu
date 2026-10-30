// ============================================================
// GADU · create-payment-order (MercadoPago · Checkout Pro clásico)
// Genera una preferencia de pago (/checkout/preferences), guarda la
// fila en mercadopago_orders y devuelve el init_point para redirigir.
// ============================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const MP_ACCESS_TOKEN = Deno.env.get("MP_ACCESS_TOKEN") || "";
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";

  if (!MP_ACCESS_TOKEN) return json({ error: "MP_ACCESS_TOKEN no configurado" }, 500);

  try {
    const body = await req.json();
    const planId = String(body.planId || "");
    const periodo = String(body.periodo || "");
    const userEmail = String(body.userEmail || "");
    const amount = round2(Number(body.amount || 0));

    if (!planId || !periodo || !(amount > 0)) {
      return json({ error: "faltan planId, periodo o amount" }, 400);
    }

    // 1) Verificar el JWT del usuario para obtener su user_id
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "sin autorización" }, 401);
    const userRes = await fetch(SUPABASE_URL + "/auth/v1/user", {
      headers: { Authorization: "Bearer " + token, apikey: SUPABASE_ANON_KEY },
    });
    if (!userRes.ok) return json({ error: "sin autorización" }, 401);
    const user = await userRes.json();
    const userId = String(user.id || "");
    if (!userId) return json({ error: "usuario no identificado" }, 401);

    // 2) Sandbox: forzar email de prueba @testuser.com
    const isSandbox = MP_ACCESS_TOKEN.startsWith("TEST-");
    const payerEmail = isSandbox
      ? "test_user_" + crypto.randomUUID().replace(/-/g, "") + "@testuser.com"
      : (userEmail || "cliente@example.com");

    // external_reference: user_id_planId_periodo (para el webhook)
    const external_reference = (userId + "_" + planId + "_" + periodo)
      .replace(/[^a-zA-Z0-9_-]/g, "")
      .slice(0, 64);

    const itemTitle = "Plan GADU " + planId.charAt(0).toUpperCase() + planId.slice(1) + " (" + periodo.charAt(0).toUpperCase() + periodo.slice(1) + ")";
    const origin = String(req.headers.get("Origin") || req.headers.get("origin") || "https://gestiongadu.vercel.app").replace(/\/$/, "");

    const mpBody = {
      items: [{
        title: itemTitle,
        quantity: 1,
        unit_price: amount,
        currency_id: "ARS",
      }],
      payer: { email: payerEmail },
      back_urls: {
        success: origin + "/#/planes",
        failure: origin + "/#/planes",
        pending: origin + "/#/planes",
      },
      auto_return: "approved",
      external_reference,
      notification_url: SUPABASE_URL + "/functions/v1/mercadopago-webhook",
    };

    console.log("[create-payment-order] POST /checkout/preferences body:", JSON.stringify(mpBody));

    // 3) Crear la preferencia (Checkout Pro clásico)
    const mpRes = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + MP_ACCESS_TOKEN,
      },
      body: JSON.stringify(mpBody),
    });

    const mpText = await mpRes.text();
    let mp: Record<string, unknown> = {};
    try { mp = JSON.parse(mpText); } catch { mp = { raw: mpText }; }

    console.log("[create-payment-order] MP response status:", mpRes.status);
    console.log("[create-payment-order] MP response body:", mpText.slice(0, 1500));

    if (!mpRes.ok || !mp.id) {
      const cause = Array.isArray(mp.cause)
        ? mp.cause.map((c: any) => String(c.description || c.code || "")).filter(Boolean).join("; ")
        : "";
      const msg = String(mp.message || mp.error || ("HTTP " + mpRes.status)) + (cause ? " · " + cause : "");
      console.error("[create-payment-order] MP error completo:", mpText.slice(0, 1500));
      return json({ error: "MercadoPago: " + msg, detail: mp }, 502);
    }

    const init_point = String(mp.init_point || mp.sandbox_init_point || "");

    // 4) Guardar en Supabase (service role → salta RLS)
    try {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const { error } = await supabase.from("mercadopago_orders").insert({
        user_id: userId,
        plan_id: planId,
        periodo,
        amount,
        status: "pending",
        order_id: String(mp.id),
        checkout_url: init_point,
        external_reference,
      });
      if (error) console.error("[create-payment-order] error insert:", error.message);
    } catch (e) {
      console.error("[create-payment-order] error insert (continuamos):", e);
    }

    return json({ init_point });
  } catch (e) {
    console.error("[create-payment-order] error general:", e);
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
