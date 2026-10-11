/* Prueba del flujo SaaS (auth + sincronización por usuario) contra el mock local */
'use strict';
const http = require('http');

/* Mock embebido (igual que test/mock-supabase.js) */
const users = new Map();
const appData = new Map();
function send(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(obj ? JSON.stringify(obj) : '');
}
function readBody(req) {
  return new Promise((resolve) => {
    let b = '';
    req.on('data', c => { b += c; });
    req.on('end', () => { try { resolve(b ? JSON.parse(b) : {}); } catch (e) { resolve({}); } });
  });
}
function userFromAuth(req) {
  const m = String(req.headers['authorization'] || '').match(/Bearer (tok|rt)-(.+)/);
  return m ? m[2] : null;
}
const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'apikey, authorization, content-type, prefer');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  const url = req.url.split('?')[0];
  const query = Object.fromEntries(new URLSearchParams(req.url.split('?')[1] || ''));
  if (url === '/auth/v1/signup') {
    const b = await readBody(req);
    if (users.has(b.email)) { send(res, 400, { msg: 'User already registered' }); return; }
    const u = { id: 'u-' + b.email, email: b.email, password: b.password, plan: 'prueba', trial_end: new Date(Date.now() + 14 * 86400000).toISOString() };
    users.set(b.email, u);
    send(res, 200, { session: { access_token: 'tok-' + b.email, refresh_token: 'rt-' + b.email }, user: { id: u.id, email: u.email } });
    return;
  }
  if (url === '/auth/v1/token') {
    const b = await readBody(req);
    if (query.grant_type === 'password') {
      const u = users.get(b.email);
      if (!u || u.password !== b.password) { send(res, 400, { error_description: 'Invalid login credentials' }); return; }
      send(res, 200, { access_token: 'tok-' + b.email, refresh_token: 'rt-' + b.email, user: { id: u.id, email: u.email } });
      return;
    }
    if (query.grant_type === 'refresh_token') {
      const m = String(b.refresh_token || '').match(/^rt-(.+)$/);
      if (!m || !users.has(m[1])) { send(res, 400, { error_description: 'Invalid Refresh Token' }); return; }
      const u = users.get(m[1]);
      send(res, 200, { access_token: 'tok-' + m[1], refresh_token: 'rt-' + m[1], user: { id: u.id, email: u.email } });
      return;
    }
    send(res, 400, { error_description: 'Bad Request' }); return;
  }
  if (url === '/auth/v1/logout') { send(res, 204); return; }
  const email = userFromAuth(req);
  const u = email ? users.get(email) : null;
  if (url === '/rest/v1/profiles') {
    if (!u) { send(res, 401, { message: 'No autorizado' }); return; }
    send(res, 200, [{ user_id: u.id, email: u.email, plan: u.plan, trial_end: u.trial_end, paid_until: null }]);
    return;
  }
  if (url === '/rest/v1/app_data') {
    if (!u) { send(res, 401, { message: 'No autorizado' }); return; }
    if (req.method === 'POST') {
      const b = await readBody(req);
      appData.set(u.id, { data: b.data, updated_at: b.updated_at });
      send(res, 201, []); return;
    }
    if (req.method === 'GET') {
      if (query.select === 'id') { send(res, 200, []); return; }
      const row = appData.get(u.id);
      send(res, 200, row ? [{ data: row.data, updated_at: row.updated_at }] : []);
      return;
    }
  }
  send(res, 404, { message: 'No encontrado' });
});

server.listen(9333, async () => {
  try {
    global.window = global;
    require('../js/auth.js');
    require('../js/sync.js');
    const A = global.GADU.auth, S = global.GADU.sync;
    A.override('http://localhost:9333', 'test-anon-key');

    /* 1) Registro + perfil */
    await A.signup('franco@test.com', 'secreto123');
    const prof = await A.getProfile();
    if (!prof || prof.plan !== 'prueba') throw new Error('perfil de prueba no creado');
    console.log('registro + perfil OK (plan prueba, 14 días)');

    /* 2) Subir datos del usuario */
    const datos = { settings: { company: 'GADU' }, works: [{ id: 'w1', name: 'Obra de franco' }] };
    await S.push(datos);
    const remoto = await S.pull();
    if (!remoto || remoto.data.works[0].name !== 'Obra de franco') throw new Error('pull no devolvió lo subido');
    console.log('subir + descargar OK (datos de franco)');

    /* 3) Aislamiento: otro usuario no ve nada */
    A.setSession(null);
    await A.signup('cliente2@test.com', 'clave456');
    const vacio = await S.pull();
    if (vacio !== null) throw new Error('cliente2 debería ver sus datos vacíos');
    console.log('aislamiento OK (cliente2 no ve datos de franco)');

    /* 4) Volver a franco: sus datos siguen */
    A.setSession(null);
    await A.login('franco@test.com', 'secreto123');
    const deNuevo = await S.pull();
    if (!deNuevo || deNuevo.data.works[0].name !== 'Obra de franco') throw new Error('franco perdió sus datos');
    console.log('reingreso OK (datos de franco intactos)');

    /* 5) Login con clave mala falla */
    let err = null;
    try { await A.login('franco@test.com', 'clave-mala'); } catch (e) { err = e; }
    if (!err) throw new Error('login con clave mala debería fallar');
    console.log('credenciales inválidas rechazadas OK');

    console.log('✔ SAAS SMOKE TEST PASADO');
  } catch (e) {
    console.error('✘ FALLO:', e.message);
    process.exit(1);
  } finally {
    server.close();
  }
});
