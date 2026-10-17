// ============================================================
// GADU · Transcribir notas de voz de WhatsApp con Gemini
// Flujo: media_id → URL (Graph API) → descarga → base64 → Gemini → texto
// El texto resultante se inyecta en la lógica normal de texto.
// ============================================================

const API_VERSION = "v21.0";

/* Convierte ArrayBuffer → base64 sin reventar el stack (en chunks) */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/* Normaliza el MIME para Gemini: WhatsApp manda "audio/ogg; codecs=opus";
   Gemini solo acepta el tipo simple (ej. "audio/ogg"). */
function normalizeMime(raw: string): string {
  const m = String(raw || "").split(";")[0].trim().toLowerCase();
  if (m === "audio/opus") return "audio/ogg";       // Opus sin contenedor → ogg
  if (!m.startsWith("audio/")) return "audio/ogg";   // desconocido → ogg por defecto
  return m;
}

/* 1) Obtiene la URL del archivo de audio desde Graph API */
async function getMediaUrl(mediaId: string): Promise<string> {
  const token = Deno.env.get("WHATSAPP_TOKEN") || "";
  if (!token) throw new Error("falta WHATSAPP_TOKEN");
  const res = await fetch(`https://graph.facebook.com/${API_VERSION}/${mediaId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error("[GADU-WA-AUDIO] getMediaUrl falló:", res.status, body);
    throw new Error("getMediaUrl HTTP " + res.status);
  }
  const j = await res.json();
  const url = String((j as { url?: string }).url || "");
  if (!url) throw new Error("getMediaUrl sin url");
  console.log("[GADU-WA-AUDIO] ✅ URL del media obtenida:", url.slice(0, 80) + "…");
  return url;
}

/* 2) Descarga el archivo de audio.
   IMPORTANTE: la URL que devuelve Meta es una URL FIRMADA (lookaside.fbsbx.com)
   y NO lleva el Bearer token; mandarlo puede devolver 403. */
async function downloadMedia(url: string): Promise<{ buffer: ArrayBuffer; mimeType: string }> {
  const res = await fetch(url);
  if (!res.ok) {
    console.error("[GADU-WA-AUDIO] downloadMedia HTTP", res.status, url.slice(0, 120));
    throw new Error("downloadMedia HTTP " + res.status);
  }
  const buffer = await res.arrayBuffer();
  const rawMime = res.headers.get("content-type") || "audio/ogg";
  const mimeType = normalizeMime(rawMime);
  console.log("[GADU-WA-AUDIO] ✅ audio descargado:", buffer.byteLength, "bytes · mime:", mimeType, "(raw:", rawMime + ")");
  return { buffer, mimeType };
}

/* 3) Transcribe con Gemini (inline_data) */
async function geminiTranscribe(buffer: ArrayBuffer, mimeType: string): Promise<string> {
  const apiKey = Deno.env.get("GEMINI_API_KEY") || "";
  if (!apiKey) {
    console.warn("[GADU-WA-AUDIO] sin GEMINI_API_KEY: no se puede transcribir");
    return "";
  }
  const model = Deno.env.get("GEMINI_MODEL") || "gemini-1.5-flash";
  const base64 = arrayBufferToBase64(buffer);
  /* Timeout de 8s: si Gemini tarda, abortamos y liberamos la cola. */
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: "Transcribí el audio de WhatsApp. Respondé SOLO con el texto transcrito, sin comentarios." },
              { inline_data: { mime_type: mimeType, data: base64 } },
            ],
          }],
        }),
        signal: controller.signal,
      },
    );
    if (!res.ok) {
      console.error("[GADU-WA-AUDIO] geminiTranscribe falló:", res.status, await res.text().catch(() => ""));
      return "";
    }
    const j = await res.json();
    const text = j?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    if (text) console.log("[GADU-WA-AUDIO] ✅ transcripción Gemini:", text.slice(0, 80));
    else console.warn("[GADU-WA-AUDIO] Gemini respondió 200 pero sin texto:", JSON.stringify(j).slice(0, 200));
    return String(text).trim();
  } catch (e) {
    console.error("[GADU-WA-AUDIO] geminiTranscribe timeout/error:", e);
    return "";
  } finally {
    clearTimeout(timer);
  }
}

async function transcribeMedia(mediaId: string): Promise<string> {
  const url = await getMediaUrl(mediaId);
  const { buffer, mimeType } = await downloadMedia(url);
  return await geminiTranscribe(buffer, mimeType);
}

export interface ResolvedIncoming {
  from: string;
  text: string;
  audioFailed?: boolean;
}

/* Resuelve el texto del mensaje entrante: texto plano O transcripción de audio.
   - null → no es un mensaje válido (o no hay texto/media)
   - { from, text } → texto resuelto (texto plano o audio transcrito)
   - { from, text: "", audioFailed: true } → era audio pero falló la transcripción */
export async function resolveIncomingText(payload: unknown): Promise<ResolvedIncoming | null> {
  try {
    const p = (payload || {}) as Record<string, any>;

    // payload simple de puente {from, text}
    if (typeof p.from === "string" && typeof p.text === "string" && String(p.text).trim()) {
      return { from: String(p.from).replace(/\D/g, ""), text: String(p.text).trim() };
    }

    const value = p.entry?.[0]?.changes?.[0]?.value;
    const msg = value?.messages?.[0];
    if (!msg) return null;

    const from = String(msg.from || value?.contacts?.[0]?.wa_id || "").replace(/\D/g, "");
    if (!from) return null;

    // Texto plano
    if (msg.type === "text") {
      const text = String(msg.text?.body || "").trim();
      return text ? { from, text } : null;
    }

    // Audio / voz → transcribir
    if (msg.type === "audio" || msg.type === "voice") {
      const mediaId = String(msg.audio?.id || msg.voice?.id || "");
      if (!mediaId) return null;
      console.log("[GADU-WA-AUDIO] audio detectado, media_id:", mediaId);
      const text = await transcribeMedia(mediaId);
      if (!text) {
        console.warn("[GADU-WA-AUDIO] transcripción vacía para media", mediaId);
        return { from, text: "", audioFailed: true };
      }
      console.log("[GADU-WA-AUDIO] transcripción:", text);
      return { from, text };
    }

    return null;
  } catch (e) {
    console.error("[GADU-WA-AUDIO] resolveIncomingText error:", e);
    return null;
  }
}
