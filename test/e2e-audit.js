/* ============================================================
   GADU · AUDITORÍA E2E — Usuario "jacinto 33"
   Simula alta de usuario, carga de datos en TODOS los módulos
   y prueba las consultas analíticas del bot (replicando la
   lógica de core.ts detectQueryIntent/computeQuery).
   NO toca producción: almacenamiento en memoria aislado.
   ============================================================ */
'use strict';
global.window = global;
const mem = {};
global.localStorage = {
  getItem: k => (k in mem ? mem[k] : null),
  setItem: (k, v) => { mem[k] = String(v); },
  removeItem: k => { delete mem[k]; },
};
global.GADU = global.GADU || {};
GADU.router = { add: () => {}, navigate: () => {}, refresh: () => {} };

require('../js/store.js');
require('../js/ui.js');
const G = global.GADU, S = G.store, UI = G.ui;

let ok = 0, ko = 0, issues = [];
const chk = (cond, label, d) => {
  if (cond) { ok++; console.log('  ✔ ' + label); }
  else { ko++; issues.push(label + (d ? ' — ' + d : '')); console.log('  ✘ ' + label + (d ? '  [' + d + ']' : '')); }
};
const sum = arr => (arr || []).reduce((a, b) => a + (Number(b) || 0), 0);
const fmt = n => '$' + (Number(n) || 0).toLocaleString('es-AR');
const flat = s => String(s == null ? '' : s).toLowerCase().normalize('NFD').split('').filter(c => { const n = c.charCodeAt(0); return n < 768 || n > 879; }).join('');

/* ---- Replicación de la lógica de core.ts (para auditarla en Node) ---- */
function normWork(s) {
  return flat(s).replace(/[^a-z0-9\s]/g, ' ').replace(/\b(?:de|del|la|el|los|las|en|a|con|y|e|al|un|una|casa|obra|obras|proyecto|proyectos|the|of|para|por|mi|mis)\b/g, ' ').replace(/\s+/g, ' ').trim();
}
function detectQueryIntent(text) {
  const f = flat(text).trim();
  if (!f) return null;
  if (/(cu[aá]nto|cuanto).*(pagar|sueldos?|jornales|adelantos?|liquidar|deveng)/.test(f) || /(sueldos?|jornales|salarios?|pagar).*(semana|mes|esta)/.test(f)) return { type: 'sueldos', target: '', periodo: /mes/.test(f) ? 'mes' : 'semana' };
  if (/(balance|estado|margen|resumen|saldo|financiero)/.test(f) && /(general|todas|todos|global|completo|cartera|empresa)/.test(f)) return { type: 'balance_general', target: '', periodo: 'mes' };
  if (/(balance|estado|margen|resumen|saldo|financiero)/.test(f) && /(obra|proyecto|casa|de|del|la|el)/.test(f)) {
    const target = f.replace(/^.*?(?:balance|estado|margen|resumen|saldo|financiero)/, '').replace(/\b(?:de|del|la|el|los|las|obra|proyecto)\b/g, ' ').replace(/\s+/g, ' ').trim();
    return { type: 'balance', target, periodo: 'mes' };
  }
  if (/(gast[eé]|gastos|egresos)/.test(f) && /(semana|mes|hoy|esta)/.test(f)) return { type: 'gastos', target: '', periodo: /mes/.test(f) ? 'mes' : 'semana' };
  if (/(ingresos?|cobr[eé]|cobros|recaud)/.test(f) && /(semana|mes|hoy|esta)/.test(f)) return { type: 'ingresos', target: '', periodo: /mes/.test(f) ? 'mes' : 'semana' };
  return null;
}
function computeQuery(d, q) {
  const works = d.works || [], employees = d.employees || [], attendance = d.attendance || [], expenses = d.expenses || [], incomes = d.incomes || [];
  const hoy = new Date().toISOString().slice(0, 10);
  const desdeSemana = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const desdeMes = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  if (q.type === 'sueldos') {
    const desde = q.periodo === 'mes' ? desdeMes : desdeSemana;
    const att = attendance.filter(a => (a.date || '') >= desde && a.status === 'presente');
    let total = 0;
    employees.forEach(e => {
      const a = att.filter(x => x.employeeId === e.id);
      const horas = sum(a.flatMap(x => x.hours || []).map(h => h.hours));
      total += horas * (Number(e.hourlyRate) || 0);
    });
    return { ok: true, tipo: 'sueldos', monto: total, detalle: employees.length + ' empleados' };
  }
  if (q.type === 'balance') {
    const tn = normWork(q.target);
    const w = works.find(x => { const n = normWork(x.name || x.nombre || ''); return !!n && (n.includes(tn) || tn.includes(n)); });
    if (!w) return { ok: false, tipo: 'balance', error: 'obra no encontrada' };
    const ing = sum(incomes.filter(i => i.workId === w.id).map(i => i.amount));
    const cos = sum(expenses.filter(x => x.workId === w.id).map(x => x.amount));
    return { ok: true, tipo: 'balance', nombre: w.name, ingresos: ing, costos: cos, margen: ing - cos };
  }
  if (q.type === 'balance_general') {
    const ing = sum(incomes.map(i => i.amount));
    const cos = sum(expenses.map(e => e.amount));
    return { ok: true, tipo: 'balance_general', ingresos: ing, costos: cos, margen: ing - cos, obras: works.length };
  }
  if (q.type === 'gastos') {
    const desde = q.periodo === 'mes' ? desdeMes : desdeSemana;
    return { ok: true, tipo: 'gastos', monto: sum(expenses.filter(x => (x.date || '') >= desde).map(x => x.amount)) };
  }
  if (q.type === 'ingresos') {
    const desde = q.periodo === 'mes' ? desdeMes : desdeSemana;
    return { ok: true, tipo: 'ingresos', monto: sum(incomes.filter(i => (i.date || '') >= desde).map(i => i.amount)) };
  }
  return { ok: false, error: 'sin tipo' };
}

console.log('═══════════════════════════════════════════════════════');
console.log('  GADU · AUDITORÍA E2E — Usuario "jacinto 33"');
console.log('═══════════════════════════════════════════════════════');

/* 1) Alta de usuario aislado */
console.log('\n== 1) Alta de usuario de prueba ==');
S.attachUser('jacinto-33');
S.load(); S.startEmpty();
chk(!!S.data && S.data.works.length === 0, 'usuario "jacinto 33" arranca en $0 (documento aislado)');
chk(Object.keys(mem).some(k => k.indexOf('jacinto-33') > -1), 'clave de almacenamiento segregada (gadu_data_v1_jacinto-33)');

/* 2) Carga de datos en todos los módulos */
console.log('\n== 2) Carga de datos de ejemplo ==');
const hoy = S.todayISO();
const cliente = S.add('contacts', { type: 'cliente', name: 'Cliente Jacinto', phone: '3513333333', email: '' });
const obra = S.add('works', { name: 'Casa Ángel Cámara', code: 'OB-JAC', clientId: cliente.id, location: 'Alta Gracia', status: 'activa', budgetTotal: 1000000, advanceFisico: 20, startDate: hoy, endDate: '', description: '' });
S.add('budgets', { code: 'PR-JAC', clientId: cliente.id, workId: obra.id, name: 'Presupuesto Casa Ángel', date: hoy, validUntil: S.daysAhead(30), status: 'aceptado', items: [{ desc: 'Mano de obra', unit: 'global', qty: 1, price: 1000000 }], discount: 0, subtotal: 1000000, total: 1000000, notes: '' });
S.add('incomes', { workId: obra.id, date: S.daysAgo(10), amount: 250000, concept: 'Adelanto', incomeKind: 'adelanto', method: 'Transferencia' });
S.add('incomes', { workId: obra.id, date: S.daysAgo(2), amount: 150000, concept: 'Cobro', incomeKind: 'cobro', method: 'Efectivo' });
const emp = S.add('employees', { firstName: 'Pichas', lastName: 'Rodríguez', phone: '3514444444', hourlyRate: 2000, active: true, notes: 'Oficio: albañil' });
S.addAttendance({ employeeId: emp.id, date: S.daysAgo(1), status: 'presente', hours: [{ workId: obra.id, hours: 8 }], notes: '' });
S.add('expenses', { type: 'obra', workId: obra.id, date: S.daysAgo(5), amount: 120000, category: 'Materiales', providerId: null, employeeId: null, expenseKind: '', description: 'Materiales', invoiceNumber: '', paymentMethod: 'Transferencia' });
S.add('expenses', { type: 'general', workId: null, date: S.daysAgo(1), amount: 50000, category: 'Alquiler', providerId: null, employeeId: null, expenseKind: '', description: 'Alquiler galpón', invoiceNumber: '', paymentMethod: 'Transferencia' });
S.add('expenses', { type: 'general', workId: null, date: S.daysAgo(1), amount: 20000, category: 'Sueldos', employeeId: emp.id, expenseKind: 'adelanto', description: 'Adelanto a Pichas', invoiceNumber: '', paymentMethod: 'Efectivo' });
S.add('assets', { name: 'Amoladora angular', category: 'Herramienta eléctrica', purchaseDate: S.daysAgo(20), cost: 50000, status: 'operativo', location: obra.id, notes: '', maintenance: [] });
S.add('compromisos', { fecha: S.daysAhead(2), hora: '09:00', tipo: 'visita', titulo: 'Visita de obra Casa Ángel', lugar: '', estado: 'pendiente' });

chk(S.data.works.length === 1 && S.data.contacts.length === 1, 'obra + cliente cargados');
chk(S.data.budgets.length === 1 && S.data.incomes.length === 2, 'presupuesto + 2 cobros cargados');
chk(S.data.employees.length === 1 && S.data.attendance.length === 1, 'empleado + jornada cargados');
chk(S.data.expenses.length === 3, '3 gastos (materiales + alquiler + adelanto) cargados');
chk(S.data.assets.length === 1 && S.data.compromisos.length === 1, 'herramienta asignada + compromiso cargados');

/* 3) Consultas analíticas del bot */
console.log('\n== 3) Consultas analíticas (bot WhatsApp) ==');
let r;

r = detectQueryIntent('¿Cuánto tengo que pagar esta semana en empleados?');
chk(r && r.type === 'sueldos' && r.periodo === 'semana', 'detección "cuánto pago esta semana" → sueldos/semana', JSON.stringify(r));
if (r) { const c = computeQuery(S.data, r); chk(c.ok && c.monto > 0, 'cálculo sueldos → ' + fmt(c.monto), JSON.stringify(c)); }

r = detectQueryIntent('balance de la casa de ángel cámara');
chk(r && r.type === 'balance', 'detección "balance de la casa de ángel cámara" → balance', JSON.stringify(r));
if (r) { const c = computeQuery(S.data, r); chk(c.ok && c.nombre === 'Casa Ángel Cámara', 'fuzzy match → "Casa Ángel Cámara" (normalización flexible)', JSON.stringify(c)); chk(c.ok && c.margen === c.ingresos - c.costos, 'margen calculado correctamente: ' + fmt(c.margen)); }

r = detectQueryIntent('balance general de todas las obras');
chk(r && r.type === 'balance_general', 'detección "balance general de todas las obras" → balance_general', JSON.stringify(r));
if (r) { const c = computeQuery(S.data, r); chk(c.ok && c.obras === 1 && c.margen === c.ingresos - c.costos, 'balance general → ' + fmt(c.margen) + ' neto', JSON.stringify(c)); }

r = detectQueryIntent('gastos de la semana');
chk(r && r.type === 'gastos' && r.periodo === 'semana', 'detección "gastos de la semana" → gastos/semana', JSON.stringify(r));
if (r) { const c = computeQuery(S.data, r); chk(c.ok && c.monto > 0, 'cálculo gastos semana → ' + fmt(c.monto), JSON.stringify(c)); }

r = detectQueryIntent('balance de la obra inexistente');
chk(r && r.type === 'balance', 'detección "balance de la obra inexistente" → balance', JSON.stringify(r));
if (r) { const c = computeQuery(S.data, r); chk(c.ok === false, 'fallback amigable: obra inexistente no revienta', JSON.stringify(c)); }

/* 4) Consistencia contable */
console.log('\n== 4) Consistencia de fórmulas ==');
const t = S.totals();
chk(t.expenses === sum(S.data.expenses.map(x => x.amount)), 'totals.expenses coincide con la suma de gastos');
chk(t.incomes === sum(S.data.incomes.map(x => x.amount)), 'totals.incomes coincide con la suma de ingresos');
chk(t.net === t.incomes - t.expenses, 'balance neto = ingresos − gastos');

console.log('\n─────────────────────────────────────────');
console.log((ko ? '✘ AUDITORÍA CON FALLOS' : '✅ AUDITORÍA E2E PASADA') + '  (' + ok + ' checks OK · ' + ko + ' fallos)');
console.log('─────────────────────────────────────────');
if (issues.length) { console.log('Fallos:\n  - ' + issues.join('\n  - ')); }
process.exit(ko ? 1 : 0);
