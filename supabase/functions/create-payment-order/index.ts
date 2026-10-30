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
    const amount = Number(body.amount || 0);
    const userEmail = String(body.userEmail || "");

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

    const external_reference = userId + "|" + planId + "|" + periodo;

    // 2) Crear la orden en MercadoPago (API de Orders)
    const mpRes = await fetch("https://api.mercadopago.com/v1/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + MP_ACCESS_TOKEN,
      },
      body: JSON.stringify({
        type: "online",
        total_amount: amount,
        external_reference,
        items: [{
          title: "Plan GADU " + planId + " (" + periodo + ")",
          quantity: 1,
          unit_price: amount,
        }],
        payer: { email: userEmail },
      }),
    });
    const mp = await mpRes.json().catch(() => ({}));
    if (!mpRes.ok || !mp.id) {
      console.error("[create-payment-order] MP error:", mpRes.status, JSON.stringify(mp));
      return json({ error: "MercadoPago: " + (mp.message || ("HTTP " + mpRes.status)) }, 502);
    }

    // 3) Guardar la orden en Supabase (service role → salta RLS)
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
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
