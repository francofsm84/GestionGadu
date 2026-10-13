/* Regresión: ruteo NLP — consultas nunca disparan formularios de creación */
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
/* Datos: herramienta en obra + obra activa + un gasto */
const obra = S.add('works', { name: 'casa pablo', code: 'OB-2026-001', clientId: null, location: '', status: 'activa', budgetTotal: 100000, advanceFisico: 0, startDate: S.todayISO(), endDate: '', description: '' });
S.add('assets', { name: 'Amoladora', status: 'activa', location: obra.id, notes: '', cost: 12000, category: 'Herramienta eléctrica' });
S.add('assets', { name: 'Hormigonera', status: 'activa', location: null, notes: '', cost: 80000, category: 'Maquinaria' });
S.add('expenses', { type: 'obra', workId: obra.id, date: S.todayISO(), amount: 5000, category: 'Materiales', providerId: null, employeeId: null, expenseKind: null, description: 'bolsas de cemento', invoiceNumber: '', paymentMethod: 'Efectivo' });

/* 1 · Búsqueda de herramienta → inventario, sin formularios */
okk(AI.searchIntent('¿dónde está la amoladora?') === 'amoladora', 'searchIntent detecta "¿dónde está la amoladora?"');
const r1 = AI.searchStore('amoladora');
okk(r1.some(r => r.tipo === 'Herramienta' && r.nombre === 'Amoladora' && r.detail.includes('casa pablo')), 'searchStore responde con inventario y obra asignada');
okk(AI.localIntent('¿dónde está la amoladora?') === null, 'la consulta NO dispara ningún formulario (null)');

/* 2 · Otras frases de búsqueda */
okk(AI.searchIntent('¿quién tiene la hormigonera?') === 'hormigonera', 'searchIntent detecta "¿quién tiene…?"');
okk(AI.searchIntent('buscame la camioneta de la obra de pablo') === 'camioneta de la obra de pablo', 'búsqueda larga (hasta 8 palabras)');
okk(AI.searchIntent('¿qué pasó con la amoladora?') === 'amoladora', 'searchIntent detecta "¿qué pasó con…?"');

/* 3 · Consultas contables NO abren wizards de creación */
okk(AI.localIntent('¿cuánto gasté en la obra casa pablo?') === null, '"¿cuánto gasté…?" → null (consulta, no alta)');
okk(AI.localIntent('¿cuánto balance hay este mes?') === null, '"¿cuánto balance…?" → null');
okk(AI.localIntent('¿puedo crear una obra nueva?') === null, '"¿puedo crear una obra?" → null');

/* 4 · Comandos reales siguen funcionando (NLP con entidades) */
const cmd1 = AI.localIntent('gasto de 5000 en nafta en la obra casa pablo');
okk(cmd1 && cmd1.modulo === 'gasto' && cmd1.campos.monto === 5000 && cmd1.campos.obra === 'casa pablo', 'gasto con monto+obra → entidades extraídas');
const cmd2 = AI.localIntent('crear una obra llamada casa nueva');
okk(cmd2 && cmd2.modulo === 'obra' && cmd2.campos.nombre === 'casa nueva', 'crear obra → alta con nombre');
const cmd3 = AI.localIntent('asignar la amoladora a la obra casa pablo');
okk(cmd3 && cmd3.modulo === 'asignar' && cmd3.campos.herramienta === 'Amoladora', 'reubicar herramienta → función asignar con entidad');

console.log('\n──────────────────────────');
if (ko === 0) { console.log('✔ AI NLP ROUTING PASADO (' + ok + ' checks)'); process.exit(0); }
else { console.log('✘ ' + ko + ' fallos de ' + (ok + ko)); process.exit(1); }
