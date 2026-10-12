/* ============================================================
   GADUX · Simulación integral (QA automatizado)
   1) Datos mock "gadux": obra, presupuestos, empleados, socio,
      ingresos y gastos variados.
   2) Simulación STT: interimResults/isFinal + sanitización.
   3) Verificación de módulos: balance del Dashboard y flujo completo.
   Uso: node test/gadux-simulation.js
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
  /* ============ 1) Datos mock "gadux" ============ */
  S.load();
  S.startReal();

  const cliente = S.add('contacts', { type: 'cliente', name: 'Gadux Cliente', company: '', phone: '+54 9 3547 1111', whatsapp: '', email: 'cliente@gadux.com', address: 'Alta Gracia', notes: '', photo: null });
  S.add('contacts', { type: 'socio', name: 'Gabriel Gadux', company: '', phone: '', whatsapp: '', email: '', address: '', notes: '', percent: 50, active: true, photo: null });

  const obra = S.add('works', { name: 'Obra Gadux - Reformas', code: 'OB-GX1', clientId: cliente.id, location: 'Alta Gracia', status: 'activa', budgetTotal: 120000, advanceFisico: 15, startDate: S.todayISO(), endDate: '', description: 'Reformas integrales' });
  S.add('budgets', { code: 'PR-GX1', clientId: cliente.id, workId: obra.id, name: 'Presupuesto Gadux', date: S.todayISO(), validUntil: S.daysAhead(30), status: 'aprobado', items: [{ desc: 'Mano de obra', unit: 'global', qty: 1, price: 80000 }, { desc: 'Materiales', unit: 'global', qty: 1, price: 40000 }], discount: 0, subtotal: 120000, total: 120000, notes: '' });

  const lucho = S.add('employees', { firstName: 'Lucho', lastName: 'Gadux', phone: '', paymentData: '', hourlyRate: 2200, active: true, notes: '', photo: null });
  const gabriel = S.add('employees', { firstName: 'Gabriel', lastName: 'Gadux', phone: '', paymentData: '', hourlyRate: 2500, active: true, notes: '', photo: null });

  // Ingresos
  S.add('incomes', { workId: obra.id, clientId: cliente.id, date: S.todayISO(), amount: 40000, concept: 'Anticipo 40%', incomeKind: 'adelanto', method: 'Transferencia', reference: '', notes: '' });
  S.add('incomes', { workId: obra.id, clientId: cliente.id, date: S.todayISO(), amount: 35000, concept: 'Certificación N°1', incomeKind: 'pago', method: 'Efectivo', reference: '', notes: '' });

  // Gastos: materiales (directo), jornales (directo con empleado), combustible (general)
  S.add('expenses', { type: 'obra', workId: obra.id, date: S.todayISO(), amount: 25000, category: 'Materiales', providerId: null, employeeId: null, expenseKind: null, description: 'Materiales de obra', invoiceNumber: '', paymentMethod: 'Efectivo' });
  S.add('expenses', { type: 'obra', workId: obra.id, date: S.todayISO(), amount: 18000, category: 'Mano de obra', providerId: null, employeeId: lucho.id, expenseKind: 'sueldo', description: 'Jornal Lucho', invoiceNumber: '', paymentMethod: 'Efectivo' });
  S.add('expenses', { type: 'general', workId: null, date: S.todayISO(), amount: 7000, category: 'Combustible', providerId: null, employeeId: null, expenseKind: null, description: 'Nafta camioneta', invoiceNumber: '', paymentMethod: 'Efectivo' });

  // Jornadas + herramienta
  S.add('attendance', { employeeId: lucho.id, date: S.todayISO(), status: 'presente', hours: [{ workId: obra.id, hours: 8 }], notes: '' });
  S.add('attendance', { employeeId: gabriel.id, date: S.todayISO(), status: 'presente', hours: [{ workId: obra.id, hours: 6 }], notes: '' });
  S.add('assets', { name: 'Gadux Amoladora', category: 'Herramienta eléctrica', purchaseDate: S.todayISO(), cost: 12000, status: 'operativo', supplierId: null, notes: '', maintenance: [] });

  /* ============ 2) Verificación de balance (Dashboard) ============ */
  const t = S.totals();
  assert(t.incomes === 75000, 'ingresos = 75000, got ' + t.incomes);
  assert(t.direct === 43000, 'gastos directos = 43000, got ' + t.direct);
  assert(t.general === 7000, 'gastos generales = 7000, got ' + t.general);
  assert(t.expenses === 50000, 'gastos totales = 50000, got ' + t.expenses);
  assert(t.net === 25000, 'neto = Ingresos - Gastos = 25000, got ' + t.net);
  assert(t.grossMargin === 32000, 'margen bruto = 32000, got ' + t.grossMargin);

  // Sin errores de variables nulas al acceder a colecciones
  assert(Array.isArray(S.data.works) && Array.isArray(S.data.incomes) && Array.isArray(S.data.expenses), 'colecciones accesibles sin null');

  /* ============ 3) Simulación STT (interimResults / isFinal) ============ */
  // El interino se SOBRESCRIBE a medida que el usuario habla
  const s1 = AI.buildTranscript([{ isFinal: false, transcript: 'quiero' }]);
  assert(s1.interim === 'quiero' && s1.combined === 'quiero', 'interino inicial');
  const s2 = AI.buildTranscript([{ isFinal: false, transcript: 'quiero cargar' }]);
  assert(s2.interim === 'quiero cargar' && s2.combined === 'quiero cargar', 'interino sobrescrito (sin acumular)');

  // El interino pasa a definitivo y arranca un nuevo interino
  const s3 = AI.buildTranscript([{ isFinal: true, transcript: 'quiero cargar' }]);
  assert(s3.final === 'quiero cargar' && s3.interim === '', 'definitivo confirmado');
  const s4 = AI.buildTranscript([{ isFinal: true, transcript: 'quiero cargar' }, { isFinal: false, transcript: 'un gasto' }]);
  assert(s4.combined === 'quiero cargar un gasto', 'definitivo + interino');

  /* ============ 4) Sanitización (anti-duplicación / saturación) ============ */
  // Simula el "efecto bola de nieve" del motor con duplicados en e.results
  const snow = AI.buildTranscript([{ isFinal: true, transcript: 'cárgame el' }, { isFinal: true, transcript: 'cárgame el' }, { isFinal: true, transcript: 'gasto' }]);
  assert(AI.removeRepeatedPhrases(snow.combined) === 'cárgame el gasto', 'dedup frases duplicadas del motor');

  // Cadenas cortas, largas y con repetición
  assert(AI.cleanInput('hola   mundo') === 'hola mundo', 'cadena corta');
  assert(AI.removeRepeatedPhrases('quiero quiero cargar') === 'quiero cargar', 'palabras repetidas');
  assert(AI.removeRepeatedPhrases('podés hacer podés hacer podés hacer') === 'podés hacer', 'triple frase repetida');
  const larga = Array.from({ length: 300 }, (_, i) => 'w' + i).join(' ');
  assert(AI.prepareMessage(larga).length === 400, 'tope de 400 chars (evita pico de consultas)');

  /* ============ 5) Persistencia ============ */
  const stored = JSON.parse(mem['gadu_data_v1']);
  assert(stored.works.some(w => w.name === 'Obra Gadux - Reformas'), 'obra persistida');
  assert(stored.employees.some(e => e.firstName === 'Lucho'), 'empleado Lucho persistido');
  assert(stored.employees.some(e => e.firstName === 'Gabriel'), 'empleado Gabriel persistido');
  assert(stored.attendance.length >= 2, 'jornadas persistidas');

  console.log('✔ GADUX SIMULATION TEST PASADO');
  process.exit(0);
} catch (e) {
  console.error('✘ FALLO:', e.message);
  process.exit(1);
}
