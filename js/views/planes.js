/* ============================================================
   GADU · Vista: Planes y Suscripción
   Tarjetas de planes, banner de prueba gratis y contacto por WhatsApp
   ============================================================ */
(function (root) {
  'use strict';
  const G = root.GADU, UI = G.ui;

  G.router.add('planes', 'planes', 'Planes y Suscripción', 'Elegí el plan ideal para tu constructora', render);

  const BOT = G.BOT_PHONE_NUMBER || '5493547665984';

  /* Períodos de facturación: Trimestral / Semestral / Anual */
  const PERIODOS = [
    { id: 'trimestral', label: 'Trimestral', dias: 90, campo: 'precio_mensual' },
    { id: 'semestral', label: 'Semestral', dias: 180, campo: 'precio_semestral' },
    { id: 'anual', label: 'Anual', dias: 365, campo: 'precio_anual' },
  ];
  const state = { periodo: 'trimestral' };

  function bannerHTML(days) {
    if (days == null) return '';
    return days > 0
      ? '<div class="card" style="border-left:3px solid var(--warning);margin-bottom:14px">' +
          '<strong>⏳ Período de prueba</strong>' +
          '<p class="muted" style="margin:4px 0 0">Estás en período de prueba. Te quedan <b>' + days + ' día' + (days !== 1 ? 's' : '') + '</b>. ¡Mejorá tu plan para no perder tus obras!</p>' +
        '</div>'
      : '<div class="card" style="border-left:3px solid var(--danger);margin-bottom:14px">' +
          '<strong>⚠️ Tu prueba ha expirado</strong>' +
          '<p class="muted" style="margin:4px 0 0">Tu prueba ha expirado. Estás en el Plan Básico (1 obra). Actualizá a PRO para desbloquear todo.</p>' +
        '</div>';
  }

  function cardHTML(p, actualId, periodo) {
    const destacado = !!p.destacado;
    const esActual = p.id === actualId;
    const per = PERIODOS.find(x => x.id === (periodo || 'trimestral')) || PERIODOS[0];
    /* Título limpio: solo el nombre del plan (los días van en el precio) */
    const titulo = p.nombre || ({ free: 'Prueba', pyme: 'PYME', pro: 'PRO', empresa: 'Empresa' })[p.id] || 'Plan';
    const precioValor = Number(p[per.campo] || 0);
    const precio = precioValor > 0
      ? '$' + UI.fmtNum(precioValor) + '<span class="muted small">/' + per.dias + ' días</span>'
      : 'Gratis';
    const feats = [
      (p.limite_obras_activas >= 999 ? 'Obras ilimitadas' : p.limite_obras_activas + ' obra' + (Number(p.limite_obras_activas) !== 1 ? 's' : '') + ' activa' + (Number(p.limite_obras_activas) !== 1 ? 's' : '')),
      (p.limite_empleados >= 999 ? 'Empleados ilimitados' : p.limite_empleados + ' empleados'),
    ];
    return '<div class="card plan-card' + (esActual ? ' plan-card-actual' : '') + '">' +
      '<div class="split-row"><strong>' + UI.escapeHtml(titulo) + '</strong>' + (destacado ? UI.chip('Más elegido', 'info') : '') + '</div>' +
      '<div class="plan-price">' + precio + '</div>' +
      '<ul class="plan-feats">' + feats.map(f => '<li>' + UI.escapeHtml(f) + '</li>').join('') + '</ul>' +
      (esActual
        ? '<button class="btn btn-ghost btn-block" disabled>Plan actual</button>'
        : '<div class="stack" style="gap:6px">' +
          (precioValor > 0
            ? '<button class="btn btn-primary btn-block" data-buy="' + p.id + '" data-periodo="' + per.id + '">💳 Comprar con Tarjeta</button>'
            : '') +
          '<a class="btn ' + (precioValor > 0 ? 'btn-soft' : (destacado ? 'btn-primary' : 'btn-soft')) + ' btn-block" href="https://wa.me/' + BOT + '?text=' + encodeURIComponent('Hola, quiero pagar por transferencia el Plan ' + titulo + ' de GADU en formato ' + per.label + '.') + '" target="_blank" rel="noopener">' + (precioValor > 0 ? '💬 Pagar por Transferencia' : '💬 Suscribirme') + '</a>' +
          '</div>') +
      '</div>';
  }

  function fallbackHTML(periodo) {
    const cards = [
      { id: 'free', nombre: 'Prueba', precio_mensual: 0, precio_semestral: 0, precio_anual: 0, limite_obras_activas: 999, limite_empleados: 999 },
      { id: 'pyme', nombre: 'PYME', precio_mensual: 0, precio_semestral: 0, precio_anual: 0, limite_obras_activas: 5, limite_empleados: 10 },
      { id: 'pro', nombre: 'PRO', precio_mensual: 0, precio_semestral: 0, precio_anual: 0, limite_obras_activas: 999, limite_empleados: 999 },
      { id: 'empresa', nombre: 'Empresa', precio_mensual: 0, precio_semestral: 0, precio_anual: 0, limite_obras_activas: 999, limite_empleados: 999 },
    ];
    return '<div class="plans-grid">' + cards.map(p => cardHTML(p, '', periodo)).join('') + '</div>';
  }

  /* Toggle de período: Trimestral / Semestral / Anual */
  function periodoToggleHTML() {
    return '<div class="card" style="margin-bottom:14px;padding:10px 14px">' +
      '<div class="seg" style="justify-content:center">' +
      PERIODOS.map(per => '<button class="' + (state.periodo === per.id ? 'active' : '') + '" data-periodo="' + per.id + '">' + per.label + '</button>').join('') +
      '</div></div>';
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

  /* Compra con MercadoPago: crea la preferencia de pago y redirige al checkout */
  async function buyWithCard(planId, periodo) {
    const plan = ((G.plan && G.plan.planes) || []).find(p => p.id === planId);
    const per = PERIODOS.find(x => x.id === periodo) || PERIODOS[0];
    const amount = plan ? Number(plan[per.campo] || 0) : 0;
    if (!plan || amount <= 0) { UI.toast('Plan no disponible', 'error'); return; }
    const sess = G.auth.getSession();
    if (!sess || !sess.userId) { UI.toast('Iniciá sesión para comprar', 'error'); return; }
    UI.toast('Generando enlace de pago…', 'info');
    try {
      const res = await fetch(G.auth.SUPABASE_URL + '/functions/v1/create-payment-order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': G.auth.SUPABASE_ANON_KEY,
          'Authorization': 'Bearer ' + (sess.accessToken || sess.access_token || ''),
        },
        body: JSON.stringify({ planId, periodo, amount, userEmail: sess.email || '' }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || ('HTTP ' + res.status));
      if (!j.init_point) throw new Error('No se recibió el enlace de pago');
      window.location.href = j.init_point;   // redirigir a MercadoPago
    } catch (e) {
      UI.toast('❌ No se pudo iniciar el pago: ' + ((e && e.message) || e), 'error');
    }
  }

  function render(view) {
    const planes = (G.plan && G.plan.planes) || [];
    const actual = G.plan ? G.plan.currentPlan() : { id: '' };
    const prof = G.plan ? G.plan.profile : null;
    const st = prof ? prof.subscription_status : 'trialing';
    const days = G.plan ? G.plan.trialDaysLeft() : null;
    const expired = st === 'expired' || actual.id === 'free_basico';

    let banner = '';
    if (st === 'trialing' && days != null) banner = bannerHTML(days);
    else if (expired) banner = bannerHTML(0);

    view.innerHTML = redeemHTML() + banner + periodoToggleHTML() +
      (planes.length
        ? '<div class="plans-grid">' + planes.map(p => cardHTML(p, actual.id, state.periodo)).join('') + '</div>'
        : fallbackHTML(state.periodo));
    bindRedeem(view);
    /* Compra con tarjeta (MercadoPago) */
    view.querySelectorAll('[data-buy]').forEach(b => b.addEventListener('click', () => {
      buyWithCard(b.dataset.buy, b.dataset.periodo || state.periodo);
    }));
    /* Toggle de período: re-renderiza las tarjetas con el precio del período elegido */
    view.querySelectorAll('[data-periodo]').forEach(b => b.addEventListener('click', () => {
      state.periodo = b.dataset.periodo;
      render(view);
    }));
  }
})(typeof window !== 'undefined' ? window : globalThis);
