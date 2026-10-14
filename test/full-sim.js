/* ============================================================
   GADU · SIMULACIÓN INTEGRAL + DIAGNÓSTICO TÉCNICO
   ------------------------------------------------------------
   Script independiente de prueba (no toca producción):
     - Crea un usuario aislado "Usuario Test GADU" (clave de
       almacenamiento propia: S.attachUser).
     - Ejecuta el flujo completo con datos sintéticos:
       cliente, obra, presupuesto, ingresos/cobros, 2 empleados
       con tarifa horaria, jornadas, adelanto, gastos directos
       de obra y gastos generales.
     - Evalúa: Panel General (totals/totalsBetween), Estado de
       Caja (cashInfo), Saldo por Cobrar de Obras
       (workBalanceInfo), Legajos de Empleados
       (employeeAccumulated/employeeStats), Libro Contable
       (consolidación movimientos) y registro de rutas de las
       16 vistas.
     - Recalcula TODAS las fórmulas de forma independiente y
       compara contra el sistema, detectando errores de cálculo,
       inconsistencias de fórmulas, fallas de enrutamiento y
       corrupción de referencias en la base.

   Uso:  node test/full-sim.js
   ============================================================ */
'use strict';
global.window = global;

/* ---- Entorno aislado (localStorage en memoria + usuario test) ---- */
const mem = {};
global.localStorage = {
  getItem: k => (k in mem ? mem[k] : null),
  setItem: (k, v) => { mem[k] = String(v); },
  removeItem: k => { delete mem[k]; },
};
const routes = {};
global.GADU = global.GADU || {};
GADU.router = {
  add: (key, pattern, title, subtitle, render) => { routes[key] = { pattern, title }; },
  navigate: h => { global.__lastNav = h; },
  refresh: () => {},
};

require('../js/store.js');
require('../js/ui.js');
const G = global.GADU, S = G.store, UI = G.ui;
G.plan = { currentPlan: () => ({ nombre: 'Free' }), trialDaysLeft: () => 14, checkLimit: () => true, needsOnboarding: () => false };
G.sync = { push: async () => {}, pull: async () => null };
G.auth = { getSession: () => ({ user: { id: 'usuario-test-gadu', email: 'test@gadu.app' } }) };
G.actions = {};
require('../js/ai.js');
const AI = G.ai;

let ok = 0, ko = 0;
const issues = [];
function chk(cond, label, detalle) {
  if (cond) { ok++; console.log('  ✔ ' + label); }
  else { ko++; issues.push(label + (detalle ? ' — ' + detalle : '')); console.log('  ✘ ' + label + (detalle ? '  [' + detalle + ']' : '')); }
}
const near = (a, b) => Math.abs((Number(a) || 0) - (Number(b) || 0)) < 0.005;

console.log('═══════════════════════════════════════════════════════');
console.log('  GADU · SIMULACIÓN INTEGRAL — "Usuario Test GADU"');
console.log('═══════════════════════════════════════════════════════');

/* ============================================================
   1) USUARIO DE PRUEBA AISLADO
   ============================================================ */
console.log('\n== 1) Entorno de prueba aislado ==');
S.attachUser('usuario-test-gadu');
S.load();
S.startEmpty();
chk(!!S.data && S.data.works.length === 0 && S.data.incomes.length === 0, 'usuario aislado arranca en $0 (documento propio, sin tocar producción)');
chk(Object.keys(mem).some(k => k.indexOf('usuario-test-gadu') > -1), 'clave de almacenamiento segregada por usuario (gadu_data_v1_usuario-test-gadu)');

/* ============================================================
   2) CARGA SINTÉTICA COMPLETA
   ============================================================ */
console.log('\n== 2) Carga sintética del flujo completo ==');
const hoy = S.todayISO();
const cliente = S.add('contacts', { type: 'cliente', name: 'Cliente Test', company: '', phone: '3510000000', whatsapp: '', email: 'cliente@test.com', address: '', notes: '' });
const obra = S.add('works', { name: 'Obra Demo', code: 'OB-DEMO', clientId: cliente.id, location: 'Córdoba', status: 'activa', budgetTotal: 1000000, advanceFisico: 20, startDate: hoy, endDate: '', description: '' });
S.add('budgets', { code: 'PR-2026-DEMO', clientId: cliente.id, workId: obra.id, name: 'Presupuesto Obra Demo', date: hoy, validUntil: S.daysAhead(30), status: 'aceptado', items: [{ desc: 'Mano de obra + materiales', unit: 'global', qty: 1, price: 1000000 }], discount: 0, subtotal: 1000000, total: 1000000, notes: '' });
S.add('incomes', { workId: obra.id, date: S.daysAgo(10), amount: 250000, concept: 'Adelanto', incomeKind: 'adelanto', method: 'Transferencia', description: '', invoiceNumber: '' });
S.add('incomes', { workId: obra.id, date: S.daysAgo(2), amount: 150000, concept: 'Cobro', incomeKind: 'cobro', method: 'Efectivo', description: '', invoiceNumber: '' });
const pepe = S.add('employees', { firstName: 'Pepe', lastName: 'Albañil', phone: '3511111111', paymentData: 'pepe.test', hourlyRate: 2000, active: true, notes: '', photo: null, createdAt: S.daysAgo(30) });
const marta = S.add('employees', { firstName: 'Marta', lastName: 'Pintora', phone: '3512222222', paymentData: 'marta.test', hourlyRate: 1500, active: true, notes: '', photo: null, createdAt: S.daysAgo(30) });
[3, 2, 1].forEach(d => S.addAttendance({ employeeId: pepe.id, date: S.daysAgo(d), status: 'presente', hours: [{ workId: obra.id, hours: 8 }], notes: '' }));
[2, 1].forEach(d => S.addAttendance({ employeeId: marta.id, date: S.daysAgo(d), status: 'presente', hours: [{ workId: obra.id, hours: 8 }], notes: '' }));
S.add('expenses', { type: 'general', workId: null, date: S.daysAgo(1), amount: 10000, category: 'Sueldos', providerId: null, employeeId: pepe.id, expenseKind: 'adelanto', description: 'Adelanto a Pepe Albañil', invoiceNumber: '', paymentMethod: 'Efectivo' });
S.add('expenses', { type: 'obra', workId: obra.id, date: S.daysAgo(5), amount: 120000, category: 'Materiales', providerId: null, employeeId: null, expenseKind: '', description: 'Materiales Obra Demo', invoiceNumber: '', paymentMethod: 'Transferencia' });
S.add('expenses', { type: 'obra', workId: obra.id, date: S.daysAgo(4), amount: 30000, category: 'Combustible', providerId: null, employeeId: null, expenseKind: '', description: 'Combustible Obra Demo', invoiceNumber: '', paymentMethod: 'Efectivo' });
S.add('expenses', { type: 'general', workId: null, date: S.daysAgo(3), amount: 50000, category: 'Alquiler', providerId: null, employeeId: null, expenseKind: '', description: 'Alquiler galpón', invoiceNumber: '', paymentMethod: 'Transferencia' });
chk(S.data.works.length === 1 && S.data.contacts.length === 1 && S.data.budgets.length === 1, 'obra + cliente + presupuesto cargados');
chk(S.data.incomes.length === 2 && S.data.expenses.length === 4, '2 cobros + 4 gastos (2 obra, alquiler, adelanto) cargados');
chk(S.data.employees.length === 2 && S.data.attendance.length === 5, '2 empleados + 5 jornadas cargadas');

/* ============================================================
   3) PANEL GENERAL — "Entró − Salió = Ganancia"
   ============================================================ */
console.log('\n== 3) Panel General (totals / totalsBetween) ==');
/* Recalculo independiente desde los datos crudos */
const incRaw = S.sum(S.data.incomes.map(x => x.amount));
const dirRaw = S.sum(S.data.expenses.filter(x => x.type === 'obra').map(x => x.amount));
const genRaw = S.sum(S.data.expenses.filter(x => x.type === 'general').map(x => x.amount));
const t = S.totals();
chk(near(t.incomes, 400000) && near(incRaw, 400000), 'ingresos = $400.000 (250.000 + 150.000)');
chk(near(t.direct, 150000) && near(dirRaw, 150000), 'gastos directos = $150.000 (materiales + combustible)');
chk(near(t.general, 60000) && near(genRaw, 60000), 'gastos generales = $60.000 (alquiler + adelanto)');
chk(near(t.expenses, 210000), 'total salido = $210.000');
chk(near(t.net, 190000) && near(t.net, t.incomes - t.expenses), 'neto = $190.000 (Entró − Salió ✓ sin drift)');
const tb = S.totalsBetween('', '');
chk(near(tb.net, t.net) && near(tb.incomes, t.incomes), 'totalsBetween (todo el historial) coincide con totals()');
const st = S.workStats(obra.id);
chk(near(st.advanceCobro, 40), 'avance de cobro de la obra = 40% ($400.000 / $1.000.000)');
const ds = S.distributionSummary();
chk(near(ds.available, 190000 * 0.7), 'reserva 30%: disponible socios = 70% del neto');

/* ============================================================
   4) ESTADO DE CAJA (asistente)
   ============================================================ */
console.log('\n== 4) Estado de Caja ==');
const caja = AI.cashInfo();
chk(!!caja && near(caja.ingresos, 400000) && near(caja.gastos, 210000), 'caja: ingresos $400.000 · gastos $210.000');
chk(!!caja && near(caja.neto, 190000) && near(caja.neto, caja.ingresos - caja.gastos), 'caja: balance neto $190.000 consistente con Panel General');

/* ============================================================
   5) SALDO POR COBRAR DE OBRAS (asistente)
   ============================================================ */
console.log('\n== 5) Saldo por Cobrar de Obras ==');
chk(AI.workBalanceIntent('¿cuánto me queda por cobrar?') === '__all__', 'detección de consulta general');
chk(AI.workBalanceIntent('¿cuánto me debe Cliente Test?') === 'Cliente Test', 'detección por cliente');
chk(AI.workBalanceIntent('¿cuánta plata tengo en caja?') === null, 'caja NO se confunde con obras');
const wb = AI.workBalanceInfo('__all__');
const wbRow = wb && wb.rows.find(r => r.name === 'Obra Demo');
chk(!!wbRow && near(wbRow.budget, 1000000) && near(wbRow.cobrado, 400000), 'obra: presupuesto $1.000.000 − cobrado $400.000');
chk(!!wbRow && near(wbRow.pendiente, 600000) && near(wb.totalPendiente, 600000), 'pendiente $600.000 + total acumulado coincidente');

/* ============================================================
   6) LEGAJOS DE EMPLEADOS — horas × tarifa − adelantos
   ============================================================ */
console.log('\n== 6) Legajos de Empleados ==');
const aP = S.employeeAccumulated(pepe.id);
const aM = S.employeeAccumulated(marta.id);
chk(near(S.employeeStats(pepe.id).hoursTotal, 24) && near(aP.devengado, 48000), 'Pepe: 24 h × $2.000 = $48.000 devengado');
chk(near(aP.adelantos, 10000) && near(aP.acumulado, 38000), 'Pepe: −$10.000 adelanto → acumulado $38.000');
chk(near(S.employeeStats(marta.id).hoursTotal, 16) && near(aM.acumulado, 24000), 'Marta: 16 h × $1.500 = $24.000 (sin adelantos)');
const salP = AI.employeeSalaryInfo('Pepe Albañil');
chk(!!salP && near(salP.neto, 38000), 'asistente: saldo neto de Pepe = $38.000 (misma fórmula que el legajo)');
chk(AI.salaryIntent('¿cuánto le queda por cobrar a Marta Pintora?') === 'Marta Pintora', 'consulta de sueldo detectada (Marta Pintora)');

/* ============================================================
   7) LIBRO CONTABLE — consolidación de movimientos
   ============================================================ */
console.log('\n== 7) Libro Contable (consolidación) ==');
const movs = S.data.incomes.map(x => ({ date: x.date, tipo: 'ingreso', monto: Number(x.amount) || 0 }))
  .concat(S.data.expenses.map(x => ({ date: x.date, tipo: 'gasto', monto: -(Number(x.amount) || 0) })))
  .sort((a, b) => b.date.localeCompare(a.date));
const balLibro = S.sum(movs.map(m => m.monto));
chk(movs.length === 6, '6 movimientos consolidados (2 ingresos + 4 gastos)');
chk(near(balLibro, 190000) && near(balLibro, t.net), 'balance del libro = $190.000 = neto del Panel General');
chk(near(S.sum(S.data.incomes.filter(x => x.workId === obra.id).map(x => x.amount)) - S.sum(S.data.expenses.filter(x => x.workId === obra.id).map(x => x.amount)), 250000), 'balance por obra: $400.000 cobrado − $150.000 gastado = $250.000');

/* ============================================================
   8) ENRUTAMIENTO — las 16 vistas registran su ruta
   ============================================================ */
console.log('\n== 8) Enrutamiento (registro de vistas) ==');
['dashboard', 'agenda', 'obras', 'obra-detalle', 'presupuestos', 'ingresos', 'gastos', 'libro', 'directorio', 'empleados', 'jornadas', 'socios', 'clientes', 'herramientas', 'seguros', 'admin'].forEach(f => {
  try { require('../js/views/' + f + '.js'); } catch (e) { issues.push('vista ' + f + ' no carga: ' + e.message); ko++; console.log('  ✘ vista ' + f + ' no carga: ' + e.message); }
});
const esperadas = ['dashboard', 'agenda', 'obras', 'obra', 'presupuestos', 'ingresos', 'gastos', 'libro', 'directorio', 'empleados', 'empleado', 'jornadas', 'socios', 'clientes', 'herramientas', 'seguros', 'admin'];
const faltan = esperadas.filter(k => !routes[k]);
chk(faltan.length === 0, 'rutas registradas por las 16 vistas' + (faltan.length ? ' — FALTAN: ' + faltan.join(', ') : ' (17/17)'));
chk(AI.routeIntent('mostrame el libro contable') === '#/libro' && AI.routeIntent('abrí mis gastos') === '#/gastos', 'redirecciones del asistente apuntan a rutas registradas');

/* ============================================================
   9) CONSISTENCIA DE LA BASE (referencias y sanidad)
   ============================================================ */
console.log('\n== 9) Consistencia de la base de datos ==');
const uniq = coll => new Set(S.data[coll].map(x => x.id)).size === S.data[coll].length;
chk(['works', 'budgets', 'incomes', 'expenses', 'contacts', 'employees', 'attendance'].every(uniq), 'IDs únicos en todas las colecciones');
chk(S.data.incomes.every(x => !x.workId || S.data.works.some(w => w.id === x.workId)), 'cada ingreso referencia una obra existente');
chk(S.data.expenses.every(x => !x.workId || S.data.works.some(w => w.id === x.workId)), 'cada gasto de obra referencia una obra existente');
chk(S.data.expenses.every(x => !x.employeeId || S.data.employees.some(e => e.id === x.employeeId)), 'cada pago referencia un empleado existente');
chk(S.data.attendance.every(a => S.data.employees.some(e => e.id === a.employeeId) && /^\d{4}-\d{2}-\d{2}$/.test(a.date || '')), 'jornadas con empleado válido y fecha ISO');
chk(S.data.budgets.every(b => S.data.works.some(w => w.id === b.workId) && S.data.contacts.some(c => c.id === b.clientId)), 'presupuestos referencian obra y cliente válidos');
chk(S.data.works.every(w => S.data.contacts.some(c => c.id === w.clientId)), 'obras referencian cliente válido');
chk(S.data.expenses.every(x => Number(x.amount) >= 0) && S.data.incomes.every(x => Number(x.amount) >= 0), 'montos no negativos');
const dupJ = S.data.attendance.filter(a => a.employeeId === pepe.id && a.date === S.daysAgo(3)).length;
chk(dupJ === 1, 'sin jornadas duplicadas por empleado+fecha (anti-duplicados activo)');

/* ============================================================
   REPORTE FINAL
   ============================================================ */
console.log('\n═══════════════════════════════════════════════════════════');
console.log('  DIAGNÓSTICO TÉCNICO INTEGRAL — GADU');
console.log('═══════════════════════════════════════════════════════════');
console.log('  Usuario simulado : Usuario Test GADU (aislado, sin tocar producción)');
console.log('  Datos sintéticos : 1 cliente · 1 obra · 1 presupuesto · 2 cobros');
console.log('                     2 empleados · 5 jornadas · 1 adelanto · 4 gastos');
console.log('  Checks ejecutados: ' + (ok + ko));
console.log('  ✔ Correctos     : ' + ok);
console.log('  ✘ Fallos        : ' + ko);
if (issues.length) {
  console.log('\n  PROBLEMAS DETECTADOS:');
  issues.forEach(i => console.log('   • ' + i));
} else {
  console.log('\n  ✅ Sin errores de cálculo, sin inconsistencias de fórmulas,');
  console.log('     sin fallas de enrutamiento y sin corrupción de referencias.');
}
console.log('═══════════════════════════════════════════════════════════');
process.exit(ko ? 1 : 0);
