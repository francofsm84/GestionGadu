// ============================================================
// GADU · Cron diario de recordatorios de WhatsApp
// Busca gastos "sin asignar" (workId null) de las últimas 24hs
// y envía un mensaje interactivo para asignarlos a una obra.
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

/* Dispara una notificación push (fire-and-forget; nunca bloquea ni tira) */
function firePush(userId: string, title: string, message: string, url: string) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceSecret = Deno.env.get("SERVICE_SECRET") || "";
  const doIt = async () => {
    try {
      const res = await fetch(supabaseUrl + "/functions/v1/send-push", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-service-secret": serviceSecret },
        body: JSON.stringify({ user_id: userId, title, message, url }),
      });
      if (!res.ok) console.warn("[GADU-WA-PUSH] send-push respondió:", res.status);
    } catch (e) {
      console.warn("[GADU-WA-PUSH] error:", e);
    }
  };
  try {
    // deno-lint-ignore no-undef
    if (typeof EdgeRuntime !== "undefined" && typeof EdgeRuntime.waitUntil === "function") {
      // deno-lint-ignore no-undef
      EdgeRuntime.waitUntil(doIt());
      return;
    }
  } catch (_e) {}
  doIt().catch(() => {});
}

/* ¿El gasto es de las últimas 24hs? (date viene como "YYYY-MM-DD") */
function isRecent24h(dateStr: unknown): boolean {
  const now = new Date();
  const cutoff = new Date(now.getTime() - 24 * 3600 * 1000);
  return String(dateStr || "") >= cutoff.toISOString().slice(0, 10);
}

/* Envía un mensaje interactivo con hasta 3 botones de respuesta */
async function sendWhatsAppButtons(
  to: string,
  text: string,
  buttons: Array<{ id: string; title: string }>,
): Promise<boolean> {
  const token = Deno.env.get("WHATSAPP_TOKEN") || "";
  const phoneId = Deno.env.get("WHATSAPP_PHONE_ID") || "";
  if (!token || !phoneId) {
    console.warn("[GADU-WA-CRON] sin WHATSAPP_TOKEN/WHATSAPP_PHONE_ID");
    return false;
  }
  const body = {
    messaging_product: "whatsapp",
    to: toMetaPhone(to),
    type: "interactive",
    interactive: {
      type: "button",
      body: { text },
      action: {
        buttons: buttons.slice(0, 3).map(b => ({
          type: "reply",
          reply: { id: b.id, title: b.title.slice(0, 20) },
        })),
      },
    },
  };
  console.log("[GADU-WA-CRON] sendWhatsAppButtons payload:", JSON.stringify(body));
  const res = await fetch(`https://graph.facebook.com/${API_VERSION}/${phoneId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const respText = await res.text().catch(() => "");
  if (!res.ok) console.error("[GADU-WA-CRON] Meta falló:", res.status, respText);
  else console.log("[GADU-WA-CRON] Meta OK:", res.status, respText);
  return res.ok;
}

/* Mensaje interactivo de tipo "list" (hasta 10 filas) para más de 3 obras */
async function sendWhatsAppList(
  to: string,
  text: string,
  works: Array<{ id: string; title: string }>,
): Promise<boolean> {
  const token = Deno.env.get("WHATSAPP_TOKEN") || "";
  const phoneId = Deno.env.get("WHATSAPP_PHONE_ID") || "";
  if (!token || !phoneId) {
    console.warn("[GADU-WA-CRON] sin WHATSAPP_TOKEN/WHATSAPP_PHONE_ID");
    return false;
  }
  const body = {
    messaging_product: "whatsapp",
    to: toMetaPhone(to),
    type: "interactive",
    interactive: {
      type: "list",
      body: { text },
      action: {
        button: "Asignar Obra",
        sections: [{
          title: "Obras",
          rows: works.slice(0, 10).map(w => ({
            id: w.id,
            title: w.title.slice(0, 24),
            description: "Asignar gasto",
          })),
        }],
      },
    },
  };
  console.log("[GADU-WA-CRON] sendWhatsAppList payload:", JSON.stringify(body));
  const res = await fetch(`https://graph.facebook.com/${API_VERSION}/${phoneId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const respText = await res.text().catch(() => "");
  if (!res.ok) console.error("[GADU-WA-CRON] Meta falló:", res.status, respText);
  else console.log("[GADU-WA-CRON] Meta OK:", res.status, respText);
  return res.ok;
}

/* Texto del recordatorio (singular o plural) */
function buildText(expenses: Array<{ amount?: unknown; category?: unknown }>): string {
  const total = expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  if (expenses.length === 1) {
    const e = expenses[0];
    return "Hola 👋, cargaste un gasto de $" + e.amount + " en " + (e.category || "varios") + ". ¿A qué obra lo asignamos?";
  }
  return "Hola 👋, tenés " + expenses.length + " gastos pendientes (total $" + total + "). ¿A qué obra los asignamos?";
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
    const res = await fetch(supabaseUrl + "/rest/v1/app_data?select=user_id,data", { headers: restHeaders });
    if (!res.ok) {
      const b = await res.text().catch(() => "");
      console.error("[GADU-WA-CRON] app_data falló:", res.status, b);
      return new Response(JSON.stringify({ error: "app_data HTTP " + res.status }), { status: 500, headers: corsHeaders });
    }
    const rows = (await res.json()) as Array<{ user_id: string; data: Record<string, any> }>;

    /* 2) Filtrar en memoria: gastos sin asignar de las últimas 24hs */
    let processed = 0;
    for (const row of rows) {
      const expenses = (row.data?.expenses || []).filter(
        (e: Record<string, any>) => e.source === "whatsapp" && e.workId == null && !e.resolved && isRecent24h(e.date),
      );
      if (!expenses.length) continue;

      /* 3) Teléfono (perfil JSON, con fallback a la tabla profiles) */
      let phone = toMetaPhone(
        row.data?.settings?.profile?.whatsapp?.phone ||
        row.data?.settings?.profile?.whatsapp?.linkedPhone ||
        "",
      );
      if (!phone) {
        const pr = await fetch(
          supabaseUrl + "/rest/v1/profiles?select=whatsapp_number&user_id=eq." + encodeURIComponent(row.user_id) + "&limit=1",
          { headers: restHeaders },
        );
        const pRows = (await pr.json().catch(() => [])) as Array<{ whatsapp_number?: string }>;
        phone = toMetaPhone(pRows?.[0]?.whatsapp_number || "");
      }
      if (!phone) {
        console.warn("[GADU-WA-CRON] usuario sin teléfono:", row.user_id);
        continue;
      }

      /* 4) Obras activas → botones (≤3) o lista interactiva (>3) */
      const activeWorks = (row.data?.works || []).filter((w: Record<string, any>) => w.status === "activa");
      const works: Array<{ id: string; title: string }> = activeWorks.map((w: Record<string, any>) => ({
        id: "assign_work:" + String(w.id),
        title: String(w.nombre || w.name || "Obra").slice(0, 24),
      }));
      works.push({ id: "assign_general", title: "Gasto General" });

      /* 5) Enviar mensaje interactivo (botones si ≤3, lista si >3) */
      let ok = false;
      if (activeWorks.length <= 3) {
        const buttons = works.map(w => ({ id: w.id, title: w.title.slice(0, 20) }));
        ok = await sendWhatsAppButtons(phone, buildText(expenses), buttons);
      } else {
        ok = await sendWhatsAppList(phone, buildText(expenses), works);
      }
      if (ok) {
        processed++;
        /* Notificación push: avisar en el celular además del WhatsApp */
        firePush(
          row.user_id,
          "GADU · Gastos pendientes",
          "Tenés " + expenses.length + " gasto" + (expenses.length !== 1 ? "s" : "") + " sin asignar de hoy. Asignalos para mantener tus cuentas al día.",
          "/#/bandeja",
        );
      }
      console.log("[GADU-WA-CRON] usuario", row.user_id, "→", expenses.length, "gasto(s) pendiente(s), enviado:", ok);
    }

    return new Response(JSON.stringify({ ok: true, processed }), { status: 200, headers: corsHeaders });
  } catch (e) {
    console.error("[GADU-WA-CRON] error:", e);
    return new Response(JSON.stringify({ ok: false, error: String((e as Error)?.message || e) }), { status: 500, headers: corsHeaders });
  }
});
