/* ============================================================
   GADU SaaS · Planes, límites por suscripción y API admin
   - Carga el perfil completo (rol, plan, cobranza) y el catálogo de planes.
   - Expone G.api (CRUD PostgREST) y G.plan (límites, permisos, auditoría).
   ============================================================ */
(function (root) {
  'use strict';
  const G = root.GADU = root.GADU || {};

  const ROLES = ['super_admin', 'admin', 'gestor_obra', 'contador'];
  let profile = null;
  let planes = [];

  function authHeaders(json) {
    const h = {
      'apikey': G.auth.SUPABASE_ANON_KEY,
      'Authorization': 'Bearer ' + ((G.auth.getSession() && G.auth.getSession().accessToken) || ''),
    };
    if (json) h['Content-Type'] = 'application/json';
    return h;
  }

  /* CRUD genérico contra PostgREST (con refresh automático de token) */
  async function api(method, path, body) {
    const res = await fetch(G.auth.SUPABASE_URL + '/rest/v1' + path, {
      method,
      headers: authHeaders(!!body),
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401) { await G.auth.refresh(); return api(method, path, body); }
    if (!res.ok) {
      let m = 'HTTP ' + res.status;
      try { const j = await res.json(); m = j.message || j.msg || m; } catch (e) {}
      throw new Error(m);
    }
    const txt = await res.text();
    return txt ? JSON.parse(txt) : null;
  }

  async function load() {
    const uid = G.auth.getSession() ? G.auth.getSession().userId : null;
    try {
      const rows = await api('GET', '/profiles?select=*&user_id=eq.' + encodeURIComponent(uid));
      profile = (rows && rows[0]) || null;
    } catch (e) { profile = null; }
    try {
      planes = (await api('GET', '/planes?select=*&activo=eq.true&order=orden.asc')) || [];
    } catch (e) { planes = []; }
    return { profile, planes };
  }

  function isAdmin() { return !!(profile && (profile.rol === 'admin' || profile.rol === 'super_admin')); }

  function currentPlan() {
    if (planes.length && profile) {
      const p = planes.find(x => x.id === profile.plan_id);
      if (p) return p;
    }
    return { id: 'free', nombre: 'Free', limite_obras_activas: 1, limite_empleados: 3, caracteristicas: [] };
  }

  function worksActive() { return (G.store.data.works || []).filter(w => w.status === 'activa').length; }
  function employeesCount() { return (G.store.data.employees || []).filter(e => e.active !== false).length; }

  function limitFor(kind) {
    const p = currentPlan();
    return kind === 'obras' ? (p.limite_obras_activas || 1) : (p.limite_empleados || 3);
  }

  function wouldExceed(kind) {
    const p = currentPlan();
    const count = kind === 'obras' ? worksActive() : employeesCount();
    const limit = kind === 'obras' ? (p.limite_obras_activas || 1) : (p.limite_empleados || 3);
    return count >= limit;
  }

  /* Devuelve true si puede crear; false si alcanzó el límite (y muestra aviso + modal) */
  function checkLimit(kind) {
    if (!wouldExceed(kind)) return true;
    if (G.ui && G.ui.toast) G.ui.toast('Llegaste al límite de tu plan ' + currentPlan().nombre, 'warning');
    if (G.upgrade) G.upgrade();
    return false;
  }

  async function log(accion, detalle) {
    try { await api('POST', '/auditoria', { accion: accion, detalle: detalle || '' }); } catch (e) {}
  }

  G.api = api;
  G.plan = {
    ROLES, load, isAdmin, currentPlan, worksActive, employeesCount, limitFor, wouldExceed, checkLimit, log,
    get profile() { return profile; },
    get planes() { return planes; },
  };
})(typeof window !== 'undefined' ? window : globalThis);
