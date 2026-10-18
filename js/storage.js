/* ============================================================
   GADU · Adaptador de almacenamiento (localForage → IndexedDB)
   Con fallback silencioso a localStorage si localForage falta.
   ============================================================ */
(function (root) {
  'use strict';
  const G = root.GADU = root.GADU || {};

  /* 1) Crear instancia de localForage si está disponible */
  let lf = null;
  try {
    if (typeof localforage !== 'undefined') {
      lf = localforage.createInstance({
        name: 'gadu_store',
        storeName: 'kv',
        description: 'Almacén offline de GADU',
      });
    }
  } catch (e) { lf = null; }

  /* 2) Fallback a localStorage (misma semántica, devuelve Promises) */
  const lsFallback = {
    get(k) { try { return Promise.resolve(localStorage.getItem(k)); } catch (e) { return Promise.resolve(null); } },
    set(k, v) { try { localStorage.setItem(k, v); return Promise.resolve(v); } catch (e) { return Promise.resolve(null); } },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} return Promise.resolve(); },
  };

  const backend = lf || lsFallback;

  async function get(key) {
    try { return await backend.get(key); } catch (e) { return null; }
  }
  async function set(key, value) {
    try { return await backend.set(key, value); } catch (e) { return null; }
  }
  async function del(key) {
    try { await backend.del(key); } catch (e) {}
  }

  G.storage = { get, set, del, isIDB: !!lf };
})(typeof window !== 'undefined' ? window : globalThis);
