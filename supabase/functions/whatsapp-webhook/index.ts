// ============================================================
// GADU · Conector de WhatsApp (Supabase Edge Function)
// Ruta: /functions/v1/whatsapp-webhook
// Recibe mensajes de texto o notas de voz (ya transcritas) de
// usuarios vinculados y los procesa con el MISMO motor del chat
// web (ai-assistant → action → app_data). El chat flotante de la
// web sigue funcionando independiente: este conector solo agrega
// el canal omnicanal.
//
// Variables de entorno (secrets de Supabase — NO commitear en el repo):
//   SUPABASE_URL · SUPABASE_ANON_KEY · SUPABASE_SERVICE_ROLE_KEY
//   WHATSAPP_TOKEN        → token de acceso de Meta Cloud API
//   WHATSAPP_PHONE_ID     → Phone Number ID de Meta (del bot de prueba)
//   WHATSAPP_WABA_ID      → WhatsApp Business Account ID (referencia)
//   WHATSAPP_VERIFY_TOKEN → token de verificación del webhook (GET hub.verify_token)
//   Número de prueba del bot: 15556643689 (+1 555 664-3689)
//
// Cómo cargarlos (NO en archivos versionados):
//   supabase secrets set \
//     WHATSAPP_TOKEN="<TOKEN>" \
//     WHATSAPP_PHONE_ID="1360123317189034" \
//     WHATSAPP_WABA_ID="4685722798416623" \
//     WHATSAPP_VERIFY_TOKEN="<CADENA_ALEATORIA_PROPIA>"
//
// Despliegue:
//   supabase functions deploy whatsapp-webhook
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  parseIncoming,
  matchVerificationCode,
  phoneMatches,
  buildContext,
  executeAction,
} from "./core.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/* Envío de la respuesta al usuario por WhatsApp (Meta Cloud API).
   Sin token configurado, la respuesta viaja en el body del webhook (útil
   para puentes propios o pruebas). */
async function sendWhatsApp(to: string, text: string) {
  const token = Deno.env.get("WHATSAPP_TOKEN") || "";
  const phoneId = Deno.env.get("WHATSAPP_PHONE_ID") || "";
  if (!token || !phoneId) {
    console.log("[whatsapp-webhook] sin WHATSAPP_TOKEN/WHATSAPP_PHONE_ID → respuesta en body");
    return false;
  }
  const res = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: text },
    }),
  });
  if (!res.ok) console.error("[whatsapp-webhook] no se pudo responder:", res.status, await res.text().catch(() => ""));
  return res.ok;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  /* ===== Verificación del webhook de Meta (GET) =====
     Meta exige responder con `hub.challenge` cuando `hub.verify_token`
     coincide con nuestro secreto (WHATSAPP_VERIFY_TOKEN). SIN este
     handshake Meta NO habilita el webhook y NUNCA entrega mensajes:
     esta es la causa más común de "no vincula ni responde". */
  if (req.method === "GET") {
    try {
      const url = new URL(req.url);
      const mode = url.searchParams.get("hub.mode");
      const token = url.searchParams.get("hub.verify_token");
      const challenge = url.searchParams.get("hub.challenge");
      const expected = Deno.env.get("WHATSAPP_VERIFY_TOKEN") || "";
      if (mode === "subscribe" && expected && token === expected && challenge) {
        return new Response(challenge, { status: 200 });
      }
      console.warn("[whatsapp-webhook] verificación GET fallida:", { mode, token, expected });
      return new Response("verification failed", { status: 403 });
    } catch (e) {
      return new Response("verification failed", { status: 403 });
    }
  }

  try {
    const payload = await req.json().catch(() => ({}));
    const inc = parseIncoming(payload);
    if (!inc) return json({ ok: false, error: "mensaje no reconocido (se espera texto o nota de voz transcrita)" });

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!supabaseUrl || !serviceKey) return json({ ok: false, error: "configuración incompleta" }, 500);

    const rest = async (path: string, opts: Record<string, unknown> = {}) => {
      const headers = {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
        ...((opts.headers as Record<string, string>) || {}),
      };
      return await fetch(supabaseUrl + "/rest/v1/" + path, { ...opts, headers } as RequestInit);
    };

    /* 1) Vinculación: "GADU · Mi código de verificación: 123456" */
    const code = matchVerificationCode(inc.text);
    if (code) {
      const q = "data->settings->profile->whatsapp->>code=eq." + encodeURIComponent(code);
      const r = await rest("app_data?select=user_id,data&" + q + "&limit=1");
      const rows = await r.json().catch(() => []);
      if (!r.ok || !Array.isArray(rows) || !rows.length) {
        await sendWhatsApp(inc.from, "🤖 Ese código no coincide con ninguna cuenta GADU. Revisalo y volvé a enviarlo.");
        return json({ ok: false, error: "código no encontrado" });
      }
      const row = rows[0];
      const wp = row.data?.settings?.profile?.whatsapp || {};
      if (!phoneMatches(wp.phone, inc.from)) {
        await sendWhatsApp(inc.from, "🤖 El código es válido pero este número no coincide con el teléfono registrado en tu perfil.");
        return json({ ok: false, error: "teléfono no coincide" });
      }
      row.data.settings.profile.whatsapp = {
        ...wp,
        linked: true,
        linkedPhone: inc.from,
        linkedAt: new Date().toISOString(),
      };
      const up = await rest("app_data?user_id=eq." + encodeURIComponent(row.user_id), {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ data: row.data, updated_at: new Date().toISOString() }),
      });
      if (!up.ok) {
        console.error("[whatsapp-webhook] falló marcar linked:", up.status);
        return json({ ok: false, error: "no se pudo guardar la vinculación" }, 500);
      }
      const reply = "¡Hola! Tu cuenta de Gestión GADU ha sido vinculada correctamente con este número de WhatsApp. Ya podés recibir tus avisos y reportes aquí.";
      await sendWhatsApp(inc.from, reply);
      return json({ ok: true, from: inc.from, reply });
    }

    /* 2) Usuario vinculado por teléfono */
    const q2 = "data->settings->profile->whatsapp->>linkedPhone=eq." + encodeURIComponent(inc.from);
    const r2 = await rest("app_data?select=user_id,data&" + q2 + "&limit=1");
    const rows2 = await r2.json().catch(() => []);
    if (!r2.ok || !Array.isArray(rows2) || !rows2.length) {
      const rpl = "🤖 No reconozco este número. Primero vinculá tu cuenta: desde la app generá tu código y envialo por WhatsApp.";
      await sendWhatsApp(inc.from, rpl);
      return json({ ok: false, error: "número no vinculado", reply: rpl });
    }
    const row = rows2[0];
    const data = row.data || {};

    /* 3) Mismo motor que el chat web: ai-assistant en modo servidor */
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const aiRes = await fetch(supabaseUrl + "/functions/v1/ai-assistant", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: anonKey,
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        message: inc.text,
        context: buildContext(data),
        mode: "usuario",
        channel: "whatsapp",
        service: true,
        userId: row.user_id,
      }),
    });
    const ai = await aiRes.json().catch(() => ({}));
    const action = (ai.action && ai.action.modulo) ? ai.action : null;

    /* 4) Ejecutar la acción contable (gasto/ingreso) e impactar en app_data */
    if (action && (action.modulo === "gasto" || action.modulo === "ingreso")) {
      const res = executeAction(data, action, inc.text, () => crypto.randomUUID(), new Date().toISOString().slice(0, 10));
      if (res.ok) {
        const up = await rest("app_data?user_id=eq." + encodeURIComponent(row.user_id), {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({ data, updated_at: new Date().toISOString() }),
        });
        if (!up.ok) {
          console.error("[whatsapp-webhook] falló impactar el movimiento:", up.status);
          return json({ ok: false, error: "no se pudo guardar el movimiento" }, 500);
        }
        const reply = (ai.reply ? ai.reply + "\n\n" : "") + "✅ " + res.label;
        await sendWhatsApp(inc.from, reply);
        return json({ ok: true, from: inc.from, reply });
      }
      const reply = ai.reply || ("🤖 Me falta " + (res.missing || "un dato") + " para cargarlo. Decímelo por acá.");
      await sendWhatsApp(inc.from, reply);
      return json({ ok: true, from: inc.from, reply });
    }

    /* 5) Consultas y otros módulos: responde la IA (igual que el chat web) */
    const reply = ai.reply || "🤖 Recibí tu mensaje. Para cargas complejas (obras, empleados, jornadas) te conviene completarlas en la app: https://gestiongadu.vercel.app";
    await sendWhatsApp(inc.from, reply);
    return json({ ok: true, from: inc.from, reply });
  } catch (e) {
    console.error("[whatsapp-webhook] error inesperado:", e);
    return json({ ok: false, error: String((e && (e as Error).message) || e) }, 500);
  }
});
