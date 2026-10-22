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

import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";
import {
  matchVerificationCode,
  matchLicenseCode,
  normalizePhone,
  phoneMatches,
  buildContext,
  executeAction,
  localIntent,
  detectAdvanceIntent,
  parseAdvanceNameAmount,
  resolveAdvanceTarget,
  toMetaPhone,
  extractFrom,
  formatProperName,
  rawDigits,
  detectQueryIntent,
  computeQuery,
  queryLink,
  computeReporte,
  calcularDeudasEmpleados,
} from "./core.ts";
import { resolveIncomingText } from "./transcribe.ts";
import { enqueueMessage, claimNext, markDone, markFailed, resetStaleProcessing } from "./queue.ts";

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
      EdgeRuntime.waitUntil(p.catch(e => console.error("[GADU-WA-CRITICAL-FIX] async error (waitUntil):", e)));
      return;
    }
  } catch (_e) { /* caer al fallback */ }
  p.catch(e => console.error("[GADU-WA-CRITICAL-FIX] async error:", e));
}

/* Configuración de Supabase (lectura LAZY por request: el runtime inyecta
   las variables por petición, no siempre disponibles a nivel de módulo) */
function supabaseUrl() { return Deno.env.get("SUPABASE_URL") || ""; }
function serviceKey() { return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""; }
function anonKey() { return Deno.env.get("SUPABASE_ANON_KEY") || ""; }

/* Dispara una notificación push (fire-and-forget; nunca bloquea ni tira) */
function firePush(userId: string, title: string, message: string, url: string) {
  fireAndForget((async () => {
    try {
      const res = await fetchWithTimeout(supabaseUrl() + "/functions/v1/send-push", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-service-secret": Deno.env.get("SERVICE_SECRET") || "",
        },
        body: JSON.stringify({ user_id: userId, title, message, url }),
      });
      if (!res.ok) console.warn("[GADU-WA-PUSH] send-push respondió:", res.status);
    } catch (e) {
      console.warn("[GADU-WA-PUSH] error:", e);
    }
  })());
}

/* Verifica la firma HMAC-SHA256 de Meta (X-Hub-Signature-256).
   Comparación en tiempo constante para evitar timing attacks. */
async function verifyMetaSignature(rawBody: string, secret: string, signatureHeader: string): Promise<boolean> {
  try {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const sig = await crypto.subtle.sign("HMAC", key, enc.encode(rawBody));
    const hex = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
    const expected = "sha256=" + hex;
    const a = enc.encode(expected);
    const b = enc.encode(String(signatureHeader || "").trim());
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
    return diff === 0;
  } catch (e) {
    console.error("[whatsapp-webhook] error verificando firma de Meta:", e);
    return false;
  }
}

/* fetch con timeout (AbortController). Lanza "Timeout exceeded" si se agota. */
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

async function rest(path: string, opts: Record<string, unknown> = {}) {
  const sk = serviceKey();
  const headers = {
    apikey: sk,
    Authorization: `Bearer ${sk}`,
    "Content-Type": "application/json",
    ...((opts.headers as Record<string, string>) || {}),
  };
  return await fetchWithTimeout(supabaseUrl() + "/rest/v1/" + path, { ...opts, headers } as RequestInit);
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
  const res = await fetchWithTimeout(`https://graph.facebook.com/${apiVersion}/${phoneId}/messages`, {
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

/* Envía un mensaje interactivo con hasta 3 botones de respuesta (obras) */
async function sendWhatsAppButtons(
  to: string,
  text: string,
  buttons: Array<{ id: string; title: string }>,
): Promise<boolean> {
  const token = Deno.env.get("WHATSAPP_TOKEN") || "";
  const phoneId = Deno.env.get("WHATSAPP_PHONE_ID") || "";
  const apiVersion = Deno.env.get("WHATSAPP_API_VERSION") || "v21.0";
  if (!token || !phoneId) {
    console.warn("[GADU-WA-BUTTONS] sin WHATSAPP_TOKEN/WHATSAPP_PHONE_ID");
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
  console.log("[GADU-WA-BUTTONS] payload:", JSON.stringify(body));
  const res = await fetchWithTimeout(`https://graph.facebook.com/${apiVersion}/${phoneId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const respText = await res.text().catch(() => "");
  if (!res.ok) console.error("[GADU-WA-BUTTONS] Meta falló:", res.status, respText);
  else console.log("[GADU-WA-BUTTONS] Meta OK:", res.status);
  return res.ok;
}

/* Envía un mensaje interactivo de tipo "list" (hasta 10 filas).
   Cada fila usa un id estable; `description` y los rótulos son configurables. */
async function sendWhatsAppList(
  to: string,
  text: string,
  works: Array<{ id: string; title: string; description?: string }>,
  opts?: { button?: string; sectionTitle?: string },
): Promise<boolean> {
  const token = Deno.env.get("WHATSAPP_TOKEN") || "";
  const phoneId = Deno.env.get("WHATSAPP_PHONE_ID") || "";
  const apiVersion = Deno.env.get("WHATSAPP_API_VERSION") || "v21.0";
  if (!token || !phoneId) {
    console.warn("[GADU-WA-LIST] sin WHATSAPP_TOKEN/WHATSAPP_PHONE_ID");
    return false;
  }
  const buttonLabel = (opts && opts.button) || "Ver opciones";
  const sectionTitle = (opts && opts.sectionTitle) || "Opciones";
  const body = {
    messaging_product: "whatsapp",
    to: toMetaPhone(to),
    type: "interactive",
    interactive: {
      type: "list",
      body: { text },
      action: {
        button: buttonLabel,
        sections: [{
          title: sectionTitle,
          rows: works.slice(0, 10).map(w => ({
            id: w.id,
            title: w.title.slice(0, 24),
            description: w.description || "Seleccionar opción",
          })),
        }],
      },
    },
  };
  console.log("[GADU-WA-LIST] payload:", JSON.stringify(body));
  const res = await fetchWithTimeout(`https://graph.facebook.com/${apiVersion}/${phoneId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const respText = await res.text().catch(() => "");
  if (!res.ok) console.error("[GADU-WA-LIST] Meta falló:", res.status, respText);
  else console.log("[GADU-WA-LIST] Meta OK:", res.status);
  return res.ok;
}

/* Menú principal unificado (lista interactiva, hasta 10 filas) */
/* ============================================================
   MENÚ JERÁRQUICO (3 categorías → submenús)
   Evita el spam: UN solo mensaje interactivo por pantalla.
   ============================================================ */
const MENU_CATEGORIES = [
  { id: "menu_cargar", title: "💰 Cargar Movimiento", description: "Gasto, inversión, adelanto, cobro" },
  { id: "menu_metricas", title: "📊 Consultar y Reportes", description: "Saldos, balances y deudas" },
  { id: "menu_gestionar", title: "🏗️ Gestionar", description: "Obra, presupuesto, contacto" },
];

const SUBMENUS: Record<string, Array<{ id: string; title: string; description?: string }>> = {
  menu_cargar: [
    { id: "action_nuevo_gasto", title: "Cargar Gasto" },
    { id: "action_inversion", title: "Registrar Inversión" },
    { id: "action_adelanto", title: "Pago / Adelanto" },
    { id: "action_herramienta", title: "Registrar Herramienta" },
    { id: "action_ingreso", title: "Registrar Cobro" },
  ],
  menu_metricas: [
    { id: "action_consulta", title: "Consultar Saldo" },
    { id: "action_balance_obra", title: "Balance de Obra" },
    { id: "metricas_deudas", title: "Deudas de Empleados" },
  ],
  menu_gestionar: [
    { id: "action_nueva_obra", title: "Nueva Obra" },
    { id: "action_presupuesto", title: "Presupuesto" },
    { id: "action_contacto", title: "Nuevo Contacto" },
    { id: "action_asistencia", title: "Registrar Asistencia" },
    { id: "action_humano", title: "Hablar con humano" },
  ],
};

/* Envía el saludo + el menú en UN SOLO mensaje interactivo (sin spam).
   El cuerpo del mensaje es el saludo; las categorías van dentro de la lista. */
async function showMainMenu(from: string, header: string): Promise<void> {
  await sendWhatsAppList(from, header, MENU_CATEGORIES, { button: "Ver menú", sectionTitle: "¿Qué querés hacer?" });
}

/* Envía un submenú (segunda pantalla del menú jerárquico) */
async function showSubMenu(from: string, categoria: string): Promise<void> {
  const items = SUBMENUS[categoria] || [];
  if (!items.length) return;
  const titulos: Record<string, string> = {
    menu_cargar: "💰 Cargar Movimiento",
    menu_metricas: "📊 Consultar y Reportes",
    menu_gestionar: "🏗️ Gestionar",
  };
  await sendWhatsAppList(from, "Elegí una opción 👇", items, { button: "Ver opciones", sectionTitle: titulos[categoria] || "Opciones" });
}

/* Busca el user_id por teléfono (variantes con/sin 9, con/sin +) */
async function findUserId(from: string): Promise<string | null> {
  const fromCandidates = [...new Set([from, normalizePhone(from), "+" + normalizePhone(from)])];
  for (const phone of fromCandidates) {
    for (const field of ["linkedPhone", "phone"]) {
      const q = "data->settings->profile->whatsapp->>" + field + "=eq." + encodeURIComponent(phone);
      const r = await rest("app_data?select=user_id&" + q + "&limit=1");
      const rows = (await r.json().catch(() => [])) as Array<{ user_id: string }>;
      if (Array.isArray(rows) && rows.length) return rows[0].user_id;
    }
    const qp = "whatsapp_number=eq." + encodeURIComponent(phone);
    const rp = await rest("profiles?select=user_id&" + qp + "&limit=1");
    const rowsP = (await rp.json().catch(() => [])) as Array<{ user_id: string }>;
    if (Array.isArray(rowsP) && rowsP.length) return rowsP[0].user_id;
  }
  return null;
}

/* Sesiones del wizard (tabla whatsapp_sessions).
   IMPORTANTE: normalizamos el teléfono SIEMPRE (canonical 54 sin "9") para que
   upsertSession/deleteSession (que reciben el `from` crudo de los botones) y
   getSession (que recibe normalizePhone desde processMessage) apunten a la MISMA
   clave. Antes, un botón guardaba "549…" (con 9) y el wizard leía "54…" (sin 9),
   perdiendo el estado (p. ej. WAITING_CONTACT) y cayendo al fallback. */
async function getSession(phone: string) {
  const r = await rest("whatsapp_sessions?phone_number=eq." + encodeURIComponent(normalizePhone(phone)) + "&limit=1", { method: "GET" });
  const rows = (await r.json().catch(() => [])) as Array<{ state: string; context: Record<string, unknown>; is_paused?: boolean; paused_until?: string }>;
  return (Array.isArray(rows) && rows.length) ? rows[0] : null;
}
async function upsertSession(phone: string, userId: string, state: string, context: Record<string, unknown>) {
  await rest("whatsapp_sessions", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({ phone_number: normalizePhone(phone), user_id: userId, state, context, is_paused: false, updated_at: new Date().toISOString() }),
  });
}
async function deleteSession(phone: string) {
  await rest("whatsapp_sessions?phone_number=eq." + encodeURIComponent(normalizePhone(phone)), { method: "DELETE" });
}

/* Pausa/Reanuda el bot para un teléfono (flag is_paused en whatsapp_sessions).
   Mientras está pausado, processMessage corta y no responde automáticamente. */
async function setPaused(phone: string, paused: boolean) {
  await rest("whatsapp_sessions?phone_number=eq." + encodeURIComponent(normalizePhone(phone)), {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ is_paused: paused, paused_until: paused ? new Date().toISOString() : null, updated_at: new Date().toISOString() }),
  });
}

/* ¿El usuario tiene un ticket de soporte ABIERTO? Devuelve el ticket (id + messages)
   o null. Mientras esté abierto, el bot NO responde automáticamente. */
async function getOpenSupportTicket(phone: string): Promise<{ id: number; messages: Array<{ role: string; text: string; at: string }> } | null> {
  try {
    const r = await rest(
      "support_tickets?phone=eq." + encodeURIComponent(normalizePhone(phone)) + "&status=eq.open&select=id,messages&limit=1",
      { method: "GET" },
    );
    const rows = (await r.json().catch(() => [])) as Array<{ id: number; messages?: unknown }>;
    if (!Array.isArray(rows) || !rows.length) return null;
    const messages = Array.isArray(rows[0].messages) ? rows[0].messages : [];
    return { id: rows[0].id, messages };
  } catch (e) {
    return null;
  }
}

/* Registra un mensaje del usuario en el historial del ticket (para que el
   admin lo vea en el chat). No responde: el bot queda en silencio. */
async function appendSupportMessage(phone: string, text: string): Promise<void> {
  try {
    const ticket = await getOpenSupportTicket(phone);
    if (!ticket) return;
    const messages = ticket.messages.concat([{ role: "user", text, at: new Date().toISOString() }]);
    await rest("support_tickets?id=eq." + ticket.id, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ messages }),
    });
  } catch (e) {
    console.warn("[GADU-WA-SUPPORT] error registrando mensaje:", e);
  }
}

/* Número personal del administrador (Franco) que recibe la alerta de nuevos tickets */
const ADMIN_WHATSAPP = Deno.env.get("ADMIN_WHATSAPP") || "5493547469000";

/* Avisa al administrador por WhatsApp cuando se crea un nuevo ticket de soporte */
async function notifyAdminNewTicket(phone: string): Promise<void> {
  try {
    const token = Deno.env.get("WHATSAPP_TOKEN") || "";
    const phoneId = Deno.env.get("WHATSAPP_PHONE_ID") || "";
    const apiVersion = Deno.env.get("WHATSAPP_API_VERSION") || "v21.0";
    if (!token || !phoneId) return;
    const body = {
      messaging_product: "whatsapp",
      to: ADMIN_WHATSAPP,
      type: "text",
      text: { body: "🔔 Nueva solicitud de soporte de " + phone + ". Revisá el panel para responder." },
    };
    const res = await fetchWithTimeout(`https://graph.facebook.com/${apiVersion}/${phoneId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) console.warn("[GADU-WA-SUPPORT] no se pudo avisar al admin:", res.status);
    else console.log("[GADU-WA-SUPPORT] admin notificado por ticket de", phone);
  } catch (e) {
    console.warn("[GADU-WA-SUPPORT] error avisando al admin:", e);
  }
}

/* Al pedir obra: SELECT obras activas (LIMIT 3) y envía botones */
async function askForWork(phone: string, userId: string, data: Record<string, any>) {
  const activeWorks = (data.works || []).filter((w: any) => w.status === "activa");

  if (activeWorks.length >= 1 && activeWorks.length <= 3) {
    const buttons = activeWorks.map((w: any) => ({
      id: "assign_work:" + String(w.id),
      title: String(w.nombre || w.name || "Obra"),
    }));
    buttons.push({ id: "assign_general", title: "Gasto General" });
    await upsertSession(phone, userId, "WAITING_WORK", {});
    await sendWhatsAppButtons(phone, "¿A qué obra asignamos el gasto?", buttons);
    return;
  }

  if (activeWorks.length > 3) {
    const works = activeWorks.map((w: any) => ({
      id: "assign_work:" + String(w.id),
      title: String(w.nombre || w.name || "Obra"),
    }));
    works.push({ id: "assign_general", title: "Gasto General" });
    await upsertSession(phone, userId, "WAITING_WORK", {});
    await sendWhatsAppList(phone, "¿A qué obra asignamos el gasto?", works);
    return;
  }

  await upsertSession(phone, userId, "WAITING_WORK", {});
  await sendWhatsAppButtons(phone, "No tenés obras activas. ¿Lo dejamos como Gasto General?", [
    { id: "assign_general", title: "Gasto General" },
  ]);
}

/* Idempotencia: evita procesar dos veces el mismo mensaje (reintentos de Meta) */
function extractMessageId(payload: unknown): string {
  const p = payload as Record<string, any>;
  return String(p?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.id || "");
}
async function isDuplicate(messageId: string): Promise<boolean> {
  if (!messageId) return false;
  const r = await rest("whatsapp_processed_messages?message_id=eq." + encodeURIComponent(messageId) + "&limit=1", { method: "GET" });
  const rows = await r.json().catch(() => []);
  return Array.isArray(rows) && rows.length > 0;
}
async function markProcessed(messageId: string): Promise<void> {
  if (!messageId) return;
  await rest("whatsapp_processed_messages", {
    method: "POST",
    headers: { Prefer: "resolution=ignore-duplicates" },
    body: JSON.stringify({ message_id: messageId }),
  });
}

/* ===== Consultas (Q&A) sobre app_data ===== */
function money(n: unknown): string {
  return "$" + Math.round(Number(n) || 0).toLocaleString("es-AR");
}
function flatStr(s: unknown): string {
  return String(s || "").toLowerCase().normalize("NFD").split("").filter((c: string) => { const n = c.charCodeAt(0); return n < 768 || n > 879; }).join("");
}
/* Normaliza nombres para matching tolerante (sin artículos/preposiciones) */
function normStr(s: unknown): string {
  return flatStr(s)
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(?:de|del|la|el|los|las|en|a|con|y|e|al|un|una|casa|obra|obras|proyecto|the|of|para|por|mi|mis)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function resolveFecha(raw: string): string {
  const r = String(raw || "hoy").toLowerCase();
  const hoy = new Date();
  if (r === "hoy" || !r) return hoy.toISOString().slice(0, 10);
  if (r === "ayer") return new Date(hoy.getTime() - 86400000).toISOString().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(r)) return r;
  return hoy.toISOString().slice(0, 10);
}
function findWorkByName(data: Record<string, any>, target: string): Record<string, any> | null {
  const ws = (data.works || []) as Array<Record<string, any>>;
  if (!ws.length) return null;
  const t = String(target || "").toLowerCase();
  if (t) {
    const hit = ws.find((w) => String(w.name || w.nombre || "").toLowerCase().includes(t));
    if (hit) return hit;
  }
  return ws[0];
}
function queryBalanceWork(data: Record<string, any>, target: string): string {
  const w = findWorkByName(data, target);
  if (!w) return "🤖 No encontré esa obra.";
  const cobrado = (data.incomes || []).filter((i: any) => i.workId === w.id).reduce((s: number, i: any) => s + (Number(i.amount) || 0), 0);
  const gastos = (data.expenses || []).filter((e: any) => e.type === "obra" && e.workId === w.id).reduce((s: number, e: any) => s + (Number(e.amount) || 0), 0);
  return "📊 El saldo de la obra *" + (w.name || w.nombre || "sin nombre") + "* es de *" + money(cobrado - gastos) + "* (Cobrado: " + money(cobrado) + ", Gastos: " + money(gastos) + ")";
}
function queryExpensesWeek(data: Record<string, any>): string {
  const cutoff = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const list = (data.expenses || []).filter((e: any) => String(e.date || "") >= cutoff);
  if (!list.length) return "💰 No tenés gastos en los últimos 7 días.";
  const total = list.reduce((s: number, e: any) => s + (Number(e.amount) || 0), 0);
  const detalle = list.slice(0, 5).map((e: any) => "· " + (e.category || e.description || "gasto") + ": " + money(e.amount)).join("\n");
  return "💰 Gastaste *" + money(total) + "* en los últimos 7 días (" + list.length + " gastos):\n" + detalle;
}
function queryAttendanceToday(data: Record<string, any>): string {
  const hoy = new Date().toISOString().slice(0, 10);
  const att = (data.attendance || []).filter((a: any) => String(a.date || "").slice(0, 10) === hoy && a.status !== "ausente");
  if (!att.length) return "👷 Hoy no registraste jornadas.";
  const names = att.map((a: any) => {
    const emp = (data.employees || []).find((e: any) => e.id === a.employeeId);
    return emp ? ((emp.firstName || "") + " " + (emp.lastName || "")).trim() : "empleado";
  });
  return "👷 Hoy trabajaron: *" + names.join(", ") + "*";
}
function queryPendingSalaries(data: Record<string, any>, target: string): string {
  const emps = (data.employees || []) as Array<Record<string, any>>;
  if (!emps.length) return "🤖 No tenés empleados cargados.";
  const t = String(target || "").toLowerCase();
  const emp = (t && emps.find((e) => String((e.firstName || "") + " " + (e.lastName || "")).toLowerCase().includes(t))) || emps[0];
  const nombre = ((emp.firstName || "") + " " + (emp.lastName || "")).trim();

  const mk = new Date().toISOString().slice(0, 7); // mes actual (YYYY-MM)
  const present = (data.attendance || []).filter((a: any) => a.employeeId === emp.id && String(a.date || "").slice(0, 7) === mk && a.status === "presente");
  const horas = present.reduce((s: number, a: any) => s + (a.hours || []).reduce((s2: number, h: any) => s2 + (Number(h.hours) || 0), 0), 0);
  const rate = Number(emp.hourlyRate || emp.hourly_rate || 0);
  const generado = horas * rate;

  const pays = (data.expenses || []).filter((x: any) => x.employeeId === emp.id && String(x.date || "").slice(0, 7) === mk);
  const pagado = pays.filter((x: any) => x.expenseKind !== "adelanto").reduce((s: number, x: any) => s + (Number(x.amount) || 0), 0);
  const adelantos = pays.filter((x: any) => x.expenseKind === "adelanto").reduce((s: number, x: any) => s + (Number(x.amount) || 0), 0);

  const deuda = generado - (pagado + adelantos);
  return "💸 *" + nombre + "*: Trabajó " + horas + " hs. Generó " + money(generado) + ". Pagado/Adelantado " + money(pagado + adelantos) + ". *Saldo pendiente: " + money(deuda) + "*";
}

/* ===== Presupuesto en PDF (pdf-lib) + envío de documentos ===== */
interface BudgetItem { descripcion: string; cantidad: number; precio: number }

async function generateBudgetPDF(budgetData: { cliente: string; items: BudgetItem[] }): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  let page = doc.addPage([595.28, 841.89]); // A4 portrait
  const hoy = new Date().toLocaleDateString("es-AR", { day: "2-digit", month: "long", year: "numeric" });

  const drawHeader = () => {
    const { height } = page.getSize();
    page.drawText("PRESUPUESTO GADU", { x: 50, y: height - 60, size: 22, font: fontBold, color: rgb(0.06, 0.09, 0.13) });
    page.drawText("GADU Construye · Tu gestión, perfecta", { x: 50, y: height - 82, size: 11, font: font, color: rgb(0.39, 0.45, 0.55) });
    page.drawText("Fecha: " + hoy, { x: 400, y: height - 60, size: 10, font: font, color: rgb(0.39, 0.45, 0.55) });
    page.drawText("Cliente: " + (budgetData.cliente || "—"), { x: 50, y: height - 118, size: 13, font: fontBold, color: rgb(0.06, 0.09, 0.13) });
  };

  drawHeader();
  let y = 841.89 - 158;
  const cols = { desc: 50, cant: 330, prec: 400, total: 470 };
  page.drawText("Descripción", { x: cols.desc, y, size: 10, font: fontBold, color: rgb(0.39, 0.45, 0.55) });
  page.drawText("Cant.", { x: cols.cant, y, size: 10, font: fontBold, color: rgb(0.39, 0.45, 0.55) });
  page.drawText("P. unit.", { x: cols.prec, y, size: 10, font: fontBold, color: rgb(0.39, 0.45, 0.55) });
  page.drawText("Total", { x: cols.total, y, size: 10, font: fontBold, color: rgb(0.39, 0.45, 0.55) });
  y -= 16;
  page.drawLine({ start: { x: 50, y: y + 8 }, end: { x: 545, y: y + 8 }, thickness: 1, color: rgb(0.83, 0.86, 0.9) });

  let totalGeneral = 0;
  for (const it of budgetData.items || []) {
    if (y < 90) { page = doc.addPage([595.28, 841.89]); drawHeader(); y = 841.89 - 158; }
    y -= 22;
    const cant = Number(it.cantidad) || 0;
    const prec = Number(it.precio) || 0;
    const tot = cant * prec;
    totalGeneral += tot;
    page.drawText(String(it.descripcion || "").slice(0, 55), { x: cols.desc, y, size: 10, font: font, color: rgb(0.06, 0.09, 0.13) });
    page.drawText(String(cant), { x: cols.cant, y, size: 10, font: font, color: rgb(0.06, 0.09, 0.13) });
    page.drawText("$" + prec.toLocaleString("es-AR"), { x: cols.prec, y, size: 10, font: font, color: rgb(0.06, 0.09, 0.13) });
    page.drawText("$" + tot.toLocaleString("es-AR"), { x: cols.total, y, size: 10, font: font, color: rgb(0.06, 0.09, 0.13) });
  }

  y -= 30;
  page.drawLine({ start: { x: 50, y: y + 12 }, end: { x: 545, y: y + 12 }, thickness: 1.5, color: rgb(0.83, 0.86, 0.9) });
  page.drawText("TOTAL", { x: cols.desc, y, size: 12, font: fontBold, color: rgb(0.06, 0.09, 0.13) });
  page.drawText("$" + totalGeneral.toLocaleString("es-AR"), { x: cols.total, y, size: 12, font: fontBold, color: rgb(0.06, 0.09, 0.13) });

  page.drawText("Generado por GADU - Tu gestión, perfecta", { x: 50, y: 40, size: 10, font: font, color: rgb(0.58, 0.63, 0.71) });

  return await doc.save();
}

async function sendWhatsAppDocument(to: string, bytes: Uint8Array, filename: string, mimeType = "application/pdf", caption = "Presupuesto GADU"): Promise<boolean> {
  const token = Deno.env.get("WHATSAPP_TOKEN") || "";
  const phoneId = Deno.env.get("WHATSAPP_PHONE_ID") || "";
  const apiVersion = Deno.env.get("WHATSAPP_API_VERSION") || "v21.0";
  if (!token || !phoneId) {
    console.warn("[GADU-WA-DOC] sin WHATSAPP_TOKEN/WHATSAPP_PHONE_ID");
    return false;
  }

  /* 1) Subir el archivo a Meta para obtener media_id */
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: mimeType }), filename);
  form.append("messaging_product", "whatsapp");
  form.append("type", mimeType);
  const up = await fetchWithTimeout(`https://graph.facebook.com/${apiVersion}/${phoneId}/media`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const upJson = await up.json().catch(() => ({}));
  if (!up.ok || !upJson.id) {
    console.error("[GADU-WA-DOC] subir media falló:", up.status, JSON.stringify(upJson));
    return false;
  }
  const mediaId = String(upJson.id);

  /* 2) Enviar el mensaje tipo document con ese media_id */
  const body = {
    messaging_product: "whatsapp",
    to: toMetaPhone(to),
    type: "document",
    document: { id: mediaId, filename, caption },
  };
  const res = await fetchWithTimeout(`https://graph.facebook.com/${apiVersion}/${phoneId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const respText = await res.text().catch(() => "");
  if (!res.ok) console.error("[GADU-WA-DOC] enviar documento falló:", res.status, respText);
  else console.log("[GADU-WA-DOC] documento enviado OK:", filename);
  return res.ok;
}

/* Genera un .xlsx con los gastos del usuario (Fecha, Monto, Categoría, Concepto, Obra) */
function exportExpensesXlsx(data: Record<string, any>): Uint8Array {
  const works = data.works || [];
  const workName = (id: string | null | undefined) => {
    if (!id) return "";
    const w = works.find((x: Record<string, any>) => String(x.id) === String(id));
    return w ? String(w.name || w.nombre || "") : "";
  };
  const rows = (data.expenses || []).map((x: Record<string, any>) => ({
    Fecha: String(x.date || x.fecha || ""),
    Monto: Number(x.amount) || 0,
    "Categoría": String(x.category || x.categoria || ""),
    Concepto: String(x.description || x.name || "").slice(0, 60),
    Obra: workName(x.workId),
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Gastos");
  return new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer);
}

Deno.serve(async (req) => {
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

  /* ===== Validación de firma de Meta (X-Hub-Signature-256) =====
     Intercepta el body crudo ANTES de parsear, verifica el HMAC-SHA256
     con WHATSAPP_APP_SECRET y rechaza con 403 si no coincide. */
  const rawBody = await req.text().catch(() => "");
  const signature = req.headers.get("x-hub-signature-256") || "";
  const appSecret = Deno.env.get("WHATSAPP_APP_SECRET") || "";
  if (appSecret) {
    if (!signature) {
      console.warn("[whatsapp-webhook] falta header X-Hub-Signature-256");
      return new Response("invalid signature", { status: 403, headers: corsHeaders });
    }
    const okSig = await verifyMetaSignature(rawBody, appSecret, signature);
    if (!okSig) {
      console.warn("[whatsapp-webhook] firma inválida de Meta");
      return new Response("invalid signature", { status: 403, headers: corsHeaders });
    }
  } else {
    console.warn("[whatsapp-webhook] WHATSAPP_APP_SECRET no configurado: no se valida firma");
  }

  let body: Record<string, any> = {};
  try { body = JSON.parse(rawBody || "{}"); } catch (e) { body = {}; }
  console.log("=== PAYLOAD ENTRANTE ===", JSON.stringify(body));
  console.log("=== WEBHOOK EVENT RECEIVED ===", JSON.stringify(body));

  const messageId = extractMessageId(body);
  const fromQuick = extractFrom(body);
  const phoneQuick = fromQuick ? normalizePhone(fromQuick) : "desconocido";

  /* Responder 200 OK INMEDIATAMENTE (en <1s) y procesar TODO en segundo plano.
     Así un audio que tarde (o falle) NUNCA bloquea el 200 OK ni los mensajes
     siguientes. La idempotencia también va en background. */
  fireAndForget((async () => {
    /* Idempotencia: si este message.id ya se procesó, salir sin tocar nada */
    if (messageId) {
      if (await isDuplicate(messageId)) {
        console.log("[GADU-WA-DEDUP] message_id ya procesado:", messageId);
        return;
      }
      await markProcessed(messageId);
    }
    /* Encolar PRIMERO y recién después drenar (secuencial): si el drain corre
       antes de insertar, no ve el mensaje y queda "pending" para siempre. */
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
    const buttonId = String(msg.interactive?.button_reply?.id || msg.interactive?.list_reply?.id || "");
    const from = String(msg.from || p?.entry?.[0]?.changes?.[0]?.value?.contacts?.[0]?.wa_id || "");
    if (!buttonId || !from) return null;
    return { from: String(from).replace(/\D/g, ""), buttonId };
  } catch (_e) {
    return null;
  }
}

async function handleButtonReply(from: string, buttonId: string) {
  console.log("[GADU-WA-BUTTONS] botón:", buttonId, "de", from);

  /* 1) Buscar usuario (helper compartido) */
  const userId = await findUserId(from);
  if (!userId) {
    console.warn("[GADU-WA-BUTTONS] usuario no encontrado para", from);
    fireAndForget(sendWhatsApp(from, "🤖 No pude identificar tu cuenta."));
    return;
  }

  /* [GADU-WA-SUPPORT] Si hay un ticket ABIERTO, ignorar cualquier botón salvo
     los de "hablar con humano" (que re-confirman el ticket). */
  if (buttonId !== "action_humano" && buttonId !== "fallback_humano") {
    try {
      if (await getOpenSupportTicket(from)) {
        console.log("[GADU-WA-SUPPORT] ticket abierto, ignorando botón:", buttonId);
        return;
      }
    } catch (e) {}
  }

  /* [GADU-WA-ADVANCE-TYPE] Selección del tipo de adelanto */
  if (buttonId.startsWith("advance_type:")) {
    const tipo = buttonId.slice("advance_type:".length);
    if (tipo === "empleado") {
      await upsertSession(from, userId, "WAITING_ADVANCE", {});
      fireAndForget(sendWhatsApp(from, "💸 Decime *a qué empleado* y *de cuánto* es el adelanto. Ej: \"Adelanto de Hugo de 12000\"."));
    } else if (tipo === "cliente") {
      await upsertSession(from, userId, "WAITING_CLIENT_ADVANCE", {});
      fireAndForget(sendWhatsApp(from, "💰 Decime *de qué cliente/obra* es el adelanto y *de cuánto*. Ej: \"Adelanto de 50000 de la obra Casa Pérez\"."));
    }
    return;
  }

  /* [GADU-WA-MENU] Navegación jerárquica: categoría → submenú */
  if (buttonId.startsWith("menu_")) {
    await showSubMenu(from, buttonId);
    return;
  }

  /* [GADU-WA-ATTENDANCE] Paso 1: empleado seleccionado → pedir obra */
  if (buttonId.startsWith("att_emp:")) {
    const empId = buttonId.slice("att_emp:".length);
    try {
      const rAtt = await rest("app_data?select=data&user_id=eq." + encodeURIComponent(userId) + "&limit=1");
      const rowsAtt = (await rAtt.json().catch(() => [])) as Array<{ data: Record<string, any> }>;
      const dAtt = (Array.isArray(rowsAtt) && rowsAtt.length) ? (rowsAtt[0].data || {}) : {};
      const emp = (dAtt.employees || []).find((e: any) => String(e.id) === empId);
      const empName = emp ? String((emp.firstName || "") + " " + (emp.lastName || "")).trim() : "el empleado";
      const obras = (dAtt.works || []).filter((w: any) => w.status === "activa").slice(0, 10);
      if (!obras.length) {
        fireAndForget(sendWhatsApp(from, "🤖 No tenés obras activas. Creá una con \"nueva obra [nombre]\"."));
        await deleteSession(normalizePhone(from));
        return;
      }
      await upsertSession(from, userId, "WAITING_ATTENDANCE_WORK", { employeeId: empId, employeeName: empName });
      await sendWhatsAppList(from, "¿En qué obra trabajó " + empName + "?", obras.map((w: any) => ({ id: "att_work:" + String(w.id), title: String(w.nombre || w.name || "Obra") })), { button: "Elegir obra", sectionTitle: "Obras activas" });
    } catch (e) {
      fireAndForget(sendWhatsApp(from, "⚠️ No pude cargar las obras. Probá de nuevo."));
    }
    return;
  }

  /* [GADU-WA-ATTENDANCE] Paso 2: obra seleccionada → pedir horas */
  if (buttonId.startsWith("att_work:")) {
    const workId = buttonId.slice("att_work:".length);
    try {
      const sessAtt = await getSession(normalizePhone(from));
      const ctxAtt = ((sessAtt && sessAtt.context) || {}) as Record<string, unknown>;
      const empName = String(ctxAtt.employeeName || "el empleado");
      const rAtt = await rest("app_data?select=data&user_id=eq." + encodeURIComponent(userId) + "&limit=1");
      const rowsAtt = (await rAtt.json().catch(() => [])) as Array<{ data: Record<string, any> }>;
      const dAtt = (Array.isArray(rowsAtt) && rowsAtt.length) ? (rowsAtt[0].data || {}) : {};
      const work = (dAtt.works || []).find((w: any) => String(w.id) === workId);
      const workName = work ? String(work.nombre || work.name || "la obra") : "la obra";
      await upsertSession(from, userId, "WAITING_ATTENDANCE_HOURS", { employeeId: ctxAtt.employeeId, employeeName: empName, workId, workName });
      fireAndForget(sendWhatsApp(from, "¿Cuántas horas trabajó " + empName + " en " + workName + "? (Ej: 8)"));
    } catch (e) {
      fireAndForget(sendWhatsApp(from, "⚠️ No pude continuar. Probá de nuevo."));
    }
    return;
  }

  /* [GADU-WA-METRICAS] Deudas de TODOS los empleados (solo lectura) */
  if (buttonId === "metricas_deudas") {
    try {
      const rDeudas = await rest("app_data?select=data&user_id=eq." + encodeURIComponent(userId) + "&limit=1");
      const rowsDeudas = (await rDeudas.json().catch(() => [])) as Array<{ data: Record<string, any> }>;
      const dDeudas = (Array.isArray(rowsDeudas) && rowsDeudas.length) ? (rowsDeudas[0].data || {}) : {};
      const reply = calcularDeudasEmpleados(dDeudas);
      console.log("[GADU-WA-METRICAS] deudas calculadas para", userId);
      fireAndForget(sendWhatsApp(from, reply));
    } catch (e) {
      console.error("[GADU-WA-METRICAS] falló:", e);
      fireAndForget(sendWhatsApp(from, "⚠️ No pude calcular las deudas. Probá de nuevo."));
    }
    return;
  }

  /* [GADU-WA-MENU] Opciones del menú principal (lista interactiva unificada) */
  if (buttonId.startsWith("action_")) {
    const act = buttonId.slice("action_".length);
    if (act === "nuevo_gasto") {
      await upsertSession(from, userId, "WAITING_GASTO", {});
      fireAndForget(sendWhatsApp(from, "Dale, decime el monto y el concepto (ej: \"Gasté 5000 de nafta\" o \"5000 de cemento\")"));
      return;
    }
    if (act === "inversion") {
      await upsertSession(from, userId, "WAITING_INVERSION", {});
      fireAndForget(sendWhatsApp(from, "¿De cuánto fue la inversión y en qué? Ej: \"Invertí 50000 en herramientas\"."));
      return;
    }
    if (act === "herramienta") {
      await upsertSession(from, userId, "WAITING_HERRAMIENTA", {});
      fireAndForget(sendWhatsApp(from, "Decime la herramienta y su costo, ej: \"Amoladora 50000\" o \"Hormigonera 380000\"."));
      return;
    }
    if (act === "nueva_obra") {
      await upsertSession(from, userId, "WAITING_OBRA", {});
      fireAndForget(sendWhatsApp(from, "¿Cómo se llama la obra y en qué dirección está? Ej: \"Casa Pérez en Alta Gracia\""));
      return;
    }
    if (act === "adelanto") {
      await upsertSession(from, userId, "WAITING_ADVANCE_TYPE", {});
      await sendWhatsAppButtons(from, "¿Qué tipo de adelanto es?", [
        { id: "advance_type:empleado", title: "Adelanto a Empleado" },
        { id: "advance_type:cliente", title: "Adelanto de Cliente" },
      ]);
      return;
    }
    if (act === "presupuesto") {
      await upsertSession(from, userId, "WAITING_PRESUPUESTO", {});
      fireAndForget(sendWhatsApp(from, "¿Para qué cliente es el presupuesto y qué ítems incluye?"));
      return;
    }
    if (act === "consulta") {
      await upsertSession(from, userId, "WAITING_CONSULTA", {});
      fireAndForget(sendWhatsApp(from, "¿Qué querés consultar? Saldo de una obra, gastos de la semana, etc."));
      return;
    }
    if (act === "balance_obra") {
      fireAndForget(sendWhatsApp(from, "¿De qué obra querés el balance? Escribí por ejemplo: \"balance de la obra Casa Pérez\"."));
      return;
    }
    if (act === "ingreso") {
      await upsertSession(from, userId, "WAITING_INGRESO", {});
      fireAndForget(sendWhatsApp(from, "¿De cuánto es el cobro? (ej. 50000)"));
      return;
    }
    if (act === "contacto") {
      await upsertSession(from, userId, "WAITING_CONTACT_ROLE", {});
      await sendWhatsAppList(from, "¿Qué tipo de contacto querés registrar?", [
        { id: "contact_role:cliente", title: "Cliente" },
        { id: "contact_role:proveedor", title: "Proveedor" },
        { id: "contact_role:subcontratista", title: "Subcontratista" },
        { id: "contact_role:socio", title: "Socio" },
        { id: "contact_role:empleado", title: "Empleado" },
      ], { button: "Elegir tipo", sectionTitle: "Contacto" });
      return;
    }
    if (act === "asistencia") {
      try {
        const rAsis = await rest("app_data?select=data&user_id=eq." + encodeURIComponent(userId) + "&limit=1");
        const rowsAsis = (await rAsis.json().catch(() => [])) as Array<{ data: Record<string, any> }>;
        const dAsis = (Array.isArray(rowsAsis) && rowsAsis.length) ? (rowsAsis[0].data || {}) : {};
        const emps = (dAsis.employees || []).filter((e: any) => e.active !== false).slice(0, 10);
        if (!emps.length) {
          fireAndForget(sendWhatsApp(from, "🤖 No tenés empleados activos. Cargá uno con \"nuevo empleado [nombre]\"."));
          return;
        }
        await upsertSession(from, userId, "WAITING_ATTENDANCE_EMPLOYEE", {});
        await sendWhatsAppList(from, "¿Qué empleado trabajó?", emps.map((e: any) => ({ id: "att_emp:" + String(e.id), title: String((e.firstName || "") + " " + (e.lastName || "")).trim() })), { button: "Elegir empleado", sectionTitle: "Empleados" });
      } catch (e) {
        fireAndForget(sendWhatsApp(from, "⚠️ No pude cargar los empleados. Probá de nuevo."));
      }
      return;
    }
    if (act === "humano") {
      try {
        await rest("support_tickets", {
          method: "POST",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({ user_id: userId, phone: from, message: "Solicitud de soporte desde WhatsApp", status: "open" }),
        });
      } catch (e) {}
      /* Pausar el bot: mientras is_paused=true, processMessage NO responde automáticamente */
      await upsertSession(from, userId, "PAUSED", {});
      await setPaused(from, true);
      fireAndForget(notifyAdminNewTicket(from));   // avisar al admin por WhatsApp
      fireAndForget(sendWhatsApp(from, "✅ Tu pedido fue enviado. Un asesor de GADU te contactará por este medio a la brevedad."));
      return;
    }
    console.warn("[GADU-WA-MENU] acción desconocida:", act);
    return;
  }

  /* [GADU-WA-MENU] Selección de rol para el nuevo contacto.
     Guarda el wizard multi-paso: WAITING_CONTACT_NAME → WAITING_CONTACT_PHONE. */
  if (buttonId.startsWith("contact_role:")) {
    const role = buttonId.slice("contact_role:".length);
    if (role === "empleado" || role === "socio" || role === "cliente" || role === "proveedor" || role === "subcontratista") {
      await upsertSession(from, userId, "WAITING_CONTACT_NAME", { contactType: role });
      const label = role === "empleado" ? "Empleado" : (role === "socio" ? "Socio" : (role === "proveedor" ? "Proveedor" : (role === "subcontratista" ? "Subcontratista" : "Cliente")));
      fireAndForget(sendWhatsApp(from, "Perfecto, vamos a registrar un *" + label + "*. ¿Cuál es el nombre completo? (Escribí *cancelar* para abortar)"));
      return;
    }
    console.warn("[GADU-WA-MENU] rol de contacto desconocido:", role);
    return;
  }

  /* [GADU-WA-AI-UPGRADE] Botones del fallback inteligente (no necesitan gasto pendiente) */
  if (buttonId === "fallback_gasto") {
    fireAndForget(sendWhatsApp(from, "💰 Decime el gasto, por ejemplo: \"Gasté 15000 en cemento\" o \"5000 de nafta\"."));
    await deleteSession(normalizePhone(from));
    return;
  }
  if (buttonId === "fallback_adelanto") {
    await upsertSession(from, userId, "WAITING_ADVANCE", {});
    fireAndForget(sendWhatsApp(from, "💸 Decime *a qué empleado* y *de cuánto* es el adelanto. Ej: \"Adelanto de Hugo de 12000\"."));
    return;
  }
  if (buttonId === "fallback_humano") {
    /* Insertar ticket de soporte (el admin lo ve en el panel) */
    try {
      await rest("support_tickets", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ user_id: userId, phone: from, message: "Solicitud de soporte desde WhatsApp", status: "open" }),
      });
      console.log("[GADU-WA-SUPPORT] ticket creado para", userId, "/", from);
    } catch (e) {
      console.error("[GADU-WA-SUPPORT] falló insertar ticket:", e);
    }
    fireAndForget(notifyAdminNewTicket(from));   // avisar al admin por WhatsApp
    fireAndForget(sendWhatsApp(from, "✅ Tu pedido fue enviado. Un asesor de GADU te contactará por este medio a la brevedad."));
    await deleteSession(normalizePhone(from));
    return;
  }

  /* 2) Recuperar app_data */
  const rData = await rest("app_data?select=user_id,data&user_id=eq." + encodeURIComponent(userId) + "&limit=1");
  const rowsData = (await rData.json().catch(() => [])) as Array<{ data: Record<string, any> }>;
  if (!Array.isArray(rowsData) || !rowsData.length) {
    console.warn("[GADU-WA-BUTTONS] usuario sin app_data:", userId);
    fireAndForget(sendWhatsApp(from, "🤖 No encontré tus datos."));
    return;
  }
  const data = rowsData[0].data || {};

  /* 3) Pendiente más reciente: primero gastos, después ingresos (adelanto de cliente) */
  const expenses = (data.expenses || []) as Array<Record<string, any>>;
  const incomes = (data.incomes || []) as Array<Record<string, any>>;
  const idxExp = expenses.findIndex(e => e.source === "whatsapp" && e.workId == null);
  let target: Record<string, any> | null = null;
  let esIngreso = false;
  if (idxExp !== -1) {
    target = expenses[idxExp];
  } else {
    const idxInc = incomes.findIndex(i => i.source === "whatsapp" && i.workId == null);
    if (idxInc !== -1) { target = incomes[idxInc]; esIngreso = true; }
  }
  if (!target) {
    console.warn("[GADU-WA-BUTTONS] sin movimientos pendientes para", userId);
    fireAndForget(sendWhatsApp(from, "🤖 No encontré movimientos pendientes de asignar."));
    return;
  }
  const monto = Number(target.amount) || 0;

  /* 4) Asignar según el botón */
  if (buttonId.startsWith("assign_work:")) {
    const workId = buttonId.slice("assign_work:".length);
    const work = (data.works || []).find((w: Record<string, any>) => String(w.id) === workId);
    const workName = String(work?.nombre || work?.name || "la obra");
    target.workId = workId;
    if (!esIngreso) target.type = "obra";
    fireAndForget(sendWhatsApp(from, "✅ Listo, " + (esIngreso ? "el ingreso" : "el gasto") + " de $" + monto + " fue asignado a la obra " + workName + "."));
  } else if (buttonId === "assign_general") {
    target.workId = null;
    if (!esIngreso) target.type = "general";
    fireAndForget(sendWhatsApp(from, "✅ Listo, " + (esIngreso ? "el ingreso" : "el gasto") + " de $" + monto + " quedó registrado como " + (esIngreso ? "ingreso sin obra" : "Gasto General") + "."));
  } else {
    console.warn("[GADU-WA-BUTTONS] botón desconocido:", buttonId);
    return;
  }

  /* 5) Guardar el JSON actualizado */
  const up = await rest("app_data?user_id=eq." + encodeURIComponent(userId), {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ data, updated_at: new Date().toISOString() }),
  });
  if (!up.ok) console.error("[GADU-WA-BUTTONS] falló PATCH app_data:", up.status);
  else console.log("[GADU-WA-BUTTONS] gasto asignado OK:", buttonId);

  /* 6) Limpiar el estado WAITING_WORK */
  await deleteSession(normalizePhone(from));
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

    /* [GADU-WA-SUPPORT] Soporte humano activo: PRIORITARIO, antes de cualquier
       respuesta automática (menús, estados, audios). Si hay ticket OPEN, anexar
       el mensaje y retornar sin que el bot responda. */
    try {
      const openTicket = await getOpenSupportTicket(resolved.from);
      if (openTicket) {
        console.log("[GADU-WA-SUPPORT] ticket abierto para", resolved.from, "→ registrando y sin responder");
        if (resolved.text) await appendSupportMessage(resolved.from, resolved.text);
        return json({ ok: true, from: resolved.from, ignored: true });
      }
    } catch (e) {
      console.warn("[GADU-WA-SUPPORT] error chequeando ticket:", e);
    }

    if (resolved.audioFailed) {
      console.warn("[GADU-WA-AUDIO] transcripción falló para", resolved.from);
      fireAndForget(sendWhatsApp(resolved.from, "🤖 No pude escuchar bien el audio. ¿Podés repetirlo o escribírmelo por texto?"));
      return;
    }
    if (resolved.imageFailed) {
      console.warn("[GADU-WA-IMAGE] análisis de imagen falló para", resolved.from);
      fireAndForget(sendWhatsApp(resolved.from, "🤖 No pude leer el ticket. ¿Me escribís el gasto?"));
      return;
    }
    if (resolved.imageNoMonto) {
      console.warn("[GADU-WA-IMAGE] no se pudo leer el monto del ticket para", resolved.from);
      fireAndForget(sendWhatsApp(resolved.from, "🤖 No pude leer el ticket. ¿Me escribís el monto?"));
      return;
    }
    const inc = { from: resolved.from, text: resolved.text, mediaUrl: resolved.mediaUrl || "" };
    console.log("[whatsapp-webhook] from=" + inc.from + " text=" + JSON.stringify(inc.text));
    console.log("[DEBUG] Remitente detectado: " + inc.from);

    if (!supabaseUrl() || !serviceKey()) {
      console.error("[whatsapp-webhook] falta SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
      return;
    }

    /* 0) Código de licencia "GADU-XXXXXX": validar contra license_codes y
       guiar al usuario a canjearlo en la app (NO lo activa acá). */
    const licenseCode = matchLicenseCode(inc.text);
    if (licenseCode) {
      console.log("[whatsapp-webhook] código de licencia detectado:", licenseCode);
      const q = "code=eq." + encodeURIComponent(licenseCode) + "&select=id,code,plan_id,duration_days,is_used";
      const r = await rest("license_codes?" + q + "&limit=1");
      const rows = await r.json().catch(() => []);
      if (!r.ok || !Array.isArray(rows) || !rows.length) {
        console.warn("[whatsapp-webhook] licencia no encontrada:", licenseCode);
        fireAndForget(sendWhatsApp(inc.from, "🤖 El código " + licenseCode + " no existe. Verificalo o pedilo de nuevo."));
        return json({ ok: false, error: "licencia no encontrada" });
      }
      const lic = rows[0];
      if (lic.is_used) {
        console.warn("[whatsapp-webhook] licencia ya usada:", licenseCode);
        fireAndForget(sendWhatsApp(inc.from, "🤖 El código " + licenseCode + " ya fue utilizado."));
        return json({ ok: false, error: "licencia ya usada" });
      }
      console.log("[whatsapp-webhook] licencia válida:", licenseCode, "· plan:", lic.plan_id, "·", lic.duration_days, "días");
      const reply = "✅ El código " + licenseCode + " es válido (plan " + String(lic.plan_id).toUpperCase() + " por " + lic.duration_days + " días).\n" +
        "Para activarlo, abrí la app: *Planes y Suscripción → Canjear código*.";
      fireAndForget(sendWhatsApp(inc.from, reply));
      return json({ ok: true, from: inc.from, reply });
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

    /* 1b) Saludo → forzar el menú SOLO si NO hay un wizard activo.
       Si hay un wizard en curso, el saludo es una respuesta al formulario:
       NO se resetea (prioridad absoluta de sesión) y el wizard lo captura. */
    const menuText = String(inc.text || "").trim().toLowerCase();
    /* Solo un saludo PURO (sin contenido extra) resetea y muestra el menú.
       Si el mensaje es "hola, quiero cargar un gasto...", NO lo trata como saludo:
       deja que el wizard/IA procese el contenido. */
    if (/^(hola|holis|holi|buenas|buen\s*d[ií]a|buenos\s*d[ií]as|menu|men[uú]|empezar|ayuda|help|inicio)\s*[.!?,]*$/.test(menuText)) {
      let activeState = "";
      let activeCtx: Record<string, unknown> = {};
      try {
        const sessMenu = await getSession(normalizePhone(inc.from));
        if (sessMenu && sessMenu.state && String(sessMenu.state).startsWith("WAITING_")) {
          activeState = String(sessMenu.state);
          activeCtx = (sessMenu.context as Record<string, unknown>) || {};
        }
      } catch (e) { /* sin sesión: no hay wizard */ }

      /* Contexto: gasto pendiente de asignar a obra → recordar en vez de mostrar el menú */
      if (activeState === "WAITING_GASTO_OBRA") {
        const monto = String(activeCtx.monto || activeCtx.amount || "");
        fireAndForget(sendWhatsApp(inc.from, "¡Hola! 👋 Antes de seguir, ¿a qué obra asignamos el gasto de $" + monto + " pendiente?"));
        return json({ ok: true, from: inc.from });
      }

      if (!activeState) {
        try { await deleteSession(normalizePhone(inc.from)); } catch (e) { /* sin sesión: ok */ }
        await showMainMenu(inc.from, "¡Hola! 👋 Soy tu asistente GADU. ¿Qué querés hacer hoy?");
        return json({ ok: true, from: inc.from });
      }
      /* Hay wizard activo: NO hacemos return; el flujo continúa y el wizard captura el texto. */
    }

    /* 2) Usuario vinculado: busca por linkedPhone/phone (app_data) y por la
       columna canónica whatsapp_number (public.profiles), probando todas las
       variantes del número (con/sin el 9, con/sin '+'). */
    const userId2 = await findUserId(inc.from);
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

    /* 2c) Pausa por soporte humano: si is_paused=true, el bot NO responde
       automáticamente (corta antes de cualquier wizard/IA/fallback). */
    try {
      const sessPause = await getSession(normalizePhone(inc.from));
      if (sessPause && sessPause.is_paused) {
        fireAndForget(sendWhatsApp(inc.from, "🤖 Un asesor de GADU está revisando tu caso, aguardá un momento."));
        return json({ ok: true, from: inc.from, reply: "pausado" });
      }
    } catch (e) { /* sin sesión: seguimos normal */ }

    /* 2d) RESTAURAR: recuperar el último registro de la papelera */
    if (String(inc.text || "").trim().toUpperCase() === "RESTAURAR") {
      const trash = Array.isArray(data.trash) ? data.trash : [];
      if (!trash.length) {
        fireAndForget(sendWhatsApp(inc.from, "🤖 No hay registros para restaurar en tu papelera."));
        return json({ ok: true, from: inc.from });
      }
      const t = trash[0];   // el más reciente (unshift)
      if (!t || !t.collection || !Array.isArray(data[t.collection])) {
        fireAndForget(sendWhatsApp(inc.from, "🤖 No pude restaurar el registro."));
        return json({ ok: true, from: inc.from });
      }
      data[t.collection].unshift(t.item);
      data.trash = data.trash.filter(x => x.id !== t.id);

      const item = t.item || {};
      const tipos: Record<string, string> = {
        expenses: "Gasto", incomes: "Ingreso", works: "Obra", employees: "Empleado",
        contacts: "Contacto", budgets: "Presupuesto", attendance: "Jornada",
        assets: "Herramienta", seguros: "Seguro", compromisos: "Compromiso",
      };
      const tipo = tipos[t.collection] || String(t.collection);
      let detalle = "";
      if (t.collection === "expenses") detalle = "$" + (item.amount || 0) + " · " + (item.category || item.description || "");
      else if (t.collection === "incomes") detalle = "$" + (item.amount || 0);
      else if (t.collection === "works") detalle = item.name || item.nombre || "";
      else if (t.collection === "employees") detalle = ((item.firstName || "") + " " + (item.lastName || "")).trim();
      else if (t.collection === "contacts") detalle = item.name || "";
      else detalle = item.description || item.name || item.nombre || "";

      const up = await rest("app_data?user_id=eq." + encodeURIComponent(row.user_id), {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ data, updated_at: new Date().toISOString() }),
      });
      if (!up.ok) {
        console.error("[GADU-WA-RESTORE] falló PATCH app_data:", up.status);
        fireAndForget(sendWhatsApp(inc.from, "🤖 No pude restaurar el registro."));
        return json({ ok: false, error: "patch " + up.status });
      }
      console.log("[GADU-WA-RESTORE] restaurado:", t.collection, t.id);
      fireAndForget(sendWhatsApp(inc.from, "✅ El registro " + tipo + (detalle ? " · " + detalle : "") + " ha sido recuperado con éxito."));
      return json({ ok: true, from: inc.from });
    }

    /* 2e) CANCELAR: en CUALQUIER wizard activo, la palabra "cancelar" limpia la
       sesión y vuelve al menú principal. Se revisa antes de los wizards/IA. */
    if (/^(cancelar|cancela|salir|abortar|no quiero|nada)\s*[.!?]*$/i.test(String(inc.text || "").trim())) {
      try {
        const sessCancel = await getSession(normalizePhone(inc.from));
        if (sessCancel && sessCancel.state) {
          await deleteSession(normalizePhone(inc.from));
          await showMainMenu(inc.from, "✋ Operación cancelada. ¿En qué te ayudo?");
          return json({ ok: true, from: inc.from, reply: "cancelado" });
        }
      } catch (e) { /* sin sesión: seguimos normal */ }
    }

    /* 3) Mismo motor que el chat web: ai-assistant en modo servidor.
       Esperamos la respuesta de la IA con un timeout de seguridad de 10s.
       Recién si la IA FALLA (o tarda más de 10s) caemos al fallback local. */
    let aiReply = "";
    let action: { modulo: string; campos?: Record<string, unknown> } | null = null;

    /* [GADU-WA-AI-UPGRADE] Detección determinística de "adelanto" (regex de apoyo).
       Si solo dijo "adelanto" sin datos → arrancamos el wizard paso a paso. */
    const advIntent = detectAdvanceIntent(inc.text);

    /* [GADU-WA-WIZARD] Wizard de gasto (WAITING_GASTO): captura monto + concepto
       de forma determinística ANTES de la IA o el menú de respaldo. */
    let enWizardGasto = false;
    try {
      const sessGasto = await getSession(normalizePhone(inc.from));
      if (sessGasto && sessGasto.state === "WAITING_GASTO") enWizardGasto = true;
    } catch (e) {}
    if (enWizardGasto) {
      const localGasto = localIntent(inc.text);
      if (localGasto && localGasto.modulo === "gasto") {
        const resG = executeAction(data, localGasto, inc.text, () => crypto.randomUUID(), new Date().toISOString().slice(0, 10));
        if (resG.ok) {
          await rest("app_data?user_id=eq." + encodeURIComponent(row.user_id), {
            method: "PATCH",
            headers: { Prefer: "return=minimal" },
            body: JSON.stringify({ data, updated_at: new Date().toISOString() }),
          });
          await deleteSession(normalizePhone(inc.from));
          const reply = "✅ " + resG.label;
          fireAndForget(sendWhatsApp(inc.from, reply));
          return json({ ok: true, from: inc.from, reply });
        }
        await deleteSession(normalizePhone(inc.from));
        fireAndForget(sendWhatsApp(inc.from, "🤖 " + (resG.missing ? "Me falta " + resG.missing + "." : "No pude cargar el gasto.") + " Probá de nuevo: \"Gasté 5000 de nafta\"."));
        return json({ ok: true, from: inc.from, reply: "" });
      }
      if (localGasto && localGasto.modulo && localGasto.modulo !== "gasto") {
        await deleteSession(normalizePhone(inc.from));
        console.log("[GADU-WA-WIZARD] WAITING_GASTO cancelado, respuesta es:", localGasto.modulo);
      } else {
        /* ¿Monto suelto? → guardar monto y pedir categoría (multi-paso) */
        const mSuelto = String(inc.text || "").trim().match(/^\$?\s*([\d][\d.,]*)\s*$/);
        if (mSuelto) {
          const monto = Number(String(mSuelto[1]).replace(/\./g, "").replace(",", "."));
          if (monto > 0) {
            await upsertSession(inc.from, row.user_id, "WAITING_GASTO_CATEGORIA", { monto });
            fireAndForget(sendWhatsApp(inc.from, "¿Qué concepto o categoría? (ej. nafta, cemento, flete)"));
            return json({ ok: true, from: inc.from, reply: "" });
          }
        }
        fireAndForget(sendWhatsApp(inc.from, "🤖 Decime el gasto, por ejemplo: \"Gasté 5000 de nafta\" o \"5000 de cemento\"."));
        return json({ ok: true, from: inc.from, reply: "" });
      }
    }

    /* Gasto paso 2: categoría (WAITING_GASTO_CATEGORIA) */
    let enWizardGastoCat = false;
    let gastoCatCtx: Record<string, unknown> = {};
    try {
      const sessGC = await getSession(normalizePhone(inc.from));
      if (sessGC && sessGC.state === "WAITING_GASTO_CATEGORIA") { enWizardGastoCat = true; gastoCatCtx = (sessGC.context as Record<string, unknown>) || {}; }
    } catch (e) {}
    if (enWizardGastoCat) {
      const t = String(inc.text || "").trim();
      if (!t) { fireAndForget(sendWhatsApp(inc.from, "🤖 ¿Qué concepto o categoría?")); return json({ ok: true, from: inc.from, reply: "" }); }
      await upsertSession(inc.from, row.user_id, "WAITING_GASTO_OBRA", { monto: gastoCatCtx.monto, categoria: t });
      fireAndForget(sendWhatsApp(inc.from, "¿A qué obra corresponde? (escribí *general* si es un gasto general)"));
      return json({ ok: true, from: inc.from, reply: "" });
    }

    /* Gasto paso 3: obra → guardar (WAITING_GASTO_OBRA) */
    let enWizardGastoObra = false;
    let gastoObraCtx: Record<string, unknown> = {};
    try {
      const sessGO = await getSession(normalizePhone(inc.from));
      if (sessGO && sessGO.state === "WAITING_GASTO_OBRA") { enWizardGastoObra = true; gastoObraCtx = (sessGO.context as Record<string, unknown>) || {}; }
    } catch (e) {}
    if (enWizardGastoObra) {
      const t = String(inc.text || "").trim();
      const esGeneral = /^(general|sin asignar|sin obra)$/i.test(t);
      const actionG = { modulo: "gasto", campos: { monto: gastoObraCtx.monto, categoria: gastoObraCtx.categoria, obra: esGeneral ? "" : t } };
      const resG = executeAction(data, actionG, inc.text, () => crypto.randomUUID(), new Date().toISOString().slice(0, 10));
      if (resG.ok) {
        await rest("app_data?user_id=eq." + encodeURIComponent(row.user_id), {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({ data, updated_at: new Date().toISOString() }),
        });
        await deleteSession(normalizePhone(inc.from));
        fireAndForget(sendWhatsApp(inc.from, "✅ " + resG.label));
        return json({ ok: true, from: inc.from, reply: "✅ " + resG.label });
      }
      fireAndForget(sendWhatsApp(inc.from, "🤖 No pude guardar el gasto. Probá de nuevo."));
      return json({ ok: true, from: inc.from, reply: "" });
    }

    /* [GADU-WA-WIZARD] Ingreso/cobro (WAITING_INGRESO): monto → concepto → obra */
    let enWizardIngreso = false;
    try {
      const sessIng = await getSession(normalizePhone(inc.from));
      if (sessIng && sessIng.state === "WAITING_INGRESO") enWizardIngreso = true;
    } catch (e) {}
    if (enWizardIngreso) {
      const localIng = localIntent(inc.text);
      if (localIng && localIng.modulo === "ingreso") {
        const res = executeAction(data, localIng, inc.text, () => crypto.randomUUID(), new Date().toISOString().slice(0, 10));
        if (res.ok) {
          await rest("app_data?user_id=eq." + encodeURIComponent(row.user_id), {
            method: "PATCH",
            headers: { Prefer: "return=minimal" },
            body: JSON.stringify({ data, updated_at: new Date().toISOString() }),
          });
          await deleteSession(normalizePhone(inc.from));
          fireAndForget(sendWhatsApp(inc.from, "✅ " + res.label));
          return json({ ok: true, from: inc.from, reply: "✅ " + res.label });
        }
        await deleteSession(normalizePhone(inc.from));
        fireAndForget(sendWhatsApp(inc.from, "🤖 " + (res.missing ? "Me falta " + res.missing + "." : "No pude cargarlo.")));
        return json({ ok: true, from: inc.from, reply: "" });
      }
      const mSuelto = String(inc.text || "").trim().match(/^\$?\s*([\d][\d.,]*)\s*$/);
      if (mSuelto) {
        const monto = Number(String(mSuelto[1]).replace(/\./g, "").replace(",", "."));
        if (monto > 0) {
          await upsertSession(inc.from, row.user_id, "WAITING_INGRESO_CONCEPTO", { monto });
          fireAndForget(sendWhatsApp(inc.from, "¿Qué concepto? (Cobro, Adelanto, Certificación)"));
          return json({ ok: true, from: inc.from, reply: "" });
        }
      }
      fireAndForget(sendWhatsApp(inc.from, "🤖 ¿De cuánto es el cobro? Ej: \"Cobré 50000 por la obra\"."));
      return json({ ok: true, from: inc.from, reply: "" });
    }

    /* Ingreso paso 2: concepto (WAITING_INGRESO_CONCEPTO) */
    let enWizardIngConc = false;
    let ingConcCtx: Record<string, unknown> = {};
    try {
      const sessIC2 = await getSession(normalizePhone(inc.from));
      if (sessIC2 && sessIC2.state === "WAITING_INGRESO_CONCEPTO") { enWizardIngConc = true; ingConcCtx = (sessIC2.context as Record<string, unknown>) || {}; }
    } catch (e) {}
    if (enWizardIngConc) {
      const t = String(inc.text || "").trim();
      if (!t) { fireAndForget(sendWhatsApp(inc.from, "🤖 ¿Qué concepto? (Cobro, Adelanto, Certificación)")); return json({ ok: true, from: inc.from, reply: "" }); }
      await upsertSession(inc.from, row.user_id, "WAITING_INGRESO_OBRA", { monto: ingConcCtx.monto, concepto: t });
      fireAndForget(sendWhatsApp(inc.from, "¿A qué obra corresponde?"));
      return json({ ok: true, from: inc.from, reply: "" });
    }

    /* Ingreso paso 3: obra → guardar (WAITING_INGRESO_OBRA) */
    let enWizardIngObra = false;
    let ingObraCtx: Record<string, unknown> = {};
    try {
      const sessIO = await getSession(normalizePhone(inc.from));
      if (sessIO && sessIO.state === "WAITING_INGRESO_OBRA") { enWizardIngObra = true; ingObraCtx = (sessIO.context as Record<string, unknown>) || {}; }
    } catch (e) {}
    if (enWizardIngObra) {
      const t = String(inc.text || "").trim();
      const actionI = { modulo: "ingreso", campos: { monto: ingObraCtx.monto, concepto: ingObraCtx.concepto, obra: t } };
      const res = executeAction(data, actionI, inc.text, () => crypto.randomUUID(), new Date().toISOString().slice(0, 10));
      if (res.ok) {
        await rest("app_data?user_id=eq." + encodeURIComponent(row.user_id), {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({ data, updated_at: new Date().toISOString() }),
        });
        await deleteSession(normalizePhone(inc.from));
        fireAndForget(sendWhatsApp(inc.from, "✅ " + res.label));
        return json({ ok: true, from: inc.from, reply: "✅ " + res.label });
      }
      fireAndForget(sendWhatsApp(inc.from, res.missing ? "🤖 Me falta " + res.missing + "." : "🤖 No pude cargarlo."));
      return json({ ok: true, from: inc.from, reply: "" });
    }

    /* [GADU-WA-WIZARD] Wizard de inversión (WAITING_INVERSION): captura monto + concepto
       con localIntent y registra la inversión ANTES de la IA. */
    let enWizardInversion = false;
    try {
      const sessInv = await getSession(normalizePhone(inc.from));
      if (sessInv && sessInv.state === "WAITING_INVERSION") enWizardInversion = true;
    } catch (e) {}
    if (enWizardInversion) {
      const txtInv = String(inc.text || "").trim();
      if (!txtInv) {
        fireAndForget(sendWhatsApp(inc.from, "🤖 ¿De cuánto fue la inversión? (ej. 50000)"));
        return json({ ok: true, from: inc.from, reply: "" });
      }
      const localInv = localIntent(inc.text);
      if (localInv && localInv.modulo === "inversion") {
        const resI = executeAction(data, localInv, inc.text, () => crypto.randomUUID(), new Date().toISOString().slice(0, 10));
        if (resI.ok) {
          await rest("app_data?user_id=eq." + encodeURIComponent(row.user_id), {
            method: "PATCH",
            headers: { Prefer: "return=minimal" },
            body: JSON.stringify({ data, updated_at: new Date().toISOString() }),
          });
          await deleteSession(normalizePhone(inc.from));
          fireAndForget(sendWhatsApp(inc.from, "✅ " + resI.label));
          return json({ ok: true, from: inc.from, reply: "✅ " + resI.label });
        }
        await deleteSession(normalizePhone(inc.from));
        fireAndForget(sendWhatsApp(inc.from, "🤖 " + (resI.missing ? "Me falta " + resI.missing + "." : "No pude cargar la inversión.")));
        return json({ ok: true, from: inc.from, reply: "" });
      }
      if (localInv && localInv.modulo && localInv.modulo !== "inversion") {
        await deleteSession(normalizePhone(inc.from));
        console.log("[GADU-WA-WIZARD] WAITING_INVERSION cancelado, respuesta es:", localInv.modulo);
      } else {
        /* ¿Monto suelto? → guardar monto y pedir concepto (multi-paso) */
        const mSuelto = txtInv.match(/^\$?\s*([\d][\d.,]*)\s*$/);
        if (mSuelto) {
          const monto = Number(String(mSuelto[1]).replace(/\./g, "").replace(",", "."));
          if (monto > 0) {
            await upsertSession(inc.from, row.user_id, "WAITING_INVERSION_CONCEPTO", { monto });
            fireAndForget(sendWhatsApp(inc.from, "¿En qué invertiste? (ej. herramientas, máquina, capital de trabajo)"));
            return json({ ok: true, from: inc.from, reply: "" });
          }
        }
        fireAndForget(sendWhatsApp(inc.from, "🤖 ¿De cuánto fue la inversión y en qué? Ej: \"Invertí 50000 en herramientas\"."));
        return json({ ok: true, from: inc.from, reply: "" });
      }
    }

    /* Inversión paso 2: concepto → guardar (WAITING_INVERSION_CONCEPTO) */
    let enWizardInvConcepto = false;
    let invConcCtx: Record<string, unknown> = {};
    try {
      const sessIC = await getSession(normalizePhone(inc.from));
      if (sessIC && sessIC.state === "WAITING_INVERSION_CONCEPTO") { enWizardInvConcepto = true; invConcCtx = (sessIC.context as Record<string, unknown>) || {}; }
    } catch (e) {}
    if (enWizardInvConcepto) {
      const t = String(inc.text || "").trim();
      if (!t) { fireAndForget(sendWhatsApp(inc.from, "🤖 ¿En qué invertiste?")); return json({ ok: true, from: inc.from, reply: "" }); }
      const actionI = { modulo: "inversion", campos: { monto: invConcCtx.monto, categoria: t } };
      const resI = executeAction(data, actionI, inc.text, () => crypto.randomUUID(), new Date().toISOString().slice(0, 10));
      if (resI.ok) {
        await rest("app_data?user_id=eq." + encodeURIComponent(row.user_id), {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({ data, updated_at: new Date().toISOString() }),
        });
        await deleteSession(normalizePhone(inc.from));
        fireAndForget(sendWhatsApp(inc.from, "✅ " + resI.label));
        return json({ ok: true, from: inc.from, reply: "✅ " + resI.label });
      }
      fireAndForget(sendWhatsApp(inc.from, "🤖 No pude cargar la inversión."));
      return json({ ok: true, from: inc.from, reply: "" });
    }

    /* [GADU-WA-WIZARD] Wizard de herramienta (WAITING_HERRAMIENTA): nombre + costo.
       Crea el activo en data.assets ANTES de confirmar (mismo patrón blindado). */
    let enWizardHerramienta = false;
    try {
      const sessHer = await getSession(normalizePhone(inc.from));
      if (sessHer && sessHer.state === "WAITING_HERRAMIENTA") enWizardHerramienta = true;
    } catch (e) {}
    if (enWizardHerramienta) {
      const tHer = String(inc.text || "").trim();
      if (!tHer) {
        fireAndForget(sendWhatsApp(inc.from, "🤖 Decime la herramienta y su costo, ej: \"Amoladora 50000\"."));
        return json({ ok: true, from: inc.from, reply: "" });
      }
      const mHer = tHer.match(/^(.+?)\s+([\d][\d.,]*)\s*$/);
      if (mHer) {
        const nombreRaw = String(mHer[1]).trim();
        const costo = Number(String(mHer[2]).replace(/\./g, "").replace(",", "."));
        let categoria = "Herramienta manual";
        if (/el[eé]ctric|amoladora|sierra|rotomartillo|taladro|mezcladora/i.test(nombreRaw)) categoria = "Herramienta eléctrica";
        else if (/hormigonera|m[aá]quina|maquinaria|equipo/i.test(nombreRaw)) categoria = "Equipo mayor";
        else if (/cami[oó]n|veh[ií]culo|utilitario|auto/i.test(nombreRaw)) categoria = "Vehículo";
        (data.assets || (data.assets = [])).unshift({
          id: crypto.randomUUID(), name: nombreRaw, category: categoria,
          purchaseDate: new Date().toISOString().slice(0, 10), cost: costo,
          status: "operativo", supplierId: null, notes: "", maintenance: [],
        });
        await rest("app_data?user_id=eq." + encodeURIComponent(row.user_id), {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({ data, updated_at: new Date().toISOString() }),
        });
        await deleteSession(normalizePhone(inc.from));
        fireAndForget(sendWhatsApp(inc.from, "✅ Herramienta registrada: " + nombreRaw + " (" + categoria + ") · $" + costo.toLocaleString("es-AR")));
        return json({ ok: true, from: inc.from, reply: "herramienta guardada" });
      }
      /* Solo nombre → pedir categoría (multi-paso) */
      await upsertSession(inc.from, row.user_id, "WAITING_HERRAMIENTA_CATEGORIA", { nombre: tHer });
      fireAndForget(sendWhatsApp(inc.from, "¿Qué tipo de herramienta es? (Herramienta eléctrica, Herramienta manual, Maquinaria, Equipo mayor, Vehículo)"));
      return json({ ok: true, from: inc.from, reply: "" });
    }

    /* Herramienta paso 2: categoría (WAITING_HERRAMIENTA_CATEGORIA) */
    let enWizardHerCat = false;
    let herCatCtx: Record<string, unknown> = {};
    try {
      const sessHC = await getSession(normalizePhone(inc.from));
      if (sessHC && sessHC.state === "WAITING_HERRAMIENTA_CATEGORIA") { enWizardHerCat = true; herCatCtx = (sessHC.context as Record<string, unknown>) || {}; }
    } catch (e) {}
    if (enWizardHerCat) {
      const t = String(inc.text || "").trim();
      if (!t) { fireAndForget(sendWhatsApp(inc.from, "🤖 ¿Qué tipo de herramienta es?")); return json({ ok: true, from: inc.from, reply: "" }); }
      await upsertSession(inc.from, row.user_id, "WAITING_HERRAMIENTA_COSTO", { nombre: herCatCtx.nombre, categoria: t });
      fireAndForget(sendWhatsApp(inc.from, "¿Cuánto costó? (ej. 50000)"));
      return json({ ok: true, from: inc.from, reply: "" });
    }

    /* Herramienta paso 3: costo → guardar (WAITING_HERRAMIENTA_COSTO) */
    let enWizardHerCosto = false;
    let herCostoCtx: Record<string, unknown> = {};
    try {
      const sessHK = await getSession(normalizePhone(inc.from));
      if (sessHK && sessHK.state === "WAITING_HERRAMIENTA_COSTO") { enWizardHerCosto = true; herCostoCtx = (sessHK.context as Record<string, unknown>) || {}; }
    } catch (e) {}
    if (enWizardHerCosto) {
      const t = String(inc.text || "").trim();
      const costo = Number(t.replace(/\./g, "").replace(",", "."));
      if (!costo || costo <= 0) { fireAndForget(sendWhatsApp(inc.from, "🤖 Eso no es un monto válido. ¿Cuánto costó?")); return json({ ok: true, from: inc.from, reply: "" }); }
      const nombreRaw = String(herCostoCtx.nombre || "");
      const categoria = String(herCostoCtx.categoria || "Herramienta manual");
      (data.assets || (data.assets = [])).unshift({
        id: crypto.randomUUID(), name: nombreRaw, category: categoria,
        purchaseDate: new Date().toISOString().slice(0, 10), cost: costo,
        status: "operativo", supplierId: null, notes: "", maintenance: [],
      });
      await rest("app_data?user_id=eq." + encodeURIComponent(row.user_id), {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ data, updated_at: new Date().toISOString() }),
      });
      await deleteSession(normalizePhone(inc.from));
      fireAndForget(sendWhatsApp(inc.from, "✅ Herramienta registrada: " + nombreRaw + " (" + categoria + ") · $" + costo.toLocaleString("es-AR")));
      return json({ ok: true, from: inc.from, reply: "herramienta guardada" });
    }

    /* [GADU-WA-WIZARD] Presupuesto (WAITING_PRESUPUESTO): la IA extrae cliente + ítems.
       Interceptamos el texto, limpiamos el estado y dejamos que la IA (CREATE_BUDGET)
       lo procese sin que el menú de respaldo lo intercepte. */
    let enWizardPresupuesto = false;
    try {
      const sessPres = await getSession(normalizePhone(inc.from));
      if (sessPres && sessPres.state === "WAITING_PRESUPUESTO") enWizardPresupuesto = true;
    } catch (e) {}
    if (enWizardPresupuesto) {
      if (!inc.text || !inc.text.trim()) {
        fireAndForget(sendWhatsApp(inc.from, "🤖 Contame qué querés incluir en el presupuesto y para qué cliente."));
        return json({ ok: true, from: inc.from, reply: "" });
      }
      await deleteSession(normalizePhone(inc.from));   // la IA procesa el texto libre a continuación
    }

    /* [GADU-WA-WIZARD] Consulta (WAITING_CONSULTA): la IA resuelve la pregunta.
       Igual que arriba: limpiamos el estado y dejamos que QUERY_DATA responda. */
    let enWizardConsulta = false;
    try {
      const sessCons = await getSession(normalizePhone(inc.from));
      if (sessCons && sessCons.state === "WAITING_CONSULTA") enWizardConsulta = true;
    } catch (e) {}
    if (enWizardConsulta) {
      if (!inc.text || !inc.text.trim()) {
        fireAndForget(sendWhatsApp(inc.from, "🤖 ¿Qué querés consultar? Saldo de una obra, gastos de la semana, etc."));
        return json({ ok: true, from: inc.from, reply: "" });
      }
      await deleteSession(normalizePhone(inc.from));   // la IA (QUERY_DATA) responde a continuación
    }

    /* [GADU-WA-ADVANCE-TYPE] Selección del tipo de adelanto por texto */
    let enWizardAdvType = false;
    try {
      const sessAT = await getSession(normalizePhone(inc.from));
      if (sessAT && sessAT.state === "WAITING_ADVANCE_TYPE") enWizardAdvType = true;
    } catch (e) {}
    if (enWizardAdvType) {
      const t = String(inc.text || "").trim().toLowerCase();
      if (/empleado|trabajador|operario|personal|obrero/.test(t)) {
        await upsertSession(inc.from, row.user_id, "WAITING_ADVANCE", {});
        fireAndForget(sendWhatsApp(inc.from, "💸 Decime *a qué empleado* y *de cuánto* es el adelanto. Ej: \"Adelanto de Hugo de 12000\"."));
        return json({ ok: true, from: inc.from, reply: "" });
      }
      if (/cliente|obra|seña|sena|anticipo|cobro/.test(t)) {
        await upsertSession(inc.from, row.user_id, "WAITING_CLIENT_ADVANCE", {});
        fireAndForget(sendWhatsApp(inc.from, "💰 Decime *de qué cliente/obra* es el adelanto y *de cuánto*. Ej: \"Adelanto de 50000 de la obra Casa Pérez\"."));
        return json({ ok: true, from: inc.from, reply: "" });
      }
      await sendWhatsAppButtons(inc.from, "Elegí una opción:", [
        { id: "advance_type:empleado", title: "Adelanto a Empleado" },
        { id: "advance_type:cliente", title: "Adelanto de Cliente" },
      ]);
      return json({ ok: true, from: inc.from, reply: "" });
    }

    /* [GADU-WA-ADVANCE-CLIENTE] Adelanto de cliente → ingreso (cobro anticipado) */
    let enWizardClientAdvance = false;
    try {
      const sessCA = await getSession(normalizePhone(inc.from));
      if (sessCA && sessCA.state === "WAITING_CLIENT_ADVANCE") enWizardClientAdvance = true;
    } catch (e) {}
    if (enWizardClientAdvance) {
      const parsed = parseAdvanceNameAmount(inc.text);
      if (parsed && parsed.monto > 0) {
        const res = executeAction(data, { modulo: "ingreso", campos: { concepto: "Adelanto", monto: parsed.monto, cliente: parsed.nombre, obra: parsed.nombre } }, inc.text, () => crypto.randomUUID(), new Date().toISOString().slice(0, 10));
        if (res.ok) {
          await rest("app_data?user_id=eq." + encodeURIComponent(row.user_id), {
            method: "PATCH",
            headers: { Prefer: "return=minimal" },
            body: JSON.stringify({ data, updated_at: new Date().toISOString() }),
          });
          await deleteSession(normalizePhone(inc.from));
          fireAndForget(sendWhatsApp(inc.from, "✅ " + res.label));
          return json({ ok: true, from: inc.from, reply: "✅ " + res.label });
        }
        await deleteSession(normalizePhone(inc.from));
        fireAndForget(sendWhatsApp(inc.from, res.missing ? "🤖 Me falta " + res.missing + "." : "🤖 No pude cargarlo."));
        return json({ ok: true, from: inc.from, reply: "" });
      }
      fireAndForget(sendWhatsApp(inc.from, "💰 Decime *de qué cliente/obra* es el adelanto y *de cuánto*. Ej: \"Adelanto de 50000 de Casa Pérez\"."));
      return json({ ok: true, from: inc.from, reply: "" });
    }

    /* [GADU-WA-AI-UPGRADE] Wizard de adelanto en curso (estado WAITING_ADVANCE) */
    let enWizardAdelanto = false;
    try {
      const sessAdv = await getSession(normalizePhone(inc.from));
      if (sessAdv && sessAdv.state === "WAITING_ADVANCE") enWizardAdelanto = true;
    } catch (e) {}
    if (enWizardAdelanto) {
      const parsed = (advIntent && advIntent.nombre && advIntent.monto > 0) ? advIntent : parseAdvanceNameAmount(inc.text);
      if (parsed && parsed.nombre && parsed.monto > 0) {
        const res = executeAction(data, { modulo: "adelanto", campos: { empleado: parsed.nombre, monto: parsed.monto } }, inc.text, () => crypto.randomUUID(), new Date().toISOString().slice(0, 10));
        if (res.ok) {
          await rest("app_data?user_id=eq." + encodeURIComponent(row.user_id), {
            method: "PATCH",
            headers: { Prefer: "return=minimal" },
            body: JSON.stringify({ data, updated_at: new Date().toISOString() }),
          });
          await deleteSession(normalizePhone(inc.from));
          fireAndForget(sendWhatsApp(inc.from, "✅ " + res.label));
          return json({ ok: true, from: inc.from, reply: "✅ " + res.label });
        }
        await deleteSession(normalizePhone(inc.from));
        fireAndForget(sendWhatsApp(inc.from, res.notFound || "🤖 No pude cargarlo. Probá: \"Adelanto de Hugo de 12000\"."));
        return json({ ok: true, from: inc.from, reply: "" });
      }
      /* Solo el nombre → pedir monto (multi-paso) */
      if (parsed && parsed.nombre) {
        await upsertSession(inc.from, row.user_id, "WAITING_ADVANCE_MONTO", { empleado: parsed.nombre });
        fireAndForget(sendWhatsApp(inc.from, "¿De cuánto es el adelanto? (ej. 12000)"));
        return json({ ok: true, from: inc.from, reply: "" });
      }
      fireAndForget(sendWhatsApp(inc.from, "💸 ¿A qué empleado y de cuánto es el adelanto? Ej: \"Hugo de 12000\"."));
      return json({ ok: true, from: inc.from, reply: "" });
    }

    /* Adelanto paso 2: monto → obra (WAITING_ADVANCE_MONTO) */
    let enWizardAdvMonto = false;
    let advMontoCtx: Record<string, unknown> = {};
    try {
      const sessAM = await getSession(normalizePhone(inc.from));
      if (sessAM && sessAM.state === "WAITING_ADVANCE_MONTO") { enWizardAdvMonto = true; advMontoCtx = (sessAM.context as Record<string, unknown>) || {}; }
    } catch (e) {}
    if (enWizardAdvMonto) {
      const t = String(inc.text || "").trim();
      const monto = Number(t.replace(/\./g, "").replace(",", "."));
      if (!monto || monto <= 0) { fireAndForget(sendWhatsApp(inc.from, "🤖 Eso no es un monto válido. ¿De cuánto es el adelanto?")); return json({ ok: true, from: inc.from, reply: "" }); }
      await upsertSession(inc.from, row.user_id, "WAITING_ADVANCE_OBRA", { empleado: advMontoCtx.empleado, monto });
      fireAndForget(sendWhatsApp(inc.from, "¿A qué obra corresponde? (escribí *general* si no sabés)"));
      return json({ ok: true, from: inc.from, reply: "" });
    }

    /* Adelanto paso 3: obra → guardar (WAITING_ADVANCE_OBRA) */
    let enWizardAdvObra = false;
    let advObraCtx: Record<string, unknown> = {};
    try {
      const sessAO = await getSession(normalizePhone(inc.from));
      if (sessAO && sessAO.state === "WAITING_ADVANCE_OBRA") { enWizardAdvObra = true; advObraCtx = (sessAO.context as Record<string, unknown>) || {}; }
    } catch (e) {}
    if (enWizardAdvObra) {
      const t = String(inc.text || "").trim();
      const esGeneral = /^(general|sin asignar|sin obra)$/i.test(t);
      const actionA = { modulo: "adelanto", campos: { empleado: advObraCtx.empleado, monto: advObraCtx.monto, obra: esGeneral ? "" : t } };
      const res = executeAction(data, actionA, inc.text, () => crypto.randomUUID(), new Date().toISOString().slice(0, 10));
      if (res.ok) {
        await rest("app_data?user_id=eq." + encodeURIComponent(row.user_id), {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({ data, updated_at: new Date().toISOString() }),
        });
        await deleteSession(normalizePhone(inc.from));
        fireAndForget(sendWhatsApp(inc.from, "✅ " + res.label));
        return json({ ok: true, from: inc.from, reply: "✅ " + res.label });
      }
      fireAndForget(sendWhatsApp(inc.from, res.notFound || "🤖 No pude cargarlo."));
      return json({ ok: true, from: inc.from, reply: "" });
    }

    /* [GADU-WA-WIZARD] Wizard de obra (WAITING_OBRA): nombre → ubicación → presupuesto */
    let enWizardObra = false;
    try {
      const sessObra = await getSession(normalizePhone(inc.from));
      if (sessObra && sessObra.state === "WAITING_OBRA") enWizardObra = true;
    } catch (e) {}
    if (enWizardObra) {
      const localOtra = localIntent(inc.text);
      if (localOtra && localOtra.modulo && localOtra.modulo !== "obra") {
        await deleteSession(normalizePhone(inc.from));
        console.log("[GADU-WA-WIZARD] WAITING_OBRA cancelado, respuesta es:", localOtra.modulo);
      } else {
        const tObra = String(inc.text || "").trim();
        const mObra = tObra.match(/^(.*?)\s+en\s+(.+)$/i);
        if (mObra) {
          /* "Casa Pérez en Alta Gracia" → nombre + ubicación en un solo mensaje */
          await upsertSession(inc.from, row.user_id, "WAITING_OBRA_PRESUPUESTO", { nombre: String(mObra[1]).trim(), ubicacion: String(mObra[2]).trim() });
          fireAndForget(sendWhatsApp(inc.from, "¿Cuál es el presupuesto total? (ej. 100000 · escribí *omitir* si no lo sabés)"));
          return json({ ok: true, from: inc.from, reply: "" });
        }
        if (tObra) {
          await upsertSession(inc.from, row.user_id, "WAITING_OBRA_UBICACION", { nombre: tObra });
          fireAndForget(sendWhatsApp(inc.from, "¿Dónde queda la obra? (ej. Alta Gracia · escribí *omitir* si no lo sabés)"));
          return json({ ok: true, from: inc.from, reply: "" });
        }
        fireAndForget(sendWhatsApp(inc.from, "🤖 ¿Cómo se llama la obra? Ej: \"Casa Pérez en Alta Gracia\"."));
        return json({ ok: true, from: inc.from, reply: "" });
      }
    }

    /* Obra paso 2: ubicación (WAITING_OBRA_UBICACION) */
    let enWizardObraUbi = false;
    let obraUbiCtx: Record<string, unknown> = {};
    try {
      const sessOU = await getSession(normalizePhone(inc.from));
      if (sessOU && sessOU.state === "WAITING_OBRA_UBICACION") { enWizardObraUbi = true; obraUbiCtx = (sessOU.context as Record<string, unknown>) || {}; }
    } catch (e) {}
    if (enWizardObraUbi) {
      const t = String(inc.text || "").trim();
      const ubicacion = /^omitir$/i.test(t) ? "" : t;
      await upsertSession(inc.from, row.user_id, "WAITING_OBRA_PRESUPUESTO", { nombre: obraUbiCtx.nombre, ubicacion });
      fireAndForget(sendWhatsApp(inc.from, "¿Cuál es el presupuesto total? (ej. 100000 · escribí *omitir* si no lo sabés)"));
      return json({ ok: true, from: inc.from, reply: "" });
    }

    /* Obra paso 3: presupuesto → crear (WAITING_OBRA_PRESUPUESTO) */
    let enWizardObraPre = false;
    let obraPreCtx: Record<string, unknown> = {};
    try {
      const sessOP = await getSession(normalizePhone(inc.from));
      if (sessOP && sessOP.state === "WAITING_OBRA_PRESUPUESTO") { enWizardObraPre = true; obraPreCtx = (sessOP.context as Record<string, unknown>) || {}; }
    } catch (e) {}
    if (enWizardObraPre) {
      const t = String(inc.text || "").trim();
      const omitir = /^omitir$/i.test(t);
      const presupuesto = omitir ? 0 : Number(t.replace(/\./g, "").replace(",", "."));
      if (!omitir && (!presupuesto || presupuesto <= 0)) {
        fireAndForget(sendWhatsApp(inc.from, "🤖 Eso no es un monto válido. ¿Cuál es el presupuesto total? (o *omitir*)"));
        return json({ ok: true, from: inc.from, reply: "" });
      }
      const res = executeAction(data, { modulo: "obra", campos: { nombre: String(obraPreCtx.nombre || ""), ubicacion: String(obraPreCtx.ubicacion || ""), presupuesto } }, inc.text, () => crypto.randomUUID(), new Date().toISOString().slice(0, 10));
      if (res.ok) {
        await rest("app_data?user_id=eq." + encodeURIComponent(row.user_id), {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({ data, updated_at: new Date().toISOString() }),
        });
        await deleteSession(normalizePhone(inc.from));
        fireAndForget(sendWhatsApp(inc.from, "✅ " + res.label));
        return json({ ok: true, from: inc.from, reply: "✅ " + res.label });
      }
      await deleteSession(normalizePhone(inc.from));
      fireAndForget(sendWhatsApp(inc.from, "🤖 No pude crear la obra. Probá de nuevo."));
      return json({ ok: true, from: inc.from, reply: "" });
    }

    /* [GADU-WA-WIZARD] Contacto paso 1: nombre (WAITING_CONTACT_NAME).
       Intercepta el texto libre ANTES de la IA/fallback. */
    let enWizardContactName = false;
    let contactNameCtx: Record<string, unknown> = {};
    try {
      const sessCN = await getSession(normalizePhone(inc.from));
      if (sessCN && sessCN.state === "WAITING_CONTACT_NAME") {
        enWizardContactName = true;
        contactNameCtx = (sessCN.context as Record<string, unknown>) || {};
      }
    } catch (e) {}
    if (enWizardContactName) {
      const t = inc.text.trim();
      if (/^cancelar$/i.test(t)) {
        await deleteSession(normalizePhone(inc.from));
        fireAndForget(sendWhatsApp(inc.from, "✅ Carga cancelada. ¿En qué más te ayudo?"));
        return json({ ok: true, from: inc.from, reply: "cancelado" });
      }
      if (!t) {
        fireAndForget(sendWhatsApp(inc.from, "🤖 ¿Cuál es el nombre completo del contacto?"));
        return json({ ok: true, from: inc.from, reply: "" });
      }
      await upsertSession(inc.from, row.user_id, "WAITING_CONTACT_PHONE", { contactType: contactNameCtx.contactType, name: t });
      fireAndForget(sendWhatsApp(inc.from, "Perfecto. ¿Cuál es el número de teléfono de *" + t + "*? (o escribí *omitir*)"));
      return json({ ok: true, from: inc.from, reply: "" });
    }

    /* [GADU-WA-WIZARD] Contacto paso 2: teléfono (WAITING_CONTACT_PHONE) */
    let enWizardContactPhone = false;
    let contactPhoneCtx: Record<string, unknown> = {};
    try {
      const sessCP = await getSession(normalizePhone(inc.from));
      if (sessCP && sessCP.state === "WAITING_CONTACT_PHONE") {
        enWizardContactPhone = true;
        contactPhoneCtx = (sessCP.context as Record<string, unknown>) || {};
      }
    } catch (e) {}
    if (enWizardContactPhone) {
      const t = inc.text.trim();
      if (/^cancelar$/i.test(t)) {
        await deleteSession(normalizePhone(inc.from));
        fireAndForget(sendWhatsApp(inc.from, "✅ Carga cancelada. ¿En qué más te ayudo?"));
        return json({ ok: true, from: inc.from, reply: "cancelado" });
      }
      const name = String(contactPhoneCtx.name || "").trim();
      const contactType = String(contactPhoneCtx.contactType || "cliente");
      const phone = /^omitir$/i.test(t) ? "" : t;
      if (contactType === "empleado") {
        const parsed = formatProperName(name);
        (data.employees || (data.employees = [])).unshift({
          id: crypto.randomUUID(), firstName: parsed.firstName, lastName: parsed.lastName,
          phone, role: parsed.role || "empleado", active: true, source: "whatsapp",
        });
      } else {
        (data.contacts || (data.contacts = [])).unshift({
          id: crypto.randomUUID(), name,
          type: contactType === "subcontratista" ? "subcontratista" : (contactType === "proveedor" ? "proveedor" : (contactType === "socio" ? "socio" : "cliente")),
          phone, email: "", source: "whatsapp",
        });
      }
      await rest("app_data?user_id=eq." + encodeURIComponent(row.user_id), {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ data, updated_at: new Date().toISOString() }),
      });
      await deleteSession(normalizePhone(inc.from));
      const label = contactType === "empleado" ? "Empleado" : (contactType === "socio" ? "Socio" : (contactType === "proveedor" ? "Proveedor" : (contactType === "subcontratista" ? "Subcontratista" : "Cliente")));
      fireAndForget(sendWhatsApp(inc.from, "✅ Contacto guardado correctamente: " + label + " '" + name + "'."));
      return json({ ok: true, from: inc.from, reply: "contacto guardado" });
    }

    /* [GADU-WA-WIZARD] Empleado paso 1: oficio (WAITING_EMP_OFICIO) */
    let enWizardEmpOficio = false;
    let empOficioCtx: Record<string, unknown> = {};
    try {
      const sessEO = await getSession(normalizePhone(inc.from));
      if (sessEO && sessEO.state === "WAITING_EMP_OFICIO") { enWizardEmpOficio = true; empOficioCtx = (sessEO.context as Record<string, unknown>) || {}; }
    } catch (e) {}
    if (enWizardEmpOficio) {
      const t = String(inc.text || "").trim();
      if (!t) { fireAndForget(sendWhatsApp(inc.from, "🤖 ¿Cuál es su oficio? (ej. Albañil, Pintor, Plomero)")); return json({ ok: true, from: inc.from, reply: "" }); }
      await upsertSession(inc.from, row.user_id, "WAITING_EMP_TARIFA", { nombre: empOficioCtx.nombre, oficio: t });
      fireAndForget(sendWhatsApp(inc.from, "¿Cuánto cobra por hora? (ej. 1500)"));
      return json({ ok: true, from: inc.from, reply: "" });
    }

    /* Empleado paso 2: tarifa por hora (WAITING_EMP_TARIFA) */
    let enWizardEmpTarifa = false;
    let empTarifaCtx: Record<string, unknown> = {};
    try {
      const sessET = await getSession(normalizePhone(inc.from));
      if (sessET && sessET.state === "WAITING_EMP_TARIFA") { enWizardEmpTarifa = true; empTarifaCtx = (sessET.context as Record<string, unknown>) || {}; }
    } catch (e) {}
    if (enWizardEmpTarifa) {
      const t = String(inc.text || "").trim();
      const tarifa = Number(t.replace(/\./g, "").replace(",", "."));
      if (!tarifa || tarifa <= 0) { fireAndForget(sendWhatsApp(inc.from, "🤖 Eso no es un monto válido. ¿Cuánto cobra por hora?")); return json({ ok: true, from: inc.from, reply: "" }); }
      await upsertSession(inc.from, row.user_id, "WAITING_EMP_TELEFONO", { nombre: empTarifaCtx.nombre, oficio: empTarifaCtx.oficio, tarifa });
      fireAndForget(sendWhatsApp(inc.from, "¿Su teléfono / WhatsApp? (o escribí *omitir*)"));
      return json({ ok: true, from: inc.from, reply: "" });
    }

    /* Empleado paso 3: teléfono → crear empleado (WAITING_EMP_TELEFONO) */
    let enWizardEmpTelefono = false;
    let empTelCtx: Record<string, unknown> = {};
    try {
      const sessEL = await getSession(normalizePhone(inc.from));
      if (sessEL && sessEL.state === "WAITING_EMP_TELEFONO") { enWizardEmpTelefono = true; empTelCtx = (sessEL.context as Record<string, unknown>) || {}; }
    } catch (e) {}
    if (enWizardEmpTelefono) {
      const t = String(inc.text || "").trim();
      const phone = /^omitir$/i.test(t) ? "" : t;
      const parsed = formatProperName(String(empTelCtx.nombre || ""));
      (data.employees || (data.employees = [])).push({
        id: crypto.randomUUID(), firstName: parsed.firstName, lastName: parsed.lastName,
        phone, role: String(empTelCtx.oficio || parsed.role || "empleado"),
        hourlyRate: Number(empTelCtx.tarifa) || 0, paymentData: "", active: true, source: "whatsapp",
      });
      await rest("app_data?user_id=eq." + encodeURIComponent(row.user_id), {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ data, updated_at: new Date().toISOString() }),
      });
      await deleteSession(normalizePhone(inc.from));
      const nombreEmp = (parsed.firstName + " " + parsed.lastName).trim();
      fireAndForget(sendWhatsApp(inc.from, "✅ Empleado registrado: " + nombreEmp + " (" + String(empTelCtx.oficio || "empleado") + ")" + (Number(empTelCtx.tarifa) ? " · $" + Number(empTelCtx.tarifa) + "/h" : "")));
      return json({ ok: true, from: inc.from, reply: "empleado guardado" });
    }

    /* [GADU-WA-WIZARD] Agenda paso 2: fecha (WAITING_AGENDA_FECHA) */
    let enWizardAgendaFecha = false;
    let agendaFechaCtx: Record<string, unknown> = {};
    try {
      const sessAF = await getSession(normalizePhone(inc.from));
      if (sessAF && sessAF.state === "WAITING_AGENDA_FECHA") { enWizardAgendaFecha = true; agendaFechaCtx = (sessAF.context as Record<string, unknown>) || {}; }
    } catch (e) {}
    if (enWizardAgendaFecha) {
      const t = String(inc.text || "").trim();
      const fecha = resolveFecha(t);
      if (!fecha) { fireAndForget(sendWhatsApp(inc.from, "🤖 No entendí esa fecha. Decime \"hoy\", \"mañana\" o una fecha (ej. 15/04).")); return json({ ok: true, from: inc.from, reply: "" }); }
      await upsertSession(inc.from, row.user_id, "WAITING_AGENDA_OBRA", { titulo: agendaFechaCtx.titulo, fecha });
      fireAndForget(sendWhatsApp(inc.from, "¿A qué obra o contacto se relaciona? (escribí *ninguna* si no aplica)"));
      return json({ ok: true, from: inc.from, reply: "" });
    }

    /* Agenda paso 3: obra/contacto → guardar (WAITING_AGENDA_OBRA) */
    let enWizardAgendaObra = false;
    let agendaObraCtx: Record<string, unknown> = {};
    try {
      const sessAO2 = await getSession(normalizePhone(inc.from));
      if (sessAO2 && sessAO2.state === "WAITING_AGENDA_OBRA") { enWizardAgendaObra = true; agendaObraCtx = (sessAO2.context as Record<string, unknown>) || {}; }
    } catch (e) {}
    if (enWizardAgendaObra) {
      const t = String(inc.text || "").trim();
      const sinRef = /^(ninguna|nada|sin\s+obra)$/i.test(t);
      const work = !sinRef ? (data.works || []).find((w: any) => flat(String(w.nombre || w.name || "")).includes(flat(t))) : null;
      (data.compromisos || (data.compromisos = [])).unshift({
        id: crypto.randomUUID(), fecha: String(agendaObraCtx.fecha || ""), hora: "", tipo: "compromiso",
        titulo: String(agendaObraCtx.titulo || "Compromiso"), lugar: "", contactoId: work ? String(work.id) : null,
        notas: sinRef ? "" : t, estado: "pendiente", createdAt: new Date().toISOString(),
      });
      await rest("app_data?user_id=eq." + encodeURIComponent(row.user_id), {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ data, updated_at: new Date().toISOString() }),
      });
      await deleteSession(normalizePhone(inc.from));
      fireAndForget(sendWhatsApp(inc.from, "✅ Compromiso agendado: " + String(agendaObraCtx.titulo || "") + " (" + String(agendaObraCtx.fecha || "") + ")"));
      return json({ ok: true, from: inc.from, reply: "compromiso guardado" });
    }

    /* [GADU-WA-WIZARD] Jornada paso 1: empleado (WAITING_JORNADA) */
    let enWizardJornada = false;
    try {
      const sessJor = await getSession(normalizePhone(inc.from));
      if (sessJor && sessJor.state === "WAITING_JORNADA") enWizardJornada = true;
    } catch (e) {}
    if (enWizardJornada) {
      const t = String(inc.text || "").trim();
      if (!t) { fireAndForget(sendWhatsApp(inc.from, "🤖 ¿A qué empleado le cargamos la jornada?")); return json({ ok: true, from: inc.from, reply: "" }); }
      await upsertSession(inc.from, row.user_id, "WAITING_JORNADA_HORAS", { empleado: t });
      fireAndForget(sendWhatsApp(inc.from, "¿Cuántas horas trabajó? (ej. 8)"));
      return json({ ok: true, from: inc.from, reply: "" });
    }

    /* Jornada paso 2: horas (WAITING_JORNADA_HORAS) */
    let enWizardJorHoras = false;
    let jorHorasCtx: Record<string, unknown> = {};
    try {
      const sessJH = await getSession(normalizePhone(inc.from));
      if (sessJH && sessJH.state === "WAITING_JORNADA_HORAS") { enWizardJorHoras = true; jorHorasCtx = (sessJH.context as Record<string, unknown>) || {}; }
    } catch (e) {}
    if (enWizardJorHoras) {
      const t = String(inc.text || "").trim();
      const horas = Number(t.replace(/[^\d.,]/g, "").replace(",", "."));
      if (!horas || horas <= 0) { fireAndForget(sendWhatsApp(inc.from, "🤖 Eso no es un número de horas válido. ¿Cuántas horas trabajó?")); return json({ ok: true, from: inc.from, reply: "" }); }
      await upsertSession(inc.from, row.user_id, "WAITING_JORNADA_OBRA", { empleado: jorHorasCtx.empleado, horas });
      fireAndForget(sendWhatsApp(inc.from, "¿En qué obra trabajó?"));
      return json({ ok: true, from: inc.from, reply: "" });
    }

    /* Jornada paso 3: obra → guardar (WAITING_JORNADA_OBRA) */
    let enWizardJorObra = false;
    let jorObraCtx: Record<string, unknown> = {};
    try {
      const sessJO = await getSession(normalizePhone(inc.from));
      if (sessJO && sessJO.state === "WAITING_JORNADA_OBRA") { enWizardJorObra = true; jorObraCtx = (sessJO.context as Record<string, unknown>) || {}; }
    } catch (e) {}
    if (enWizardJorObra) {
      const t = String(inc.text || "").trim();
      const emp = (data.employees || []).find((e: any) => flat(String((e.firstName || "") + " " + (e.lastName || "")).trim()).includes(flat(String(jorObraCtx.empleado || ""))));
      if (!emp) {
        await deleteSession(normalizePhone(inc.from));
        fireAndForget(sendWhatsApp(inc.from, "🤖 No encontré a ese empleado. Primero cargalo con \"nuevo empleado [nombre]\"."));
        return json({ ok: true, from: inc.from, reply: "" });
      }
      const work = (data.works || []).find((w: any) => flat(String(w.nombre || w.name || "")).includes(flat(t)));
      (data.attendance || (data.attendance = [])).unshift({
        id: crypto.randomUUID(), employeeId: String((emp as any).id || ""), date: new Date().toISOString().slice(0, 10),
        status: "presente", hours: [{ workId: work ? String((work as any).id) : null, hours: Number(jorObraCtx.horas) || 0 }], notes: "",
      });
      await rest("app_data?user_id=eq." + encodeURIComponent(row.user_id), {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ data, updated_at: new Date().toISOString() }),
      });
      await deleteSession(normalizePhone(inc.from));
      const empName = String((emp as any).firstName || "") + " " + String((emp as any).lastName || "");
      fireAndForget(sendWhatsApp(inc.from, "✅ Jornada registrada: " + empName.trim() + " · " + Number(jorObraCtx.horas) + "h" + (work ? " en " + String((work as any).nombre || (work as any).name || "") : "")));
      return json({ ok: true, from: inc.from, reply: "jornada guardada" });
    }

    /* [GADU-WA-ATTENDANCE] Asistencia paso 3: horas → guardar (WAITING_ATTENDANCE_HOURS) */
    let enWizardAttHoras = false;
    let attHorasCtx: Record<string, unknown> = {};
    try {
      const sessAH = await getSession(normalizePhone(inc.from));
      if (sessAH && sessAH.state === "WAITING_ATTENDANCE_HOURS") { enWizardAttHoras = true; attHorasCtx = (sessAH.context as Record<string, unknown>) || {}; }
    } catch (e) {}
    if (enWizardAttHoras) {
      const t = String(inc.text || "").trim();
      const horas = Number(t.replace(/[^\d.,]/g, "").replace(",", "."));
      if (!horas || horas <= 0) {
        fireAndForget(sendWhatsApp(inc.from, "🤖 Eso no es un número de horas válido. ¿Cuántas horas trabajó? (ej. 8)"));
        return json({ ok: true, from: inc.from, reply: "" });
      }
      (data.attendance || (data.attendance = [])).unshift({
        id: crypto.randomUUID(), employeeId: String(attHorasCtx.employeeId || ""), date: new Date().toISOString().slice(0, 10),
        status: "presente", hours: [{ workId: attHorasCtx.workId ? String(attHorasCtx.workId) : null, hours }], notes: "",
      });
      await rest("app_data?user_id=eq." + encodeURIComponent(row.user_id), {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ data, updated_at: new Date().toISOString() }),
      });
      await deleteSession(normalizePhone(inc.from));
      const workNameAtt = String(attHorasCtx.workName || "");
      fireAndForget(sendWhatsApp(inc.from, "✅ Asistencia registrada: " + String(attHorasCtx.employeeName || "Empleado") + " trabajó " + horas + " horas" + (workNameAtt ? " en " + workNameAtt : "")));
      return json({ ok: true, from: inc.from, reply: "asistencia guardada" });
    }

    /* [GADU-WA-EXPORT] Exportar gastos a Excel (comando "excel" / "exportar gastos") */
    if (/\b(excel|planilla|xlsx)\b/i.test(inc.text) || /exportar\s+(gastos|movimientos|todo|mis\s+datos)/i.test(inc.text)) {
      console.log("[GADU-WA-EXPORT] pedido de exportación:", inc.text);
      try {
        const xlsxBytes = exportExpensesXlsx(data);
        const ok = await sendWhatsAppDocument(
          inc.from,
          xlsxBytes,
          "gastos-gadu.xlsx",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Gastos GADU",
        );
        if (!ok) {
          fireAndForget(sendWhatsApp(inc.from, "🤖 No pude generar el archivo. Probá de nuevo en unos minutos."));
        }
      } catch (e) {
        console.error("[GADU-WA-EXPORT] error generando excel:", e);
        fireAndForget(sendWhatsApp(inc.from, "🤖 No pude generar el archivo. Probá de nuevo en unos minutos."));
      }
      return json({ ok: true, from: inc.from, reply: "excel" });
    }

    if (advIntent && !advIntent.nombre && advIntent.monto <= 0) {
      const reply = "💸 ¡Vamos a cargar el adelanto! Decime *a qué empleado* y *de cuánto* es. Por ejemplo: \"Adelanto de Hugo de 12000\".";
      await upsertSession(inc.from, row.user_id, "WAITING_ADVANCE", {});
      fireAndForget(sendWhatsApp(inc.from, reply));
      return json({ ok: true, from: inc.from, reply });
    }

    /* Consultas analíticas (SOLO LECTURA): detectar + calcular ANTES de la IA.
       Sueldos, balance de obra, agenda y herramientas se resuelven localmente. */
    const queryIntent = detectQueryIntent(inc.text);
    if (queryIntent) {
      const qr = computeQuery(data, queryIntent);
      const link = queryLink(data, queryIntent);
      const reply = link ? qr + "\n\n📊 Podés ver el reporte completo y detallado acá: " + link : qr;
      console.log("[GADU-WA-QUERY] consulta:", queryIntent.type, "· target:", queryIntent.target || "(—)");
      fireAndForget(sendWhatsApp(inc.from, reply));
      return json({ ok: true, from: inc.from, reply });
    }

    const RECOGNIZED_MODULOS = ["saludo", "consulta", "presupuesto_pdf", "asistencia", "gasto", "ingreso", "empleado", "adelanto", "obra", "inversion", "reporte"];
    console.log("[GADU-WA-INTENT] texto a interpretar:", JSON.stringify(inc.text));

    const aiController = new AbortController();
    const aiTimer = setTimeout(() => aiController.abort(), 10000);
    try {
      const aiRes = await fetch(supabaseUrl() + "/functions/v1/ai-assistant", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: anonKey(),
          Authorization: `Bearer ${serviceKey()}`,
          "x-service-secret": Deno.env.get("SERVICE_SECRET") || "",
        },
        body: JSON.stringify({
          message: inc.text,
          context: buildContext(data),
          mode: "usuario",
          channel: "whatsapp",
          service: true,
          userId: row.user_id,
        }),
        signal: aiController.signal,
      });
      const ai = await aiRes.json().catch(() => ({}));
      console.log("[GADU-WA-BACKGROUND] ai-assistant http", aiRes.status, "· action:", JSON.stringify(ai.action || null), "· reply:", JSON.stringify(ai.reply || ai.error || ""));
      aiReply = ai.reply || "";
      if (ai.action && ai.action.modulo && RECOGNIZED_MODULOS.includes(ai.action.modulo)) {
        action = ai.action;
      } else {
        console.warn("[GADU-WA-BACKGROUND] IA sin acción o módulo no reconocido:", JSON.stringify(ai.action || null), "· status=", aiRes.status);
      }
    } catch (e) {
      console.error("[GADU-WA-BACKGROUND] ai-assistant falló/abortó:", e);
    } finally {
      clearTimeout(aiTimer);
    }
    /* Fallback local SOLO si la IA no devolvió acción */
    if (!action) {
      const local = localIntent(inc.text);
      if (local) {
        action = local;
        console.log("[GADU-WA-BACKGROUND] usando intent local (fallback):", JSON.stringify(local));
      }
    }
    /* [GADU-WA-SMART-CONTEXT] Si el regex detectó "adelanto" con nombre+monto, desambiguar cliente vs empleado */
    if (advIntent && advIntent.nombre && advIntent.monto > 0) {
      const target = resolveAdvanceTarget(data, advIntent.nombre);
      if (target.kind === "cliente") {
        action = { modulo: "ingreso", campos: { concepto: "Adelanto", cliente: target.nombre, monto: advIntent.monto } };
      } else {
        action = { modulo: "adelanto", campos: { empleado: target.nombre, monto: advIntent.monto } };
      }
      console.log("[GADU-WA-SMART-CONTEXT] adelanto → " + target.kind + ":", target.nombre, "· monto:", advIntent.monto);
    }
    console.log("[DEBUG] Intent detectado: " + (action ? action.modulo : "ninguno"));

    /* Saludo → respuesta directa (sin acción contable) */
    if (action && action.modulo === "saludo") {
      const reply = ((action as unknown) as { reply?: string }).reply || "¡Hola! 👋 Soy GADU. ¿En qué te ayudo?";
      fireAndForget(sendWhatsApp(inc.from, reply));
      return json({ ok: true, from: inc.from, reply });
    }

    /* Consultas (QUERY_DATA): responder con cálculos en memoria (no guardar nada) */
    if (action && action.modulo === "consulta") {
      const c = (action.campos || {}) as Record<string, unknown>;
      const qtype = String(c.query_type || "");
      const target = String(c.target || "");
      let reply = "";
      if (qtype === "balance_work") reply = queryBalanceWork(data, target);
      else if (qtype === "expenses_week") reply = queryExpensesWeek(data);
      else if (qtype === "attendance_today") reply = queryAttendanceToday(data);
      else if (qtype === "pending_salaries") reply = queryPendingSalaries(data, target);
      else reply = "🤖 No entendí la consulta. Probá preguntando '¿Cuál es el saldo de la obra X?'";
      console.log("[GADU-WA-QUERY]", qtype || "(sin tipo)", "· target:", target);
      fireAndForget(sendWhatsApp(inc.from, reply));
      return json({ ok: true, from: inc.from, reply });
    }

    /* Presupuesto PDF (CREATE_BUDGET): guardar en data.budgets + generar + enviar documento */
    if (action && action.modulo === "presupuesto_pdf") {
      const c = (action.campos || {}) as Record<string, unknown>;
      const cliente = String(c.cliente || "Cliente");
      const items = Array.isArray(c.items)
        ? c.items.map((it: any) => ({ descripcion: String(it.descripcion || ""), cantidad: Number(it.cantidad) || 0, precio: Number(it.precio) || 0 }))
        : [];
      if (!items.length) {
        fireAndForget(sendWhatsApp(inc.from, "🤖 Me faltan los ítems del presupuesto. Decímelos de nuevo, por ejemplo: \"20 m2 de cerámica, 3 bolsas de pegamento\"."));
        return json({ ok: true, from: inc.from, reply: "" });
      }
      try {
        const hoy = new Date().toISOString().slice(0, 10);
        const subtotal = items.reduce((s, i) => s + (i.cantidad * i.precio), 0);
        const discount = Number(c.discount || c.descuento || 0);
        const tax = Number(c.tax || c.iva || 0);
        const total = Math.max(0, subtotal - discount + tax);

        /* Resolver clientId (buscar en el directorio por nombre) */
        let clientId: string | null = null;
        const cli = (data.contacts || []).find((x: any) => String(x.name || "").toLowerCase().includes(cliente.toLowerCase()));
        if (cli) clientId = String(cli.id || "");

        const year = new Date().getFullYear();
        const code = "PR-" + year + "-" + String((data.budgets || []).length + 1).padStart(3, "0");
        const budget = {
          id: crypto.randomUUID(), code, clientId, workId: null,
          name: "Presupuesto " + cliente, date: hoy, validUntil: "",
          status: "borrador",
          items: items.map(i => ({ desc: i.descripcion, unit: "", qty: i.cantidad, price: i.precio })),
          discount, subtotal, total, tax, notes: "",
        };
        (data.budgets || (data.budgets = [])).unshift(budget);

        /* Sincronizar con la nube (Realtime lo ve aparecer al instante) */
        const up = await rest("app_data?user_id=eq." + encodeURIComponent(row.user_id), {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({ data, updated_at: new Date().toISOString() }),
        });
        if (!up.ok) console.error("[GADU-WA-BUDGET] falló PATCH app_data:", up.status);

        const pdf = await generateBudgetPDF({ cliente, items });
        const filename = "Presupuesto_" + String(cliente || "gadu").replace(/[^a-z0-9áéíóúñ ]/gi, "").replace(/\s+/g, "_") + ".pdf";
        const ok = await sendWhatsAppDocument(inc.from, pdf, filename);
        const reply = ok
          ? "✅ Presupuesto para " + cliente + " guardado y adjuntado. Podés verlo en la sección 'Presupuestos' de la app."
          : "✅ Presupuesto para " + cliente + " guardado. (No pude adjuntar el PDF, probá de nuevo.)";
        fireAndForget(sendWhatsApp(inc.from, reply));
        return json({ ok: true, from: inc.from, reply });
      } catch (e) {
        console.error("[GADU-WA-DOC] error generando PDF:", e);
        fireAndForget(sendWhatsApp(inc.from, "❌ No pude generar el PDF. Probá de nuevo."));
        return json({ ok: true, from: inc.from, reply: "" });
      }
    }

    /* Registro de asistencia (REGISTER_ATTENDANCE) — acepta formato array
       (employees) o simple (empleado/obra/horas) */
    if (action && action.modulo === "asistencia") {
      const c = (action.campos || {}) as Record<string, unknown>;
      const fecha = resolveFecha(String(c.fecha || "hoy"));
      /* Formato simple: {empleado, horas, obra} → envolver como array */
      let employees: Array<Record<string, unknown>> = Array.isArray(c.employees) ? (c.employees as Array<Record<string, unknown>>) : [];
      if (!employees.length && c.empleado) {
        employees = [{ nombre: String(c.empleado || ""), horas: Number(c.horas) || 0, work: String(c.obra || c.work || "") }];
      }
      const registrados: Array<{ nombre: string; horas: number; workLabel: string }> = [];
      const noEncontrados: string[] = [];
      for (const e of employees) {
        const nombre = String((e as any).nombre || (e as any).empleado || "").trim();
        const horas = Number((e as any).horas) || 0;
        if (!nombre || horas <= 0) continue;
        const emp = (data.employees || []).find((x: any) =>
          normStr(String((x.firstName || "") + " " + (x.lastName || "")).trim()).includes(normStr(nombre))
        );
        if (!emp) { noEncontrados.push(nombre); continue; }
        /* Resolver la obra → workId con matching flexible (normWork) */
        const workName = String((e as any).work || (e as any).obra || "").trim();
        let workId: string | null = null;
        let workLabel = "";
        if (workName) {
          const w = (data.works || []).find((x: any) => normStr(String(x.nombre || x.name || "")).includes(normStr(workName)));
          if (w) { workId = String(w.id || ""); workLabel = String(w.nombre || w.name || workName); }
        }
        (data.attendance || (data.attendance = [])).push({
          id: crypto.randomUUID(), employeeId: String(emp.id || ""), date: fecha,
          status: "presente", hours: [{ workId, hours }], notes: "",
        });
        registrados.push({ nombre: String((emp.firstName || "") + " " + (emp.lastName || "")).trim(), horas, workLabel });
      }
      const up = await rest("app_data?user_id=eq." + encodeURIComponent(row.user_id), {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ data, updated_at: new Date().toISOString() }),
      });
      if (!up.ok) console.error("[GADU-WA-ATT] falló PATCH app_data:", up.status);
      const partes = registrados.map(r => r.nombre + " (" + r.horas + "hs" + (r.workLabel ? " en " + r.workLabel : " sin obra asignada") + ")");
      let reply = "✅ Asistencia registrada: " + (partes.join(", ") || "nadie") + ".";
      if (noEncontrados.length) reply += " (No encontré a " + noEncontrados.join(", ") + " en tu lista de empleados).";
      fireAndForget(sendWhatsApp(inc.from, reply));
      return json({ ok: true, from: inc.from, reply });
    }

    /* 4) Ejecutar la acción contable (gasto/ingreso) e impactar en app_data */
    /* [AGENDA/JORNADA] módulos con wizard propio: NO pasan por executeAction */
    if (action && action.modulo === "agendar") {
      const titulo = String((action.campos || {}).titulo || "").trim();
      await upsertSession(inc.from, row.user_id, "WAITING_AGENDA_FECHA", { titulo: titulo || "Compromiso" });
      fireAndForget(sendWhatsApp(inc.from, "¿Para qué día? (ej. hoy, mañana, 15/04, 2026-04-15)"));
      return json({ ok: true, from: inc.from, reply: "" });
    }
    if (action && action.modulo === "jornada") {
      const cj = (action.campos || {}) as Record<string, unknown>;
      const empleado = String(cj.empleado || "").trim();
      const horas = Number(cj.horas) || 0;
      if (empleado && horas > 0) {
        await upsertSession(inc.from, row.user_id, "WAITING_JORNADA_OBRA", { empleado, horas });
        fireAndForget(sendWhatsApp(inc.from, "¿En qué obra trabajó?"));
        return json({ ok: true, from: inc.from, reply: "" });
      }
      await upsertSession(inc.from, row.user_id, "WAITING_JORNADA", {});
      fireAndForget(sendWhatsApp(inc.from, "¿A qué empleado le cargamos la jornada?"));
      return json({ ok: true, from: inc.from, reply: "" });
    }

    /* [REPORTE] consulta gerencial (solo lectura): calcular y responder */
    if (action && action.modulo === "reporte") {
      const rc = (action.campos || {}) as Record<string, unknown>;
      const reply = computeReporte(data, String(rc.tipo || ""), rc);
      console.log("[GADU-WA-REPORTE] tipo:", rc.tipo, "· campos:", JSON.stringify(rc));
      fireAndForget(sendWhatsApp(inc.from, reply));
      return json({ ok: true, from: inc.from, reply });
    }

    if (action && ["gasto", "ingreso", "empleado", "adelanto", "obra", "inversion"].includes(action.modulo)) {
      /* [EMPLEADO multi-paso] Si hay nombre pero faltan oficio/tarifa/teléfono,
         arrancar el wizard secuencial en lugar de crear un empleado incompleto. */
      if (action.modulo === "empleado") {
        const nombreEmp = String((action.campos || {}).nombre || "").trim();
        if (nombreEmp) {
          await upsertSession(inc.from, row.user_id, "WAITING_EMP_OFICIO", { nombre: nombreEmp });
          fireAndForget(sendWhatsApp(inc.from, "Dale, ¿cuál es su oficio? (ej. Albañil, Pintor, Plomero)"));
          return json({ ok: true, from: inc.from, reply: "" });
        }
      }
      const res = executeAction(data, action, inc.text, () => crypto.randomUUID(), new Date().toISOString().slice(0, 10));
      if (res.ok) {
        /* Si el gasto vino de una FOTO de ticket, adjuntar el comprobante ANTES del PATCH
           (si lo hacemos después, el receiptUrl no se persiste). */
        if (action.modulo === "gasto" && inc.mediaUrl) {
          const gastoNuevo = (data.expenses && data.expenses[0]) || null;
          if (gastoNuevo) gastoNuevo.receiptUrl = inc.mediaUrl;
        }
        const up = await rest("app_data?user_id=eq." + encodeURIComponent(row.user_id), {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({ data, updated_at: new Date().toISOString() }),
        });
        if (!up.ok) {
          console.error("[whatsapp-webhook] falló impactar el movimiento:", up.status);
          return json({ ok: false, error: "no se pudo guardar el movimiento" });
        }
        let reply = "✅ " + res.label;
        /* Deep link + notificación push: enlazar al gasto recién creado */
        if (action.modulo === "gasto") {
          const gasto = (data.expenses && data.expenses[0]) || null;
          if (gasto) {
            const gastoId = String(gasto.id || "");
            const monto = Number(gasto.amount) || 0;
            const cat = String(gasto.category || "gasto");
            if (gastoId) reply += "\n\n👉 Ver en GADU: https://gestiongadu.vercel.app/#/gastos?id=" + gastoId;
            firePush(row.user_id, "GADU · Gasto registrado", "Se guardó un gasto de $" + monto + " en " + cat + ". Tocá para verlo.", "/#/gastos?id=" + gastoId);
          }
        }
        fireAndForget(sendWhatsApp(inc.from, reply));
        /* Si quedó SIN obra (gasto en bandeja o adelanto de cliente), preguntar a qué obra */
        if (res.pendingWork) {
          await askForWork(inc.from, row.user_id, data);
        }
        return json({ ok: true, from: inc.from, reply });
      }
      const reply = res.notFound ? res.notFound : "🤖 Me falta " + (res.missing || "un dato") + " para cargarlo. Decímelo por acá.";
      fireAndForget(sendWhatsApp(inc.from, reply));
      return json({ ok: true, from: inc.from, reply });
    }

      /* 5) Fallback: desplegar el menú principal unificado (misma lista) */
      const reply = aiReply || "🤖 No estoy seguro de qué querés hacer.";
      await showMainMenu(inc.from, reply);
      return json({ ok: true, from: inc.from, reply });
  } catch (error) {
    console.error("[GADU-WA-QUEUE-FIX] CRITICAL ERROR en processMessage:", error);
    throw error;   // ← propagar para que drainPhone lo marque como fallido y siga
  }
}

/* ===== Drain FIFO de la cola ===== */
async function drainPhone(phone: string) {
  /* [GADU-WA-RESET] Liberar mensajes 'processing' huérfanos (crash) hace más de 3 min */
  try {
    const freed = await resetStaleProcessing(rest);
    if (freed > 0) console.warn("[GADU-WA-RESET] liberados", freed, "mensaje(s) processing huérfano(s)");
  } catch (e) {
    console.warn("[GADU-WA-RESET] error liberando huérfanos:", e);
  }

  /* Mutex por teléfono: si otro drain ya tiene un mensaje en 'processing',
     salimos para no pisar el read-modify-write de app_data. */
  const busy = await rest("whatsapp_queue?status=eq.processing&phone=eq." + encodeURIComponent(phone) + "&limit=1", { method: "GET" });
  const busyRows = (await busy.json().catch(() => [])) as Array<{ id: number }>;
  if (Array.isArray(busyRows) && busyRows.length) return;

  let item = await claimNext(rest, phone);
  while (item) {
    console.log("[GADU-WA-CRITICAL-FIX] Procesando mensaje", item.id, "· status=", item.status, "· attempts=", item.attempts);
    try {
      await processMessage(item.payload);
      await markDone(rest, item.id);
      console.log("[GADU-WA-CRITICAL-FIX] mensaje", item.id, "procesado OK");
    } catch (e) {
      console.error("[GADU-WA-CRITICAL-FIX] Fallo en mensaje", item.id + ":", e);
      await markFailed(rest, item.id);
      /* Avisar al usuario y SEGUIR con el siguiente mensaje de la cola */
      try {
        await sendWhatsApp(item.phone, "🤖 Falló el procesamiento, reintenta o escríbelo por texto.");
      } catch (e2) {
        console.error("[GADU-WA-CRITICAL-FIX] no se pudo notificar el fallo:", e2);
      }
      console.log("[GADU-WA-CRITICAL-FIX] mensaje", item.id, "marcado como fallido, sigo con el siguiente");
    }
    item = await claimNext(rest, phone);
  }
}
