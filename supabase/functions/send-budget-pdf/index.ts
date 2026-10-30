// ============================================================
// GADU · send-budget-pdf (Supabase Edge Function)
// Envía un presupuesto en PDF al WhatsApp de un cliente.
// Body: { phone, budgetData: { name, total }, pdfBase64 }
// Auth: JWT de un usuario autenticado (Bearer token).
// ============================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const WHATSAPP_TOKEN = Deno.env.get("WHATSAPP_TOKEN") || "";
const WHATSAPP_PHONE_ID = Deno.env.get("WHATSAPP_PHONE_ID") || "";
const API_VERSION = Deno.env.get("WHATSAPP_API_VERSION") || "v21.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function toMetaPhone(p: unknown): string {
  let d = String(p == null ? "" : p).replace(/\D/g, "");
  if (d.startsWith("549") && d.length === 13) d = "54" + d.slice(3);
  return d;
}

/* Base64 (data URI o crudo) → Uint8Array */
function base64ToBytes(b64: string): Uint8Array {
  const clean = String(b64).includes(",") ? String(b64).split(",").pop()! : String(b64);
  const bin = atob(clean);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/* Verifica que el JWT corresponda a un usuario autenticado */
async function requireAuth(req: Request): Promise<boolean> {
  const auth = req.headers.get("Authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return false;
  const res = await fetch(SUPABASE_URL + "/auth/v1/user", {
    headers: { Authorization: "Bearer " + token, apikey: ANON_KEY },
  });
  return res.ok;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method not allowed" }, 405);

  try {
    if (!(await requireAuth(req))) {
      return json({ ok: false, error: "sin autorización" }, 401);
    }

    const body = await req.json();
    const phone = toMetaPhone(body.phone);
    const pdfBase64 = String(body.pdfBase64 || "");
    const name = String((body.budgetData && body.budgetData.name) || "Obra");
    const total = Number((body.budgetData && body.budgetData.total) || 0);

    if (!phone || !pdfBase64) {
      return json({ ok: false, error: "faltan phone o pdfBase64" }, 400);
    }

    const bytes = base64ToBytes(pdfBase64);
    const filename = "Presupuesto_" + String(name).replace(/[^a-z0-9áéíóúñ ]/gi, "").replace(/\s+/g, "_") + ".pdf";
    const caption = "¡Hola! Acá tenés el presupuesto de " + name + " por un total de $" + total.toLocaleString("es-AR") + ". Cualquier duda, quedamos en contacto.";

    /* 1) Subir el PDF a Meta para obtener media_id */
    const form = new FormData();
    form.append("file", new Blob([bytes], { type: "application/pdf" }), filename);
    form.append("messaging_product", "whatsapp");
    form.append("type", "application/pdf");
    const up = await fetch(`https://graph.facebook.com/${API_VERSION}/${WHATSAPP_PHONE_ID}/media`, {
      method: "POST",
      headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` },
      body: form,
    });
    const upJson = await up.json().catch(() => ({}));
    if (!up.ok || !upJson.id) {
      console.error("[send-budget-pdf] subir media falló:", up.status, JSON.stringify(upJson));
      return json({ ok: false, error: "Meta " + up.status }, 502);
    }

    /* 2) Enviar el documento con el caption */
    const msg = await fetch(`https://graph.facebook.com/${API_VERSION}/${WHATSAPP_PHONE_ID}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${WHATSAPP_TOKEN}` },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: phone,
        type: "document",
        document: { id: String(upJson.id), filename, caption },
      }),
    });
    if (!msg.ok) {
      const j = await msg.json().catch(() => ({}));
      console.error("[send-budget-pdf] enviar documento falló:", msg.status, JSON.stringify(j));
      return json({ ok: false, error: "Meta " + msg.status }, 502);
    }

    console.log("[send-budget-pdf] presupuesto enviado a", phone);
    return json({ ok: true });
  } catch (e) {
    return json({ ok: false, error: String((e as Error)?.message || e) }, 500);
  }
});
