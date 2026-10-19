// Limpia ai-assistant/index.ts → ai-assistant.clean.ts (ASCII puro, anti-mojibake)
const fs = require('fs');
let s = fs.readFileSync('supabase/functions/ai-assistant/index.ts', 'utf8');

const accents = {
  'á': 'a', 'é': 'e', 'í': 'i', 'ó': 'o', 'ú': 'u', 'ñ': 'n', 'ü': 'u',
  'Á': 'A', 'É': 'E', 'Í': 'I', 'Ó': 'O', 'Ú': 'U', 'Ñ': 'N', 'Ü': 'U',
  '¿': '', '¡': '', '°': '', '·': ' ', '–': '-', '—': '-',
  '→': '->', '…': '...', '•': '-', '✓': 'OK', '≠': '!=',
};
for (const [k, v] of Object.entries(accents)) s = s.split(k).join(v);

const emojis = {
  '🤖': '[BOT]', '✅': 'OK', '❌': '[ERROR]', '⚠️': '[ALERTA]', '⚠': '[ALERTA]', '❗': '!',
  '👉': '->', '👇': '[abajo]', '👋': 'Hola', '💪': '[ok]',
  '💰': '$', '💸': '$', '💵': '$', '💳': '[pago]',
  '📄': '[doc]', '📎': '[adjunto]', '🧾': '[ticket]', '📌': '[pin]',
  '🏗️': '[obra]', '🏗': '[obra]', '👤': '[contacto]', '👷': '[empleado]', '🛠️': '[herramienta]', '🛠': '[herramienta]',
  '⏳': '[espera]', '⏰': '[hora]', '📅': '[fecha]', '🗓️': '[fecha]', '🗓': '[fecha]',
  '🔍': '[buscar]', '📲': '[whatsapp]', '🔔': '[alerta]', '📱': '[telefono]',
  '👑': '[admin]', '➕': '+', '🗑': '[borrar]', '✏️': '[editar]', '✏': '[editar]',
  '📊': '[metricas]', '👥': '[usuarios]', '🔒': '[lock]', '💡': '[tip]', '⚙️': '[config]', '⚙': '[config]',
  '🎉': '[ok]', '🔧': '[fix]', '🎯': '[objetivo]', '🔥': '[ok]', '🚀': '[ok]',
  '👍': '[ok]', '⬇️': '[abajo]', '⬇': '[abajo]', '⬆️': '[arriba]', '⬆': '[arriba]',
  '📈': '[sube]', '📉': '[baja]', '⛔': '[prohibido]', 'ℹ️': '[info]', 'ℹ': '[info]',
  '✔': 'OK', '✖': '[ERROR]', '⭐': '[star]', '🔄': '[refresh]', '▶': '>', '◀': '<',
  '☰': '[menu]', '☑': 'OK', '∞': 'infinito', '➜': '->',
};
for (const [k, v] of Object.entries(emojis)) s = s.split(k).join(v);

s = s.replace(/[^\x00-\x7F]/g, '');
fs.writeFileSync('ai-assistant.clean.ts', s, 'utf8');
console.log('ai-assistant.clean.ts:', s.split('\n').length, 'lineas · no-ASCII:', (s.match(/[^\x00-\x7F]/g) || []).length);
