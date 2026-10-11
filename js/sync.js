/* ============================================================
   GADU SaaS · Sincronización por usuario (Supabase / PostgREST)
   Cada usuario logueado tiene UNA fila con todos sus datos.
   La seguridad la aplica Supabase (RLS por user_id): nadie
   puede leer ni escribir los datos de otro usuario.
   ============================================================ */
(function (root) {
  'use strict';
  const G = root.GADU = root.GADU || {};

  function baseUrl() {
    return G.auth.SUPABASE_URL + '/rest/v1';
  }

  function headers() {
    return {
      'apikey': G.auth.SUPABASE_ANON_KEY,
      'Authorization': 'Bearer ' + ((G.auth.getSession() && G.auth.getSession().accessToken) || ''),
      'Content-Type': 'application/json',
    };
  }

  function notAuthed(res) { return res.status === 401 || res.status === 403; }

  /* fetch con timeout: evita que la UI quede "cargando" para siempre */
  function fetchT(url, opts, ms) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms || 12000);
    return fetch(url, Object.assign({}, opts, { signal: ctrl.signal })).finally(() => clearTimeout(t));
  }

  /* Prueba de conexión */
  async function test() {
    const res = await fetchT(baseUrl() + '/app_data?select=id&limit=1', { headers: headers() });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return true;
  }

  /* Subir los datos actuales (upsert de la fila del usuario) */
  async function push(data) {
    const res = await fetchT(baseUrl() + '/app_data?on_conflict=user_id', {
      method: 'POST',
      headers: Object.assign(headers(), { 'Prefer': 'resolution=merge-duplicates' }),
      body: JSON.stringify({ data: data, updated_at: new Date().toISOString() }),
    });
    if (notAuthed(res)) {
      const r = await G.auth.refresh();
      if (r) return push(data);
    }
    if (!res.ok) {
      let msg = 'HTTP ' + res.status;
      try { const j = await res.json(); msg = j.message || j.msg || j.error_description || msg; } catch (e) {}
      throw new Error(msg);
    }
    return true;
  }

  /* Descargar los datos del usuario desde la nube (null si no hay) */
  async function pull() {
    const uid = G.auth.getSession() ? G.auth.getSession().userId : null;
    const url = baseUrl() + '/app_data?select=data,updated_at&user_id=eq.' + encodeURIComponent(uid || '') + '&limit=1';
    const res = await fetchT(url, { headers: headers() });
    if (notAuthed(res)) {
      const r = await G.auth.refresh();
      if (r) return pull();
    }
    if (!res.ok) {
      let msg = 'HTTP ' + res.status;
      try { const j = await res.json(); msg = j.message || j.msg || msg; } catch (e) {}
      throw new Error(msg);
    }
    const arr = await res.json();
    if (!Array.isArray(arr) || !arr.length || !arr[0].data) return null;
    return { data: arr[0].data, updatedAt: arr[0].updated_at };
  }

  /* Sincronización automática (con pausa para agrupar guardados) */
  let timer = null;
  function schedulePush() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (!G.store || !G.store.data) return;
      const cfg = G.store.data.settings && G.store.data.settings.cloud;
      if (!cfg || !cfg.autoPush) return;
      push(G.store.data).then(() => {
        if (G.store && G.store.data) {
          G.store.data.settings.lastCloudSync = new Date().toISOString();
        }
      }).catch(err => {
        if (G.ui && G.ui.toast) G.ui.toast('No se pudo sincronizar con la nube: ' + ((err && err.message) || err), 'error');
      });
    }, 2500);
  }

  G.sync = { baseUrl, headers, test, push, pull, schedulePush };
})(typeof window !== 'undefined' ? window : globalThis);
