/* Mock de Supabase (Auth + PostgREST) para pruebas locales (puerto 9333)
   Simula: signup, login (password/refresh), logout, profiles con plan
   y la tabla app_data con UNA fila por usuario. */
'use strict';
const http = require('http');

const users = new Map();      // email -> {id, email, password}
const appData = new Map();    // userId -> {data, updated_at}

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
  const auth = String(req.headers['authorization'] || '');
  const m = auth.match(/Bearer (tok|rt)-(.+)/);
  return m ? m[2] : null; // el "email"
}
function profileFor(email) {
  const u = users.get(email);
  if (!u) return null;
  return {
    user_id: u.id, email: u.email, plan: u.plan || 'prueba',
    trial_end: u.trial_end, paid_until: u.paid_until || null,
  };
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'apikey, authorization, content-type, prefer, range');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS, DELETE');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const url = req.url.split('?')[0];
  const query = Object.fromEntries(new URLSearchParams(req.url.split('?')[1] || ''));

  /* ---------- Auth ---------- */
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

  /* ---------- PostgREST ---------- */
  const email = userFromAuth(req);
  const u = email ? users.get(email) : null;

  if (url === '/rest/v1/profiles') {
    if (!u) { send(res, 401, { message: 'No autorizado' }); return; }
    send(res, 200, [profileFor(email)]);
    return;
  }
  if (url === '/rest/v1/app_data') {
    if (!u) { send(res, 401, { message: 'No autorizado' }); return; }
    if (req.method === 'POST') {
      const b = await readBody(req);
      appData.set(u.id, { data: b.data, updated_at: b.updated_at });
      send(res, 201, []);
      return;
    }
    if (req.method === 'GET') {
      const sel = query.select || '';
      if (sel === 'id') { send(res, 200, []); return; }
      const row = appData.get(u.id);
      if (!row) { send(res, 200, []); return; }
      send(res, 200, [{ data: row.data, updated_at: row.updated_at }]);
      return;
    }
  }
  send(res, 404, { message: 'No encontrado' });
});

server.listen(9333, () => console.log('Mock Supabase escuchando en http://localhost:9333'));
