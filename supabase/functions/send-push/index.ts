// ============================================================
// GADU · send-push (Supabase Edge Function)
// Envía una notificación web push al usuario (Web Push API).
// Body: { user_id, message, title?, url? }
// Headers: x-service-secret (SERVICE_SECRET)
// ============================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import webpush from "https://esm.sh/web-push@3.6.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY") || "";
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY") || "";
const SERVICE_SECRET = Deno.env.get("SERVICE_SECRET") || "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-service-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

webpush.setVapidDetails("mailto:soporte@gestiongadu.vercel.app", VAPID_PUBLIC, VAPID_PRIVATE);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("method not allowed", { status: 405, headers: corsHeaders });

  try {
    const body = await req.json();
    const secret = req.headers.get("x-service-secret") || "";
    if (!SERVICE_SECRET || secret !== SERVICE_SECRET) {
      return new Response(JSON.stringify({ ok: false, error: "sin autorización" }), { status: 401, headers: corsHeaders });
    }

    const userId = String(body.user_id || "");
    const message = String(body.message || "");
    const title = String(body.title || "GADU");
    const url = String(body.url || "/");
    if (!userId || !message) {
      return new Response(JSON.stringify({ ok: false, error: "faltan user_id o message" }), { status: 400, headers: corsHeaders });
    }

    const q = await fetch(
      `${SUPABASE_URL}/rest/v1/push_subscriptions?select=endpoint,keys&user_id=eq.${encodeURIComponent(userId)}`,
      { headers: { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}` } },
    );
    const subs = await q.json().catch(() => []);
    if (!Array.isArray(subs) || !subs.length) {
      return new Response(JSON.stringify({ ok: true, sent: 0 }), { headers: corsHeaders });
    }

    const payload = JSON.stringify({ title, body: message, url });
    let sent = 0;
    for (const s of subs) {
      try {
        const sub = { endpoint: s.endpoint, keys: typeof s.keys === "string" ? JSON.parse(s.keys) : s.keys };
        await webpush.sendNotification(sub, payload);
        sent++;
      } catch (e) {
        const err = e as { statusCode?: number; status?: number; message?: string };
        const status = err.statusCode || err.status;
        if (status === 404 || status === 410) {
          /* Suscripción muerta/revocada → limpiar de la base para no reenviar */
          console.warn("[send-push] endpoint muerto (" + status + "), limpiando:", String(s.endpoint).slice(0, 60));
          try {
            await fetch(
              `${SUPABASE_URL}/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(s.endpoint)}`,
              { method: "DELETE", headers: { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}` } },
            );
          } catch (e2) {
            console.warn("[send-push] no se pudo limpiar endpoint:", (e2 as Error)?.message || e2);
          }
        } else {
          console.error("[send-push] falló el envío a un endpoint:", err.message || e);
        }
      }
    }
    return new Response(JSON.stringify({ ok: true, sent }), { headers: corsHeaders });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String((e as Error)?.message || e) }), { status: 500, headers: corsHeaders });
  }
});
