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

/* 1) Obtiene la URL del archivo de audio desde Graph API (timeout 8s) */
async function getMediaUrl(mediaId: string): Promise<string> {
  const token = Deno.env.get("WHATSAPP_TOKEN") || "";
  if (!token) throw new Error("falta WHATSAPP_TOKEN");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`https://graph.facebook.com/${API_VERSION}/${mediaId}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
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
  } catch (e) {
    console.error("[GADU-WA-CRITICAL-FIX] getMediaUrl timeout/error:", e);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/* 2) Descarga el archivo de audio (timeout 8s).
   IMPORTANTE: la URL que devuelve Meta es una URL FIRMADA (lookaside.fbsbx.com)
   y NO lleva el Bearer token; mandarlo puede devolver 403. */
async function downloadMedia(url: string): Promise<{ buffer: ArrayBuffer; mimeType: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    let res = await fetch(url, { signal: controller.signal });
    /* Si la URL no viene firmada (401/403), reintentar con el token de WhatsApp */
    if (res.status === 401 || res.status === 403) {
      const token = Deno.env.get("WHATSAPP_TOKEN") || "";
      console.warn("[GADU-WA-MEDIA] descarga 401/403 → reintentando con Authorization");
      res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {}, signal: controller.signal });
    }
    if (!res.ok) {
      console.error("[GADU-WA-AUDIO] downloadMedia HTTP", res.status, url.slice(0, 120));
      throw new Error("downloadMedia HTTP " + res.status);
    }
    const buffer = await res.arrayBuffer();
    const rawMime = res.headers.get("content-type") || "application/octet-stream";
    const mimeType = String(rawMime).split(";")[0].trim().toLowerCase();
    console.log("[GADU-WA-MEDIA] ✅ media descargado:", buffer.byteLength, "bytes · mime:", mimeType, "(raw:", rawMime + ")");
    return { buffer, mimeType };
  } catch (e) {
    console.error("[GADU-WA-CRITICAL-FIX] downloadMedia timeout/error:", e);
    throw e;
  } finally {
    clearTimeout(timer);
  }
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
  console.log("[GADU-WA-AUDIO] gemini transcribir:", buffer.byteLength, "bytes · mime:", mimeType, "· model:", model);
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
      const body = await res.text().catch(() => "");
      console.error("[GADU-WA-AUDIO] geminiTranscribe falló · HTTP", res.status, "· body:", body.slice(0, 400));
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

/* 3b) Transcribe audio con Groq (whisper-large-v3-turbo). Devuelve "" si falla. */
async function groqTranscribe(buffer: ArrayBuffer, mimeType: string): Promise<string> {
  const apiKey = Deno.env.get("GROQ_API_KEY") || "";
  if (!apiKey) {
    console.warn("[GADU-WA-GROQ] sin GROQ_API_KEY");
    return "";
  }
  const norm = normalizeMime(mimeType);
  console.log("[GADU-WA-GROQ] transcribir audio:", buffer.byteLength, "bytes · mime:", norm, "· model: whisper-large-v3-turbo");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const form = new FormData();
    /* Extensión derivada del MIME real (mp4/m4a/wav/ogg) para que Groq
       infiera el formato correcto. WhatsApp manda opus en ogg o AAC en mp4. */
    const ext = norm.includes("mp4") ? "mp4" : (norm.includes("m4a") ? "m4a" : (norm.includes("wav") ? "wav" : "ogg"));
    form.append("file", new Blob([buffer], { type: norm }), "audio." + ext);
    form.append("model", "whisper-large-v3-turbo");
    const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { "Authorization": "Bearer " + apiKey },
      body: form,
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.warn("[GADU-WA-GROQ] transcripción falló · HTTP", res.status, "· body:", body.slice(0, 400));
      return "";
    }
    const j = await res.json();
    const text = String((j as { text?: string }).text || "").trim();
    if (text) console.log("[GADU-WA-GROQ] ✅ transcripción:", text.slice(0, 80));
    else console.warn("[GADU-WA-GROQ] 200 pero sin text:", JSON.stringify(j).slice(0, 200));
    return text;
  } catch (e) {
    console.warn("[GADU-WA-GROQ] error/timeout transcribiendo:", e);
    return "";
  } finally {
    clearTimeout(timer);
  }
}

/* Transcribe con Groq y, si falla, con Gemini (fallback). */
async function transcribeAudio(buffer: ArrayBuffer, mimeType: string): Promise<string> {
  const text = await groqTranscribe(buffer, mimeType);
  if (text) return text;
  return await geminiTranscribe(buffer, normalizeMime(mimeType));
}

async function transcribeMedia(mediaId: string): Promise<string> {
  const url = await getMediaUrl(mediaId);
  const { buffer, mimeType } = await downloadMedia(url);
  return await transcribeAudio(buffer, mimeType);
}

/* Normaliza el MIME de imagen para Gemini Vision */
function normalizeImageMime(raw: string): string {
  const m = String(raw || "").split(";")[0].trim().toLowerCase();
  if (m === "image/jpeg" || m === "image/jpg") return "image/jpeg";
  if (m === "image/png") return "image/png";
  if (m === "image/webp") return "image/webp";
  return "image/jpeg";
}

/* Sube el media (imagen de ticket) a Supabase Storage y devuelve la URL pública.
   Bucket: gadu_tickets · ruta: gadu_tickets/<userId>/whatsapp/<ts>.<ext> */
async function uploadMediaToStorage(buffer: ArrayBuffer, mimeType: string, userId: string): Promise<string> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !serviceKey) {
    console.warn("[GADU-WA-IMAGE] sin SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY: no se sube la imagen");
    return "";
  }
  const norm = normalizeImageMime(mimeType);
  const ext = norm === "image/png" ? "png" : (norm === "image/webp" ? "webp" : "jpg");
  const path = "gadu_tickets/" + userId + "/whatsapp/" + Date.now() + "." + ext;
  try {
    const res = await fetch(supabaseUrl + "/storage/v1/object/" + path, {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + serviceKey,
        "apikey": serviceKey,
        "Content-Type": norm,
        "x-upsert": "false",
      },
      body: new Uint8Array(buffer),
    });
    if (!res.ok) {
      console.error("[GADU-WA-IMAGE] subida a Storage falló:", res.status, await res.text().catch(() => ""));
      return "";
    }
    return supabaseUrl + "/storage/v1/object/public/" + path;
  } catch (e) {
    console.error("[GADU-WA-IMAGE] uploadMediaToStorage error:", e);
    return "";
  }
}

/* Analiza una imagen (ticket) con Gemini Vision + el caption del usuario */
async function geminiAnalyzeImage(buffer: ArrayBuffer, mimeType: string, caption: string): Promise<string> {
  const apiKey = Deno.env.get("GEMINI_API_KEY") || "";
  if (!apiKey) {
    console.warn("[GADU-WA-IMAGE] sin GEMINI_API_KEY: no se puede analizar la imagen");
    return "";
  }
  const model = Deno.env.get("GEMINI_MODEL") || "gemini-1.5-flash";
  const base64 = arrayBufferToBase64(buffer);
  const prompt = "Eres un experto leyendo tickets de compra, incluso si están rotados, borrosos, con poca luz, arrugados o fotografiados de costado. " +
    "Haz un esfuerzo EXTRA: busca la palabra 'TOTAL' (o 'TOTAL A PAGAR', 'IMPORTE', 'SUBTOTAL') y lee los números AUNQUE estén al final o al borde de la imagen. " +
    "Devuelve SOLO y ESTRICTAMENTE un JSON válido, sin markdown ni comentarios, con esta estructura exacta: " +
    '{"monto": <numero>, "concepto": "<descripcion>"}. ' +
    'Si no puedes leer el monto, devuelve {"monto": 0, "concepto": ""}. ' +
    'Texto que acompaña la imagen: "' + (caption || "") + '".';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  console.log("[GADU-WA-IMAGE] gemini analizar imagen:", buffer.byteLength, "bytes · mime:", mimeType);
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: prompt },
              { inline_data: { mime_type: mimeType, data: base64 } },
            ],
          }],
        }),
        signal: controller.signal,
      },
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("[GADU-WA-IMAGE] geminiAnalyzeImage falló · HTTP", res.status, "· body:", body.slice(0, 400));
      return "";
    }
    const j = await res.json();
    const text = j?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    if (text) console.log("[GADU-WA-IMAGE] ✅ análisis Gemini:", text.slice(0, 80));
    else console.warn("[GADU-WA-IMAGE] Gemini respondió 200 pero sin texto:", JSON.stringify(j).slice(0, 200));
    return String(text).trim();
  } catch (e) {
    console.error("[GADU-WA-IMAGE] geminiAnalyzeImage timeout/error:", e);
    return "";
  } finally {
    clearTimeout(timer);
  }
}

/* Analiza una imagen con Groq Vision. Devuelve "" si falla.
   Modelo vigente de visión Groq: meta-llama/llama-4-scout-17b-16e-instruct
   (llama-3.2-11b-vision-preview y qwen/qwen3.8-27b quedaron deprecados). */
async function groqAnalyzeImage(buffer: ArrayBuffer, mimeType: string, caption: string): Promise<string> {
  const apiKey = Deno.env.get("GROQ_API_KEY") || "";
  if (!apiKey) {
    console.warn("[GADU-WA-GROQ] sin GROQ_API_KEY");
    return "";
  }
  const norm = normalizeImageMime(mimeType);
  console.log("[GADU-WA-GROQ] analizar imagen:", buffer.byteLength, "bytes · mime:", norm, "· model: meta-llama/llama-4-scout-17b-16e-instruct");
  /* Groq: las imágenes mayores a ~20MB se rechazan con 400 → cortamos antes */
  if (buffer.byteLength > 20 * 1024 * 1024) {
    console.warn("[GADU-WA-GROQ] imagen excede 20MB:", buffer.byteLength, "bytes → no se envía a Groq");
    return "";
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const base64 = arrayBufferToBase64(buffer);
    const dataUrl = "data:" + norm + ";base64," + base64;
    const prompt = "Eres un experto leyendo tickets de compra, incluso si están rotados, borrosos, con poca luz, arrugados o fotografiados de costado. " +
      "Haz un esfuerzo EXTRA: busca la palabra 'TOTAL' (o 'TOTAL A PAGAR', 'IMPORTE', 'SUBTOTAL') y lee los números AUNQUE estén al final o al borde de la imagen. " +
      "Devuelve SOLO y ESTRICTAMENTE un JSON válido, sin markdown ni comentarios, con esta estructura exacta: " +
      '{"monto": <numero>, "concepto": "<descripcion>"}. ' +
      'Si no puedes leer el monto, devuelve {"monto": 0, "concepto": ""}. ' +
      'Texto que acompaña la imagen: "' + (caption || "") + '".';
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": "Bearer " + apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "meta-llama/llama-4-scout-17b-16e-instruct",
        messages: [{
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        }],
        max_tokens: 200,
        temperature: 0.2,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.warn("[GADU-WA-GROQ] visión falló · HTTP", res.status, "· body:", body.slice(0, 400));
      return "";
    }
    const j = await res.json();
    const text = String(j?.choices?.[0]?.message?.content || "").trim();
    if (text) console.log("[GADU-WA-GROQ] ✅ visión:", text.slice(0, 80));
    else console.warn("[GADU-WA-GROQ] 200 pero sin contenido:", JSON.stringify(j).slice(0, 200));
    return text;
  } catch (e) {
    console.warn("[GADU-WA-GROQ] error/timeout analizando imagen:", e);
    return "";
  } finally {
    clearTimeout(timer);
  }
}

/* Analiza la imagen con Groq y, si falla, con Gemini Vision (fallback). */
async function analyzeImageWithFallback(buffer: ArrayBuffer, mimeType: string, caption: string): Promise<string> {
  const text = await groqAnalyzeImage(buffer, mimeType, caption);
  if (text) return text;
  return await geminiAnalyzeImage(buffer, normalizeImageMime(mimeType), caption);
}

export interface ResolvedIncoming {
  from: string;
  text: string;
  audioFailed?: boolean;
  imageFailed?: boolean;
  imageNoMonto?: boolean;
  mediaUrl?: string;
  contact?: { name: string; phone: string };
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
      let text = "";
      try {
        text = await transcribeMedia(mediaId);
      } catch (e) {
        console.error("[GADU-WA-CRITICAL-FIX] transcribeMedia falló:", e);
        return { from, text: "", audioFailed: true };
      }
      if (!text) {
        console.warn("[GADU-WA-AUDIO] transcripción vacía para media", mediaId);
        return { from, text: "", audioFailed: true };
      }
      /* Ruido / audio demasiado breve ("mmm", "eh", "ah") → pedir repetir,
         en lugar de dejar que caiga al menú de fallback genérico. */
      const limpio = String(text).replace(/[^a-záéíóúñ0-9\s]/gi, "").replace(/\s+/g, " ").trim();
      if (limpio.length < 3 || /^(m+|h+|a+h+|e+h+|u+h+|mmm+|hmm|aja|jaja|jajaja|si|no)$/i.test(limpio)) {
        console.warn("[GADU-WA-AUDIO] transcripción ruido/breve descartada:", JSON.stringify(text));
        return { from, text: "", audioFailed: true };
      }
      console.log("[GADU-WA-AUDIO] texto transcrito (exacto):", JSON.stringify(text));
      return { from, text };
    }

    // Imagen (ticket) → analizar con Gemini Vision + caption
    if (msg.type === "image") {
      const mediaId = String(msg.image?.id || "");
      const caption = String(msg.image?.caption || "");
      if (!mediaId) return null;
      console.log("[GADU-WA-IMAGE] imagen detectada, media_id:", mediaId, "· caption:", caption);
      let text = "";
      let mediaUrl = "";
      try {
        /* Descargamos una sola vez: con el buffer hacemos el análisis Gemini
           Y subimos el comprobante a Storage. */
        const url = await getMediaUrl(mediaId);
        const { buffer, mimeType } = await downloadMedia(url);
        text = await analyzeImageWithFallback(buffer, mimeType, caption);
        try {
          mediaUrl = await uploadMediaToStorage(buffer, mimeType, from);
        } catch (e) {
          console.warn("[GADU-WA-IMAGE] no se pudo subir el comprobante:", e);
        }
      } catch (e) {
        console.error("[GADU-WA-CRITICAL-FIX] analyzeImage falló:", e);
        /* Si la visión lanzó error pero hay caption, usar el texto como fallback */
        if (caption && caption.trim()) {
          console.warn("[GADU-WA-IMAGE] visión lanzó error, uso caption como fallback:", caption);
          return { from, text: caption, mediaUrl: "" };
        }
        return { from, text: "", imageFailed: true };
      }
      if (!text) {
        /* La visión falló. Si el usuario escribió un caption, usarlo como
           red de seguridad para que el flujo normal de texto procese el gasto. */
        if (caption && caption.trim()) {
          console.warn("[GADU-WA-IMAGE] visión vacía, uso caption como fallback:", caption);
          return { from, text: caption, mediaUrl };
        }
        console.warn("[GADU-WA-IMAGE] análisis vacío para media", mediaId);
        return { from, text: "", imageFailed: true, mediaUrl };
      }
      console.log("[GADU-WA-IMAGE] análisis:", text, "· mediaUrl:", mediaUrl ? mediaUrl.slice(0, 80) : "(sin subir)");
      /* El modelo devuelve JSON {monto, concepto, categoria}. Parsearlo:
         - monto > 0 → construir texto de gasto natural (lo categoriza el flujo normal)
         - monto === 0 → el ticket se leyó pero no se pudo extraer el monto */
      try {
        const parsed = JSON.parse(String(text).replace(/```json|```/g, "").trim());
        const monto = Number(parsed && parsed.monto);
        if (monto > 0) {
          const concepto = String((parsed && parsed.concepto) || caption || "gasto").slice(0, 60);
          return { from, text: "Gasto de " + monto + " en " + concepto, mediaUrl };
        }
        console.warn("[GADU-WA-IMAGE] monto 0 → no se pudo leer el monto del ticket");
        /* Si hay caption (texto del usuario), usarlo como fallback */
        if (caption && caption.trim()) {
          console.warn("[GADU-WA-IMAGE] monto 0, uso caption como fallback:", caption);
          return { from, text: caption, mediaUrl };
        }
        return { from, text: "", imageNoMonto: true, mediaUrl };
      } catch (e) {
        /* No devolvió JSON: usar el texto crudo como fallback (flujo normal) */
        return { from, text, mediaUrl };
      }
    }

    // Contacto compartido (vCard): extraer nombre + teléfono
    if (msg.type === "contacts") {
      const contacts = Array.isArray(msg.contacts) ? msg.contacts : [];
      const c = contacts[0] || {};
      const nombre = String(c.name?.formatted_name || c.name?.first_name || c.name?.last_name || "").trim();
      const phone = String(
        c.phones?.[0]?.phone ||
        c.phones?.[0]?.wa_id ||
        (Array.isArray(c.phones) && c.phones.length ? String(c.phones[0]).replace(/\D/g, "") : "") ||
        ""
      ).trim();
      if (!nombre && !phone) return null;
      console.log("[GADU-WA-CONTACT] contacto compartido:", JSON.stringify({ nombre, phone }));
      return { from, text: "", contact: { name: nombre, phone } };
    }

    return null;
  } catch (e) {
    console.error("[GADU-WA-AUDIO] resolveIncomingText error:", e);
    return null;
  }
}
