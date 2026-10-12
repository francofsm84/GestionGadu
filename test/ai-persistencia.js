/* Auditoría: persistencia real verificada — tilde verde SOLO si Supabase confirma */
'use strict';
global.window = global;
const mem = {};
global.localStorage = { getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: k => { delete mem[k]; } };
require('../js/store.js');
const G = global.GADU;
G.plan = { profile: {}, currentPlan: () => ({ nombre: 'Free' }), trialDaysLeft: () => 14, checkLimit: () => true };
G.auth = { getSession: () => null };
G.actions = {};
require('../js/ai.js');
const S = G.store;
const AI = G.ai;

let ok = 0, ko = 0;
function okk(cond, label) { if (cond) { ok++; console.log('  ✔ ' + label); } else { ko++; console.log('  ✘ ' + label); } }

(async () => {

S.load();
S.startEmpty();
S.add('works', { name: 'Obra A', code: 'OB-1', clientId: null, location: '', status: 'activa', budgetTotal: 0, advanceFisico: 0, startDate: S.todayISO(), endDate: '', description: '' });
S.add('works', { name: 'Obra B', code: 'OB-2', clientId: null, location: '', status: 'activa', budgetTotal: 0, advanceFisico: 0, startDate: S.todayISO(), endDate: '', description: '' });

console.log('== 1) Sin conexión: NUNCA tilde verde ==');
G.sync = { push: () => Promise.reject(new Error('network down')) };
const r1 = await AI.execFormAction({ modulo: 'gasto', campos: { monto: 3000, categoria: 'Materiales', obra: 'Obra A' } });
okk(r1 && r1.saved === true, 'guardado local OK');
okk(r1 && r1.synced === false, 'synced:false (la nube falló) → sin tilde verde');
okk(S.data.expenses.some(e => e.amount === 3000), 'el dato está en el store local (listas visibles)');

console.log('== 2) Nube OK: tilde verde confirmado ==');
G.sync = { push: () => Promise.resolve(true) };
const r2 = await AI.execFormAction({ modulo: 'ingreso', campos: { monto: 10000, obra: 'Obra B' } });
okk(r2 && r2.saved === true && r2.synced === true, 'synced:true → tilde verde habilitado');
okk(S.data.incomes.some(i => i.amount === 10000), 'el ingreso quedó insertado en el store');

console.log('== 3) Datos insuficientes: sin guardado ==');
const r3 = await AI.execFormAction({ modulo: 'gasto', campos: { monto: 100 } });
okk(r3 && r3.saved === false, 'gasto sin categoría/obra → retiene (sin tilde)');

console.log('\n──────────────────────────');
if (ko === 0) { console.log('✔ AI PERSISTENCIA AUDIT PASADO (' + ok + ' checks)'); process.exit(0); }
else { console.log('✘ AUDIT: ' + ko + ' fallos de ' + (ok + ko)); process.exit(1); }

})().catch(e => { console.error('✘ FALLO:', e); process.exit(1); });
