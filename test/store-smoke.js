/* Smoke test de la capa de datos (se ejecuta con Node, no en el navegador) */
'use strict';
global.window = global;
const memStore = {};
global.localStorage = {
  getItem: k => (k in memStore ? memStore[k] : null),
  setItem: (k, v) => { memStore[k] = String(v); },
  removeItem: k => { delete memStore[k]; },
};
require('../js/store.js');
const S = global.GADU.store;
S.load();

const t = S.totals();
console.log('== Totales ==');
console.log(JSON.stringify(t));
if (t.incomes <= 0) throw new Error('incomes <= 0');
if (t.direct <= 0) throw new Error('direct <= 0');
if (t.general <= 0) throw new Error('general <= 0');
if (t.net <= 0) throw new Error('utilidad neta debe ser positiva en el seed, got ' + t.net);
if (t.net !== t.incomes - t.direct - t.general) throw new Error('net inconsistente');
console.log('utilidad neta positiva OK:', t.net);

// Coherencia por obra
console.log('== Obras ==');
for (const w of S.data.works) {
  const st = S.workStats(w.id);
  console.log(w.code, '| ingresos', st.incomes, '| costos', st.costs, '| margen', st.margin, '| cobro', Math.round(st.advanceCobro) + '%');
}

// Distribución de gastos
const dist = S.expenseDistribution();
if (S.sum(dist.map(d => d.value)) !== t.expenses) throw new Error('distribución de gastos no suma el total');

// Reparto
const ds = S.distributionSummary();
console.log('== Reparto ==');
console.log('utilidad bruta', ds.gross, '| generales', ds.general, '| neta', ds.net, '| disponible', ds.available, '| pendiente', ds.pending, '| vencidas', ds.overdue.length);
if (Math.abs(ds.available - (ds.net * 0.7)) > 1) throw new Error('disponible no respeta reserva 30%');
if (ds.overdue.length !== 1) throw new Error('debería haber 1 liquidación vencida en el seed');
const splits = S.splitsFor(300000);
if (S.sum(splits.map(s => s.amount)) !== 300000) throw new Error('splits no suman el total');
if (S.sum(S.data.contacts.filter(c => c.type === 'socio').map(c => c.percent)) !== 100) throw new Error('porcentajes de socios no suman 100');

// Serie mensual
const series = S.monthlySeries(8);
if (series.length !== 8) throw new Error('serie mensual debe tener 8 meses');
if (S.sum(series.map(m => m.inc)) !== t.incomes) throw new Error('serie de ingresos no cuadra');
if (S.sum(series.map(m => m.exp)) !== t.expenses) throw new Error('serie de egresos no cuadra');
console.log('Serie 8 meses OK');

// === Empleados, asistencia y pagos ===
console.log('== Empleados ==');
if (S.data.employees.length !== 4) throw new Error('seed empleados');
if (S.data.attendance.length < 10) throw new Error('seed asistencia');
if (S.presentToday().length !== 3) throw new Error('debería haber 3 presentes hoy en el seed');

const es = S.employeeStats('e1');
console.log('e1: cobrado', es.paidTotal, '| sueldos', es.salary, '| adelantos', es.advances, '| días', es.daysWorked, '| horas', es.hoursTotal, '| obras', es.byWorkList.length);
if (es.paidTotal <= 0) throw new Error('e1 sin pagos');
if (es.daysWorked <= 0) throw new Error('e1 sin días trabajados');
if (es.byWorkList.length === 0) throw new Error('e1 sin horas por obra');
if (S.employeeName(S.employeeById('e1')) !== 'Ramón Quiroga') throw new Error('employeeName');

// Adelantos de dinero
const e2adv = S.employeeAdvances('e2');
if (e2adv.total <= 0) throw new Error('e2 sin adelantos en el seed');
const e2st = S.employeeStats('e2');
if (e2st.advances !== e2adv.total) throw new Error('advances de stats no cuadran');
if (e2st.salary + e2st.advances !== e2st.paidTotal) throw new Error('salary+advances != paidTotal');
const e2m = S.employeeMonth('e2');
if (e2m.present <= 0 || e2m.hours <= 0) throw new Error('employeeMonth e2 sin jornadas');
if (e2m.advances <= 0) throw new Error('employeeMonth e2 sin adelantos');
if (S.employeeAdvancesThisMonth() <= 0) throw new Error('adelantos del mes <= 0');
console.log('adelantos OK · e2: total', e2adv.total, '· mes:', e2m.advances, '· sueldos mes:', e2m.salary, '· P/A:', e2m.present + '/' + e2m.absent);

// Personal y adelantos por obra
const w1emps = S.workEmployees('w1');
if (w1emps.length < 2) throw new Error('w1 debería tener al menos 2 empleados con horas');
if (!w1emps.every(x => x.hours > 0 && x.days > 0)) throw new Error('workEmployees sin horas/días');
const w1cli = S.workClientAdvances('w1');
if (w1cli.total <= 0) throw new Error('w1 debería tener anticipo del cliente marcado');
const w1emp = S.workEmployeeAdvances('w1');
if (w1emp.total !== 50000) throw new Error('w1 debería tener 50000 de adelantos a empleados, got ' + w1emp.total);
console.log('obra OK · w1: empleados', w1emps.length, '· adelantos cliente', w1cli.total, '· adelantos empleados', w1emp.total);

// Herramientas: ubicación e historial de uso / rendimiento
const a1 = S.data.assets.find(x => x.id === 'a1');
if (a1.location !== 'w1') throw new Error('seed: a1 debería estar en w1');
const u1 = S.assetUsage(a1);
if (u1.totalDays <= 0 || u1.byWorkList.length === 0) throw new Error('assetUsage sin días en obra');
if (!S.moveAsset('a1', 'w2', 'Prueba de movimiento')) throw new Error('moveAsset falló');
if (S.data.assets.find(x => x.id === 'a1').location !== 'w2') throw new Error('moveAsset no actualizó ubicación');
if (S.moveAsset('a1', 'w2', 'Otra')) throw new Error('moveAsset debería rechazar destino repetido');
const u2 = S.assetUsage(S.data.assets.find(x => x.id === 'a1'));
if (u2.log.length !== u1.log.length + 1) throw new Error('moveAsset no registró en el historial');
if (S.assetUsage(S.data.assets.find(x => x.id === 'a5')).totalDays !== 0) throw new Error('activo guardado no debe sumar días en obra');
console.log('herramientas OK · a1: días en obra', u2.totalDays, '· movimientos', u2.log.length, '· obras con uso', u2.byWorkList.length);

// Fotos: persisten en contactos y empleados (guardado + recarga)
S.add('contacts', { type: 'cliente', name: 'Cliente Foto', phone: '', email: '', photo: 'data:image/jpeg;base64,AAAA' });
const cf = S.data.contacts.find(c => c.name === 'Cliente Foto');
if (!cf || cf.photo !== 'data:image/jpeg;base64,AAAA') throw new Error('foto de contacto no persiste');
S.add('employees', { firstName: 'Foto', lastName: 'Empleado', phone: '', photo: 'data:image/jpeg;base64,BBBB' });
const ef = S.data.employees.find(e => e.firstName === 'Foto');
if (!ef || ef.photo !== 'data:image/jpeg;base64,BBBB') throw new Error('foto de empleado no persiste');
const antes = JSON.stringify(S.data);
S.reload();
if (JSON.stringify(S.data) !== antes) throw new Error('fotos no sobreviven al guardado/carga');
console.log('fotos OK · persisten en contacto y empleado tras guardar/cargar');

// "Cobrado hasta una fecha": con fecha vieja no debe contar pagos recientes
const esOld = S.employeeStats('e1', S.daysAgo(30));
if (esOld.paidTotal !== 0) throw new Error('upTo no filtra pagos, got ' + esOld.paidTotal);
console.log('filtro "hasta fecha" OK (pagos recientes excluidos con fecha vieja)');

if (S.employeesPaidThisMonth() <= 0) throw new Error('empleados pagados este mes');
const tb = S.totalsBetween(null, null);
if (tb.incomes !== t.incomes || tb.net !== t.net || tb.assets !== t.assets) throw new Error('totalsBetween sin rango debe igualar totals');
const tm = S.totalsBetween(S.todayISO().slice(0, 8) + '01', S.todayISO());
if (tm.incomesCount <= 0 || tm.expensesCount <= 0) throw new Error('totalsBetween mes sin movimientos');
console.log('totalsBetween OK · este mes: ingresos', tm.incomes, 'gastos', tm.expenses, 'neto', tm.net);

// Cascade de borrado de empleado
const emp = S.add('employees', { firstName: 'Prueba', lastName: 'Temporal', active: true });
S.add('attendance', { employeeId: emp.id, date: S.todayISO(), status: 'presente', hours: [{ workId: 'w1', hours: 8 }], notes: '' });
S.add('expenses', { type: 'general', date: S.todayISO(), category: 'Sueldos', amount: 1000, providerId: null, employeeId: emp.id, description: 'x', invoiceNumber: '', paymentMethod: 'Efectivo' });
S.removeEmployee(emp.id);
if (S.data.attendance.some(a => a.employeeId === emp.id)) throw new Error('cascade asistencia');
if (S.data.expenses.some(x => x.employeeId === emp.id)) throw new Error('cascade pagos');
console.log('removeEmployee cascade OK');

// Códigos
console.log('nextCode PR:', S.nextCode('PR', 'budgets'), '| nextCode OB:', S.nextCode('OB', 'works'));

// Empezar de cero (datos reales)
S.startReal();
const lens = ['works', 'budgets', 'incomes', 'expenses', 'employees', 'attendance', 'assets', 'distributions'].map(k => S.data[k].length);
if (lens.join(',') !== '1,1,1,1,1,1,1,1') throw new Error('startReal debe dejar 1 por módulo, got ' + lens.join(','));
if (S.data.contacts.length !== 4) throw new Error('startReal debe dejar 4 contactos (cliente/proveedor/subcontratista/socio)');
const tr = S.totals();
if (tr.net !== 0 || tr.incomes !== 0 || tr.expenses !== 0 || tr.assets !== 0) throw new Error('startReal debe dejar montos en 0');
if (S.presentToday().length !== 1) throw new Error('startReal debe dejar 1 jornada de hoy');
S.startEmpty();
if (S.data.works.length !== 0 || S.data.contacts.length !== 0 || S.data.employees.length !== 0) throw new Error('startEmpty debe vaciar todo');
console.log('startReal (1 ejemplo por módulo, montos $0) y startEmpty OK');

console.log('✔ SMOKE TEST PASADO');
