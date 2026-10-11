/* ============================================================
   GADU SaaS · Autenticación con Supabase Auth
   Registro, inicio de sesión, refresco de sesión y perfil.
   La URL y la clave pública están embebidas: son datos
   públicos de la instancia GADU (diseño estándar de SaaS).
   ============================================================ */
(function (root) {
  'use strict';
  const G = root.GADU = root.GADU || {};

  let SUPABASE_URL = 'https://kalqvykomlfwxmsdaipf.supabase.co';
  let SUPABASE_ANON_KEY = 'sb_publishable_QFhRFnw-ndqcct6XkYb-GA_SCNVAal2';
  const SKEY = 'gadu_auth_v1';

  /* Solo para pruebas: apuntar a otro servidor (mock local) */
  function override(url, key) {
    SUPABASE_URL = url;
    SUPABASE_ANON_KEY = key;
    if (G.auth) {
      G.auth.SUPABASE_URL = url;
      G.auth.SUPABASE_ANON_KEY = key;
    }
  }

  const storage = (typeof localStorage !== 'undefined')
    ? localStorage
    : { getItem: () => null, setItem: () => {}, removeItem: () => {} };

  let session = null;

  function load() {
    try { session = JSON.parse(storage.getItem(SKEY)) || null; } catch (e) { session = null; }
    return session;
  }
  function setSession(s) {
    session = s;
    try { if (s) storage.setItem(SKEY, JSON.stringify(s)); else storage.removeItem(SKEY); } catch (e) {}
    return session;
  }
  function getSession() { return session; }
  function clear() { return setSession(null); }

  function headers(json) {
    const h = {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': 'Bearer ' + (session && session.accessToken ? session.accessToken : ''),
    };
    if (json) h['Content-Type'] = 'application/json';
    return h;
  }

  /* fetch con timeout (evita que login/sincronización queden colgados) */
  function fetchT(url, opts, ms) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms || 10000);
    return fetch(url, Object.assign({}, opts, { signal: ctrl.signal })).finally(() => clearTimeout(t));
  }

  async function signup(email, password) {
    const res = await fetchT(SUPABASE_URL + '/auth/v1/signup', {
      method: 'POST',
      headers: { 'apikey': SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    let j = null;
    try { j = await res.json(); } catch (e) {}
    if (!res.ok) throw new Error((j && (j.msg || j.message)) || ('Error ' + res.status));
    if (!j.session) throw new Error('CONFIRMA_EMAIL');
    setSession({
      accessToken: j.session.access_token,
      refreshToken: j.session.refresh_token,
      email: j.user && j.user.email,
      userId: j.user && j.user.id,
    });
    return true;
  }

  async function login(email, password) {
    const res = await fetchT(SUPABASE_URL + '/auth/v1/token?grant_type=password', {
      method: 'POST',
      headers: { 'apikey': SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    let j = null;
    try { j = await res.json(); } catch (e) {}
    if (!res.ok) throw new Error((j && (j.error_description || j.msg || j.message)) || 'Credenciales inválidas');
    setSession({
      accessToken: j.access_token,
      refreshToken: j.refresh_token,
      email: j.user && j.user.email,
      userId: j.user && j.user.id,
    });
    return true;
  }

  async function refresh() {
    if (!session || !session.refreshToken) return null;
    try {
      const res = await fetchT(SUPABASE_URL + '/auth/v1/token?grant_type=refresh_token', {
        method: 'POST',
        headers: { 'apikey': SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: session.refreshToken }),
      });
      if (!res.ok) { clear(); return null; }
      const j = await res.json();
      if (!j || !j.access_token) { clear(); return null; }
      return setSession({
        accessToken: j.access_token,
        refreshToken: j.refresh_token,
        email: j.user && j.user.email,
        userId: j.user && j.user.id,
      });
    } catch (e) { return session; }
  }

  async function logout() {
    try { await fetch(SUPABASE_URL + '/auth/v1/logout', { method: 'POST', headers: headers() }); } catch (e) {}
    clear();
  }

  /* Perfil (plan y vencimientos) del usuario actual */
  async function getProfile() {
    const uid = session ? session.userId : null;
    const url = SUPABASE_URL + '/rest/v1/profiles?select=plan,trial_end,paid_until,email' +
      (uid ? '&user_id=eq.' + encodeURIComponent(uid) : '') + '&limit=1';
    const res = await fetchT(url, { headers: headers() });
    if (!res.ok) {
      if (res.status === 401) { const r = await refresh(); if (r) return getProfile(); }
      throw new Error('HTTP ' + res.status);
    }
    const arr = await res.json();
    return arr[0] || null;
  }

  /* ---------- Inicio de sesión con Google (OAuth) ---------- */
  function googleAuthURL() {
    const redirect = location.origin + location.pathname;
    return SUPABASE_URL + '/auth/v1/authorize?provider=google&redirect_to=' + encodeURIComponent(redirect);
  }
  function signInWithGoogle() {
    location.assign(googleAuthURL());
  }
  /* Al volver de Google, Supabase deja access_token/refresh_token en el hash.
     Lo parseamos, obtenemos el usuario y armamos la sesión. Devuelve true si
     se inició sesión (para que el boot no pinte el login). */
  async function handleOAuthRedirect() {
    try {
      const h = location.hash || '';
      if (h.indexOf('access_token') === -1) return false;
      const params = new URLSearchParams(h.replace(/^#/, ''));
      const at = params.get('access_token');
      const rt = params.get('refresh_token');
      if (!at || !rt) { try { location.hash = ''; } catch (e) {} return false; }
      try { location.hash = ''; } catch (e) {}
      const res = await fetchT(SUPABASE_URL + '/auth/v1/user', {
        headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + at },
      });
      if (!res.ok) return false;
      const u = await res.json();
      setSession({ accessToken: at, refreshToken: rt, email: u.email, userId: u.id });
      return true;
    } catch (e) { return false; }
  }

  G.auth = { SUPABASE_URL, SUPABASE_ANON_KEY, override, load, setSession, getSession, clear, headers, signup, login, refresh, logout, getProfile, signInWithGoogle, handleOAuthRedirect };
})(typeof window !== 'undefined' ? window : globalThis);
