/* Auditoría interna del asistente: extracción de entidades (nombres/montos),
   transcripción y deduplicación de dictado por voz. */
'use strict';
global.window = global;
const mem = {};
global.localStorage = { getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: k => { delete mem[k]; } };
require('../js/ai.js');
const AI = global.GADU.ai;

let ok = 0, ko = 0;
function eq(actual, expected, label) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a === b) { ok++; console.log('  ✔ ' + label); }
  else { ko++; console.log('  ✘ ' + label + '\n      esperado: ' + b + '\n      obtenido: ' + a); }
}

console.log('== 1) Extracción de NOMBRES compuestos (localIntent) ==');
eq(AI.localIntent('crear empleado mariela rodríguez'), { modulo: 'empleado', campos: { nombre: 'mariela rodríguez' } }, 'empleado compuesto');
eq(AI.localIntent('cargar cliente ángel cámara'), { modulo: 'cliente', campos: { nombre: 'ángel cámara' } }, 'cliente compuesto');
eq(AI.localIntent('agregar socio maría josé pérez'), { modulo: 'socio', campos: { nombre: 'maría josé pérez' } }, 'socio compuesto');
eq(AI.localIntent('crear obra casa de maría'), { modulo: 'obra', campos: { nombre: 'casa de maría' } }, 'obra con nombre compuesto');
eq(AI.localIntent('crear presupuesto reforma cocina'), { modulo: 'presupuesto', campos: { nombre: 'reforma cocina' } }, 'presupuesto compuesto');

console.log('== 2) Extracción de MONTOS (localIntent) ==');
eq(AI.localIntent('carga un gasto de nafta de 5000'), { modulo: 'gasto', campos: { monto: 5000, categoria: 'Combustible' } }, 'gasto con categoría (nafta → Combustible)');
eq(AI.localIntent('cargo un ingreso de 10000'), { modulo: 'ingreso', campos: { monto: 10000, concepto: 'Cobro' } }, 'ingreso 10000');
eq(AI.localIntent('registrá un anticipo de 15000'), { modulo: 'ingreso', campos: { monto: 15000, concepto: 'Adelanto' } }, 'anticipo (concepto Adelanto)');
eq(AI.localIntent('cárgame un gasto de 5.000'), { modulo: 'gasto', campos: { monto: 5000 } }, 'monto con separador de miles');
eq(AI.localIntent('gasto de combustible 2.500'), { modulo: 'gasto', campos: { monto: 2500, categoria: 'Combustible' } }, 'monto 2.500 (canónica)');

console.log('== 3) Transcripción (buildTranscript) ==');
eq(AI.buildTranscript([
  { isFinal: true, transcript: 'mariela' },
  { isFinal: false, transcript: 'rodríguez' },
]), { final: 'mariela', interim: 'rodríguez', combined: 'mariela rodríguez' }, 'final + interino');
eq(AI.buildTranscript([
  { isFinal: true, transcript: 'hola' },
  { isFinal: true, transcript: 'mundo' },
]), { final: 'hola mundo', interim: '', combined: 'hola mundo' }, 'dos finales concatenados');

console.log('== 4) Deduplicación de dictado ==');
eq(AI.cleanInput('mariela mariela rodríguez'), 'mariela rodríguez', 'palabras consecutivas (nombre)');
eq(AI.removeRepeatedPhrases('cárgame cárgame un gasto de 5000'), 'cárgame un gasto de 5000', 'repetición con acentos');
eq(AI.cleanInput('cargar gasto cargar gasto'), 'cargar gasto', 'frase repetida');

console.log('== 5) Tope de longitud ==');
eq(AI.prepareMessage(Array.from({ length: 300 }, (_, i) => 'w' + i).join(' ')).length, 400, 'prepareMessage recorta a 400');

console.log('\n──────────────────────────');
if (ko === 0) { console.log('✔ AI AUDIT PASADO (' + ok + ' checks)'); process.exit(0); }
else { console.log('✘ AI AUDIT: ' + ko + ' fallos de ' + (ok + ko)); process.exit(1); }
