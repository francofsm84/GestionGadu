// ============================================================
// GADU · Recordatorio diario de asistencia (11:00 AM ARG)
// Envía una PLANTILLA de WhatsApp (type: template) a los
// administradores que tienen empleados activos, para que carguen
// la asistencia del día. No usa texto libre (regla de 24h de Meta).
//
// Llamado por pg_cron → pg_net → POST a /functions/v1/send-daily-reminder
// ============================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const API_VERSION = "v21.0";
const TEMPLATE_NAME = "recordatorio_asistencia";
const TEMPLATE_LANG = "es_AR";

/* Normaliza el teléfono para Meta (549… → 54… sin el 9 de prueba AR) */
function toMetaPhone(p: unknown): string {
  let d = String(p == null ? "" : p).replace(/\D/g, "");
  if (d.startsWith("549") && d.length === 13) d = "54" + d.slice(3);
  return d;
}

/* fetch con timeout */
async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 8000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (e) {
    if (controller.signal.aborted) throw new Error("Timeout exceeded");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/* Envía un MENSAJE TEMPLATE (plantilla aprobada en Meta) */
async function sendTemplate(to: string): Promise<boolean> {
  const token = Deno.env.get("WHATSAPP_TOKEN") || "";
  const phoneId = Deno.env.get("WHATSAPP_PHONE_ID") || "";
  if (!token || !phoneId) {
    console.warn("[GADU-DAILY] sin WHATSAPP_TOKEN/WHATSAPP_PHONE_ID");
    return false;
  }
  const body = {
    messaging_product: "whatsapp",
    to: toMetaPhone(to),
    type: "template",
    template: {
      name: TEMPLATE_NAME,
      language: { code: TEMPLATE_LANG },
    },
  };
  console.log("[GADU-DAILY] sendTemplate payload:", JSON.stringify(body));
  const res = await fetchWithTimeout(`https://graph.facebook.com/${API_VERSION}/${phoneId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const respText = await res.text().catch(() => "");
  if (!res.ok) console.error("[GADU-DAILY] Meta falló:", res.status, respText);
  else console.log("[GADU-DAILY] Meta OK:", res.status, respText);
  return res.ok;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  /* Seguridad del cron: exige el secreto compartido */
  const expected = Deno.env.get("CRON_SECRET") || "";
  const auth = req.headers.get("authorization") || "";
  if (expected && auth !== `Bearer ${expected}`) {
    return new Response(JSON.stringify({ error: "no autorizado" }), { status: 401, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!supabaseUrl || !serviceKey) {
      return new Response(JSON.stringify({ error: "configuración incompleta" }), { status: 500, headers: corsHeaders });
    }
    const restHeaders = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };

    /* 1) Leer todos los documentos app_data */
    const res = await fetchWithTimeout(supabaseUrl + "/rest/v1/app_data?select=user_id,data", { headers: restHeaders });
    if (!res.ok) {
      const b = await res.text().catch(() => "");
      console.error("[GADU-DAILY] app_data falló:", res.status, b);
      return new Response(JSON.stringify({ error: "app_data HTTP " + res.status }), { status: 500, headers: corsHeaders });
    }
    const rows = (await res.json()) as Array<{ user_id: string; data: Record<string, any> }>;

    /* 2) Filtrar administradores: con empleados activos (son quienes cargan asistencia) */
    let processed = 0;
    for (const row of rows) {
      const employees = (row.data?.employees || []).filter((e: Record<string, any>) => e.active !== false);
      const hasActiveWorks = (row.data?.works || []).some((w: Record<string, any>) => w.status === "activa");
      if (!employees.length && !hasActiveWorks) continue;

      /* 3) Teléfono del admin (perfil JSON, fallback a profiles) */
      let phone = toMetaPhone(
        row.data?.settings?.profile?.whatsapp?.phone ||
        row.data?.settings?.profile?.whatsapp?.linkedPhone ||
        "",
      );
      if (!phone) {
        const pr = await fetchWithTimeout(
          supabaseUrl + "/rest/v1/profiles?select=whatsapp_number&user_id=eq." + encodeURIComponent(row.user_id) + "&limit=1",
          { headers: restHeaders },
        );
        const pRows = (await pr.json().catch(() => [])) as Array<{ whatsapp_number?: string }>;
        phone = toMetaPhone(pRows?.[0]?.whatsapp_number || "");
      }
      if (!phone) {
        console.warn("[GADU-DAILY] usuario sin teléfono:", row.user_id);
        continue;
      }

      /* 4) Enviar plantilla */
      const ok = await sendTemplate(phone);
      if (ok) processed++;
      console.log("[GADU-DAILY] usuario", row.user_id, "→ recordatorio enviado:", ok);
    }

    return new Response(JSON.stringify({ ok: true, processed }), { status: 200, headers: corsHeaders });
  } catch (e) {
    console.error("[GADU-DAILY] error:", e);
    return new Response(JSON.stringify({ ok: false, error: String((e as Error)?.message || e) }), { status: 500, headers: corsHeaders });
  }
});
