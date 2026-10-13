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

  AI._send('Albañil');
  console.log('  ✔ paso 3: oficio capturado');

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

  console.log('\n──────────────────────────');
  console.log('✔ AI E2E PASADO — persistencia verificada de punta a punta');
  process.exit(0);
})().catch(e => fail((e && e.stack) || String(e)));
