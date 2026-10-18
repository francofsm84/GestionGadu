/* ============================================================
   GADU · Portal público de obra (vista del cliente, sin sesión)
   Ruta: #/portal/<publicToken>
   Llama al RPC get_public_work_data (SECURITY DEFINER) que solo
   devuelve datos públicos: nombre, dirección, avances y fotos.
   ============================================================ */
(function (root) {
  'use strict';
  const G = root.GADU, UI = G.ui;

  const SUPABASE_URL = (G.auth && G.auth.SUPABASE_URL) || '';
  const SUPABASE_ANON_KEY = (G.auth && G.auth.SUPABASE_ANON_KEY) || '';

  /* Registro en el router (el arranque igual lo renderiza de forma standalone) */
  G.router.add('portal', 'portal/:token', 'Avance de Obra', 'Portal público', render);

  const STATUS_LABEL = { activa: 'Activa', pausada: 'Pausada', finalizada: 'Finalizada' };

  function empty(msg) {
    return '<div class="portal-empty"><div style="font-size:42px;margin-bottom:8px">🔒</div><strong>' + msg + '</strong></div>';
  }

  function portalHTML(w) {
    const physical = Math.max(0, Math.min(100, Math.round(Number(w.physicalProgress) || 0)));
    const billing = Math.max(0, Math.min(100, Math.round(Number(w.billingProgress) || 0)));
    const status = STATUS_LABEL[w.status] || 'Activa';
    const photos = Array.isArray(w.photos) ? w.photos.filter(Boolean) : [];

    return '<div class="portal-wrap">' +
      '<div class="portal-card">' +
        '<div class="portal-head">' +
          '<div class="portal-logo">GADU <span>Construye</span></div>' +
          '<div class="portal-chip">' + status + '</div>' +
        '</div>' +
        '<h1 class="portal-title">' + UI.escapeHtml(w.name || 'Obra') + '</h1>' +
        '<p class="portal-addr">📍 ' + UI.escapeHtml(w.address || 'Sin dirección') + '</p>' +
        '<div class="portal-bar-item">' +
          '<div class="portal-bar-label"><span>Avance Físico</span><b>' + physical + '%</b></div>' +
          '<div class="portal-bar"><div class="portal-bar-fill" style="width:' + physical + '%"></div></div>' +
        '</div>' +
        '<div class="portal-bar-item">' +
          '<div class="portal-bar-label"><span>Avance de Cobro</span><b>' + billing + '%</b></div>' +
          '<div class="portal-bar"><div class="portal-bar-fill portal-bar-fill--info" style="width:' + billing + '%"></div></div>' +
        '</div>' +
        (photos.length ? '<div class="portal-photos">' + photos.map(p => '<img src="' + UI.escapeHtml(p) + '" alt="Foto de la obra">').join('') + '</div>' : '') +
        '<p class="portal-foot">Datos actualizados automáticamente · Generado por GADU</p>' +
      '</div></div>';
  }

  async function render(token) {
    const t = typeof token === 'string' ? token : ((token && token.token) || '');
    document.body.classList.add('no-session');
    const prev = document.getElementById('portalRoot');
    if (prev) prev.remove();
    const host = document.createElement('div');
    host.id = 'portalRoot';
    host.innerHTML = '<div class="portal-empty">Cargando avance…</div>';
    document.body.appendChild(host);

    if (!t) { host.innerHTML = empty('Este enlace no es válido.'); return; }

    try {
      const res = await fetch(SUPABASE_URL + '/rest/v1/rpc/get_public_work_data', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ p_token: t }),
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      const work = Array.isArray(data) ? data[0] : data;
      if (!work || !work.name) {
        host.innerHTML = empty('Este enlace ya no es válido o la obra fue eliminada.');
        return;
      }
      host.innerHTML = portalHTML(work);
    } catch (e) {
      console.error('[GADU-PORTAL] error cargando:', e);
      host.innerHTML = empty('No se pudo cargar el avance. Probá de nuevo en unos minutos.');
    }
  }

  G.portal = { render };
})(typeof window !== 'undefined' ? window : globalThis);
