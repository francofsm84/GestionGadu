/* Auditoría interna del chat conversacional (js/ai.js):
   1) Contexto con números reales (saldos de obra, herramientas, reparto)
   2) Ejecución directa sin modales (execFormAction)
   3) Botones inline para pasos guiados (inlineOptionsFor)
   4) Historial multi-paso (rememberTurn → context) */
'use strict';
global.window = global;
const mem = {};
global.localStorage = { getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: k => { delete mem[k]; } };
require('../js/store.js');
const G = global.GADU;
/* Mocks de plan/sync/auth necesarios para el módulo del asistente */
G.plan = {
  profile: { subscription_status: 'trialing' },
  currentPlan: () => ({ nombre: 'Free' }),
  trialDaysLeft: () => 14,
  checkLimit: () => true,
};
G.sync = { push: () => {} };
G.auth = { getSession: () => null };
G.actions = {};   // si el chat abriera un modal, fallaría aquí
require('../js/ai.js');
const S = G.store;
const AI = G.ai;

let ok = 0, ko = 0;
function okk(cond, label) {
  if (cond) { ok++; console.log('  ✔ ' + label); }
  else { ko++; console.log('  ✘ ' + label); }
}

(async () => {

/* ---------- Seed de datos realista ---------- */
S.load();
S.startEmpty();
const cliente = S.add('contacts', { type: 'cliente', name: 'Ángel Cámara', company: '', phone: '', whatsapp: '', email: '', address: '', notes: '', photo: null });
const obra = S.add('works', { name: 'Norma Molina', code: 'OB-1', clientId: cliente.id, location: 'Alta Gracia', status: 'activa', budgetTotal: 100000, advanceFisico: 0, startDate: S.todayISO(), endDate: '', description: '' });
S.add('incomes', { workId: obra.id, clientId: cliente.id, date: S.todayISO(), amount: 40000, concept: 'Anticipo', incomeKind: 'adelanto', method: 'Transferencia', reference: '', notes: '' });
S.add('expenses', { type: 'obra', workId: obra.id, date: S.todayISO(), amount: 15000, category: 'Materiales', providerId: null, employeeId: null, expenseKind: null, description: '', invoiceNumber: '', paymentMethod: 'Efectivo' });
S.add('employees', { firstName: 'Juan', lastName: 'Pérez', phone: '', paymentData: '', hourlyRate: 1500, active: true, notes: '', photo: null });
S.add('assets', { name: 'Amoladora', category: 'Herramienta eléctrica', purchaseDate: S.todayISO(), cost: 12000, status: 'operativo', supplierId: null, notes: 'en obra Norma Molina', maintenance: [] });
S.add('distributions', { id: 'd1', period: 'Enero', date: S.todayISO(), amount: 50000, status: 'pendiente', paidDate: null, method: 'Transferencia', splits: [{ partnerId: 'p1', name: 'Juan', amount: 50000 }], notes: '' });

console.log('== 1) Contexto con números reales (consultas del Dashboard) ==');
const ctx = AI.context();
okk(ctx.includes('Norma Molina (cobrado $40000, gastado $15000, pendiente por cobrar $60000)'), 'saldos de obra con números reales');
okk(ctx.includes('Amoladora (operativo, nota: en obra Norma Molina)'), 'ubicación de herramienta');
okk(ctx.includes('Juan $50000 (Enero)'), 'reparto pendiente del socio');
okk(ctx.includes('Juan Pérez ($1500/hora)'), 'tarifa horaria del empleado');

console.log('== 2) Ejecución directa sin modales (carga conversacional) ==');
const antesGastos = S.data.expenses.length;
const resGasto = await AI.execFormAction({ modulo: 'gasto', campos: { monto: 5000, categoria: 'nafta' } });
okk(resGasto && resGasto.saved === true, 'gasto completo → guarda directo');
okk(S.data.expenses.length === antesGastos + 1 && S.data.expenses.some(e => e.amount === 5000), 'gasto insertado en el store (Dashboard se actualiza)');
const antesEmps = S.data.employees.length;
const resEmp = await AI.execFormAction({ modulo: 'empleado', campos: {} });
okk(resEmp && resEmp.saved === false, 'empleado incompleto → NO guarda, sigue en el chat');
okk(S.data.employees.length === antesEmps, 'sin empleados fantasma (sin modal externo)');

console.log('== 3) Botones inline para pasos guiados ==');
const oficios = AI.inlineOptionsFor('¿Cuál es el oficio del empleado?');
okk(oficios.length === 7 && oficios[0].label === 'Albañil' && oficios[0].send === 'oficio Albañil', 'botones de oficio (7)');
const obras = AI.inlineOptionsFor('¿A qué obra lo asigno?');
okk(obras.length === 1 && obras[0].label === 'Norma Molina' && obras[0].send === 'obra Norma Molina', 'botones de obra (del store)');
const cats = AI.inlineOptionsFor('¿Cuál es la categoría del gasto?');
okk(cats.length >= 12 && cats[0].label === 'Herramientas / Equipamiento' && cats.some(c => c.label === 'Materiales'), 'botones de categoría (reales del store)');
okk(AI.inlineOptionsFor('Hola, ¿cómo estás?').length === 0, 'sin botones para mensaje normal');

console.log('== 4) Historial multi-paso (sin pérdida de contexto) ==');
AI.rememberTurn('usuario', 'cárgame un empleado');
AI.rememberTurn('asistente', '¿Cómo se llama?');
const ctx2 = AI.context();
okk(ctx2.includes('Historial de la conversación: usuario: cárgame un empleado asistente: ¿Cómo se llama?'), 'historial multi-paso viaja en el contexto');
AI.rememberTurn('usuario', 'Juan Pérez');
const ctx3 = AI.context();
okk(ctx3.includes('usuario: Juan Pérez'), 'siguiente paso del diálogo presente');

console.log('\n──────────────────────────');
if (ko === 0) { console.log('✔ AI CONVERSACIONAL AUDIT PASADO (' + ok + ' checks)'); process.exit(0); }
else { console.log('✘ AUDIT: ' + ko + ' fallos de ' + (ok + ko)); process.exit(1); }

})().catch(e => { console.error('✘ FALLO:', e); process.exit(1); });
