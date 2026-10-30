// ============================================================
// GADU · create-payment-order (MercadoPago · API de Orders)
// Recibe { planId, periodo, amount, userEmail } y crea una orden
// de pago online, guarda la fila en mercadopago_orders y devuelve
// el checkout_url para redirigir al usuario.
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

/* Redondea a 2 decimales (evita floats largos que rechaza MercadoPago) */
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

    // external_reference válido: solo [a-z0-9_-], máx 64 chars.
    // Usamos "_" como separador (el user_id UUID ya trae guiones "-").
    const external_reference = (userId + "_" + planId + "_" + periodo)
      .replace(/[^a-zA-Z0-9_-]/g, "")
      .slice(0, 64);

    // 2) Armar el body de la orden (API de Orders):
    //    - total_amount y payments[].amount van como STRING con 2 decimales.
    //    - transactions.payments es OBLIGATORIO (payment_method).
    //    - processing_mode "manual" es obligatorio para Checkout Pro.
    //    - payer.email en Sandbox debe terminar en @testuser.com.
    const isSandbox = MP_ACCESS_TOKEN.startsWith("TEST-");
    const payerEmail = isSandbox
      ? "test_user_" + crypto.randomUUID().replace(/-/g, "") + "@testuser.com"
      : (userEmail || "cliente@example.com");

    const amountStr = amount.toFixed(2);   // "5000.00"
    const itemTitle = "Plan GADU " + planId.charAt(0).toUpperCase() + planId.slice(1) + " (" + periodo.charAt(0).toUpperCase() + periodo.slice(1) + ")";
    const origin = String(req.headers.get("Origin") || req.headers.get("origin") || "https://gadu.app").replace(/\/$/, "");
    const mpBody = {
      type: "online",
      processing_mode: "manual",
      total_amount: amountStr,
      external_reference,
      payer: { email: payerEmail },
      transactions: {
        payments: [{
          amount: amountStr,
          payment_method: {
            id: "master",
            type: "credit_card",
          },
        }],
      },
      items: [{
        title: itemTitle,
        unit_price: amountStr,
        quantity: 1,
      }],
      back_urls: {
        success: origin + "/#/planes",
        pending: origin + "/#/planes",
        failure: origin + "/#/planes",
      },
      notification_url: SUPABASE_URL + "/functions/v1/mercadopago-webhook",
    };

    console.log("[create-payment-order] POST /v1/orders body:", JSON.stringify(mpBody));
    console.log("[create-payment-order] X-Idempotency-Key:", "generada");

    // 3) Crear la orden en MercadoPago (API de Orders) con idempotencia
    const mpRes = await fetch("https://api.mercadopago.com/v1/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + MP_ACCESS_TOKEN,
        "X-Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify(mpBody),
    });

    const mpText = await mpRes.text();
    let mp: Record<string, unknown> = {};
    try { mp = JSON.parse(mpText); } catch { mp = { raw: mpText }; }

    console.log("[create-payment-order] MP response status:", mpRes.status);
    console.log("[create-payment-order] MP response body:", mpText.slice(0, 1500));

    if (!mpRes.ok || !mp.id) {
      // Exponer el error EXACTO de MercadoPago (message + cause) al frontend
      const cause = Array.isArray(mp.cause)
        ? mp.cause.map((c: any) => String(c.description || c.code || "")).filter(Boolean).join("; ")
        : "";
      const msg = String(mp.message || mp.error || ("HTTP " + mpRes.status)) + (cause ? " · " + cause : "");
      console.error("[create-payment-order] MP error completo:", mpText.slice(0, 1500));
      return json({ error: "MercadoPago: " + msg, detail: mp }, 502);
    }

    // 4) Guardar la orden en Supabase (service role → salta RLS)
    try {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const { error } = await supabase.from("mercadopago_orders").insert({
        user_id: userId,
        plan_id: planId,
        periodo,
        amount,
        status: "pending",
        order_id: String(mp.id),
        checkout_url: String(mp.checkout_url || ""),
        external_reference,
      });
      if (error) console.error("[create-payment-order] error insert:", error.message);
    } catch (e) {
      console.error("[create-payment-order] error insert (continuamos):", e);
    }

    return json({ init_point: mp.checkout_url });
  } catch (e) {
    console.error("[create-payment-order] error general:", e);
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
