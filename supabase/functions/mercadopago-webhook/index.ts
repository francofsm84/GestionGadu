// ============================================================
// GADU · mercadopago-webhook (MercadoPago · API de Orders)
// Recibe notificaciones de pago, verifica el estado en MP y, si
// está aprobado, activa la licencia: genera el código, lo inserta
// en license_codes, actualiza profiles y marca la orden completed.
// Siempre responde 200 OK para que MP no reintente.
// ============================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function diasDePeriodo(periodo: string): number {
  if (periodo === "anual") return 365;
  if (periodo === "semestral") return 180;
  return 90; // trimestral (default)
}

function genLicenseCode(): string {
  const raw = crypto.randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase();
  return "GADU-" + raw;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const MP_ACCESS_TOKEN = Deno.env.get("MP_ACCESS_TOKEN") || "";
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

  try {
    if (req.method === "POST" && MP_ACCESS_TOKEN) {
      const body = await req.json().catch(() => ({}));
      const type = String(body.type || body.action || "");
      const dataId = body.data ? String(body.data.id || "") : "";

      if (dataId) {
        // 1) Consultar el estado del recurso a MercadoPago
        let status = "";
        let externalRef = "";
        let isOrder = false;
        if (type === "order" || type === "merchant_order" || type === "order.update") {
          isOrder = true;
          const r = await fetch("https://api.mercadopago.com/v1/orders/" + dataId, {
            headers: { Authorization: "Bearer " + MP_ACCESS_TOKEN },
          });
          const j = await r.json().catch(() => ({}));
          status = String(j.status || "");
          externalRef = String(j.external_reference || "");
        } else {
          // payment (API clásica)
          const r = await fetch("https://api.mercadopago.com/v1/payments/" + dataId, {
            headers: { Authorization: "Bearer " + MP_ACCESS_TOKEN },
          });
          const j = await r.json().catch(() => ({}));
          status = String(j.status || "");
          externalRef = String(j.external_reference || "");
        }

        // 2) Aprobado: status "approved" (payment) o "paid"/"completed" (order)
        const approved = status === "approved" || status === "paid" || status === "completed";
        if (approved && externalRef && externalRef.includes("|")) {
          const parts = externalRef.split("|");
          const userId = String(parts[0] || "");
          const planId = String(parts[1] || "");
          const periodo = String(parts[2] || "trimestral");
          const dias = diasDePeriodo(periodo);
          const vencimiento = new Date(Date.now() + dias * 86400000).toISOString();
          const code = genLicenseCode();

          const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

          // 3) Insertar el código de licencia
          const { error: licErr } = await supabase.from("license_codes").insert({
            code,
            plan_id: planId,
            duration_days: dias,
            is_used: false,
          });
          if (licErr) console.error("[mercadopago-webhook] error insert license_codes:", licErr.message);

          // 4) Activar el plan en profiles (service role → salta blindar_perfil)
          const { error: profErr } = await supabase.from("profiles").update({
            plan_id: planId,
            trial_ends_at: vencimiento,
            trial_end: vencimiento,
            paid_until: vencimiento,
            subscription_status: "active",
            estado_cuenta: "activo",
          }).eq("user_id", userId);
          if (profErr) console.error("[mercadopago-webhook] error update profiles:", profErr.message);

          // 5) Marcar la orden como completed
          await supabase.from("mercadopago_orders").update({ status: "completed" })
            .eq("external_reference", externalRef);

          console.log("[mercadopago-webhook] pago aprobado:", userId, planId, periodo, "· código:", code);
        } else {
          console.log("[mercadopago-webhook] notificación ignorada · type:", type, "status:", status, "· isOrder:", isOrder);
        }
      }
    }

    // Siempre 200 OK para que MercadoPago no reintente
    return new Response("ok", { status: 200, headers: corsHeaders });
  } catch (e) {
    console.error("[mercadopago-webhook] error:", e);
    return new Response("ok", { status: 200, headers: corsHeaders });
  }
});
