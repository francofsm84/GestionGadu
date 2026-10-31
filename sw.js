/* ============================================================
   GADU · Service Worker (PWA offline)
   - App Shell cacheado en install (incluye CDNs de localForage y html2pdf).
   - Cache-first en fetch (excluye la API de Supabase).
   ============================================================ */
const CACHE = 'gadu-cache-v7';

const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/styles.css',
  './logo-32.png',
  './logo-192.png',
  './logo-512.png',
  // Núcleo
  './js/storage.js',
  './js/store.js',
  './js/auth.js',
  './js/sync.js',
  './js/plan.js',
  './js/ui.js',
  './js/onboarding.js',
  './js/charts.js',
  './js/app.js',
  './js/ai.js',
  './js/services/whatsappWebhook.js',
  // Vistas
  './js/views/dashboard.js',
  './js/views/obras.js',
  './js/views/obra-detalle.js',
  './js/views/presupuestos.js',
  './js/views/ingresos.js',
  './js/views/gastos.js',
  './js/views/bandeja.js',
  './js/views/libro.js',
  './js/views/deudas.js',
  './js/views/socios.js',
  './js/views/seguros.js',
  './js/views/empleados.js',
  './js/views/jornadas.js',
  './js/views/clientes.js',
  './js/views/directorio.js',
  './js/views/herramientas.js',
  './js/views/agenda.js',
  './js/views/admin.js',
  './js/views/planes.js',
  './js/views/portal-cliente.js',
  './js/views/reportes.js',
  // CDNs (para funcionar offline tras la primera carga)
  'https://cdn.jsdelivr.net/npm/localforage@1.10.0/dist/localforage.min.js',
  'https://cdn.jsdelivr.net/npm/html2pdf.js@0.10.1/dist/html2pdf.bundle.min.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;

  const url = new URL(e.request.url);
  // La API de Supabase SIEMPRE va a la red (datos frescos, no cachear)
  if (
    url.pathname.indexOf('/rest/v1/') !== -1 ||
    url.pathname.indexOf('/auth/v1/') !== -1 ||
    url.pathname.indexOf('/storage/v1/') !== -1 ||
    url.pathname.indexOf('/functions/v1/') !== -1
  ) return;

  // Cache-first: devuelve del caché si existe, si no baja de la red y lo cachea.
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (res && res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      }).catch(() => cached);
    })
  );
});

/* ===== Notificaciones Push (Web Push API) ===== */
self.addEventListener('push', (e) => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch (err) { data = { body: e.data ? e.data.text() : '' }; }
  const title = data.title || 'GADU';
  const body = data.body || '';
  const url = data.url || '/';
  e.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: './logo-192.png',
      badge: './logo-192.png',
      data: { url },
      tag: data.tag || 'gadu',
    })
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if ('focus' in c) { c.navigate(url); return c.focus(); }
      }
      return self.clients.openWindow(url);
    })
  );
});
