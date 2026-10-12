/* Auditoría: búsqueda inteligente de registros en el chat (js/ai.js) */
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
S.add('employees', { firstName: 'Jorge', lastName: 'el Flaco', phone: '', paymentData: '', hourlyRate: 1500, active: true, notes: 'Oficio: Albañil', photo: null });
S.add('assets', { name: 'Amoladora', category: 'Herramienta eléctrica', purchaseDate: S.todayISO(), cost: 12000, status: 'operativo', supplierId: null, notes: 'en obra Norma Molina', maintenance: [] });
S.add('works', { name: 'Norma Molina', code: 'OB-1', clientId: null, location: 'Alta Gracia', status: 'activa', budgetTotal: 100000, advanceFisico: 0, startDate: S.todayISO(), endDate: '', description: '' });

console.log('== 1) Detección de intención de búsqueda ==');
okk(AI.searchIntent('buscame a Jorge el Flaco') === 'jorge el flaco', 'buscame a X');
okk(AI.searchIntent('¿Dónde está la amoladora?') === 'amoladora', '¿dónde está X? (artículo)');
okk(AI.searchIntent('buscar amoladora') === 'amoladora', 'buscar X');
okk(AI.searchIntent('cargar un gasto de 5000') === null, 'no confunde cargas con búsquedas');

console.log('== 2) Coincidencias en el store ==');
const e = AI.searchStore('jorge el flaco');
okk(e.length === 1 && e[0].tipo === 'Empleado' && e[0].key === 'empleados', 'encuentra al empleado');
const h = AI.searchStore('amoladora');
okk(h.length === 1 && h[0].tipo === 'Herramienta' && h[0].key === 'herramientas', 'encuentra la herramienta');
const w = AI.searchStore('norma');
okk(w.length >= 1 && w.some(r => r.tipo === 'Obra' && r.key === 'obras'), 'encuentra la obra');
const nada = AI.searchStore('zzz');
okk(nada.length === 0, 'sin coincidencias → vacío');
const oficio = AI.searchStore('albañil');
okk(oficio.length === 1 && oficio[0].nombre === 'Jorge el Flaco', 'busca también por oficio (notas)');

console.log('\n──────────────────────────');
if (ko === 0) { console.log('✔ AI SEARCH AUDIT PASADO (' + ok + ' checks)'); process.exit(0); }
else { console.log('✘ AUDIT: ' + ko + ' fallos de ' + (ok + ko)); process.exit(1); }
