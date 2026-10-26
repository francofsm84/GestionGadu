/* ============================================================
   GADU SaaS · Sincronización por usuario (Supabase / PostgREST)
   Cada usuario logueado tiene UNA fila con todos sus datos.
   La seguridad la aplica Supabase (RLS por user_id): nadie
   puede leer ni escribir los datos de otro usuario.
   ============================================================ */
(function (root) {
  'use strict';
  const G = root.GADU = root.GADU || {};

  /* Impersonación (solo lectura): el admin ve la app como un usuario.
     El flag se setea desde el panel Admin y la app carga los datos de ese id. */
  G.impersonate = {
    uid: () => { try { return localStorage.getItem('gadu_impersonate') || null; } catch (e) { return null; } },
    isActive: () => !!G.impersonate.uid(),
    clear: () => { try { localStorage.removeItem('gadu_impersonate'); } catch (e) {} },
  };

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

  /* Subir los datos actuales (upsert de la fila del usuario).
     En modo soporte (impersonación) NO se sube NADA: read-only estricto. */
  async function push(data) {
    if (G.impersonate && G.impersonate.isActive && G.impersonate.isActive()) return true;
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

  /* Descargar los datos del usuario desde la nube (null si no hay).
     En modo impersonación, carga los datos del usuario impersonado. */
  async function pull() {
    const impUid = (G.impersonate && G.impersonate.uid()) || null;
    const uid = impUid || (G.auth.getSession() ? G.auth.getSession().userId : null);
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

  /* ---------- Realtime: cambios de app_data en tiempo real ---------- */
  let rtSocket = null, rtTimer = null;

  function subscribeRealtime(onUpdate) {
    if (typeof WebSocket === 'undefined') return () => {};
    const uid = G.auth.getSession() ? G.auth.getSession().userId : null;
    if (!uid) return () => {};
    const wsUrl = G.auth.SUPABASE_URL.replace(/^http/, 'ws') +
      '/realtime/v1/websocket?apikey=' + encodeURIComponent(G.auth.SUPABASE_ANON_KEY) + '&vsn=1.0.0';
    const topic = 'realtime:public:app_data';
    let closed = false;

    function connect() {
      if (closed) return;
      try { rtSocket = new WebSocket(wsUrl); } catch (e) { return; }
      rtSocket.onopen = () => {
        rtSocket.send(JSON.stringify({
          topic: topic,
          event: 'phx_join',
          payload: { config: { postgres_changes: [{ event: '*', schema: 'public', table: 'app_data', filter: 'user_id=eq.' + uid }] } },
          ref: String(Date.now()),
        }));
        rtTimer = setInterval(() => {
          if (rtSocket.readyState === 1) rtSocket.send(JSON.stringify({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: String(Date.now()) }));
        }, 30000);
      };
      rtSocket.onmessage = (msg) => {
        let m; try { m = JSON.parse(msg.data); } catch (e) { return; }
        if (m.event !== 'postgres_changes') return;
        const d = m.payload && m.payload.data;
        const row = d && d.new;
        if (!row || row.user_id !== uid) return;
        try { if (typeof onUpdate === 'function') onUpdate(row.data, row.updated_at, row.user_id); } catch (e) {}
      };
      rtSocket.onclose = () => {
        clearInterval(rtTimer);
        if (!closed) setTimeout(connect, 3000);   // reconexión
      };
      rtSocket.onerror = () => { try { rtSocket.close(); } catch (e) {} };
    }
    connect();
    return () => { closed = true; clearInterval(rtTimer); try { rtSocket && rtSocket.close(); } catch (e) {} };
  }

  G.sync = { baseUrl, headers, test, push, pull, schedulePush, subscribeRealtime };
})(typeof window !== 'undefined' ? window : globalThis);
