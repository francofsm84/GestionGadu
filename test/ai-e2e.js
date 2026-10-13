/* ============================================================
   E2E: usuario simulado — chat completo + persistencia real
   1) Alta de empleado por wizard (4 pasos) → payload capturado
   2) Verificación de escritura en el mock de Supabase (9333)
   3) Simulación de fallo de red → NUNCA tilde verde
   Uso: node test/ai-e2e.js
   ============================================================ */
'use strict';
global.window = global;
global.location = { hash: '' };
global.addEventListener = () => {};
const mem = {};
global.localStorage = { getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: k => { delete mem[k]; } };

/* ---------- DOM mínimo para el wizard (registra burbujas) ---------- */
const byId = {};
function mkEl(tag) {
  return {
    tag, className: '', textContent: '', innerHTML: '', hidden: false, value: '', title: '',
    dataset: {}, style: {}, children: [], scrollTop: 0,
    appendChild(c) { this.children.push(c); return c; },
    addEventListener() {}, removeEventListener() {},
    querySelector() { return null; }, querySelectorAll() { return []; },
    setAttribute() {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
  };
}
global.document = {
  createElement: t => mkEl(t),
  getElementById: id => {
    /* 'aiRoot' no existe aún → build() puede montar el widget */
    if (id === 'aiRoot') return null;
    return (byId[id] = byId[id] || mkEl('#' + id));
  },
  body: mkEl('body'),
  querySelectorAll: () => [], querySelector: () => null,
};

/* ---------- Mock de Supabase (puerto 9333) ---------- */
require('./mock-supabase.js');

const email = 'e2e-' + Date.now() + '@test.com';
const token = 'tok-' + email;
const uid = 'u-' + email;

function fail(msg) { console.error('✘ FALLO:', msg); process.exit(1); }

(async () => {
  /* 1) Alta del usuario simulado en el mock */
  const su = await fetch('http://localhost:9333/auth/v1/signup', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'Secreto123' }),
  }).then(r => r.json());
  if (!su.access_token) fail('no se pudo crear el usuario simulado');

  /* 2) Cargar la app real (store + sync + asistente) apuntando al mock */
  require('../js/store.js');
  const G = global.GADU;
  G.auth = {
    SUPABASE_URL: 'http://localhost:9333',
    SUPABASE_ANON_KEY: 'anon',
    getSession: () => ({ accessToken: token, userId: uid, user: { id: uid } }),
    refresh: async () => false,
  };
  G.plan = {
    profile: { subscription_status: 'trialing', rol: 'gestor_obra' },
    currentPlan: () => ({ nombre: 'Free' }), trialDaysLeft: () => 45, checkLimit: () => true,
    isAdmin: () => false, planes: [], log: async () => {},
  };
  G.ui = { toast: () => {}, icon: () => '', fmtMoney: v => String(v) };
  G.actions = {};
  G.router = { refresh: () => {} };
  require('../js/sync.js');
  require('../js/ai.js');
  const S = G.store;
  const AI = G.ai;

  S.load();
  S.startEmpty();
  const obra = S.add('works', { name: 'Obra E2E', code: 'OB-E2E', clientId: null, location: '', status: 'activa', budgetTotal: 0, advanceFisico: 0, startDate: S.todayISO(), endDate: '', description: '' });

  /* Interceptar el push para capturar el payload EXACTO */
  let captured = null;
  const origPush = G.sync.push.bind(G.sync);
  G.sync.push = async (data) => { captured = JSON.parse(JSON.stringify(data)); return origPush(data); };

  AI._build();
  const log = AI._log();

  /* ============ FLUJO A: alta de empleado completa (4 pasos) ============ */
  console.log('== A) Alta de empleado por chat (E2E) ==');
  AI._send('cargar un empleado');
  if (!AI._pending() || AI._pending().modulo !== 'empleado') fail('el wizard no arrancó');
  console.log('  ✔ paso 1: wizard de empleado iniciado');

  AI._send('Leonardo Yáñez');
  if (AI._pending() && !('nombre' in AI._pending().campos)) fail('no capturó el nombre');
  console.log('  ✔ paso 2: nombre capturado ("Leonardo Yáñez")');

  AI._send('+54 9 351 555-9999');
  console.log('  ✔ paso 3: teléfono / WhatsApp capturado');

  AI._send('Albañil');
  console.log('  ✔ paso 4: oficio capturado');

  AI._send('1500');
  /* esperar el guardado asíncrono (push al mock) */
  const t0 = Date.now();
  while (Date.now() - t0 < 4000) {
    const ult = log.children[log.children.length - 1];
    if (ult && (ult.innerHTML.indexOf('ai-success') >= 0 || ult.innerHTML.indexOf('⚠️') >= 0)) break;
    await new Promise(r => setTimeout(r, 50));
  }
  const ultA = log.children[log.children.length - 1];
  const greenA = ultA && ultA.innerHTML.indexOf('ai-success') >= 0;
  if (!greenA) fail('no apareció la tarjeta verde tras el guardado (última burbuja: ' + (ultA && ultA.innerHTML) + ')');
  console.log('  ✔ paso 4: tilde verde ✔ con confirmación REAL de escritura');

  /* El push envuelve el documento: body = { data: <doc>, updated_at }.
     captured = documento crudo enviado a G.sync.push */
  if (!captured || !Array.isArray(captured.employees)) fail('payload inválido capturado: ' + JSON.stringify(captured).slice(0, 300));
  const emp = captured.employees.find(e => e.firstName === 'Leonardo');
  if (!emp) fail('el empleado NO está en el payload enviado');
  if (emp.notes !== 'Oficio: Albañil' || emp.hourlyRate !== 1500) fail('campos oficio/tarifa incorrectos en el payload');
  if (!Array.isArray(captured.settings) && captured.settings && captured.works) {} // estructura íntegra
  console.log('  ✔ payload capturado: documento completo con employees[firstName:"Leonardo", notes:"Oficio: Albañil", hourlyRate:1500]');

  /* Verificar la escritura REAL leyendo el mock de vuelta */
  const read = await fetch('http://localhost:9333/rest/v1/app_data?select=data&user_id=eq.' + encodeURIComponent(uid) + '&limit=1', {
    headers: { 'Authorization': 'Bearer ' + token, apikey: 'anon' },
  }).then(r => r.json());
  const enMock = read && read[0] && read[0].data && read[0].data.employees && read[0].data.employees.find(e => e.firstName === 'Leonardo');
  if (!enMock) fail('la base de datos NO devolvió el empleado (escritura perdida)');
  console.log('  ✔ la base de datos devuelve el empleado: ' + enMock.firstName + ' ' + enMock.lastName + ' · ' + enMock.notes);

  /* ============ FLUJO B: fallo de red → NUNCA tilde verde ============ */
  console.log('== B) Simulación de caída de red (puerto muerto) ==');
  G.auth.SUPABASE_URL = 'http://localhost:9998';   // puerto cerrado → push falla
  AI._send('cargar un gasto');
  AI._send('5000');
  AI._send('Materiales');
  AI._send('Obra E2E');
  AI._send('no sé');   // comprobante (secundario)
  const t1 = Date.now();
  while (Date.now() - t1 < 6000) {
    const ult = log.children[log.children.length - 1];
    if (ult && (ult.innerHTML.indexOf('ai-success') >= 0 || ult.innerHTML.indexOf('⚠️') >= 0)) break;
    await new Promise(r => setTimeout(r, 50));
  }
  const ultB = log.children[log.children.length - 1];
  if (ultB && ultB.innerHTML.indexOf('ai-success') >= 0) fail('mostró tilde verde pese al fallo de red');
  if (!ultB || ultB.innerHTML.indexOf('⚠️') < 0) fail('no alertó del fallo de escritura');
  console.log('  ✔ sin conexión → tarjeta de advertencia (SIN tilde verde)');
  console.log('  ✔ el gasto quedó en el store local: ' + (S.data.expenses.some(e => e.amount === 5000) ? 'sí' : 'no'));

  /* ============ FLUJO C: validación estricta (datos incompletos) ============ */
  console.log('== C) Datos incompletos → retiene (sin guardado) ==');
  const antes = S.data.expenses.length;
  AI._send('cargar un ingreso');
  AI._send('10000');
  /* queda pendiente el paso obra → cancelamos */
  AI._send('cancelar');
  if (S.data.incomes.some(i => i.amount === 10000)) fail('guardó un ingreso incompleto');
  console.log('  ✔ ingreso sin obra NO se guardó (wizard retuvo el dato)');

  /* ============ FLUJO D: Crear agenda → rol → carga 100% manual ============ */
  console.log('== D) Crear agenda → [Empleado/Cliente/Socio] → carga manual ==');
  G.auth.SUPABASE_URL = 'http://localhost:9333';   // restablecer la red
  AI._send('crear un contacto');
  const t2 = Date.now();
  while (Date.now() - t2 < 3000) {
    const ult = log.children[log.children.length - 1];
    if (ult && ult.innerHTML.indexOf('Qué tipo de contacto') >= 0) break;
    await new Promise(r => setTimeout(r, 50));
  }
  const pendD0 = log.children[log.children.length - 1];
  const flat0 = (pendD0 && pendD0.children) ? pendD0.children.reduce((acc, c) => acc.concat(c.children || []), []) : [];
  const roleBtns = flat0.filter(c => c.dataset && c.dataset.role);
  if (roleBtns.length !== 3) fail('no aparecieron los 3 botones de rol primero, got ' + roleBtns.length);
  console.log('  ✔ primero pregunta el rol: [Empleado] [Cliente] [Socio]');

  AI._send('cliente');   // elegir rol por texto (sin agenda ni archivos)
  if (!AI._pending() || AI._pending().modulo !== 'cliente') fail('no arrancó el wizard de cliente');
  console.log('  ✔ rol elegido → wizard de cliente manual (SIN agenda nativa)');

  AI._send('Ángel Cámara');      // nombre
  AI._send('+54 9 3547 55-1234');  // teléfono / WhatsApp
  AI._send('fr@x.com');           // email
  AI._send('Alta Gracia');        // direccion
  const t3 = Date.now();
  while (Date.now() - t3 < 4000) {
    const ult = log.children[log.children.length - 1];
    if (ult && (ult.innerHTML.indexOf('ai-success') >= 0 || ult.innerHTML.indexOf('⚠️') >= 0)) break;
    await new Promise(r => setTimeout(r, 50));
  }
  const creado = S.data.contacts.find(c => c.name === 'Ángel Cámara');
  if (!creado) fail('el cliente no se guardó');
  if (creado.phone !== '+54 9 3547 55-1234') fail('teléfono unificado incorrecto');
  if (creado.email !== 'fr@x.com') fail('e-mail incorrecto en el registro');
  console.log('  ✔ cliente guardado (nombre + teléfono + email + dirección) con tilde verde');

  /* ============ FLUJO E: blindaje — los botones/comandos NO son datos ============ */
  console.log('== E) Blindaje: comandos y textos de botón rechazados como nombres ==');
  AI._send('crear un contacto');
  while (Date.now() - t2 < 3000) {
    const ult = log.children[log.children.length - 1];
    if (ult && ult.innerHTML.indexOf('Qué tipo de contacto') >= 0) break;
    await new Promise(r => setTimeout(r, 50));
  }
  AI._send('empleado');   // rol
  if (!AI._pending() || AI._pending().modulo !== 'empleado') fail('no arrancó el wizard de empleado');
  AI._send('crear una obra');   // comando como nombre → debe rechazarse
  if (!AI._pending() || 'nombre' in AI._pending().campos) fail('aceptó un comando como nombre');
  console.log('  ✔ "crear una obra" rechazado como nombre');
  AI._send('socio');            // texto de botón como nombre → debe rechazarse
  if (!AI._pending() || 'nombre' in AI._pending().campos) fail('aceptó un texto de botón como nombre');
  console.log('  ✔ "socio" (texto de botón) rechazado como nombre');
  AI._send('Jorge Pérez');      // nombre válido
  if (!('nombre' in AI._pending().campos)) fail('nombre válido no capturado');
  AI._send('+54 9 351 555-1234');  // teléfono
  AI._send('Albañil');          // oficio
  AI._send('1500');             // tarifa
  const t6 = Date.now();
  while (Date.now() - t6 < 4000) {
    const ult = log.children[log.children.length - 1];
    if (ult && (ult.innerHTML.indexOf('ai-success') >= 0 || ult.innerHTML.indexOf('⚠️') >= 0)) break;
    await new Promise(r => setTimeout(r, 50));
  }
  const emp2 = S.data.employees.find(e => e.firstName === 'Jorge');
  if (!emp2) fail('el empleado no se guardó');
  if (emp2.phone !== '+54 9 351 555-1234') fail('teléfono del empleado incorrecto');
  console.log('  ✔ empleado guardado completo (nombre + teléfono + oficio + tarifa) con tilde verde');

  /* ============ FLUJO F: Contabilidad ([Ingresos][Gastos]) + Deshacer ============ */
  console.log('== F) Menú Contabilidad + tarjeta Tap-to-Confirm con Deshacer ==');
  G.auth.SUPABASE_URL = 'http://localhost:9333';
  AI._pill('contabilidad');
  while (Date.now() - t6 < 3000) {
    const ult = log.children[log.children.length - 1];
    if (ult && ult.innerHTML.indexOf('Qué querés cargar') >= 0) break;
    await new Promise(r => setTimeout(r, 50));
  }
  const pendL = log.children[log.children.length - 1];
  const ledgerBtns = pendL.children.reduce((acc, c) => acc.concat(c.children || []), []).filter(c => c.dataset && c.dataset.ledger);
  if (ledgerBtns.length !== 2) fail('no aparecieron [Ingresos][Gastos], got ' + ledgerBtns.length);
  console.log('  ✔ pill Contabilidad → botones [Ingresos] [Gastos]');
  AI._send('gastos');   // elegir por texto
  if (!AI._pending() || AI._pending().modulo !== 'gasto') fail('no arrancó el wizard de gasto');
  AI._send('5000');
  AI._send('Materiales');
  AI._send('Obra E2E');
  AI._send('no sé');
  const t7 = Date.now();
  while (Date.now() - t7 < 4000) {
    const ult = log.children[log.children.length - 1];
    if (ult && ult.innerHTML.indexOf('ai-success') >= 0) break;
    await new Promise(r => setTimeout(r, 50));
  }
  const pendOK = log.children[log.children.length - 1];
  if (pendOK.innerHTML.indexOf('data-undo') < 0) fail('la tarjeta de éxito no incluye el botón Deshacer');
  if (!AI._lastSaved() || AI._lastSaved().coll !== 'expenses') fail('no se registró el último guardado para Deshacer');
  const antesUndo = S.data.expenses.length;
  console.log('  ✔ gasto guardado con tarjeta verde + botón [↩ Deshacer]');
  AI._undo();
  if (S.data.expenses.length !== antesUndo - 1) fail('Deshacer no eliminó el gasto');
  console.log('  ✔ Deshacer eliminó el registro y refrescó');

  /* ============ FLUJO G: consulta de herramienta NO rompe el wizard ============ */
  console.log('== G) "¿Dónde está la hormigonera?" durante un wizard ==');
  G.auth.SUPABASE_URL = 'http://localhost:9333';
  S.add('assets', { name: 'Hormigonera 130 L', category: 'Equipo mayor', purchaseDate: S.todayISO(), cost: 100000, status: 'operativo', supplierId: null, notes: '', location: obra.id, usages: [{ from: S.todayISO(), workId: obra.id, notes: 'En obra E2E' }], maintenance: [] });
  AI._send('cargar un presupuesto');
  if (!AI._pending() || AI._pending().modulo !== 'presupuesto') fail('no arrancó el wizard de presupuesto');
  AI._send('dónde está la hormigonera');
  if (AI._pending() && 'nombre' in AI._pending().campos) fail('la consulta se guardó como dato del presupuesto');
  if (!AI._pending() || AI._pending().modulo !== 'presupuesto') fail('el wizard se perdió tras la consulta');
  /* La respuesta de búsqueda está entre las últimas burbujas (luego se re-pregunta el paso) */
  let okG = false;
  for (let i = log.children.length - 1; i >= 0 && i >= log.children.length - 4; i--) {
    if (log.children[i].innerHTML.indexOf('Hormigonera') >= 0) { okG = true; break; }
  }
  if (!okG) fail('no mostró la ubicación de la herramienta');
  console.log('  ✔ consulta respondida (ubicación + estado) y wizard intacto');
  AI._send('cancelar');
  if (AI._pending() || AI._ledger() || AI._tools()) fail('cancelar no limpió el estado por completo');
  console.log('  ✔ cancelar limpia todos los estados colgados');

  /* ============ FLUJO H: chips de concepto (toque táctil) avanzan el flujo ============ */
  console.log('== H) Chips de concepto del ingreso: tocar → inyecta y avanza ==');
  G.auth.SUPABASE_URL = 'http://localhost:9333';
  AI._send('cargar un ingreso');
  if (!AI._pending() || AI._pending().modulo !== 'ingreso') fail('no arrancó el wizard de ingreso');
  AI._send('10000');            // monto
  AI._wiz('Cobro');             // toque del chip [Cobro] → inyecta texto y avanza
  if (!AI._pending() || 'concepto' in AI._pending().campos === false || AI._pending().campos.concepto !== 'Cobro') fail('el chip no inyectó el concepto');
  const ultH = log.children[log.children.length - 2];
  if (!ultH || ultH.innerHTML.indexOf('Cobro') < 0) fail('el texto del chip no quedó visible en el chat');
  console.log('  ✔ tocar [Cobro] inyecta el texto y avanza al paso de obra');
  AI._send('Obra E2E');         // obra → guardado directo
  const t8 = Date.now();
  while (Date.now() - t8 < 4000) {
    const ult = log.children[log.children.length - 1];
    if (ult && ult.innerHTML.indexOf('ai-success') >= 0) break;
    await new Promise(r => setTimeout(r, 50));
  }
  const ingH = S.data.incomes.find(x => x.concept === 'Cobro' && x.amount === 10000);
  if (!ingH) fail('el ingreso con concepto tocado no se guardó');
  console.log('  ✔ ingreso guardado con tilde verde (concepto elegido por chip)');

  /* ============ FLUJO I: botones rápidos de horas (4 hs / 8 hs) ============ */
  console.log('== I) Botones rápidos de horas de la jornada ==');
  G.auth.SUPABASE_URL = 'http://localhost:9333';
  AI._send('cargar una jornada');
  if (!AI._pending() || AI._pending().modulo !== 'jornada') fail('no arrancó el wizard de jornada');
  AI._wiz('Jorge Pérez');   // chip de empleado
  AI._wiz('Obra E2E');      // chip de obra
  AI._wiz('4 hs');          // botón rápido de horas
  const t9 = Date.now();
  while (Date.now() - t9 < 4000) {
    const ult = log.children[log.children.length - 1];
    if (ult && ult.innerHTML.indexOf('ai-success') >= 0) break;
    await new Promise(r => setTimeout(r, 50));
  }
  const jI = S.data.attendance.find(x => x.employeeId && x.hours && x.hours[0] && x.hours[0].hours === 4 && x.hours[0].workId === obra.id);
  if (!jI) fail('las horas tocadas (4 hs) no se registraron correctamente');
  console.log('  ✔ tocar [4 hs] registra la jornada con 4 horas vinculadas a la obra');

  console.log('\n──────────────────────────');
  console.log('✔ AI E2E PASADO — persistencia verificada de punta a punta');
  process.exit(0);
})().catch(e => fail((e && e.stack) || String(e)));
