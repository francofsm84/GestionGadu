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

console.log('== 8) NLP: entidades y ejecución directa (function calling) ==');
const iAsig = AI.localIntent('asignar la amoladora a la obra de Norma Molina hoy');
okk(iAsig && iAsig.modulo === 'asignar' && iAsig.campos.herramienta === 'Amoladora angular' && iAsig.campos.destino === 'Norma Molina', 'asignar: herramienta + obra extraídas de la frase');
okk(AI.isCompleteWizard('asignar', iAsig.campos) === true, 'asignación completa → ejecución directa');
const iDep = AI.localIntent('dejé la amoladora hoy en el depósito');
okk(iDep && iDep.modulo === 'asignar' && iDep.campos.destino === '📦 En depósito', '"dejé en el depósito" → destino depósito');
const iMan = AI.localIntent('mandá la amoladora a mantenimiento');
okk(iMan && iMan.campos.destino === '🔧 En mantenimiento', '"a mantenimiento" → estado en reparación');
const iCob = AI.localIntent('cobré 50000 de la obra Norma Molina');
okk(iCob && iCob.modulo === 'ingreso' && iCob.campos.monto === 50000 && iCob.campos.obra === 'Norma Molina', 'ingreso: monto + obra extraídos');
const iGas = AI.localIntent('gasté 3000 en materiales en la obra Norma Molina');
okk(iGas && iGas.modulo === 'gasto' && iGas.campos.monto === 3000 && iGas.campos.obra === 'Norma Molina' && iGas.campos.categoria === 'Materiales', 'gasto: monto + categoría + obra');
okk(AI.isCompleteWizard('gasto', iGas.campos) === true, 'gasto completo → ejecución directa');
const rDir = await AI.execFormAction(iGas);
okk(rDir && rDir.saved === true && rDir.coll === 'expenses', 'gasto por voz se guardó directo (function calling)');
const iAg = AI.localIntent('agendar una visita mañana a la obra de Norma Molina');
okk(iAg && iAg.modulo === 'agendar' && iAg.campos.tipo === 'visita' && iAg.campos.fecha === S.daysAhead(1), 'agendar: tipo + fecha + lugar extraídos');
const rAg = await AI.execFormAction({ modulo: 'agendar', campos: { tipo: 'visita', fecha: S.daysAhead(1), titulo: 'Visita obra Norma Molina', hora: '', lugar: 'Norma Molina' } });
okk(rAg && rAg.saved === true && rAg.coll === 'compromisos', 'compromiso agendado en el store');
const comp = S.data.compromisos.find(c => c.tipo === 'visita');
okk(!!comp && comp.fecha === S.daysAhead(1) && comp.estado === 'pendiente', 'fecha normalizada y persistida');
okk(AI.normFecha('mañana') === S.daysAhead(1), 'normFecha: mañana');
okk(AI.normFecha('15/04') === String(new Date().getFullYear()) + '-04-15', 'normFecha: dd/mm');
okk(AI.normFecha('chau') === null, 'normFecha: inválida → null');
const iCrear = AI.localIntent('crear una obra para Pablo Molina');
okk(iCrear && iCrear.modulo === 'obra' && iCrear.campos.nombre === 'pablo molina', 'crear obra: nombre extraído');

console.log('== 9) Robustez: consultas nunca son datos ==');
okk(AI.isValidName('dónde está la amoladora') === false, 'consulta de ubicación rechazada como nombre');
okk(AI.isValidName('cuánto vale') === false, 'pregunta de monto rechazada como nombre');
okk(AI.searchIntent('¿dónde está la amoladora?') === 'amoladora', 'searchIntent extrae la herramienta');
const res9 = AI.searchStore('amoladora');
okk(res9.some(r => r.tipo === 'Herramienta' && /En (mantenimiento|depósito|uso)/.test(r.detail)), 'búsqueda devuelve estado + ubicación claros');

console.log('== 10) Chips obligatorios para opciones predefinidas ==');
const stConcepto = AI.WIZARD_STEPS.ingreso.find(s => s.key === 'concepto');
okk(!!stConcepto && JSON.stringify(stConcepto.buttons) === JSON.stringify(['Cobro', 'Adelanto', 'Certificación']), 'ingreso · concepto con chips [Cobro][Adelanto][Certificación]');
okk(AI.WIZARD_STEPS.gasto.some(s => s.catsList), 'gasto · categoría con chips');
okk(AI.WIZARD_STEPS.gasto.some(s => s.worksList), 'gasto · obra con chips');
okk(AI.WIZARD_STEPS.ingreso.some(s => s.worksList), 'ingreso · obra con chips');
okk(AI.WIZARD_STEPS.herramienta.some(s => s.buttons && s.buttons.length), 'herramienta · tipo con chips');
okk(AI.WIZARD_STEPS.agendar[0].buttons.length === 5 && JSON.stringify(AI.WIZARD_STEPS.agendar[0].buttons) === JSON.stringify(['Reunión', 'Visita', 'Entrega', 'Tarea', 'Evento']), 'agendar · tipo con chips multirubro');
okk(AI.WIZARD_STEPS.empleado.some(s => s.buttons && s.buttons.length >= 7), 'empleado · oficio con chips');

console.log('== 11) Puente obras ↔ asistente: 100% de obras, sin undefined ==');
const wCac = S.add('works', { name: 'Casa Ángel Cámara', code: 'OB-CAC', clientId: null, location: '', status: 'activa', budgetTotal: 0, advanceFisico: 0, startDate: S.todayISO(), endDate: '', description: '' });
S.add('works', { name: undefined, code: 'OB-BAD', clientId: null, location: '', status: 'activa', budgetTotal: 0, advanceFisico: 0, startDate: S.todayISO(), endDate: '', description: '' });
const iOk = await AI.execFormAction({ modulo: 'ingreso', campos: { monto: 20000, concepto: 'Adelanto', obra: 'Casa Ángel Cámara' } });
okk(iOk && iOk.saved === true, 'ingreso vinculado a la obra correcta por nombre');
const inc11 = S.data.incomes.find(x => x.amount === 20000);
okk(!!inc11 && inc11.workId === wCac.id, 'workId correcto (jamás undefined)');
okk(typeof AI.suggestedWork() === 'string' && AI.suggestedWork() !== 'undefined', 'obra sugerida nunca es undefined');
okk(AI.findWorkMention('cobrar un adelanto para casa angel camara') === 'Casa Ángel Cámara', '"casa angel camara" (sin acentos) resuelve a la obra real');
okk(AI.findWorkMention('obra que no existe en absoluto') === null, 'obra inexistente → null');
okk(AI.flatText('Ángel Cámara') === 'angel camara', 'comparación sin acentos');

console.log('== 12) workLabel: todas las variantes del nombre de obra ==');
okk(AI.workLabel({ nombre: 'Obra B' }) === 'Obra B', 'nombre → texto (orden preferido)');
okk(AI.workLabel({ name: 'Obra A' }) === 'Obra A', 'name → texto');
okk(AI.workLabel({ titulo: 'Obra C' }) === 'Obra C', 'titulo → texto');
okk(AI.workLabel({ nombreObra: 'Obra D' }) === 'Obra D', 'nombreObra → texto');
okk(AI.workLabel({}) === '', 'sin propiedad → vacío (jamás "undefined")');
/* Caso real reportado: registro con name corrupto y nombre legible */
const wCorrupto = { name: 'undefined', nombre: 'casa angel camara', code: 'OB-2026-004', id: 'w-corr' };
okk(AI.workLabel(wCorrupto) === 'casa angel camara', 'name="undefined" + nombre real → muestra "casa angel camara"');
okk(AI.workLabel({ name: 'undefined', nombre: null }) === '', 'todo corrupto → vacío, se excluye de los chips');
const wLeg = S.add('works', { name: 'undefined', nombre: 'casa angel camara', code: 'OB-2026-004', clientId: null, location: '', status: 'activa', budgetTotal: 0, advanceFisico: 0, startDate: S.todayISO(), endDate: '', description: '' });
const iLeg = await AI.execFormAction({ modulo: 'ingreso', campos: { monto: 5000, concepto: 'Cobro', obra: 'casa angel camara' } });
const incLeg = S.data.incomes.find(x => x.amount === 5000);
okk(iLeg && iLeg.saved === true && !!incLeg && incLeg.workId === wLeg.id, 'OB-2026-004 (name="undefined", nombre real) vincula el ingreso al ID correcto');

console.log('== 13) Chips de obras: primer botón SIEMPRE con texto (nunca transparente) ==');
const chips = AI.workChipLabels();
okk(chips.length >= 3, 'lista TODAS las obras activas');
okk(chips.every(l => typeof l === 'string' && l.trim().length > 0), 'ningún chip vacío (cero botones transparentes)');
okk(!chips.some(l => /undefined/i.test(l)), 'ningún chip dice "undefined"');
const sug13 = AI.suggestedWork();
okk(chips[0] === sug13, 'el primer botón es la obra sugerida con su texto real');
okk(chips.indexOf('casa angel camara') >= 0, '"casa angel camara" presente entre los chips');
okk(chips[0] !== '', 'primer botón no vacío (regresión del bug del botón transparente)');

console.log('== 14) Botones rápidos de horas (jornada) ==');
const stHoras = AI.WIZARD_STEPS.jornada.find(s => s.key === 'horas');
okk(!!stHoras && JSON.stringify(stHoras.buttons) === JSON.stringify(['4 hs', '8 hs']), 'paso horas con botones rápidos [4 hs] [8 hs]');
const rJ4 = await AI.execFormAction({ modulo: 'jornada', campos: { empleado: 'Jorge el Flaco', obra: 'Norma Molina', horas: '4 hs' } });
okk(rJ4 && rJ4.saved === true, 'horas "4 hs" (botón) se aceptan y guardan');
/* Anti-duplicados: la jornada del mismo empleado+fecha se fusiona (sin duplicar) */
const j4 = S.data.attendance.find(x => x.hours && x.hours.some(h => Number(h.hours) === 4));
okk(!!j4, 'el valor registrado es 4 (número, fusionado en la jornada del día)');

console.log('== 15) Parseo de montos: miles con punto y abreviaturas ==');
okk(AI.parseMoney('100.000') === 100000, '"100.000" → 100000');
okk(AI.parseMoney('100mil') === 100000, '"100mil" → 100000');
okk(AI.parseMoney('100 mil') === 100000, '"100 mil" → 100000');
okk(AI.parseMoney('1.500,50') === 1500.5, '"1.500,50" → 1500.5');
okk(AI.parseMoney('2,5 mil') === 2500, '"2,5 mil" → 2500');
const i100 = AI.localIntent('cobré 100mil de la obra Norma Molina');
okk(i100 && i100.modulo === 'ingreso' && i100.campos.monto === 100000, 'intención "cobré 100mil" → monto 100000 (no 100)');
const r100 = await AI.execFormAction({ modulo: 'gasto', campos: { monto: '100.000', categoria: 'Materiales', obra: 'Norma Molina', comprobante: '' } });
const g100 = S.data.expenses.find(x => x.amount === 100000);
okk(r100 && r100.saved === true && !!g100, 'monto "100.000" se guarda completo ($100.000, no $100)');
okk(!S.data.expenses.some(x => x.amount === 100), 'no quedó ningún gasto truncado en $100');

console.log('== 16) Pago / Adelanto a empleado (impacto doble) ==');
const iPago = AI.localIntent('adelanto de 50mil a Jorge el Flaco en la obra Norma Molina');
okk(iPago && iPago.modulo === 'pago' && iPago.campos.empleado === 'Jorge el Flaco' && iPago.campos.monto === 50000 && iPago.campos.tipo === 'Adelanto' && iPago.campos.obra === 'Norma Molina', 'adelanto: empleado + monto + tipo + obra extraídos');
okk(AI.isCompleteWizard('pago', iPago.campos) === true, 'adelanto completo → ejecución directa');
const rPag = await AI.execFormAction(iPago);
okk(rPag && rPag.saved === true && rPag.coll === 'expenses', 'adelanto guardado como gasto');
const ePag = S.data.expenses.find(x => x.amount === 50000 && x.employeeId);
okk(!!ePag && ePag.category === 'Mano de obra' && ePag.expenseKind === 'adelanto' && ePag.workId === obra.id, 'gasto: categoría Mano de obra + obra + empleado vinculados');
const jorge = S.data.employees.find(e => e.firstName === 'Jorge');
const avances = S.data.expenses.filter(x => x.employeeId === jorge.id && x.expenseKind === 'adelanto');
okk(avances.some(x => x.id === ePag.id), 'saldo de adelantos del empleado actualizado automáticamente');
const rSuel = await AI.execFormAction({ modulo: 'pago', campos: { empleado: 'Jorge el Flaco', tipo: 'Pago de jornada / semana', monto: '200.000', obra: 'Norma Molina' } });
okk(rSuel && rSuel.saved === true, 'pago de jornada con "200.000" guarda el monto completo');
const eSuel = S.data.expenses.find(x => x.amount === 200000 && x.employeeId);
okk(!!eSuel && eSuel.expenseKind === 'sueldo', 'pago de jornada → expenseKind sueldo (legajo del empleado)');
const rBadPago = await AI.execFormAction({ modulo: 'pago', campos: { empleado: 'Jorge el Flaco', tipo: 'Adelanto' } });
okk(rBadPago && rBadPago.saved === false, 'pago incompleto (sin monto/obra) NO guarda');
okk(AI.PILL_WIZARD['pago'] === 'pago', 'pill rápido Pago / Adelanto → wizard pago');

console.log('== 17) Ver registro: ruta directa al ítem guardado ==');
okk(AI.gotoHref('expenses', 'x1') === '#/gastos', 'gasto → sección Gastos');
okk(AI.gotoHref('incomes', 'x1') === '#/ingresos', 'ingreso → sección Ingresos');
okk(AI.gotoHref('employees', 'e1') === '#/empleado/e1', 'empleado → legajo con id dinámico');
okk(AI.gotoHref('works', 'w1') === '#/obra/w1', 'obra → detalle con id dinámico');
okk(AI.gotoHref('assets', 'a1') === '#/herramientas', 'herramienta → sección Herramientas');
okk(AI.gotoHref('attendance', 'a1') === '#/jornadas', 'jornada → Jornadas y Asistencia');
okk(AI.gotoHref('compromisos', 'c1') === '#/agenda', 'compromiso → Agenda');
okk(AI.gotoHref('budgets', 'b1') === '#/presupuestos', 'presupuesto → Presupuestos');
okk(AI.gotoHref('contacts', 'c1') === '#/directorio', 'contacto → Directorio');
okk(AI.gotoHref('desconocido', 'x') === null, 'colección desconocida → sin ruta');

console.log('== 18) Sueldo/saldo de empleado: cálculo directo ==');
const eSal = S.add('employees', { firstName: 'Luis', lastName: 'Álamo', phone: 'x', paymentData: '', hourlyRate: 2000, active: true, notes: '', photo: null, createdAt: S.todayISO() });
S.addAttendance({ employeeId: eSal.id, date: S.daysAgo(3), status: 'presente', hours: [{ workId: obra.id, hours: 8 }], notes: '' });
S.addAttendance({ employeeId: eSal.id, date: S.daysAgo(2), status: 'presente', hours: [{ workId: obra.id, hours: 8 }], notes: '' });
S.addAttendance({ employeeId: eSal.id, date: S.daysAgo(1), status: 'presente', hours: [{ workId: obra.id, hours: 8 }], notes: '' });
S.add('expenses', { type: 'general', workId: null, date: S.todayISO(), amount: 10000, category: 'Sueldos', providerId: null, employeeId: eSal.id, expenseKind: 'adelanto', description: 'Adelanto a Luis Álamo', invoiceNumber: '', paymentMethod: 'Efectivo' });
S.add('expenses', { type: 'general', workId: null, date: S.todayISO(), amount: 20000, category: 'Sueldos', providerId: null, employeeId: eSal.id, expenseKind: 'sueldo', description: 'Pago a Luis Álamo', invoiceNumber: '', paymentMethod: 'Efectivo' });
okk(AI.salaryIntent('¿cuánto le queda por cobrar a Luis Álamo?') === 'Luis Álamo', 'detecta la consulta y extrae el empleado (sin acentos)');
const infoSal = AI.employeeSalaryInfo('Luis Álamo');
okk(infoSal && infoSal.horas === 24 && infoSal.dias === 3, 'lee días y horas trabajadas del sistema');
okk(infoSal && infoSal.devengado === 48000, 'devengado = 24 h × $2000 = $48.000');
okk(infoSal && infoSal.adelantos === 10000 && infoSal.sueldos === 20000, 'lee adelantos y sueldos registrados');
okk(infoSal && infoSal.neto === 38000, 'neto exacto: $48.000 − $10.000 de adelantos = $38.000 (misma fórmula que la tarjeta)');
okk(AI.employeeSalaryInfo('Nadie Inexistente') === null, 'empleado inexistente → null');

console.log('\n──────────────────────────');
if (ko === 0) { console.log('✔ AI WIZARD AUDIT PASADO (' + ok + ' checks)'); process.exit(0); }
else { console.log('✘ AUDIT: ' + ko + ' fallos de ' + (ok + ko)); process.exit(1); }

})().catch(e => { console.error('✘ FALLO:', e); process.exit(1); });
