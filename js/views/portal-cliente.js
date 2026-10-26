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
    /* Pagos/certificados + bitácora + hitos: campos flexibles según el RPC.
       NUNCA se muestran costos, márgenes ni sueldos (solo lo que abonó el cliente). */
    const payments = Array.isArray(w.payments) ? w.payments
      : Array.isArray(w.cobros) ? w.cobros
      : Array.isArray(w.certificados) ? w.certificados : [];
    const bitacora = Array.isArray(w.bitacora) ? w.bitacora
      : Array.isArray(w.updates) ? w.updates
      : Array.isArray(w.novedades) ? w.novedades : [];
    const hitos = Array.isArray(w.hitos) ? w.hitos
      : Array.isArray(w.milestones) ? w.milestones
      : Array.isArray(w.etapas) ? w.etapas : [];
    /* Desglose financiero transparente (Contrato / Abonado / Saldo) */
    const contrato = Number(w.contractAmount || w.contract || w.budgetTotal || w.montoContrato || 0);
    const abonado = Number(w.paidAmount || w.abonado || w.totalAbonado || 0) ||
      payments.reduce((s, p) => s + Number(p.amount || p.monto || 0), 0);
    const saldo = Math.max(0, contrato - abonado);
    const updatedAt = w.updatedAt || w.updated_at || w.lastUpdate || w.last_update || '';

    return '<div class="portal-wrap">' +
      '<div class="portal-card" id="portalCardContent">' +
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
        (contrato > 0
          ? '<div class="portal-section"><h3 class="portal-section-title">Desglose financiero</h3>' +
            '<div class="portal-fin-row"><span>Monto del Contrato</span><b>' + UI.fmtMoney(contrato) + '</b></div>' +
            '<div class="portal-fin-row"><span>Total Abonado / Certificado</span><b class="pos">' + UI.fmtMoney(abonado) + '</b></div>' +
            '<div class="portal-fin-row"><span>Saldo Pendiente</span><b class="warning-text">' + UI.fmtMoney(saldo) + '</b></div>' +
            '</div>'
          : '') +
        (hitos.length
          ? '<div class="portal-section"><h3 class="portal-section-title">Hitos de avance</h3>' +
            hitos.map(h => {
              const est = String(h.status || h.estado || h.state || '').toLowerCase();
              const isDone = /complet|done|finaliz|terminad|ok|✓/.test(est);
              const isProgress = /progreso|curso|activo|doing|pendiente/.test(est);
              const label = h.name || h.nombre || h.titulo || h.title || 'Hito';
              return '<div class="portal-hito"><span class="portal-hito-dot ' + (isDone ? 'done' : isProgress ? 'progress' : '') + '"></span><span>' + UI.escapeHtml(label) + '</span></div>';
            }).join('') +
            '</div>'
          : '') +
        (payments.length
          ? '<div class="portal-section"><h3 class="portal-section-title">Pagos / Certificados</h3>' +
            payments.map(p => {
              const monto = Number(p.amount || p.monto || 0);
              const fecha = p.date || p.fecha || '';
              const det = p.concept || p.concepto || p.description || p.detalle || 'Pago';
              return '<div class="portal-pay-row"><span class="muted">' + (fecha ? UI.fmtDate(fecha) + ' · ' : '') + UI.escapeHtml(det) + '</span><b class="pos">' + UI.fmtMoney(monto) + '</b></div>';
            }).join('') +
            '</div>'
          : '') +
        (bitacora.length
          ? '<div class="portal-section"><h3 class="portal-section-title">Bitácora de avances</h3>' +
            bitacora.map(n => {
              const fecha = n.date || n.fecha || '';
              const nota = n.notes || n.nota || n.texto || n.detalle || '';
              return '<div class="portal-note"><span class="muted">' + (fecha ? UI.fmtDate(fecha) : '') + '</span><span>' + UI.escapeHtml(nota) + '</span></div>';
            }).join('') +
            '</div>'
          : '') +
        (photos.length
          ? '<div class="portal-section"><h3 class="portal-section-title">Fotos de avance</h3><div class="portal-photos">' + photos.map(p => '<img src="' + UI.escapeHtml(p) + '" alt="Foto de la obra">').join('') + '</div></div>'
          : '<p class="portal-no-photos">El contratista aún no ha subido fotos de avance.</p>') +
        '<div class="portal-foot">' +
          '<button class="btn btn-soft btn-sm" id="btnPdfPortal" style="margin-bottom:10px">' + UI.icon('download', 14) + ' Descargar PDF</button>' +
          (updatedAt ? '<div>Última actualización: ' + UI.fmtDate(updatedAt) + '</div>' : '') +
          '<div>Datos actualizados automáticamente · Generado por GADU</div>' +
        '</div>' +
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
      /* Descargar PDF: captura la tarjeta y genera el PDF con la misma estética */
      const btnPdf = host.querySelector('#btnPdfPortal');
      if (btnPdf) btnPdf.addEventListener('click', () => downloadPortalPDF(work));
    } catch (e) {
      console.error('[GADU-PORTAL] error cargando:', e);
      host.innerHTML = empty('No se pudo cargar el avance. Probá de nuevo en unos minutos.');
    }
  }

  function downloadPortalPDF(w) {
    if (typeof html2pdf === 'undefined') { return; }
    const card = document.getElementById('portalCardContent');
    if (!card) return;
    const btn = document.getElementById('btnPdfPortal');
    const filename = 'Avance_' + String(w.name || 'obra').replace(/[^a-z0-9áéíóúñ ]/gi, '').replace(/\s+/g, '_') + '.pdf';
    /* Captura limpia: ocultar el botón + fijar ancho centrado de la tarjeta */
    if (btn) btn.style.display = 'none';
    card.classList.add('portal-card-print');
    html2pdf().from(card).set({
      margin: [10, 10, 10, 10],
      filename,
      image: { type: 'jpeg', quality: 0.98 },
      /* useCORS + allowTaint: lee las fotos de la galería sin bloqueos de seguridad */
      html2canvas: { scale: 2, useCORS: true, allowTaint: true, logging: false },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    }).save().then(() => {
      if (btn) btn.style.display = '';
      card.classList.remove('portal-card-print');
    }).catch(() => {
      if (btn) btn.style.display = '';
      card.classList.remove('portal-card-print');
    });
  }

  G.portal = { render };
})(typeof window !== 'undefined' ? window : globalThis);
