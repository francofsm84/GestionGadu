/* Mock de Supabase (Auth + PostgREST + admin v3) para pruebas locales (puerto 9333) */
'use strict';
const http = require('http');

const users = new Map();      // email -> objeto de perfil completo
const appData = new Map();    // userId -> {data, updated_at}
const auditoria = [];
const invitaciones = new Map();   // email -> objeto de invitación pendiente
const negocio = { id: 1, nombre: 'GADU Construye', telefono: '', direccion: '', datos_fiscales: '', moneda: 'ARS', trial_dias: 45, modo_mantenimiento: false, banner_global: '' };
const cpago = { id: 1, mp_public_key: '', mp_access_token: '' };
const PLANES = [
  { id: 'free', nombre: 'Free', precio_mensual: 0, precio_anual: 0, limite_obras_activas: 1, limite_empleados: 3, caracteristicas: [], activo: true, orden: 1 },
  { id: 'pro', nombre: 'Pro', precio_mensual: 5000, precio_anual: 50000, limite_obras_activas: 2, limite_empleados: 10, caracteristicas: [], activo: true, orden: 2 },
  { id: 'pyme', nombre: 'Pyme', precio_mensual: 20000, precio_anual: 200000, limite_obras_activas: 5, limite_empleados: 20, caracteristicas: [], activo: true, orden: 3 },
  { id: 'empresa', nombre: 'Empresa', precio_mensual: 50000, precio_anual: 500000, limite_obras_activas: 999, limite_empleados: 999, caracteristicas: [], activo: true, orden: 4 },
];

function newUser(email, password, extra) {
  const u = {
    id: 'u-' + email, email, password,
    rol: 'gestor_obra', plan_id: 'free',
    subscription_status: 'trialing', subscription_end_date: null,
    gateway_customer_id: null, estado_cuenta: 'activo', empresa: '',
    trial_end: new Date(Date.now() + 45 * 86400000).toISOString(), paid_until: null,
    ultima_conexion: null, created_at: new Date().toISOString(),
    trial_ends_at: new Date(Date.now() + 45 * 86400000).toISOString(),
    telefono: null, direccion: null, nacionalidad: null, rubro: null, onboarding_completo: false,
    latitud: null, longitud: null, localidad: null, empresa_constructora: null, rubro_principal: null,
    perfil_tipo: null, obras_simultaneas: null, tamano_equipo: null,
  };
  Object.assign(u, extra || {});
  /* Blindaje admin (simula el trigger v8): admin/super_admin siempre activo y plan máximo */
  if (u.rol === 'admin' || u.rol === 'super_admin') {
    u.plan_id = 'empresa';
    u.subscription_status = 'active';
    u.estado_cuenta = 'activo';
    u.trial_end = null;
    u.trial_ends_at = null;
  }
  users.set(email, u);
  return u;
}
newUser('admin@test.com', 'secreto123', { rol: 'admin', plan_id: 'pro' });

function send(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(obj !== undefined ? JSON.stringify(obj) : '');
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
function eqVal(q) { return decodeURIComponent(String(q || '')).replace(/^eq\./, ''); }

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'apikey, authorization, content-type, prefer, range');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const url = req.url.split('?')[0];
  const query = Object.fromEntries(new URLSearchParams(req.url.split('?')[1] || ''));

  if (url === '/auth/v1/signup') {
    const b = await readBody(req);
    if (users.has(b.email)) { send(res, 400, { msg: 'User already registered' }); return; }
    const inv = invitaciones.get(b.email);
    const u = newUser(b.email, b.password, inv ? { rol: inv.rol, plan_id: inv.plan_id, empresa: inv.empresa } : {});
    if (inv) invitaciones.delete(b.email);   // vinculación: consume la invitación
    send(res, 200, { access_token: 'tok-' + b.email, refresh_token: 'rt-' + b.email, user: { id: u.id, email: u.email } });
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
      send(res, 200, { access_token: 'tok-' + m[1], refresh_token: 'rt-' + m[1], user: { id: users.get(m[1]).id, email: m[1] } });
      return;
    }
    send(res, 400, { error_description: 'Bad Request' }); return;
  }
  if (url === '/auth/v1/logout') { send(res, 204); return; }

  const email = userFromAuth(req);
  const u = email ? users.get(email) : null;

  if (url === '/rest/v1/profiles') {
    if (req.method === 'GET') {
      if (query.user_id) {
        const uid = eqVal(query.user_id);
        const found = [...users.values()].find(x => x.id === uid);
        send(res, 200, found ? [found] : []);
        return;
      }
      send(res, 200, [...users.values()]);
      return;
    }
    if (req.method === 'PATCH') {
      const b = await readBody(req);
      const uid = eqVal(query.user_id);
      const found = [...users.values()].find(x => x.id === uid);
      if (found) {
        Object.assign(found, b);
        /* Blindaje admin (simula el trigger de la v8): un admin/super_admin
           siempre queda activo con plan máximo, inmune a cambios manuales */
        if (found.rol === 'admin' || found.rol === 'super_admin') {
          found.plan_id = 'empresa';
          found.subscription_status = 'active';
          found.estado_cuenta = 'activo';
          found.trial_end = null;
          found.trial_ends_at = null;
        }
      }
      send(res, 204); return;
    }
    if (req.method === 'POST') {
      const b = await readBody(req);
      newUser(b.email || ('invitado' + Date.now() + '@test.com'), '', b);
      send(res, 201, []); return;
    }
    if (req.method === 'DELETE') {
      const uid = eqVal(query.user_id);
      const found = [...users.values()].find(x => x.id === uid);
      if (found) users.delete(found.email);
      send(res, 204); return;
    }
  }

  if (url === '/rest/v1/planes') {
    if (req.method === 'GET') { send(res, 200, PLANES); return; }
    if (req.method === 'PATCH') {
      const b = await readBody(req);
      const id = eqVal(query.id);
      const p = PLANES.find(x => x.id === id);
      if (p) Object.assign(p, b);
      send(res, 204); return;
    }
  }

  if (url === '/rest/v1/negocio') {
    if (req.method === 'GET') { send(res, 200, [negocio]); return; }
    if (req.method === 'PATCH') { const b = await readBody(req); Object.assign(negocio, b); send(res, 204); return; }
  }

  if (url === '/rest/v1/credenciales_pago') {
    if (req.method === 'GET') { send(res, 200, [cpago]); return; }
    if (req.method === 'PATCH') { const b = await readBody(req); Object.assign(cpago, b); send(res, 204); return; }
  }

  if (url === '/rest/v1/auditoria') {
    if (req.method === 'GET') { send(res, 200, auditoria); return; }
    if (req.method === 'POST') {
      const b = await readBody(req);
      auditoria.push({ id: auditoria.length + 1, user_id: u ? u.id : null, accion: b.accion, detalle: b.detalle, fecha: new Date().toISOString() });
      send(res, 201, []); return;
    }
  }

  if (url === '/rest/v1/invitaciones') {
    if (req.method === 'GET') { send(res, 200, [...invitaciones.values()]); return; }
    if (req.method === 'POST') {
      const b = await readBody(req);
      invitaciones.set(b.email, { email: b.email, rol: b.rol || 'gestor_obra', plan_id: b.plan_id || 'free', empresa: b.empresa || '', estado: b.estado || 'pendiente', created_at: new Date().toISOString() });
      send(res, 201, []); return;
    }
    if (req.method === 'DELETE') {
      const em = eqVal(query.email);
      invitaciones.delete(em);
      send(res, 204); return;
    }
  }

  if (url === '/rest/v1/rpc/metricas') {
    const all = [...users.values()];
    const activos = all.filter(x => x.estado_cuenta === 'activo');
    const obras = [...appData.values()].reduce((acc, a) => acc + ((a.data && a.data.works) ? a.data.works.length : 0), 0);
    const mrr = PLANES.reduce((s, p) => s + (p.precio_mensual || 0) * all.filter(x => x.plan_id === p.id && x.estado_cuenta === 'activo').length, 0);
    const arr = PLANES.reduce((s, p) => s + (p.precio_anual || 0) * all.filter(x => x.plan_id === p.id && x.estado_cuenta === 'activo').length, 0);
    const porPlan = {};
    PLANES.forEach(p => { porPlan[p.nombre] = all.filter(x => x.plan_id === p.id).length; });
    const convBase = all.filter(x => ['active', 'trialing', 'past_due', 'canceled'].includes(x.subscription_status)).length;
    const conversion = convBase ? Math.round(1000 * all.filter(x => x.subscription_status === 'active').length / convBase) / 10 : 0;
    send(res, 200, { mrr, arr, usuarios: all.length, activos: activos.length, past_due: 0, obras, conversion, por_plan: porPlan });
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
      /* admin puede leer los datos de OTRO usuario (auditoría de soporte) */
      if (query.user_id) {
        const uid = eqVal(query.user_id);
        const esAdmin = u && (u.rol === 'admin' || u.rol === 'super_admin');
        if (uid !== u.id && !esAdmin) { send(res, 200, []); return; }
        const row = appData.get(uid);
        send(res, 200, row ? [{ data: row.data, updated_at: row.updated_at }] : []);
        return;
      }
      const row = appData.get(u.id);
      send(res, 200, row ? [{ data: row.data, updated_at: row.updated_at }] : []);
      return;
    }
  }

  send(res, 404, { message: 'No encontrado' });
});

server.listen(9333, () => console.log('Mock Supabase (admin v3) escuchando en http://localhost:9333'));
