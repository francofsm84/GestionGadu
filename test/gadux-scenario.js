/* ============================================================
   GADUX · Escenario completo de prueba (simulación operativa)
   Simula el ciclo diario de un contratista:
     alta de obra → presupuesto → ingresos → gastos → jornada →
     herramientas → verificación del balance en el Dashboard.
   También valida la sanitización STT y la persistencia local.
   Uso: node test/gadux-scenario.js
   ============================================================ */
'use strict';
global.window = global;
const mem = {};
global.localStorage = {
  getItem: k => (k in mem ? mem[k] : null),
  setItem: (k, v) => { mem[k] = String(v); },
  removeItem: k => { delete mem[k]; },
};
require('../js/store.js');
require('../js/ai.js');
const S = global.GADU.store;
const AI = global.GADU.ai;

function assert(cond, msg) { if (!cond) throw new Error(msg); }

try {
  /* 1) Arranque limpio con colecciones completas */
  S.load();          // inicializa data (evita null en currentSettings)
  S.startReal();     // reemplaza con datos mínimos (montos en 0)

  /* 2) Entidades "gadux" */
  const cliente = S.add('contacts', { type: 'cliente', name: 'Gadux Cliente', company: '', phone: '+54 9 3547 0000', whatsapp: '', email: 'cliente@gadux.com', address: 'Alta Gracia', notes: '', photo: null });
  S.add('contacts', { type: 'socio', name: 'Gadux Socio', company: '', phone: '', whatsapp: '', email: '', address: '', notes: '', percent: 50, active: true, photo: null });
  const obra = S.add('works', { name: 'Gadux - Alta Gracia', code: 'OB-GX1', clientId: cliente.id, location: 'Alta Gracia', status: 'activa', budgetTotal: 100000, advanceFisico: 10, startDate: S.todayISO(), endDate: '', description: 'Refacción integral' });
  S.add('budgets', { code: 'PR-GX1', clientId: cliente.id, workId: obra.id, name: 'Gadux - Refacción', date: S.todayISO(), validUntil: S.daysAhead(30), status: 'aprobado', items: [{ desc: 'Mano de obra', unit: 'global', qty: 1, price: 80000 }, { desc: 'Materiales', unit: 'global', qty: 1, price: 20000 }], discount: 0, subtotal: 100000, total: 100000, notes: '' });
  const emp = S.add('employees', { firstName: 'Gadux', lastName: 'Pérez', phone: '', paymentData: '', hourlyRate: 2500, active: true, notes: '', photo: null });

  /* 3) Movimientos financieros */
  S.add('incomes', { workId: obra.id, clientId: cliente.id, date: S.todayISO(), amount: 50000, concept: 'Anticipo 50%', incomeKind: 'adelanto', method: 'Transferencia', reference: '', notes: '' });
  S.add('incomes', { workId: obra.id, clientId: cliente.id, date: S.todayISO(), amount: 30000, concept: 'Certificación N°1', incomeKind: 'pago', method: 'Efectivo', reference: '', notes: '' });
  S.add('expenses', { type: 'obra', workId: obra.id, date: S.todayISO(), amount: 20000, category: 'Materiales', providerId: null, employeeId: null, expenseKind: null, description: 'Compra de materiales', invoiceNumber: '', paymentMethod: 'Efectivo' });
  S.add('expenses', { type: 'general', workId: null, date: S.todayISO(), amount: 5000, category: 'Combustible', providerId: null, employeeId: null, expenseKind: null, description: 'Nafta', invoiceNumber: '', paymentMethod: 'Efectivo' });

  /* 4) Jornada laboral + herramienta */
  S.add('attendance', { employeeId: emp.id, date: S.todayISO(), status: 'presente', hours: [{ workId: obra.id, hours: 8 }], notes: '' });
  S.add('assets', { name: 'Gadux Hormigonera', category: 'Equipo', purchaseDate: S.todayISO(), cost: 15000, status: 'operativo', supplierId: null, notes: '', maintenance: [] });

  /* 5) Balance del Dashboard: Ingresos - Gastos = Neto */
  const t = S.totals();
  assert(t.incomes === 80000, 'ingresos = 80000, got ' + t.incomes);
  assert(t.direct === 20000, 'gastos directos = 20000, got ' + t.direct);
  assert(t.general === 5000, 'gastos generales = 5000, got ' + t.general);
  assert(t.expenses === 25000, 'gastos totales = 25000, got ' + t.expenses);
  assert(t.net === 55000, 'neto = 55000, got ' + t.net);
  assert(t.grossMargin === 60000, 'margen bruto = 60000, got ' + t.grossMargin);

  /* 6) Persistencia local (save → localStorage) */
  const stored = JSON.parse(mem['gadu_data_v1']);
  assert(stored.works.some(w => w.name === 'Gadux - Alta Gracia'), 'obra gadux persistida');
  assert(stored.attendance.some(a => a.employeeId === emp.id), 'jornada persistida');

  /* 7) Sanitización STT (asistente de voz) */
  assert(AI.removeRepeatedPhrases('cárgame el cárgame el gasto') === 'cárgame el gasto', 'dedup frase (acentos)');
  assert(AI.removeRepeatedPhrases('quiero cargar quiero cargar quiero cargar') === 'quiero cargar', 'dedup triple frase');
  const largo = Array.from({ length: 200 }, (_, i) => 'w' + i).join(' ');
  assert(AI.prepareMessage(largo).length === 400, 'tope 400 chars');

  console.log('✔ GADUX SCENARIO TEST PASADO');
  process.exit(0);
} catch (e) {
  console.error('✘ FALLO:', e.message);
  process.exit(1);
}
