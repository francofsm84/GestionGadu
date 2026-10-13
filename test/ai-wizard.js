/* Auditoría: flujo guiado universal (wizard) + nuevos módulos presupuesto/herramienta */
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

(async () => {

S.load();
S.startEmpty();
const obra = S.add('works', { name: 'Norma Molina', code: 'OB-1', clientId: null, location: '', status: 'activa', budgetTotal: 0, advanceFisico: 0, startDate: S.todayISO(), endDate: '', description: '' });

console.log('== 1) Cobertura universal de pasos guiados ==');
['empleado', 'cliente', 'socio', 'obra', 'gasto', 'ingreso', 'presupuesto', 'herramienta', 'jornada'].forEach(m => {
  okk(!!AI.WIZARD_STEPS[m] && AI.WIZARD_STEPS[m].length > 0, 'wizard de ' + m);
});
const sinOpcional = ['empleado', 'cliente', 'socio', 'obra', 'gasto', 'ingreso', 'presupuesto', 'herramienta', 'jornada'].every(m =>
  AI.WIZARD_STEPS[m].every(s => !s.optional)
);
okk(sinOpcional, 'ningún paso es opcional (sin "Saltear")');

console.log('== 2) Detección de intención (localIntent) ==');
okk(JSON.stringify(AI.localIntent('cargar herramienta amoladora')) === JSON.stringify({ modulo: 'herramienta', campos: { nombre: 'amoladora' } }), 'detecta herramienta');
okk(JSON.stringify(AI.localIntent('nuevo presupuesto reforma cocina')) === JSON.stringify({ modulo: 'presupuesto', campos: { nombre: 'reforma cocina' } }), 'detecta presupuesto');
okk(JSON.stringify(AI.localIntent('cargar un gasto')) === JSON.stringify({ modulo: 'gasto', campos: {} }), 'gasto sin monto → guiado');

console.log('== 3) Completitud mínima por módulo (validación estricta) ==');
okk(AI.isCompleteWizard('empleado', { nombre: 'Jorge' }) === false, 'empleado sin teléfono/oficio → incompleto');
okk(AI.isCompleteWizard('empleado', { nombre: 'Jorge', telefono: '123', oficio: 'Albañil' }) === true, 'empleado completo (nombre + teléfono + oficio) → listo');
okk(AI.isCompleteWizard('cliente', { nombre: 'X' }) === false, 'cliente sin teléfono → incompleto');
okk(AI.isCompleteWizard('socio', { nombre: 'X', telefono: '123' }) === false, 'socio sin porcentaje → incompleto');
okk(AI.isCompleteWizard('gasto', {}) === false, 'gasto vacío → incompleto');
okk(AI.isCompleteWizard('gasto', { monto: 5000 }) === false, 'gasto SOLO con monto → incompleto (falta categoría y obra)');
okk(AI.isCompleteWizard('gasto', { monto: 5000, categoria: 'Materiales', obra: 'X' }) === true, 'gasto completo → listo');
okk(AI.isCompleteWizard('ingreso', { monto: 10000 }) === false, 'ingreso sin obra → incompleto');
okk(AI.isCompleteWizard('obra', { nombre: 'X' }) === true, 'obra con nombre → completo');
okk(AI.isCompleteWizard('presupuesto', { nombre: 'X' }) === false, 'presupuesto sin obra → incompleto');
okk(AI.isCompleteWizard('jornada', { empleado: 'X', obra: 'Y', horas: 8 }) === true, 'jornada completa → listo');
okk(AI.isCompleteWizard('jornada', { empleado: 'X' }) === false, 'jornada incompleta → retiene');

console.log('== 3b) Blindaje de nombres (comandos/botones NO son datos) ==');
okk(AI.isValidName('crear una obra') === false, 'rechaza comando');
okk(AI.isValidName('empleado') === false, 'rechaza texto de botón');
okk(AI.isValidName('socio') === false, 'rechaza texto de botón');
okk(AI.isValidName('Juan Pérez') === true, 'acepta nombre válido');
okk(AI.isValidName('Ángel Cámara') === true, 'acepta nombre compuesto');

console.log('== 5) Guardado estricto: sin obra no se guarda como general ==');
const otra = S.add('works', { name: 'Obra Dos', code: 'OB-2', clientId: null, location: '', status: 'activa', budgetTotal: 0, advanceFisico: 0, startDate: S.todayISO(), endDate: '', description: '' });
const antes = S.data.expenses.length;
const rSin = await AI.execFormAction({ modulo: 'gasto', campos: { monto: 3000, categoria: 'Materiales' } });
okk(rSin && rSin.saved === false, 'gasto sin obra con varias obras → NO guarda (retiene)');
okk(S.data.expenses.length === antes, 'no se insertó gasto fantasma');
const rCon = await AI.execFormAction({ modulo: 'gasto', campos: { monto: 3000, categoria: 'Materiales', obra: 'Norma Molina' } });
okk(rCon && rCon.saved === true, 'gasto con obra → guarda directo');
okk(S.data.expenses.some(x => x.amount === 3000 && x.workId === obra.id), 'gasto insertado en la obra correcta');

console.log('== 4) Guardado autónomo de los nuevos módulos ==');
const r1 = await AI.execFormAction({ modulo: 'presupuesto', campos: { nombre: 'Reforma cocina', monto: 80000, obra: 'Norma Molina' } });
okk(r1 && r1.saved === true, 'presupuesto guarda directo');
const b = S.data.budgets.find(x => x.name === 'Reforma cocina');
okk(!!b && b.total === 80000 && b.workId === obra.id, 'presupuesto con monto y obra correctos');
const r2 = await AI.execFormAction({ modulo: 'herramienta', campos: { nombre: 'Amoladora', categoria: 'Herramienta eléctrica', costo: 12000 } });
okk(r2 && r2.saved === true, 'herramienta guarda directo');
const a = S.data.assets.find(x => x.name === 'Amoladora');
okk(!!a && a.cost === 12000 && a.category === 'Herramienta eléctrica', 'herramienta con costo y categoría');
const r3 = await AI.execFormAction({ modulo: 'empleado', campos: { nombre: 'Jorge el Flaco', telefono: '+54 9 351 555-1234', oficio: 'Albañil', tarifa: 1500 } });
okk(r3 && r3.saved === true, 'empleado con oficio guarda');
const e = S.data.employees.find(x => x.firstName === 'Jorge');
okk(!!e && e.notes === 'Oficio: Albañil' && e.hourlyRate === 1500, 'empleado con oficio y tarifa persistidos');
const rSinOficio = await AI.execFormAction({ modulo: 'empleado', campos: { nombre: 'Pepe' } });
okk(rSinOficio && rSinOficio.saved === false, 'empleado SIN oficio → NO guarda (retiene)');
const r4 = await AI.execFormAction({ modulo: 'jornada', campos: { empleado: 'Jorge el Flaco', obra: 'Norma Molina', horas: 8 } });
okk(r4 && r4.saved === true, 'jornada guarda directo');
const j = S.data.attendance.find(x => x.employeeId === e.id);
okk(!!j && j.hours[0].hours === 8 && j.hours[0].workId === obra.id, 'jornada con empleado, obra y horas correctas');
const rSinJ = await AI.execFormAction({ modulo: 'jornada', campos: { empleado: 'Jorge el Flaco' } });
okk(rSinJ && rSinJ.saved === false, 'jornada incompleta → NO guarda');

console.log('== 7) Asignar herramienta: mover a obra / depósito / mantenimiento ==');
const asset = S.add('assets', { name: 'Amoladora angular', category: 'Herramienta eléctrica', purchaseDate: S.todayISO(), cost: 45000, status: 'operativo', supplierId: null, notes: '', location: null, usages: [{ from: S.todayISO(), workId: null, notes: 'Compra' }], maintenance: [] });
const rAsig = await AI.execFormAction({ modulo: 'asignar', campos: { herramienta: 'Amoladora angular · depósito', destino: 'Norma Molina', nota: 'La llevó Juan' } });
okk(rAsig && rAsig.saved === true, 'asignación a obra guarda directo');
const a1 = S.data.assets.find(x => x.id === asset.id);
okk(a1.location === obra.id, 'quedó asignada a la obra');
okk((a1.usages || []).some(u => u.workId === obra.id && /La llevó Juan/.test(u.notes || '')), 'movimiento registrado en el historial con nota');
okk(a1.cost === 45000, 'costo de inversión intacto');
const rDep = await AI.execFormAction({ modulo: 'asignar', campos: { herramienta: 'Amoladora angular · en obra', destino: '📦 En depósito' } });
okk(rDep && rDep.saved === true, 'devolución a depósito');
const a2 = S.data.assets.find(x => x.id === asset.id);
okk(a2.location === null && a2.status === 'operativo', 'quedó en depósito y operativa');
const rMant = await AI.execFormAction({ modulo: 'asignar', campos: { herramienta: 'Amoladora angular · depósito', destino: '🔧 En mantenimiento' } });
okk(rMant && rMant.saved === true, 'envío a mantenimiento');
const a3 = S.data.assets.find(x => x.id === asset.id);
okk(a3.status === 'en reparación', 'estado en mantenimiento persistido');
okk(a3.usages.length >= 4, 'trazabilidad completa (cada movimiento quedó registrado)');
const rBad = await AI.execFormAction({ modulo: 'asignar', campos: { herramienta: 'Inexistente', destino: 'Norma Molina' } });
okk(rBad && rBad.saved === false, 'herramienta inexistente → NO guarda');

console.log('== 6) Asistencia diaria: empleados frecuentes + obra sugerida ==');
const eA = S.add('employees', { firstName: 'Frecuente', lastName: 'Uno', phone: '+1', paymentData: '', hourlyRate: 0, active: true, notes: '', photo: null });
const eB = S.add('employees', { firstName: 'Ocasional', lastName: 'Dos', phone: '+2', paymentData: '', hourlyRate: 0, active: true, notes: '', photo: null });
S.add('attendance', { employeeId: eA.id, date: S.todayISO(), status: 'presente', hours: [{ workId: obra.id, hours: 8 }], notes: '' });
S.add('attendance', { employeeId: eA.id, date: S.todayISO(), status: 'presente', hours: [{ workId: obra.id, hours: 6 }], notes: '' });
S.add('attendance', { employeeId: eB.id, date: '2026-01-05', status: 'presente', hours: [{ workId: obra.id, hours: 8 }], notes: '' });
const orden = AI.frequentEmployees([eB, eA]);
okk(orden[0].id === eA.id, 'el empleado con más actividad reciente va primero');
const sug = AI.suggestedWork();
okk(!!sug && S.data.works.some(w => w.name === sug && w.status === 'activa'), 'obra sugerida es una obra activa real');
okk(r1 && r1.coll === 'budgets' && r1.id, 'el guardado devuelve coll+id (Deshacer disponible)');

console.log('\n──────────────────────────');
if (ko === 0) { console.log('✔ AI WIZARD AUDIT PASADO (' + ok + ' checks)'); process.exit(0); }
else { console.log('✘ AUDIT: ' + ko + ' fallos de ' + (ok + ko)); process.exit(1); }

})().catch(e => { console.error('✘ FALLO:', e); process.exit(1); });
