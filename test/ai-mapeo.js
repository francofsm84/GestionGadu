/* Auditoría: mapeo de categorías reales + Herramientas/Equipamiento + búsqueda completa */
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
const obra = S.add('works', { name: 'Obra Uno', code: 'OB-1', clientId: null, location: '', status: 'activa', budgetTotal: 0, advanceFisico: 0, startDate: S.todayISO(), endDate: '', description: '' });
S.add('incomes', { workId: obra.id, clientId: null, date: S.todayISO(), amount: 40000, concept: 'Certificacion N1', method: 'Transferencia', reference: '', notes: '', incomeKind: 'pago' });
S.add('expenses', { type: 'obra', workId: obra.id, date: S.todayISO(), amount: 8000, category: 'Materiales', providerId: null, employeeId: null, expenseKind: null, description: 'Compra de hierros', invoiceNumber: '', paymentMethod: 'Efectivo' });
S.add('budgets', { code: 'PR-1', clientId: null, workId: obra.id, name: 'Presupuesto Cocina', date: S.todayISO(), validUntil: '', status: 'aprobado', items: [], discount: 0, subtotal: 90000, total: 90000, notes: '' });
if (!S.data.seguros) S.data.seguros = [];   // startEmpty no crea la colección seguros
S.add('seguros', { id: 'sg1', tipo: 'ART', compania: 'La Segunda', numeroPoliza: '123', costo: 5000, fechaVencimiento: S.todayISO(), estado: 'activo', obraId: null, createdAt: S.todayISO(), updatedAt: S.todayISO() });

console.log('== 1) Herramientas / Equipamiento en gastos ==');
const g1 = AI.localIntent('gasto de 5000 en herramientas');
okk(g1 && g1.modulo === 'gasto' && g1.campos.categoria === 'Herramientas / Equipamiento', 'gasto en herramientas → categoría correcta');
const g2 = AI.localIntent('gasto de 8000 en mantenimiento');
okk(g2 && g2.campos.categoria === 'Mantenimiento de herramientas', 'mantenimiento → categoría del store');
const g3 = AI.localIntent('gasto de 3000 en flete');
okk(g3 && g3.campos.categoria === 'Fletes', 'flete → "Fletes" (canónica del store)');

console.log('== 2) Compra de herramientas → flujo de inversión ==');
const c1 = AI.localIntent('comprar una amoladora de 12000');
okk(c1 && c1.modulo === 'herramienta' && c1.campos.costo === 12000, 'compra de amoladora → herramienta con costo');
const c2 = AI.localIntent('invertir en un equipo de 80000');
okk(c2 && c2.modulo === 'herramienta' && c2.campos.costo === 80000, 'inversión en equipo → herramienta');

console.log('== 3) Búsqueda completa (todas las colecciones) ==');
const b1 = AI.searchStore('certificacion');
okk(b1.some(r => r.tipo === 'Ingreso' && r.key === 'ingresos'), 'busca ingresos');
const b2 = AI.searchStore('hierros');
okk(b2.some(r => r.tipo === 'Gasto' && r.key === 'gastos'), 'busca gastos');
const b3 = AI.searchStore('cocina');
okk(b3.some(r => r.tipo === 'Presupuesto' && r.key === 'presupuestos'), 'busca presupuestos');
const b4 = AI.searchStore('la segunda');
okk(b4.some(r => r.tipo === 'Seguro' && r.key === 'seguros'), 'busca seguros');

console.log('== 4) Categorías del wizard provienen del store ==');
const pasos = AI.WIZARD_STEPS.gasto;
okk(pasos.some(s => s.key === 'categoria' && s.catsList === true), 'paso de categoría usa catsList (dinámico)');
const catsStore = (S.CATS_OBRA || []).concat(S.CATS_GENERAL || []);
okk(catsStore.includes('Materiales') && catsStore.includes('Mantenimiento de herramientas') && catsStore.includes('Alquiler de equipos'), 'store expone todas las categorías reales');

console.log('\n──────────────────────────');
if (ko === 0) { console.log('✔ AI MAPEO AUDIT PASADO (' + ok + ' checks)'); process.exit(0); }
else { console.log('✘ AUDIT: ' + ko + ' fallos de ' + (ok + ko)); process.exit(1); }
