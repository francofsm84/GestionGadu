/* Auditoría: flujo guiado universal (wizard) + nuevos módulos presupuesto/herramienta */
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
const S = G.store;
const AI = G.ai;

let ok = 0, ko = 0;
function okk(cond, label) { if (cond) { ok++; console.log('  ✔ ' + label); } else { ko++; console.log('  ✘ ' + label); } }

S.load();
S.startEmpty();
const obra = S.add('works', { name: 'Norma Molina', code: 'OB-1', clientId: null, location: '', status: 'activa', budgetTotal: 0, advanceFisico: 0, startDate: S.todayISO(), endDate: '', description: '' });

console.log('== 1) Cobertura universal de pasos guiados ==');
['empleado', 'cliente', 'socio', 'obra', 'gasto', 'ingreso', 'presupuesto', 'herramienta'].forEach(m => {
  okk(!!AI.WIZARD_STEPS[m] && AI.WIZARD_STEPS[m].length > 0, 'wizard de ' + m);
});

console.log('== 2) Detección de intención (localIntent) ==');
okk(JSON.stringify(AI.localIntent('cargar herramienta amoladora')) === JSON.stringify({ modulo: 'herramienta', campos: { nombre: 'amoladora' } }), 'detecta herramienta');
okk(JSON.stringify(AI.localIntent('nuevo presupuesto reforma cocina')) === JSON.stringify({ modulo: 'presupuesto', campos: { nombre: 'reforma cocina' } }), 'detecta presupuesto');
okk(JSON.stringify(AI.localIntent('cargar un gasto')) === JSON.stringify({ modulo: 'gasto', campos: {} }), 'gasto sin monto → guiado');

console.log('== 3) Completitud mínima por módulo (validación estricta) ==');
okk(AI.isCompleteWizard('empleado', { nombre: 'Jorge' }) === true, 'empleado con nombre → completo');
okk(AI.isCompleteWizard('gasto', {}) === false, 'gasto vacío → incompleto');
okk(AI.isCompleteWizard('gasto', { monto: 5000 }) === false, 'gasto SOLO con monto → incompleto (falta categoría y obra)');
okk(AI.isCompleteWizard('gasto', { monto: 5000, categoria: 'Materiales', obra: 'X' }) === true, 'gasto completo → listo');
okk(AI.isCompleteWizard('ingreso', { monto: 10000 }) === false, 'ingreso sin obra → incompleto');
okk(AI.isCompleteWizard('obra', { nombre: 'X' }) === true, 'obra con nombre → completo');
okk(AI.isCompleteWizard('presupuesto', { nombre: 'X' }) === false, 'presupuesto sin obra → incompleto');

console.log('== 5) Guardado estricto: sin obra no se guarda como general ==');
const otra = S.add('works', { name: 'Obra Dos', code: 'OB-2', clientId: null, location: '', status: 'activa', budgetTotal: 0, advanceFisico: 0, startDate: S.todayISO(), endDate: '', description: '' });
const antes = S.data.expenses.length;
const rSin = AI.execFormAction({ modulo: 'gasto', campos: { monto: 3000, categoria: 'Materiales' } });
okk(rSin && rSin.saved === false, 'gasto sin obra con varias obras → NO guarda (retiene)');
okk(S.data.expenses.length === antes, 'no se insertó gasto fantasma');
const rCon = AI.execFormAction({ modulo: 'gasto', campos: { monto: 3000, categoria: 'Materiales', obra: 'Norma Molina' } });
okk(rCon && rCon.saved === true, 'gasto con obra → guarda directo');
okk(S.data.expenses.some(x => x.amount === 3000 && x.workId === obra.id), 'gasto insertado en la obra correcta');

console.log('== 4) Guardado autónomo de los nuevos módulos ==');
const r1 = AI.execFormAction({ modulo: 'presupuesto', campos: { nombre: 'Reforma cocina', monto: 80000, obra: 'Norma Molina' } });
okk(r1 && r1.saved === true, 'presupuesto guarda directo');
const b = S.data.budgets.find(x => x.name === 'Reforma cocina');
okk(!!b && b.total === 80000 && b.workId === obra.id, 'presupuesto con monto y obra correctos');
const r2 = AI.execFormAction({ modulo: 'herramienta', campos: { nombre: 'Amoladora', categoria: 'Herramienta eléctrica', costo: 12000 } });
okk(r2 && r2.saved === true, 'herramienta guarda directo');
const a = S.data.assets.find(x => x.name === 'Amoladora');
okk(!!a && a.cost === 12000 && a.category === 'Herramienta eléctrica', 'herramienta con costo y categoría');
const r3 = AI.execFormAction({ modulo: 'empleado', campos: { nombre: 'Jorge el Flaco', oficio: 'Albañil', tarifa: 1500 } });
okk(r3 && r3.saved === true, 'empleado con oficio guarda');
const e = S.data.employees.find(x => x.firstName === 'Jorge');
okk(!!e && e.notes === 'Oficio: Albañil' && e.hourlyRate === 1500, 'empleado con oficio y tarifa persistidos');

console.log('\n──────────────────────────');
if (ko === 0) { console.log('✔ AI WIZARD AUDIT PASADO (' + ok + ' checks)'); process.exit(0); }
else { console.log('✘ AUDIT: ' + ko + ' fallos de ' + (ok + ko)); process.exit(1); }
