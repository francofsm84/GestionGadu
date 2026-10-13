/* Verifica que los pills de bienvenida disparen los wizards DIRECTAMENTE
   (sin inyectar el texto del botón como dato) y que los comandos de texto
   sigan mapeando a las intenciones correctas. */
'use strict';
global.window = global;
const mem = {};
global.localStorage = { getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: k => { delete mem[k]; } };
require('../js/store.js');
const G = global.GADU;
G.plan = { profile: {}, currentPlan: () => ({ nombre: 'Free' }), trialDaysLeft: () => 14, checkLimit: () => true };
G.sync = { push: () => {} };
G.auth = { getSession: () => null };
G.actions = {};
require('../js/ai.js');
const AI = G.ai;

let ok = 0, ko = 0;
function okk(cond, label) { if (cond) { ok++; console.log('  ✔ ' + label); } else { ko++; console.log('  ✘ ' + label); } }

console.log('== 1) Pills → módulo de wizard (click directo, sin texto) ==');
okk(AI.PILL_WIZARD['new-obra'] === 'obra', 'Nueva obra → wizard obra');
okk(AI.PILL_WIZARD['new-gasto'] === 'gasto', 'Cargar gasto → wizard gasto');
okk(AI.PILL_WIZARD['new-ingreso'] === 'ingreso', 'Nuevo ingreso → wizard ingreso');
okk(AI.PILL_WIZARD['new-presupuesto'] === 'presupuesto', 'Nuevo presupuesto → wizard presupuesto');
okk(AI.PILL_WIZARD['herramientas'] === 'herramienta', 'Herramientas → wizard herramienta');
okk(AI.PILL_WIZARD['new-jornada'] === 'jornada', 'Jornada → wizard jornada');
okk(!AI.PILL_WIZARD['new-empleado'] && !AI.PILL_WIZARD['new-cliente'], 'empleado/cliente NO van directo a wizard (pasan por Crear agenda)');

console.log('== 2) Comandos por texto siguen funcionando (voz/escritura) ==');
const cmds = {
  obra: 'cargar una obra',
  empleado: 'cargar un empleado',
  cliente: 'cargar un cliente',
  gasto: 'cargar un gasto',
  ingreso: 'cargar un ingreso',
  presupuesto: 'cargar un presupuesto',
  herramienta: 'cargar una herramienta',
};
for (const [mod, cmd] of Object.entries(cmds)) {
  const r = AI.localIntent(cmd);
  okk(!!r && r.modulo === mod, '"' + cmd + '" → ' + (r ? r.modulo : 'null'));
}

console.log('== 3) Validadores de campos ==');
okk(AI.isValidNumber('5000') === true, 'número válido');
okk(AI.isValidNumber('1.500') === true, 'número con separador de miles');
okk(AI.isValidNumber('cargar un gasto') === false, 'texto NO es número');
okk(AI.isValidPhone('+54 9 351 555-1234') === true, 'teléfono válido');
okk(AI.isValidPhone('abc') === false, 'teléfono inválido');
okk(AI.isValidEmail('fr@x.com') === true, 'email válido');
okk(AI.isValidEmail('no tengo') === false, 'email inválido');

console.log('\n──────────────────────────');
if (ko === 0) { console.log('✔ PILLS MAPEAN A WIZARDS DIRECTOS (' + ok + ' checks)'); process.exit(0); }
else { console.log('✘ ' + ko + ' fallos'); process.exit(1); }
