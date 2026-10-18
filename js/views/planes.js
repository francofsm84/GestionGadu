/* ============================================================
   GADU · Vista: Planes y Suscripción
   Tarjetas de planes, banner de prueba gratis y contacto por WhatsApp
   ============================================================ */
(function (root) {
  'use strict';
  const G = root.GADU, UI = G.ui;

  G.router.add('planes', 'planes', 'Planes y Suscripción', 'Elegí el plan ideal para tu constructora', render);

  const BOT = G.BOT_PHONE_NUMBER || '5493547665984';

  function bannerHTML(days) {
    if (days == null) return '';
    return days > 0
      ? '<div class="card" style="border-left:3px solid var(--info);margin-bottom:14px">' +
          '<strong>⏳ Prueba gratis en curso</strong>' +
          '<p class="muted" style="margin:4px 0 0">Te quedan <b>' + days + ' día' + (days !== 1 ? 's' : '') + '</b> de prueba. Cuando termine, elegí un plan para seguir usando GADU.</p>' +
        '</div>'
      : '<div class="card" style="border-left:3px solid var(--danger);margin-bottom:14px">' +
          '<strong>⚠️ Tu prueba ha expirado</strong>' +
          '<p class="muted" style="margin:4px 0 0">Por favor, elegí un plan para continuar usando GADU.</p>' +
        '</div>';
  }

  function cardHTML(p, actualId) {
    const esPro = p.id === 'pro';
    const esActual = p.id === actualId;
    const precio = Number(p.precio_mensual) > 0
      ? '$' + UI.fmtNum(Number(p.precio_mensual)) + '<span class="muted small">/mes</span>'
      : 'Gratis';
    const feats = [
      (p.limite_obras_activas >= 999 ? 'Obras ilimitadas' : p.limite_obras_activas + ' obra' + (Number(p.limite_obras_activas) !== 1 ? 's' : '') + ' activa' + (Number(p.limite_obras_activas) !== 1 ? 's' : '')),
      (p.limite_empleados >= 999 ? 'Empleados ilimitados' : p.limite_empleados + ' empleados'),
    ];
    return '<div class="card plan-card' + (esActual ? ' plan-card-actual' : '') + '">' +
      '<div class="split-row"><strong>' + UI.escapeHtml(p.nombre) + '</strong>' + (esPro ? UI.chip('Más elegido', 'info') : '') + '</div>' +
      '<div class="plan-price">' + precio + '</div>' +
      '<ul class="plan-feats">' + feats.map(f => '<li>' + UI.escapeHtml(f) + '</li>').join('') + '</ul>' +
      (esActual
        ? '<button class="btn btn-ghost btn-block" disabled>Plan actual</button>'
        : '<a class="btn ' + (esPro ? 'btn-primary' : 'btn-soft') + ' btn-block" href="https://wa.me/' + BOT + '?text=' + encodeURIComponent('Hola! Quiero suscribirme al plan ' + p.nombre + ' de GADU.') + '" target="_blank" rel="noopener">' + UI.icon('whatsapp', 15) + ' Suscribirme</a>') +
      '</div>';
  }

  function fallbackHTML() {
    const cards = [
      { id: 'free', nombre: 'Prueba (45 días)', precio_mensual: 0, limite_obras_activas: 999, limite_empleados: 999 },
      { id: 'pyme', nombre: 'PYME', precio_mensual: 0, limite_obras_activas: 5, limite_empleados: 10 },
      { id: 'pro', nombre: 'PRO', precio_mensual: 0, limite_obras_activas: 999, limite_empleados: 999 },
      { id: 'empresa', nombre: 'Empresa', precio_mensual: 0, limite_obras_activas: 999, limite_empleados: 999 },
    ];
    return '<div class="plans-grid">' + cards.map(p => cardHTML(p, '')).join('') + '</div>';
  }

  function redeemHTML() {
    return '<div class="card" style="margin-bottom:14px">' +
      '<div class="card-head"><div><h3>¿Tenés un código de activación?</h3><p class="muted">Canjealo acá para activar tu plan al instante.</p></div></div>' +
      '<div class="split-row" style="gap:8px;flex-wrap:wrap">' +
      '<input class="input" id="codeInput" placeholder="Ej: GADU-8X2K9P" style="flex:1;min-width:200px;text-transform:uppercase;letter-spacing:1px">' +
      '<button class="btn btn-primary" id="btnRedeem">' + UI.icon('check', 15) + 'Canjear</button>' +
      '</div></div>';
  }

  function bindRedeem(view) {
    const input = view.querySelector('#codeInput');
    const btn = view.querySelector('#btnRedeem');
    if (!input || !btn) return;
    btn.addEventListener('click', async () => {
      const code = input.value.trim();
      if (!code) { UI.toast('Ingresá el código', 'error'); return; }
      btn.disabled = true;
      try {
        const res = await G.api('POST', '/rpc/canjear_licencia', { p_code: code });
        if (res && res.ok) {
          UI.toast('¡Felicidades! Plan activado hasta el ' + UI.fmtDate(res.vencimiento), 'success');
          try { await G.plan.load(); } catch (e) {}
          render(view);
        } else {
          UI.toast((res && res.error) || 'Código inválido', 'error');
        }
      } catch (e) {
        UI.toast('Código inválido', 'error');
      } finally {
        btn.disabled = false;
      }
    });
  }

  function render(view) {
    const planes = (G.plan && G.plan.planes) || [];
    const actual = G.plan ? G.plan.currentPlan() : { id: '' };
    const prof = G.plan ? G.plan.profile : null;
    const st = prof ? prof.subscription_status : 'trialing';
    const days = G.plan ? G.plan.trialDaysLeft() : null;

    view.innerHTML = redeemHTML() +
      bannerHTML(st === 'trialing' ? days : null) +
      (planes.length
        ? '<div class="plans-grid">' + planes.map(p => cardHTML(p, actual.id)).join('') + '</div>'
        : fallbackHTML());
    bindRedeem(view);
  }
})(typeof window !== 'undefined' ? window : globalThis);
