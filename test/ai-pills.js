/* Verifica que los pills de bienvenida disparen el flujo guiado (wizard) */
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

const cmds = {
  obra: 'cargar una obra',
  empleado: 'cargar un empleado',
  cliente: 'cargar un cliente',
  gasto: 'cargar un gasto',
  ingreso: 'cargar un ingreso',
  presupuesto: 'cargar un presupuesto',
  herramienta: 'cargar una herramienta',
};
console.log('== Pills → comando conversacional → intención ==');
for (const [mod, cmd] of Object.entries(cmds)) {
  const r = AI.localIntent(cmd);
  okk(!!r && r.modulo === mod, '"' + cmd + '" → ' + (r ? r.modulo : 'null'));
}

console.log('\n──────────────────────────');
if (ko === 0) { console.log('✔ PILLS MAPEAN AL WIZARD (' + ok + ' checks)'); process.exit(0); }
else { console.log('✘ ' + ko + ' fallos'); process.exit(1); }
