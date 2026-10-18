// ============================================================
// GADU · REFERENCIA (Node.js) — proveedor multimedia Groq
// ⚠️ Documentación de referencia para una posible migración o
//    microservicio aparte. El código REAL de producción vive en:
//    supabase/functions/whatsapp-webhook/transcribe.ts (Deno).
// ============================================================
const Groq = require('groq-sdk');
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

/* Transcribe una nota de voz. Recibe el Buffer crudo descargado de WhatsApp. */
async function transcribirAudio(buffer) {
  // groq-sdk acepta un File; convertimos el Buffer con su helper oficial
  const file = await Groq.toFile(buffer, 'nota_voz.ogg', { type: 'audio/ogg' });
  const t = await groq.audio.transcriptions.create({
    file,
    model: 'whisper-large-v3-turbo',
    response_format: 'json',
  });
  return (t.text || '').trim();
}

/* Analiza una imagen. Recibe una data-URL (data:image/jpeg;base64,...).
   Devuelve el JSON string: {"monto":number,"concepto":string,"categoria":string} */
async function analizarImagen(dataUrl) {
  const prompt = `Analiza esta imagen. Si es un ticket o producto, extrae el monto total y el concepto.
Devuelve SOLO un JSON válido con esta estructura exacta (sin markdown, sin comentarios):
{"monto": 2000, "concepto": "cigarrillos", "categoria": "Ocio"}`;
  const res = await groq.chat.completions.create({
    model: 'meta-llama/llama-4-scout-17b-16e-instruct',
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: dataUrl } },
      ],
    }],
    temperature: 0.2,
    max_tokens: 300,
  });
  return (res.choices[0]?.message?.content || '').trim();
}

module.exports = { transcribirAudio, analizarImagen };
