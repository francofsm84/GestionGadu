// Limpia whatsapp-webhook.bundle.ts de caracteres no-ASCII (anti mojibake):
//   - emojis → texto plano
//   - acentos/¿/¡ → escapes Unicode (\uXXXX)
//   - cualquier otro no-ASCII restante → se elimina
const fs = require('fs');

let s = fs.readFileSync('whatsapp-webhook.bundle.ts', 'utf8');

// 1) Acentos y puntuación española → escapes Unicode
const accents = {
  'á': '\\u00e1', 'é': '\\u00e9', 'í': '\\u00ed', 'ó': '\\u00f3', 'ú': '\\u00fa', 'ñ': '\\u00f1', 'ü': '\\u00fc',
  'Á': '\\u00c1', 'É': '\\u00c9', 'Í': '\\u00cd', 'Ó': '\\u00d3', 'Ú': '\\u00da', 'Ñ': '\\u00d1', 'Ü': '\\u00dc',
  '¿': '\\u00bf', '¡': '\\u00a1', '°': '\\u00b0', '·': '\\u00b7', '–': '\\u2013', '—': '\\u2014',
  '→': '\\u2192', '…': '\\u2026', '•': '\\u2022', '✓': '\\u2713', '≠': '\\u2260',
};
for (const [k, v] of Object.entries(accents)) s = s.split(k).join(v);

// 2) Emojis → texto plano (los más usados; el resto se elimina en el sweep final)
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

// 3) Sweep final: cualquier carácter no-ASCII que haya quedado → eliminar
s = s.replace(/[^\x00-\x7F]/g, '');

fs.writeFileSync('whatsapp-webhook.bundle.clean.ts', s, 'utf8');
const nonAscii = (s.match(/[^\x00-\x7F]/g) || []).length;
console.log('Limpio. Caracteres no-ASCII restantes:', nonAscii);
console.log('Lineas:', s.split('\n').length);
