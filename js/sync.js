/* ============================================================
   GADU · Sincronización en la nube (Supabase / PostgREST)
   Sube y descarga los datos completos para compartirlos
   entre la PC y el celular. Configuración por dispositivo
   (URL del proyecto + anon public key + código de sincronización).
   ============================================================ */
(function (root) {
  'use strict';
  const G = root.GADU = root.GADU || {};

  function baseUrl(cfg) {
    let u = String(cfg.url || '').trim().replace(/\/+$/, '');
    if (!/\/rest\/v1$/.test(u)) u += '/rest/v1';
    return u;
  }
  function headers(cfg) {
    return {
      'apikey': cfg.anonKey || '',
      'Authorization': 'Bearer ' + (cfg.anonKey || ''),
      'Content-Type': 'application/json',
    };
  }
  function rowId(cfg) {
    return 'gadu-' + String(cfg.code || '').trim().toLowerCase().replace(/[^a-z0-9-_]/g, '');
  }

  function cfgOK(cfg) {
    return !!(cfg && cfg.url && cfg.anonKey && cfg.code);
  }

  /* Prueba de conexión: consulta barata al endpoint */
  async function test(cfg) {
    if (!cfgOK(cfg)) throw new Error('Faltan datos de configuración');
    const res = await fetch(baseUrl(cfg) + '/app_data?select=id&limit=1', { headers: headers(cfg) });
    if (!res.ok) {
      let msg = 'HTTP ' + res.status;
      try { const j = await res.json(); msg = j.message || j.msg || j.error_description || msg; } catch (e) {}
      throw new Error(msg);
    }
    return true;
  }

  /* Subir los datos actuales a la nube */
  async function push(cfg, data) {
    if (!cfgOK(cfg)) throw new Error('Faltan datos de configuración');
    const url = baseUrl(cfg) + '/app_data?id=eq.' + encodeURIComponent(rowId(cfg));
    const payload = JSON.stringify({ id: rowId(cfg), data: data, updated_at: new Date().toISOString() });
    const res = await fetch(url, {
      method: 'PATCH',
      headers: Object.assign(headers(cfg), { 'Prefer': 'resolution=merge-duplicates,return=representation' }),
      body: payload,
    });
    if (!res.ok) {
      let msg = 'HTTP ' + res.status;
      try { const j = await res.json(); msg = j.message || j.msg || j.error_description || msg; } catch (e) {}
      throw new Error(msg);
    }
    return true;
  }

  /* Descargar los datos desde la nube (null si no hay nada guardado) */
  async function pull(cfg) {
    if (!cfgOK(cfg)) throw new Error('Faltan datos de configuración');
    const url = baseUrl(cfg) + '/app_data?id=eq.' + encodeURIComponent(rowId(cfg)) + '&select=data,updated_at';
    const res = await fetch(url, { headers: headers(cfg) });
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
      if (!cfg || !cfg.autoPush || !cfgOK(cfg)) return;
      push(cfg, G.store.data).catch(err => {
        if (G.ui && G.ui.toast) G.ui.toast('No se pudo sincronizar con la nube: ' + ((err && err.message) || err), 'error');
      });
    }, 2500);
  }

  G.sync = { baseUrl, headers, rowId, cfgOK, test, push, pull, schedulePush };
})(typeof window !== 'undefined' ? window : globalThis);
