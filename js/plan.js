/* ============================================================
   GADU SaaS · Planes, límites por suscripción y API admin
   - Carga el perfil completo (rol, plan, cobranza) y el catálogo de planes.
   - Expone G.api (CRUD PostgREST) y G.plan (límites, permisos, auditoría).
   ============================================================ */
(function (root) {
  'use strict';
  const G = root.GADU = root.GADU || {};

  /* Configuración de integraciones. Pegá tu API key de Google Maps
     (con Maps JavaScript API y Places API habilitados) para activar
     el autocompletado de direcciones en el onboarding. */
  G.config = { googleMapsKey: '' };

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
    const sess = G.auth.getSession();
    const uid = sess ? sess.userId : null;
    try {
      const rows = await api('GET', '/profiles?select=*&user_id=eq.' + encodeURIComponent(uid));
      profile = (rows && rows[0]) || null;
    } catch (e) { profile = null; }
    /* Fallback seguro: si el trigger no creó el perfil, lo insertamos (jamás bloquea) */
    if (!profile && uid) {
      try {
        const email = (sess && sess.email) || '';
        await api('POST', '/profiles?on_conflict=user_id', {
          user_id: uid,
          email: email,
          nombre: email ? email.split('@')[0] : '',
          apellido: '',
          rol: 'gestor_obra',
          plan_id: 'free',
          empresa: '',
          subscription_status: 'trialing',
          estado_cuenta: 'activo',
          trial_end: new Date(Date.now() + 45 * 86400000).toISOString(),
          trial_ends_at: new Date(Date.now() + 45 * 86400000).toISOString(),
        });
        const rows2 = await api('GET', '/profiles?select=*&user_id=eq.' + encodeURIComponent(uid));
        profile = (rows2 && rows2[0]) || null;
      } catch (e) { profile = null; }
    }
    try {
      planes = (await api('GET', '/planes?select=*&activo=eq.true&order=orden.asc')) || [];
    } catch (e) { planes = []; }
    try {
      const neg = await api('GET', '/negocio?id=eq.1');
      G.config.negocio = (neg && neg[0]) || {};
    } catch (e) { G.config.negocio = {}; }
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

  /* Días restantes del período de prueba (null si no aplica) */
  function trialDaysLeft() {
    if (!profile) return null;
    const end = profile.trial_ends_at || profile.trial_end;
    if (!end) return null;
    return Math.max(0, Math.ceil((new Date(end).getTime() - Date.now()) / 86400000));
  }

  /* ¿El usuario debe completar el onboarding? (nuevo en Plan Free sin perfil) */
  function needsOnboarding() {
    if (!profile) return false;
    if (isAdmin()) return false;   // los administradores nunca pasan por onboarding
    if (profile.plan_id !== 'free') return false;
    return !profile.onboarding_completo;
  }

  /* ¿La cuenta está bloqueada? Los administradores NUNCA se bloquean. */
  function isLocked() {
    if (!profile) return false;
    if (isAdmin()) return false;   // excepción absoluta
    if (profile.estado_cuenta === 'suspendido') return true;
    const st = profile.subscription_status || 'trialing';
    if (st === 'expired' || st === 'past_due' || st === 'canceled') return true;
    return trialDaysLeft() === 0;
  }

  /* ============================================================
     Licencias por código (extensión de 90 días) · Mock local
     ============================================================ */
  const CODIGOS_PRUEBA = ['GADU90-PRUEBA', 'GADU90-TEST', 'GADU90-DEMO'];

  /* Mock: un código es válido si empieza con "GADU90-" / "GADU-90D-"
     o coincide con la lista de prueba. */
  function validarCodigo(code) {
    const c = String(code || '').trim().toUpperCase();
    if (!c) return false;
    return c.indexOf('GADU90-') === 0 || c.indexOf('GADU-90D-') === 0 || CODIGOS_PRUEBA.indexOf(c) !== -1;
  }

  function diasRestantes() { return trialDaysLeft(); }
  function fechaVencimiento() {
    if (!profile) return null;
    return profile.trial_ends_at || profile.trial_end || null;
  }

  /* Canjea un código: extiende el acceso 90 días y desbloquea la app */
  async function canjearCodigo(code) {
    if (!validarCodigo(code)) return { ok: false, error: 'Código incorrecto o vencido' };
    const sess = G.auth.getSession();
    const uid = sess ? sess.userId : null;
    if (!uid) return { ok: false, error: 'Sin sesión activa' };
    const nuevaFecha = new Date(Date.now() + 90 * 86400000).toISOString();
    try {
      await api('PATCH', '/profiles?user_id=eq.' + encodeURIComponent(uid), {
        trial_ends_at: nuevaFecha,
        trial_end: nuevaFecha,
        paid_until: nuevaFecha,
        subscription_status: 'active',
        estado_cuenta: 'activo',
      });
      await load();   // recargar perfil para reflejar el nuevo vencimiento
      return { ok: true, vencimiento: nuevaFecha };
    } catch (e) {
      return { ok: false, error: 'No se pudo activar: ' + ((e && e.message) || e) };
    }
  }

  G.api = api;
  G.plan = {
    ROLES, load, isAdmin, currentPlan, worksActive, employeesCount, limitFor, wouldExceed, checkLimit, log, trialDaysLeft, needsOnboarding, isLocked,
    validarCodigo, canjearCodigo, diasRestantes, fechaVencimiento,
    get profile() { return profile; },
    get planes() { return planes; },
  };
})(typeof window !== 'undefined' ? window : globalThis);
