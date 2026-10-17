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
  matchVerificationCode,
  normalizePhone,
  phoneMatches,
  buildContext,
  executeAction,
  localIntent,
  toMetaPhone,
  extractFrom,
} from "./core.ts";
import { resolveIncomingText } from "./transcribe.ts";
import { enqueueMessage, claimNext, markDone, markFailed } from "./queue.ts";

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

/* Desacopla trabajo pesado de la respuesta a Meta: responde 200 YA y sigue
   procesando en segundo plano. Evita que Meta marque timeout y deje de entregar. */
function fireAndForget(p: Promise<unknown>) {
  try {
    // deno-lint-ignore no-undef
    if (typeof EdgeRuntime !== "undefined" && typeof EdgeRuntime.waitUntil === "function") {
      // deno-lint-ignore no-undef
      EdgeRuntime.waitUntil(p);
      return;
    }
  } catch (_e) { /* caer al fallback */ }
  p.catch(e => console.error("[whatsapp-webhook] async error:", e));
}

/* Configuración de Supabase (lectura LAZY por request: el runtime inyecta
   las variables por petición, no siempre disponibles a nivel de módulo) */
function supabaseUrl() { return Deno.env.get("SUPABASE_URL") || ""; }
function serviceKey() { return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""; }
function anonKey() { return Deno.env.get("SUPABASE_ANON_KEY") || ""; }

async function rest(path: string, opts: Record<string, unknown> = {}) {
  const sk = serviceKey();
  const headers = {
    apikey: sk,
    Authorization: `Bearer ${sk}`,
    "Content-Type": "application/json",
    ...((opts.headers as Record<string, string>) || {}),
  };
  return await fetch(supabaseUrl() + "/rest/v1/" + path, { ...opts, headers } as RequestInit);
}

/* Envío de la respuesta al usuario por WhatsApp (Meta Cloud API).
   Sin token configurado, la respuesta viaja en el body del webhook (útil
   para puentes propios o pruebas). */
async function sendWhatsApp(to: string, text: string) {
  const token = Deno.env.get("WHATSAPP_TOKEN") || "";
  const phoneId = Deno.env.get("WHATSAPP_PHONE_ID") || "";
  const apiVersion = Deno.env.get("WHATSAPP_API_VERSION") || "v21.0";
  console.log("[DEBUG] Destinatario (to): " + to);
  console.log("[DEBUG] phone_number_id usado para enviar: " + phoneId);
  if (!token || !phoneId) {
    console.log("[whatsapp-webhook] sin WHATSAPP_TOKEN/WHATSAPP_PHONE_ID → respuesta en body");
    return false;
  }
  /* Destinatario normalizado para cuentas de prueba AR (549… → 54… sin el 9) */
  const toNormalized = toMetaPhone(to);
  const body = {
    messaging_product: "whatsapp",
    to: toNormalized,
    type: "text",
    text: { body: text },
  };
  /* Log detallado del payload exacto que se envía a Meta (incluye el `to` y la versión) */
  console.log("[whatsapp-webhook] sendWhatsApp payload (", apiVersion, "):", JSON.stringify(body));
  const res = await fetch(`https://graph.facebook.com/${apiVersion}/${phoneId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const respText = await res.text().catch(() => "");
  if (!res.ok) {
    if (respText.includes("131030") || respText.includes("not in allowed list")) {
      console.warn(
        "[whatsapp-webhook] Meta 131030: el destinatario",
        to,
        "NO está en la lista de permitidos del bot de prueba. Agregalo en Meta for Developers → WhatsApp → Test numbers.",
      );
    } else {
      console.error("[whatsapp-webhook] Meta Graph API falló:", res.status, respText);
    }
  } else {
    console.log("[whatsapp-webhook] Meta Graph API respondió:", res.status, respText);
  }
  return res.ok;
}

serve(async (req) => {
  /* Rastreo verbose: imprime SIEMPRE método, URL y headers de cualquier
     petición, para descartar filtros internos y validar el formato de los
     headers que envía Meta. */
  console.log("[whatsapp-webhook] request:", req.method, req.url);
  try {
    const headers: Record<string, string> = {};
    req.headers.forEach((v, k) => { headers[k] = v; });
    console.log("[whatsapp-webhook] headers:", JSON.stringify(headers));
  } catch (e) { console.warn("[whatsapp-webhook] no se pudieron leer headers:", e); }
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

  const body = await req.json().catch(() => ({}));
  console.log("=== PAYLOAD ENTRANTE ===", JSON.stringify(body));
  console.log("=== WEBHOOK EVENT RECEIVED ===", JSON.stringify(body));
  console.log("RAW BODY:", JSON.stringify(body));

  /* Encolar inmediato y procesar FIFO en segundo plano (no se pierde en ráfagas) */
  const fromQuick = extractFrom(body);
  const phoneQuick = fromQuick ? normalizePhone(fromQuick) : "desconocido";
  /* Encolar PRIMERO y recién después drenar (secuencial): si el drain corre
     antes de insertar, no ve el mensaje y queda "pending" para siempre. */
  fireAndForget((async () => {
    await enqueueMessage(rest, phoneQuick, body);
    await drainPhone(phoneQuick);
  })());

  return json({ ok: true });
});

/* ===== Mensajes interactivos (botones) ===== */
function detectInteractive(body: unknown): { from: string; buttonId: string } | null {
  try {
    const p = body as Record<string, any>;
    const msg = p?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!msg || msg.type !== "interactive") return null;
    const buttonId = String(msg.interactive?.button_reply?.id || "");
    const from = String(msg.from || p?.entry?.[0]?.changes?.[0]?.value?.contacts?.[0]?.wa_id || "");
    if (!buttonId || !from) return null;
    return { from: String(from).replace(/\D/g, ""), buttonId };
  } catch (_e) {
    return null;
  }
}

async function handleButtonReply(from: string, buttonId: string) {
  console.log("[GADU-WA-INTERACTIVE] botón:", buttonId, "de", from);

  /* 1) Buscar usuario (misma lógica de candidatos que el flujo de texto) */
  const fromCandidates = [...new Set([from, normalizePhone(from), "+" + normalizePhone(from)])];
  let userId: string | null = null;
  for (const phone of fromCandidates) {
    for (const field of ["linkedPhone", "phone"]) {
      const q = "data->settings->profile->whatsapp->>" + field + "=eq." + encodeURIComponent(phone);
      const r = await rest("app_data?select=user_id&" + q + "&limit=1");
      const rows = (await r.json().catch(() => [])) as Array<{ user_id: string }>;
      if (Array.isArray(rows) && rows.length) { userId = rows[0].user_id; break; }
    }
    if (userId) break;
    const qp = "whatsapp_number=eq." + encodeURIComponent(phone);
    const rp = await rest("profiles?select=user_id&" + qp + "&limit=1");
    const rowsP = (await rp.json().catch(() => [])) as Array<{ user_id: string }>;
    if (Array.isArray(rowsP) && rowsP.length) { userId = rowsP[0].user_id; break; }
  }
  if (!userId) {
    console.warn("[GADU-WA-INTERACTIVE] usuario no encontrado para", from);
    fireAndForget(sendWhatsApp(from, "🤖 No pude identificar tu cuenta."));
    return;
  }

  /* 2) Recuperar app_data */
  const rData = await rest("app_data?select=user_id,data&user_id=eq." + encodeURIComponent(userId) + "&limit=1");
  const rowsData = (await rData.json().catch(() => [])) as Array<{ data: Record<string, any> }>;
  if (!Array.isArray(rowsData) || !rowsData.length) {
    console.warn("[GADU-WA-INTERACTIVE] usuario sin app_data:", userId);
    fireAndForget(sendWhatsApp(from, "🤖 No encontré tus datos."));
    return;
  }
  const data = rowsData[0].data || {};

  /* 3) Gasto pendiente más reciente (unshift = el primero que cumple) */
  const expenses = (data.expenses || []) as Array<Record<string, any>>;
  const idx = expenses.findIndex(e => e.source === "whatsapp" && e.workId == null);
  if (idx === -1) {
    console.warn("[GADU-WA-INTERACTIVE] sin gastos pendientes para", userId);
    fireAndForget(sendWhatsApp(from, "🤖 No encontré gastos pendientes de asignar."));
    return;
  }
  const expense = expenses[idx];
  const monto = Number(expense.amount) || 0;

  /* 4) Asignar según el botón */
  if (buttonId.startsWith("assign_work:")) {
    const workId = buttonId.slice("assign_work:".length);
    const work = (data.works || []).find((w: Record<string, any>) => String(w.id) === workId);
    const workName = String(work?.nombre || work?.name || "la obra");
    expense.workId = workId;
    expense.type = "obra";
    fireAndForget(sendWhatsApp(from, "✅ Listo, el gasto de $" + monto + " fue asignado a la obra " + workName + "."));
  } else if (buttonId === "assign_general") {
    expense.workId = null;
    expense.type = "general";
    fireAndForget(sendWhatsApp(from, "✅ Listo, el gasto de $" + monto + " quedó registrado como Gasto General."));
  } else {
    console.warn("[GADU-WA-INTERACTIVE] botón desconocido:", buttonId);
    return;
  }

  /* 5) Guardar el JSON actualizado */
  const up = await rest("app_data?user_id=eq." + encodeURIComponent(userId), {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ data, updated_at: new Date().toISOString() }),
  });
  if (!up.ok) console.error("[GADU-WA-INTERACTIVE] falló PATCH app_data:", up.status);
  else console.log("[GADU-WA-INTERACTIVE] gasto asignado OK:", buttonId);
}

/* ===== Procesamiento del mensaje (extraído del handler) ===== */
async function processMessage(body: unknown) {
  try {
    /* Mensajes interactivos (botones) → asignar gasto pendiente */
    const btn = detectInteractive(body);
    if (btn) {
      await handleButtonReply(btn.from, btn.buttonId);
      return;
    }
    const resolved = await resolveIncomingText(body);
    if (!resolved) {
      console.warn("[whatsapp-webhook] payload no reconocido:", JSON.stringify(body));
      return;
    }
    if (resolved.audioFailed) {
      console.warn("[GADU-WA-AUDIO] transcripción falló para", resolved.from);
      fireAndForget(sendWhatsApp(resolved.from, "🤖 No pude escuchar el audio, ¿me lo escribís?"));
      return;
    }
    const inc = { from: resolved.from, text: resolved.text };
    console.log("[whatsapp-webhook] from=" + inc.from + " text=" + JSON.stringify(inc.text));
    console.log("[DEBUG] Remitente detectado: " + inc.from);

    if (!supabaseUrl() || !serviceKey()) {
      console.error("[whatsapp-webhook] falta SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
      return;
    }

    /* 1) Vinculación: código alfanumérico (mayúsculas, sin espacios).
       Búsqueda CASE-INSENSITIVE por código (ilike) y SIN filtrar por prefijo
       de celular: el número se valida aparte de forma tolerante (con/sin 9). */
    const code = (matchVerificationCode(inc.text) || "").trim().toUpperCase();
    if (code) {
      console.log("[whatsapp-webhook] código extraído:", code);
      const q = "data->settings->profile->whatsapp->>code=ilike." + encodeURIComponent(code);
      const r = await rest("app_data?select=user_id,data&" + q + "&limit=1");
      const rows = await r.json().catch(() => []);
      console.log("[whatsapp-webhook] consulta app_data (código):", code, "→ http", r.status, "·", (Array.isArray(rows) ? rows.length : 0), "coincidencia(s)", (Array.isArray(rows) && rows[0]) ? ("user_id=" + rows[0].user_id) : "");
      if (!r.ok || !Array.isArray(rows) || !rows.length) {
        console.warn("[whatsapp-webhook] código no encontrado/vencido:", code, "(http", r.status + ")");
        fireAndForget(sendWhatsApp(inc.from, "🤖 El código no es válido o ya expiró. Volvé a generarlo desde la app (Perfil → Vincular WhatsApp → Generar código) y envialo de nuevo."));
        return json({ ok: false, error: "código no encontrado o expirado" });
      }
      const row = rows[0];
      const wp = row.data?.settings?.profile?.whatsapp || {};
      if (!phoneMatches(wp.phone, inc.from)) {
        console.warn("[whatsapp-webhook] teléfono no coincide: from=" + inc.from + " perfil=" + String(wp.phone));
        fireAndForget(sendWhatsApp(inc.from, "🤖 El código es válido pero este número no coincide con el teléfono registrado en tu perfil."));
        return json({ ok: false, error: "teléfono no coincide" });
      }
      row.data.settings.profile.whatsapp = {
        ...wp,
        linked: true,
        linkedPhone: normalizePhone(inc.from),   // forma canónica (54 sin 9)
        linkedAt: new Date().toISOString(),
      };
      const up = await rest("app_data?user_id=eq." + encodeURIComponent(row.user_id), {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ data: row.data, updated_at: new Date().toISOString() }),
      });
      if (!up.ok) {
        console.error("[whatsapp-webhook] falló marcar linked:", up.status);
        return json({ ok: false, error: "no se pudo guardar la vinculación" });
      }
      /* Sincronizar la columna canónica whatsapp_number en public.profiles */
      try {
        const pPatch = await rest("profiles?user_id=eq." + encodeURIComponent(row.user_id), {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({ whatsapp_number: normalizePhone(inc.from) }),
        });
        if (!pPatch.ok) console.warn("[whatsapp-webhook] no se pudo sincronizar profiles.whatsapp_number:", pPatch.status);
      } catch (e) {
        console.warn("[whatsapp-webhook] error sincronizando profiles.whatsapp_number:", e);
      }
      console.log("[whatsapp-webhook] cuenta vinculada:", row.user_id, "teléfono:", inc.from);
      const reply = "¡Hola! Tu cuenta de Gestión GADU ha sido vinculada correctamente con este número de WhatsApp. Ya podés recibir tus avisos y reportes aquí.";
      fireAndForget(sendWhatsApp(inc.from, reply));
      return json({ ok: true, from: inc.from, reply });
    }

    /* 2) Usuario vinculado: busca por linkedPhone/phone (app_data) y por la
       columna canónica whatsapp_number (public.profiles), probando todas las
       variantes del número (con/sin el 9, con/sin '+'). */
    const fromCandidates = [...new Set([
      inc.from,
      normalizePhone(inc.from),
      "+" + normalizePhone(inc.from),
    ])];
    let userId2: string | null = null;
    const fields = ["linkedPhone", "phone"];
    for (const phone of fromCandidates) {
      /* 2a) app_data: linkedPhone y phone */
      for (const field of fields) {
        const q2 = "data->settings->profile->whatsapp->>" + field + "=eq." + encodeURIComponent(phone);
        const r2 = await rest("app_data?select=user_id&" + q2 + "&limit=1");
        const rows2 = await r2.json().catch(() => []);
        console.log("[whatsapp-webhook] consulta app_data (" + field + "):", phone, "→ http", r2.status, "·", (Array.isArray(rows2) ? rows2.length : 0), "coincidencia(s)");
        if (Array.isArray(rows2) && rows2.length) { userId2 = rows2[0].user_id; break; }
      }
      if (userId2) break;
      /* 2b) public.profiles: columna canónica whatsapp_number */
      const qp = "whatsapp_number=eq." + encodeURIComponent(phone);
      const rp = await rest("profiles?select=user_id&" + qp + "&limit=1");
      const rowsp = await rp.json().catch(() => []);
      console.log("[whatsapp-webhook] consulta profiles (whatsapp_number):", phone, "→ http", rp.status, "·", (Array.isArray(rowsp) ? rowsp.length : 0), "coincidencia(s)");
      if (Array.isArray(rowsp) && rowsp.length) { userId2 = rowsp[0].user_id; break; }
    }
    if (!userId2) {
      console.warn("[whatsapp-webhook] número no vinculado:", inc.from);
      const rpl = "🤖 No reconozco este número. Primero vinculá tu cuenta: desde la app generá tu código y envialo por WhatsApp.";
      fireAndForget(sendWhatsApp(inc.from, rpl));
      return json({ ok: false, error: "número no vinculado", reply: rpl });
    }
    /* 2c) Recuperar el documento app_data del usuario encontrado */
    const rData = await rest("app_data?select=user_id,data&user_id=eq." + encodeURIComponent(userId2) + "&limit=1");
    const rowsData = await rData.json().catch(() => []);
    if (!Array.isArray(rowsData) || !rowsData.length) {
      console.warn("[whatsapp-webhook] usuario sin app_data:", userId2);
      const rpl = "🤖 Encontré tu cuenta pero aún no tiene datos. Abrí la app una vez para sincronizar y volvé a intentarlo.";
      fireAndForget(sendWhatsApp(inc.from, rpl));
      return json({ ok: false, error: "sin app_data", reply: rpl });
    }
    const row = rowsData[0];
    const data = row.data || {};

    /* 3) Mismo motor que el chat web: ai-assistant en modo servidor.
       Si el LLM no responde o falla la auth, hay fallback local (localIntent)
       para "Gasté X en Y" / "Ingresé X por Y" y el negocio sigue operando. */
    let aiReply = "";
    let action: { modulo: string; campos?: Record<string, unknown> } | null = null;
    try {
      const aiRes = await fetch(supabaseUrl() + "/functions/v1/ai-assistant", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: anonKey(),
          Authorization: `Bearer ${serviceKey()}`,
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
      aiReply = ai.reply || "";
      if (ai.action && ai.action.modulo) action = ai.action;
    } catch (e) {
      console.error("[whatsapp-webhook] ai-assistant falló:", e);
    }
    /* Fallback local: si no hubo acción de la IA, intentamos el patrón simple */
    if (!action) {
      const local = localIntent(inc.text);
      if (local) {
        action = local;
        console.log("[whatsapp-webhook] usando intent local:", JSON.stringify(local));
      }
    }
    console.log("[DEBUG] Intent detectado: " + (action ? action.modulo : "ninguno"));

    /* Saludo → respuesta directa (sin acción contable) */
    if (action && action.modulo === "saludo") {
      const reply = ((action as unknown) as { reply?: string }).reply || "¡Hola! 👋 Soy GADU. ¿En qué te ayudo?";
      fireAndForget(sendWhatsApp(inc.from, reply));
      return json({ ok: true, from: inc.from, reply });
    }

    /* 4) Ejecutar la acción contable (gasto/ingreso) e impactar en app_data */
    if (action && ["gasto", "ingreso", "empleado", "adelanto", "obra"].includes(action.modulo)) {
      const res = executeAction(data, action, inc.text, () => crypto.randomUUID(), new Date().toISOString().slice(0, 10));
      if (res.ok) {
        const up = await rest("app_data?user_id=eq." + encodeURIComponent(row.user_id), {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({ data, updated_at: new Date().toISOString() }),
        });
        if (!up.ok) {
          console.error("[whatsapp-webhook] falló impactar el movimiento:", up.status);
          return json({ ok: false, error: "no se pudo guardar el movimiento" });
        }
        const reply = (aiReply ? aiReply + "\n\n" : "") + "✅ " + res.label;
        fireAndForget(sendWhatsApp(inc.from, reply));
        return json({ ok: true, from: inc.from, reply });
      }
      const reply = aiReply || ("🤖 Me falta " + (res.missing || "un dato") + " para cargarlo. Decímelo por acá.");
      fireAndForget(sendWhatsApp(inc.from, reply));
      return json({ ok: true, from: inc.from, reply });
    }

      /* 5) Consultas y otros módulos: responde la IA (igual que el chat web) */
      const reply = aiReply || "🤖 Recibí tu mensaje. Para cargas complejas (obras, empleados, jornadas) te conviene completarlas en la app: https://gestiongadu.vercel.app";
      fireAndForget(sendWhatsApp(inc.from, reply));
      return json({ ok: true, from: inc.from, reply });
  } catch (error) {
    console.error("CRITICAL ERROR:", error);
  }
}

/* ===== Drain FIFO de la cola ===== */
async function drainPhone(phone: string) {
  /* Mutex por teléfono: si otro drain ya tiene un mensaje en 'processing',
     salimos para no pisar el read-modify-write de app_data. */
  const busy = await rest("whatsapp_queue?status=eq.processing&phone=eq." + encodeURIComponent(phone) + "&limit=1", { method: "GET" });
  const busyRows = (await busy.json().catch(() => [])) as Array<{ id: number }>;
  if (Array.isArray(busyRows) && busyRows.length) return;

  let item = await claimNext(rest, phone);
  while (item) {
    try {
      await processMessage(item.payload);
      await markDone(rest, item.id);
    } catch (e) {
      console.error("[whatsapp-webhook] falló mensaje " + item.id, e);
      await markFailed(rest, item.id);
    }
    item = await claimNext(rest, phone);
  }
}
