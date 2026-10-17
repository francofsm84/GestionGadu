// ============================================================
// GADU · Notificación de borrado lógico por WhatsApp
// La app web (js/store.js) invoca esta función al borrar un
// registro, para avisar al usuario y ofrecerle RESTAURAR.
// ============================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const API_VERSION = "v21.0";

/* Normaliza el teléfono para Meta (549… → 54… sin el 9 de prueba AR) */
function toMetaPhone(p: unknown): string {
  let d = String(p == null ? "" : p).replace(/\D/g, "");
  if (d.startsWith("549") && d.length === 13) d = "54" + d.slice(3);
  return d;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { userId, trashId, tipo, detalle } = await req.json().catch(() => ({})) as {
      userId?: string; trashId?: string; tipo?: string; detalle?: string;
    };
    if (!userId || !trashId) {
      return new Response(JSON.stringify({ ok: false, error: "faltan userId/trashId" }), { status: 400, headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const restHeaders = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };

    /* 1) Teléfono del usuario (app_data → fallback profiles.whatsapp_number) */
    let phone = "";
    const rData = await fetch(
      `${supabaseUrl}/rest/v1/app_data?select=data&user_id=eq.${encodeURIComponent(userId)}&limit=1`,
      { headers: restHeaders },
    );
    const rows = (await rData.json().catch(() => [])) as Array<{ data: Record<string, any> }>;
    const d = rows[0]?.data || {};
    phone = d?.settings?.profile?.whatsapp?.phone || d?.settings?.profile?.whatsapp?.linkedPhone || "";
    if (!phone) {
      const rp = await fetch(
        `${supabaseUrl}/rest/v1/profiles?select=whatsapp_number&user_id=eq.${encodeURIComponent(userId)}&limit=1`,
        { headers: restHeaders },
      );
      const pRows = (await rp.json().catch(() => [])) as Array<{ whatsapp_number?: string }>;
      phone = pRows[0]?.whatsapp_number || "";
    }
    if (!phone) {
      console.warn("[GADU-WA-DELETE] usuario sin teléfono:", userId);
      return new Response(JSON.stringify({ ok: false, error: "sin teléfono" }), { status: 200, headers: corsHeaders });
    }

    /* 2) Enviar el mensaje de advertencia con la opción RESTAURAR */
    const token = Deno.env.get("WHATSAPP_TOKEN") || "";
    const phoneId = Deno.env.get("WHATSAPP_PHONE_ID") || "";
    if (!token || !phoneId) {
      console.warn("[GADU-WA-DELETE] sin WHATSAPP_TOKEN/WHATSAPP_PHONE_ID");
      return new Response(JSON.stringify({ ok: false, error: "falta config" }), { status: 200, headers: corsHeaders });
    }

    const text = `⚠️ Se eliminó el registro: ${tipo || "registro"} - ${detalle || ""}. Si fue un error, responde a este mensaje con la palabra RESTAURAR.`;
    const res = await fetch(`https://graph.facebook.com/${API_VERSION}/${phoneId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: toMetaPhone(phone),
        type: "text",
        text: { body: text },
      }),
    });
    const respText = await res.text().catch(() => "");
    if (!res.ok) {
      console.error("[GADU-WA-DELETE] Meta falló:", res.status, respText);
      return new Response(JSON.stringify({ ok: false, error: "meta " + res.status }), { status: 200, headers: corsHeaders });
    }
    console.log("[GADU-WA-DELETE] notificación enviada:", userId, "trashId:", trashId);
    return new Response(JSON.stringify({ ok: true, trashId }), { status: 200, headers: corsHeaders });
  } catch (e) {
    console.error("[GADU-WA-DELETE] error:", e);
    return new Response(JSON.stringify({ ok: false, error: String((e as Error)?.message || e) }), { status: 200, headers: corsHeaders });
  }
});
