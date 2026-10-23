// Regenera whatsapp-webhook.bundle.ts desde los 4 módulos + limpia no-ASCII.
//  1) index.ts + core.ts + transcribe.ts + queue.ts (sin imports locales)
//  2) emojis → texto plano, acentos → \uXXXX, sweep final no-ASCII
const fs = require('fs');
const dir = 'supabase/functions/whatsapp-webhook/';

let index = fs.readFileSync(dir + 'index.ts', 'utf8');
// quitar imports locales (core/transcribe/queue) — regex no dependiente de la lista exacta
index = index.replace(/import \{\s*matchVerificationCode,[\s\S]*?\} from "\.\/core\.ts";\s*\r?\n/, '');
index = index.replace(/import \{ resolveIncomingText \} from "\.\/transcribe\.ts";\s*\r?\n/, '');
index = index.replace(/import \{ enqueueMessage, claimNext, markDone, markFailed, resetStaleProcessing \} from "\.\/queue\.ts";\s*\r?\n/, '');

let s = fs.readFileSync(dir + 'core.ts', 'utf8') + '\n\n'
      + fs.readFileSync(dir + 'transcribe.ts', 'utf8') + '\n\n'
      + fs.readFileSync(dir + 'queue.ts', 'utf8') + '\n\n'
      + index;

// 1) Acentos y puntuación española → texto ASCII plano (SIN escapes \u, para
//    evitar problemas de parseo en el editor de Supabase)
const accents = {
  'á': 'a', 'é': 'e', 'í': 'i', 'ó': 'o', 'ú': 'u', 'ñ': 'n', 'ü': 'u',
  'Á': 'A', 'É': 'E', 'Í': 'I', 'Ó': 'O', 'Ú': 'U', 'Ñ': 'N', 'Ü': 'U',
  '¿': '', '¡': '', '°': '', '·': ' ', '–': '-', '—': '-',
  '→': '->', '…': '...', '•': '-', '✓': 'OK', '≠': '!=',
};
for (const [k, v] of Object.entries(accents)) s = s.split(k).join(v);

// 2) Emojis y cualquier no-ASCII restante → \uXXXX (surrogate pairs).
//    Así los emojis (💰📊🏗️🏠…) se conservan en WhatsApp y el bundle
//    sigue siendo ASCII-puro para el editor de Supabase (sin mojibake).
s = s.replace(/[^\x00-\x7F]/g, ch => {
  const code = ch.charCodeAt(0);
  return '\\u' + code.toString(16).toUpperCase().padStart(4, '0');
});

fs.writeFileSync('whatsapp-webhook.bundle.ts', s, 'utf8');
const nonAscii = (s.match(/[^\x00-\x7F]/g) || []).length;
console.log('Bundle final:', s.split('\n').length, 'lineas · no-ASCII:', nonAscii);
