// Regenera whatsapp-webhook.bundle.ts desde los 4 módulos + limpia no-ASCII.
//  1) index.ts + core.ts + transcribe.ts + queue.ts (sin imports locales)
//  2) emojis → texto plano, acentos → \uXXXX, sweep final no-ASCII
const fs = require('fs');
const dir = 'supabase/functions/whatsapp-webhook/';

let index = fs.readFileSync(dir + 'index.ts', 'utf8');
// quitar imports locales (core/transcribe/queue)
index = index.replace(/import \{\s*matchVerificationCode,[\s\S]*?rawDigits,\s*\} from "\.\/core\.ts";\s*\r?\n/, '');
index = index.replace(/import \{ resolveIncomingText \} from "\.\/transcribe\.ts";\s*\r?\n/, '');
index = index.replace(/import \{ enqueueMessage, claimNext, markDone, markFailed, resetStaleProcessing \} from "\.\/queue\.ts";\s*\r?\n/, '');

let s = fs.readFileSync(dir + 'core.ts', 'utf8') + '\n\n'
      + fs.readFileSync(dir + 'transcribe.ts', 'utf8') + '\n\n'
      + fs.readFileSync(dir + 'queue.ts', 'utf8') + '\n\n'
      + index;

// 1) Acentos y puntuación española → escapes Unicode
const accents = {
  'á': '\\u00e1', 'é': '\\u00e9', 'í': '\\u00ed', 'ó': '\\u00f3', 'ú': '\\u00fa', 'ñ': '\\u00f1', 'ü': '\\u00fc',
  'Á': '\\u00c1', 'É': '\\u00c9', 'Í': '\\u00cd', 'Ó': '\\u00d3', 'Ú': '\\u00da', 'Ñ': '\\u00d1', 'Ü': '\\u00dc',
  '¿': '\\u00bf', '¡': '\\u00a1', '°': '\\u00b0', '·': '\\u00b7', '–': '\\u2013', '—': '\\u2014',
  '→': '\\u2192', '…': '\\u2026', '•': '\\u2022', '✓': '\\u2713', '≠': '\\u2260',
};
for (const [k, v] of Object.entries(accents)) s = s.split(k).join(v);

// 2) Emojis → texto plano
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

// 3) Sweep final: cualquier no-ASCII restante → eliminar
s = s.replace(/[^\x00-\x7F]/g, '');

fs.writeFileSync('whatsapp-webhook.bundle.ts', s, 'utf8');
const nonAscii = (s.match(/[^\x00-\x7F]/g) || []).length;
console.log('Bundle final:', s.split('\n').length, 'lineas · no-ASCII:', nonAscii);
