// ============================================================
// GADU · REFERENCIA (Node.js) — webhook WhatsApp + Groq + DeepSeek
// ⚠️ Documentación de referencia. El código REAL de producción es
//    supabase/functions/whatsapp-webhook/index.ts (Deno, Supabase).
// ============================================================
const express = require('express');
const axios = require('axios');
const { transcribirAudio, analizarImagen } = require('./groqService');
const { interpretarGasto } = require('./deepseekService');

const app = express();
app.use(express.json());
const TOKEN = process.env.WHATSAPP_TOKEN;
const V = 'v18.0';

/* Descarga Meta de 2 pasos: URL temporal → binario (con token) */
async function downloadMedia(mediaId) {
  const meta = await axios.get(`https://graph.facebook.com/${V}/${mediaId}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  const res = await axios.get(meta.data.url, {
    responseType: 'arraybuffer',
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  return { buffer: Buffer.from(res.data), mimeType: res.headers['content-type'] };
}

function bufToDataUrl(buffer, mimeType) {
  return `data:${mimeType};base64,${buffer.toString('base64')}`;
}

async function sendText(to, body) {
  await axios.post(`https://graph.facebook.com/${V}/${process.env.WHATSAPP_PHONE_ID}/messages`, {
    messaging_product: 'whatsapp', to, type: 'text', text: { body },
  }, { headers: { Authorization: `Bearer ${TOKEN}` } });
}

app.post('/webhook', async (req, res) => {
  res.sendStatus(200);   // responder YA (idempotencia de Meta)

  const msg = req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  const to = msg?.from;
  if (!msg || !to) return;

  try {
    if (msg.type === 'text') {
      const g = await interpretarGasto(msg.text.body);
      await sendText(to, `✅ Gasto registrado: $${g.monto} en ${g.concepto} (${g.categoria})`);

    } else if (msg.type === 'audio' || msg.type === 'voice') {
      const { buffer } = await downloadMedia(msg.audio.id);
      const texto = await transcribirAudio(buffer);
      if (!texto) throw new Error('transcripción vacía');
      const g = await interpretarGasto(texto);
      await sendText(to, `✅ Gasto registrado: $${g.monto} en ${g.concepto} (${g.categoria})`);

    } else if (msg.type === 'image') {
      const { buffer, mimeType } = await downloadMedia(msg.image.id);
      const json = await analizarImagen(bufToDataUrl(buffer, mimeType));
      const parsed = JSON.parse(json.replace(/```json|```/g, '').trim());
      const g = await interpretarGasto(`${parsed.concepto} ${parsed.monto}`);
      await sendText(to, `✅ Gasto registrado: $${g.monto} en ${g.concepto} (${g.categoria})`);
    }
  } catch (e) {
    console.error('[webhook] error multimedia:', e.message);
    await sendText(to, 'Hubo un problema procesando tu archivo, ¿podrías escribirlo manualmente?');
  }
});

app.listen(process.env.PORT || 3000);
