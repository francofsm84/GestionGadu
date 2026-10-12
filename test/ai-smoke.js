/* Prueba del módulo del asistente (ai.js): limpieza del dictado por voz */
'use strict';
global.window = global;
const mem = {};
global.localStorage = { getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: k => { delete mem[k]; } };
require('../js/ai.js');
const AI = global.GADU.ai;

function assert(cond, msg) { if (!cond) throw new Error(msg); }

try {
  // 1) Deduplicación de palabras consecutivas repetidas
  assert(AI.cleanInput('quiero quiero cargar') === 'quiero cargar', 'dedup palabras consecutivas');
  assert(AI.cleanInput('cárgame cárgame un gasto') === 'cárgame un gasto', 'dedup palabras consecutivas (tildes)');

  // 2) Colapso de frases repetidas (a b a b → a b)
  assert(AI.cleanInput('quiero cargar quiero cargar') === 'quiero cargar', 'dedup frase repetida (2+2)');
  assert(AI.cleanInput('podés hacer podés hacer') === 'podés hacer', 'dedup frase repetida (2+2)');

  // 3) Colapso de espacios
  assert(AI.cleanInput('  hola   mundo  ') === 'hola mundo', 'colapso de espacios');

  // 4) Cadena vacía
  assert(AI.cleanInput('   ') === '', 'espacios vacíos → cadena vacía');

  // 5) Tope de longitud (anti-consultas gigantes)
  const largo = Array.from({ length: 200 }, (_, i) => 'w' + i).join(' ');
  const capped = AI.prepareMessage(largo);
  assert(capped.length === 400, 'prepareMessage debe recortar a 400 chars, got ' + capped.length);

  console.log('✔ AI SMOKE TEST PASADO');
  process.exit(0);
} catch (e) {
  console.error('✘ FALLO:', e.message);
  process.exit(1);
}
