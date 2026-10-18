// ============================================================
// GADU · REFERENCIA (Node.js) — interpretación de texto
// DeepSeek principal + fallback a Google AI Studio (Gemini).
// ⚠️ En producción real esto lo hace la Edge Function ai-assistant.
// ============================================================
const axios = require('axios');

/* Interpreta el texto transcrito → devuelve { monto, concepto, categoria }. */
async function interpretarGasto(texto) {
  const prompt = `Extrae el gasto del texto: "${texto}".
Responde SOLO JSON: {"monto": number, "concepto": string, "categoria": string}`;

  try {
    const r = await axios.post('https://api.deepseek.com/chat/completions', {
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0,
      response_format: { type: 'json_object' },
    }, {
      headers: { Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}` },
      timeout: 8000,
    });
    return JSON.parse(r.data.choices[0].message.content);
  } catch (e) {
    return interpretarConGemini(texto);   // fallback
  }
}

async function interpretarConGemini(texto) {
  const key = process.env.GEMINI_API_KEY;
  const r = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`,
    { contents: [{ parts: [{ text: `Extrae el gasto de: "${texto}". Responde JSON {monto,concepto,categoria}` }] }] },
  );
  const txt = r.data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  return JSON.parse(txt.replace(/```json|```/g, '').trim());
}

module.exports = { interpretarGasto };
