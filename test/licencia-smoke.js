/* Prueba del sistema de licencias por código (mock de validación) */
'use strict';
global.window = global;
require('../js/plan.js');
const P = global.GADU.plan;

function assert(cond, msg) { if (!cond) throw new Error(msg); }

try {
  // Prefijos válidos
  assert(P.validarCodigo('GADU90-ABCD') === true, 'prefijo GADU90- válido');
  assert(P.validarCodigo('gadu90-xyz') === true, 'case-insensitive GADU90-');
  assert(P.validarCodigo('GADU-90D-ABCD') === true, 'prefijo GADU-90D- válido');
  assert(P.validarCodigo('GADU-90D-TEST') === true, 'prefijo GADU-90D- válido');
  // Lista de prueba
  assert(P.validarCodigo('GADU90-PRUEBA') === true, 'código de prueba');
  assert(P.validarCodigo('GADU90-TEST') === true, 'código de prueba');
  assert(P.validarCodigo('GADU90-DEMO') === true, 'código de prueba');
  // Inválidos
  assert(P.validarCodigo('INVALIDO') === false, 'código inválido');
  assert(P.validarCodigo('') === false, 'vacío inválido');
  assert(P.validarCodigo('   ') === false, 'espacios inválidos');
  assert(P.validarCodigo('GADU-000') === false, 'prefijo desconocido inválido');

  console.log('✔ LICENCIA SMOKE TEST PASADO');
  process.exit(0);
} catch (e) {
  console.error('✘ FALLO:', e.message);
  process.exit(1);
}
