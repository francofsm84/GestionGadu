// ============================================================
// GADU · send-whatsapp-message (Supabase Edge Function)
// Envía un mensaje de texto por WhatsApp usando la Graph API de Meta.
// Solo el administrador (rol admin/super_admin) puede usarlo.
// Body: { to, text }
// ============================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const WHATSAPP_TOKEN = Deno.env.get("WHATSAPP_TOKEN") || "";
const WHATSAPP_PHONE_ID = Deno.env.get("WHATSAPP_PHONE_ID") || "";
const API_VERSION = Deno.env.get("WHATSAPP_API_VERSION") || "v21.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function toMetaPhone(p: unknown): string {
  let d = String(p == null ? "" : p).replace(/\D/g, "");
  if (d.startsWith("549") && d.length === 13) d = "54" + d.slice(3);
  return d;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("method not allowed", { status: 405, headers: corsHeaders });

  try {
    /* 1) Autenticar: verificar JWT y que el usuario sea admin/super_admin */
    const auth = req.headers.get("Authorization") || "";
    const token = auth.replace(/^Bearer\s+/i, "");
    if (!token) {
      return new Response(JSON.stringify({ ok: false, error: "sin token" }), { status: 401, headers: corsHeaders });
    }

    const userRes = await fetch(SUPABASE_URL + "/auth/v1/user", {
      headers: { Authorization: "Bearer " + token, apikey: ANON_KEY },
    });
    if (!userRes.ok) {
      return new Response(JSON.stringify({ ok: false, error: "token inválido" }), { status: 401, headers: corsHeaders });
    }
    const user = await userRes.json();

    const profRes = await fetch(
      SUPABASE_URL + "/rest/v1/profiles?select=rol&user_id=eq." + encodeURIComponent(user.id),
      { headers: { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}` } },
    );
    const profs = (await profRes.json().catch(() => [])) as Array<{ rol: string }>;
    const rol = profs[0] && profs[0].rol;
    if (rol !== "admin" && rol !== "super_admin") {
      return new Response(JSON.stringify({ ok: false, error: "sin permisos" }), { status: 403, headers: corsHeaders });
    }

    /* 2) Enviar el mensaje por la Graph API de Meta */
    const body = await req.json();
    const to = toMetaPhone(body.to);
    const text = String(body.text || "").trim();
    if (!to || !text) {
      return new Response(JSON.stringify({ ok: false, error: "faltan to o text" }), { status: 400, headers: corsHeaders });
    }

    const metaRes = await fetch(`https://graph.facebook.com/${API_VERSION}/${WHATSAPP_PHONE_ID}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${WHATSAPP_TOKEN}` },
      body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body: text } }),
    });
    const metaJson = await metaRes.json().catch(() => ({}));
    if (!metaRes.ok) {
      console.error("[send-whatsapp-message] Meta falló:", metaRes.status, JSON.stringify(metaJson));
      return new Response(
        JSON.stringify({ ok: false, error: "Meta " + metaRes.status, meta: metaJson }),
        { status: 502, headers: corsHeaders },
      );
    }
    console.log("[send-whatsapp-message] enviado a", to);
    return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: String((e as Error)?.message || e) }),
      { status: 500, headers: corsHeaders },
    );
  }
});
