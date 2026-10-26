// ============================================================
// GADU · send-broadcast (Supabase Edge Function)
// Envía un anuncio masivo por WhatsApp y Web Push, en lotes de 5.
// Body: { title, message, target }
//   target: 'todos' | 'prueba' | 'pagos'
// Auth: JWT de un admin/super_admin (verifica rol en profiles).
// ============================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const SERVICE_SECRET = Deno.env.get("SERVICE_SECRET") || "";
const WHATSAPP_TOKEN = Deno.env.get("WHATSAPP_TOKEN") || "";
const WHATSAPP_PHONE_ID = Deno.env.get("WHATSAPP_PHONE_ID") || "";
const API_VERSION = Deno.env.get("WHATSAPP_API_VERSION") || "v21.0";

const BATCH_SIZE = 5;
const BATCH_DELAY_MS = 1000;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Profile = {
  user_id: string;
  email: string | null;
  whatsapp_number: string | null;
  whatsapp: { phone?: string } | null;
  plan_id: string | null;
  subscription_status: string | null;
};

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

/* Normaliza un teléfono argentino al formato que espera Meta */
function toMetaPhone(p: unknown): string {
  let d = String(p == null ? "" : p).replace(/\D/g, "");
  if (d.startsWith("549") && d.length === 13) d = "54" + d.slice(3);
  return d;
}

function profilePhone(p: Profile): string {
  const raw = p.whatsapp_number || (p.whatsapp && p.whatsapp.phone) || "";
  return toMetaPhone(raw);
}

function matchTarget(p: Profile, target: string): boolean {
  if (target === "prueba") return p.subscription_status === "trialing" || p.plan_id === "free";
  if (target === "pagos") return ["pyme", "pro", "empresa"].includes(p.plan_id || "");
  return true; // 'todos'
}

async function sendWhatsApp(to: string, text: string): Promise<boolean> {
  const res = await fetch(`https://graph.facebook.com/${API_VERSION}/${WHATSAPP_PHONE_ID}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${WHATSAPP_TOKEN}` },
    body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body: text } }),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    console.error("[GADU-BROADCAST] Meta falló para " + to + ":", res.status, JSON.stringify(j));
  }
  return res.ok;
}

async function sendPush(userId: string, title: string, message: string): Promise<boolean> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-service-secret": SERVICE_SECRET },
    body: JSON.stringify({ user_id: userId, title, message }),
  });
  if (!res.ok) {
    console.error("[GADU-BROADCAST] Push falló para " + userId + ":", res.status);
  }
  return res.ok;
}

/* Envía a un usuario (WhatsApp si tiene teléfono + Push). Devuelve true si al menos uno llegó. */
async function sendToUser(p: Profile, title: string, message: string): Promise<boolean> {
  let ok = false;
  const text = `*${title}*\n\n${message}`;
  const phone = profilePhone(p);
  if (phone) ok = (await sendWhatsApp(phone, text)) || ok;
  try { ok = (await sendPush(p.user_id, title, message)) || ok; } catch (e) { console.error("[GADU-BROADCAST] push error:", (e as Error)?.message || e); }
  return ok;
}

async function requireAdmin(req: Request): Promise<boolean> {
  const auth = req.headers.get("Authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return false;
  const userRes = await fetch(SUPABASE_URL + "/auth/v1/user", {
    headers: { Authorization: "Bearer " + token, apikey: ANON_KEY },
  });
  if (!userRes.ok) return false;
  const user = await userRes.json();
  const profRes = await fetch(
    SUPABASE_URL + "/rest/v1/profiles?select=rol&user_id=eq." + encodeURIComponent(user.id),
    { headers: { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}` } },
  );
  const profs = (await profRes.json().catch(() => [])) as Array<{ rol: string }>;
  const rol = profs[0] && profs[0].rol;
  return rol === "admin" || rol === "super_admin";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method not allowed" }, 405);

  try {
    if (!(await requireAdmin(req))) {
      return json({ ok: false, error: "sin permisos" }, 403);
    }

    const body = await req.json();
    const title = String(body.title || "").trim();
    const message = String(body.message || "").trim();
    const target = String(body.target || "todos");
    if (!title || !message) {
      return json({ ok: false, error: "faltan title o message" }, 400);
    }

    /* 1) Registrar el anuncio como 'pending' */
    let broadcastId: string | null = null;
    try {
      const ins = await fetch(`${SUPABASE_URL}/rest/v1/broadcasts`, {
        method: "POST",
        headers: { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}`, "Content-Type": "application/json", Prefer: "return=representation" },
        body: JSON.stringify({ title, message, target, status: "pending" }),
      });
      const created = (await ins.json().catch(() => [])) as Array<{ id: string }>;
      broadcastId = created[0] && created[0].id;
    } catch (e) {
      console.error("[GADU-BROADCAST] no se pudo registrar:", (e as Error)?.message || e);
    }

    /* 2) Buscar destinatarios según target */
    const profRes = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?select=user_id,email,whatsapp_number,whatsapp,plan_id,subscription_status&order=created_at.asc`,
      { headers: { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}` } },
    );
    const all = (await profRes.json().catch(() => [])) as Profile[];
    const targets = all.filter((p) => matchTarget(p, target));

    console.log(`[GADU-BROADCAST] target=${target} · destinatarios=${targets.length}`);

    /* 3) Envío en lotes de 5, con 1s de pausa entre lotes */
    let sent = 0;
    let failed = 0;
    for (let i = 0; i < targets.length; i += BATCH_SIZE) {
      const batch = targets.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(batch.map((p) => sendToUser(p, title, message)));
      const ok = results.filter(Boolean).length;
      sent += ok;
      failed += batch.length - ok;
      console.log(`[GADU-BROADCAST] lote ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.length} procesado(s), ${ok} ok`);
      if (i + BATCH_SIZE < targets.length) {
        await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
      }
    }

    /* 4) Actualizar estado */
    const status = failed === targets.length && targets.length > 0 ? "failed" : "sent";
    if (broadcastId) {
      try {
        await fetch(`${SUPABASE_URL}/rest/v1/broadcasts?id=eq.${encodeURIComponent(broadcastId)}`, {
          method: "PATCH",
          headers: { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}`, "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        });
      } catch (e) {
        console.error("[GADU-BROADCAST] no se pudo actualizar estado:", (e as Error)?.message || e);
      }
    }

    console.log(`[GADU-BROADCAST] fin: ${sent} ok / ${failed} fallidos / ${targets.length} total`);
    return json({ ok: true, total: targets.length, sent, failed, status });
  } catch (e) {
    return json({ ok: false, error: String((e as Error)?.message || e) }, 500);
  }
});
