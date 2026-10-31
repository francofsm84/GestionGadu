/* ============================================================
   GADU · Landing Page Premium (#/landing)
   Glassmorphism · gradientes · micro-animaciones · copy AR
   ============================================================ */
(function (root) {
  'use strict';
  const G = root.GADU;

  const PRICES = {
    pro:     { trimestral: 5000,  semestral: 9000,  anual: 16000,  dias: { trimestral: 90, semestral: 180, anual: 365 } },
    pyme:    { trimestral: 20000, semestral: 36000, anual: 64000,  dias: { trimestral: 90, semestral: 180, anual: 365 } },
    empresa: { trimestral: 50000, semestral: 90000, anual: 160000, dias: { trimestral: 90, semestral: 180, anual: 365 } },
  };
  const fmt = n => Number(n).toLocaleString('es-AR');
  const APP = 'https://gestiongadu.vercel.app';

  function register() { try { if (G.app && G.app.renderLogin) G.app.renderLogin('register'); } catch (e) { location.hash = '#/login'; } }
  function legal(t) { try { if (G.openLegal) G.openLegal(t); } catch (e) {} }
  function scrollToId(id) { const el = document.getElementById(id); if (el) el.scrollIntoView({ behavior: 'smooth' }); }

  /* ============================ HTML ============================ */
  function heroHTML() {
    return '<section class="lp-hero">' +
      '<div class="lp-glow lp-glow-1"></div><div class="lp-glow lp-glow-2"></div>' +
      '<div class="lp-hero-inner">' +
        '<div class="lp-pill lp-reveal">🇦🇷 Hecha para contratistas argentinos</div>' +
        '<h1 class="lp-hero-title lp-reveal">Tus obras no se pierden por falta de trabajo.<br><span class="lp-gradient-text">Se pierden por falta de control.</span></h1>' +
        '<p class="lp-hero-sub lp-reveal">GADU usa el WhatsApp que ya usás todos los días para ordenar la plata de tu obra en tiempo real. Sin instalar nada raro, sin planillas, sin cuaderno.</p>' +
        '<div class="lp-hero-cta lp-reveal">' +
          '<button class="lp-btn lp-btn-primary lp-btn-glow" data-lp="register">Empezar gratis 45 días</button>' +
          '<button class="lp-btn lp-btn-ghost" data-lp="como">Ver cómo funciona</button>' +
        '</div>' +
        '<div class="lp-hero-proof lp-reveal">' +
          '<div class="lp-stat"><span class="lp-stat-num" data-count="300">0</span><span class="lp-stat-label">obras gestionadas</span></div>' +
          '<div class="lp-stat"><span class="lp-stat-num" data-count="100">0</span><span class="lp-stat-label">% de control</span></div>' +
          '<div class="lp-stat"><span class="lp-stat-num" data-count="45">0</span><span class="lp-stat-label">días gratis</span></div>' +
        '</div>' +
      '</div>' +
    '</section>';
  }

  function painHTML() {
    const pains = [
      ['🧾', 'El ticket en el bolsillo', 'Lo guardás "para después" y a la semana no sabés cuánto gastaste ni en qué.', 'Cargalo en 10 segundos y olvidate.'],
      ['🤝', 'El socio que no confía', 'Sin números claros, cada reunión termina en discusión.', 'Repartí la plata automático, sin peleas.'],
      ['💸', 'El cliente que no paga el saldo', 'Perdés el hilo de los cobros y el saldo queda en el aire.', 'Seguí cada cobro y reclamá con datos.'],
      ['📉', 'El margen que se evapora', 'Entre jornales, materiales y fletes, no sabés si ganás o perdés.', 'Mirá tu margen real, obra por obra.'],
    ];
    return '<section class="lp-section lp-pain">' +
      '<div class="lp-container">' +
        '<h2 class="lp-section-title lp-reveal">Si te pasa esto, <span class="lp-gradient-text">estás perdiendo plata</span></h2>' +
        '<p class="lp-section-sub lp-reveal">Y lo peor: no te das cuenta hasta que es tarde.</p>' +
        '<div class="lp-pain-grid">' + pains.map(p =>
          '<div class="lp-pain-card lp-reveal">' +
            '<div class="lp-pain-ico">' + p[0] + '</div>' +
            '<div><h3>' + p[1] + '</h3><p class="lp-pain-dolor">' + p[2] + '</p><p class="lp-pain-fix">→ ' + p[3] + '</p></div>' +
          '</div>'
        ).join('') + '</div>' +
      '</div>' +
    '</section>';
  }

  function whatsappHTML() {
    return '<section class="lp-section lp-wa">' +
      '<div class="lp-container">' +
        '<h2 class="lp-section-title lp-reveal">Cargar tus números es tan fácil como <span class="lp-gradient-text">mandar un mensaje</span></h2>' +
        '<p class="lp-section-sub lp-reveal">Sin formularios aburridos. Solo chateás y la app web se actualiza sola.</p>' +
        '<div class="lp-wa-grid">' +
          '<div class="lp-phone lp-reveal">' +
            '<div class="lp-phone-notch"></div>' +
            '<div class="lp-chat">' +
              '<div class="lp-msg lp-msg-user">Registrar jornada</div>' +
              '<div class="lp-msg lp-msg-bot">👷 ¿Quién trabajó hoy?</div>' +
              '<div class="lp-chips"><span class="lp-chip lp-chip-on">Juan</span><span class="lp-chip">Pedro</span><span class="lp-chip">Luis</span></div>' +
              '<div class="lp-msg lp-msg-user">Juan</div>' +
              '<div class="lp-msg lp-msg-bot">🏗️ ¿En qué obra?</div>' +
              '<div class="lp-chips"><span class="lp-chip lp-chip-on">Casa Pérez</span><span class="lp-chip">Remodelación</span></div>' +
              '<div class="lp-msg lp-msg-bot lp-msg-ok">✅ Listo. Jornada de <b>Juan</b> en <b>Casa Pérez</b> guardada.</div>' +
            '</div>' +
          '</div>' +
          '<div class="lp-wa-copy">' +
            '<div class="lp-wa-step lp-reveal"><span class="lp-wa-step-num">1</span><div><h3>Registrar jornada</h3><p>Escribís "Registrar jornada" al bot.</p></div></div>' +
            '<div class="lp-wa-step lp-reveal"><span class="lp-wa-step-num">2</span><div><h3>El bot pregunta</h3><p>Elegís quién vino con un toque. Nada de escribir nombres.</p></div></div>' +
            '<div class="lp-wa-step lp-reveal"><span class="lp-wa-step-num">3</span><div><h3>Queda confirmado</h3><p>El bot guarda y tu Dashboard se actualiza solo.</p></div></div>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</section>';
  }

  function featuresHTML() {
    const feats = [
      ['📊', 'Control de obra en vivo', 'Barras de avance físico y de cobro, actualizadas en tiempo real.', ['Presupuesto', 'Avance de cobro', 'Avance de costos']],
      ['📱', 'Offline-first', 'Funciona en el fondo de la obra, sin señal. Se sincroniza cuando vuelve.', null],
      ['🤝', 'Multi-socio', 'Reparto automático de ganancias. Cero peleas, cero dudas.', null],
      ['👷', 'Empleados y jornales', 'Control de asistencia con un clic y liquidación de sueldos sin errores.', null],
    ];
    return '<section class="lp-section lp-features">' +
      '<div class="lp-container">' +
        '<h2 class="lp-section-title lp-reveal">Las armas de GADU</h2>' +
        '<div class="lp-features-grid">' + feats.map((f, i) =>
          '<div class="lp-feature lp-feature-' + (i + 1) + ' lp-reveal">' +
            '<div class="lp-feature-ico">' + f[0] + '</div>' +
            '<h3>' + f[1] + '</h3>' +
            (f[2] ? '<div class="lp-bars">' + f[2].map((b, j) => '<div class="lp-bar"><span>' + b + '</span><div class="lp-bar-track"><div class="lp-bar-fill" style="width:' + (90 - j * 25) + '%"></div></div></div>').join('') + '</div>' : '<p>' + (['Funciona en el fondo de la obra, sin señal.', 'Repartí la plata automático.', 'Asistencia con un toque.'][i - 1] || '') + '</p>') +
          '</div>'
        ).join('') + '</div>' +
      '</div>' +
    '</section>';
  }

  function stepsHTML() {
    const steps = [
      ['1', 'Vinculás tu WhatsApp', 'Conectás tu número en dos pasos desde Mi Perfil.'],
      ['2', 'Chateás para cargar', 'Gastos, obras, empleados, jornadas. Todo por chat guiado.'],
      ['3', 'Mirás el Dashboard', 'La web se actualiza sola con tu plata ordenada.'],
    ];
    return '<section class="lp-section lp-steps">' +
      '<div class="lp-container">' +
        '<h2 class="lp-section-title lp-reveal">Así de simple</h2>' +
        '<div class="lp-timeline">' + steps.map(s =>
          '<div class="lp-timeline-step lp-reveal"><div class="lp-timeline-dot">' + s[0] + '</div><h3>' + s[1] + '</h3><p>' + s[2] + '</p></div>'
        ).join('') + '</div>' +
      '</div>' +
    '</section>';
  }

  function pricingHTML() {
    const plan = (titulo, precioHtml, diasHtml, feats, dest, badge) =>
      '<div class="lp-plan' + (dest ? ' lp-plan-hot' : '') + '">' +
      (badge ? '<div class="lp-plan-badge">' + badge + '</div>' : '') +
      '<h3>' + titulo + '</h3>' +
      '<div class="lp-plan-price">' + precioHtml + (diasHtml ? '<span> / ' + diasHtml + '</span>' : '') + '</div>' +
      '<ul>' + feats.map(f => '<li>' + f + '</li>').join('') + '</ul>' +
      '<button class="lp-btn ' + (dest ? 'lp-btn-primary' : 'lp-btn-ghost') + ' lp-btn-block" data-lp="register">Elegir Plan</button>' +
      '</div>';

    return '<section class="lp-section lp-pricing" id="precios">' +
      '<div class="lp-container">' +
        '<h2 class="lp-section-title lp-reveal">Menos de lo que gastás en un café por día</h2>' +
        '<p class="lp-section-sub lp-reveal">Para tener la tranquilidad de que tu plata está ordenada.</p>' +
        '<div class="lp-toggle lp-reveal">' +
          '<button class="lp-toggle-btn active" data-periodo="trimestral">Trimestral</button>' +
          '<button class="lp-toggle-btn" data-periodo="semestral">Semestral</button>' +
          '<button class="lp-toggle-btn" data-periodo="anual">Anual</button>' +
        '</div>' +
        '<div class="lp-plans">' +
          plan('Free Básico', '$0', '', ['1 obra activa', '3 empleados', 'Respaldos locales'], false) +
          plan('Prueba', 'Gratis', '45 días', ['Todo ilimitado', 'Bot de WhatsApp', 'Sin tarjeta'], false) +
          plan('Plan Pro', '$<span id="lp-p-pro">5.000</span>', '<span id="lp-d-pro">90</span> días', ['2 obras activas', '10 empleados', 'Reportes en PDF', 'Bot de WhatsApp'], true, 'Más elegido') +
          plan('Plan Pyme', '$<span id="lp-p-pyme">20.000</span>', '<span id="lp-d-pyme">90</span> días', ['5 obras activas', '20 empleados', 'Reportes en PDF'], false) +
          plan('Plan Empresa', '$<span id="lp-p-empresa">50.000</span>', '<span id="lp-d-empresa">90</span> días', ['Ilimitado', 'Soporte prioritario', 'Reportes en PDF'], false) +
        '</div>' +
      '</div>' +
    '</section>';
  }

  function faqHTML() {
    const faqs = [
      ['¿Tengo que instalar algo?', 'No. Entrás desde el navegador del celular o la compu. Y por WhatsApp, ni siquiera salís de la conversación.'],
      ['¿Qué pasa si se cae el internet?', 'Nada. GADU funciona offline: guarda todo en tu celular y sincroniza cuando vuelve la señal.'],
      ['¿Mis datos están seguros?', 'Sí. Cada cuenta está aislada y encriptada. Solo vos y quien vos autorices ven tu información.'],
      ['¿Y si tengo varios socios?', 'GADU reparte la ganancia automáticamente según el porcentaje de cada socio. Fin de las discusiones.'],
    ];
    return '<section class="lp-section lp-faq">' +
      '<div class="lp-container">' +
        '<h2 class="lp-section-title lp-reveal">Preguntas que todos nos hacen</h2>' +
        '<div class="lp-faq-list">' + faqs.map((f, i) =>
          '<details class="lp-faq-item lp-reveal"' + (i === 0 ? ' open' : '') + '><summary>' + f[0] + '<span class="lp-faq-arrow">+</span></summary><p>' + f[1] + '</p></details>'
        ).join('') + '</div>' +
      '</div>' +
    '</section>';
  }

  function finalCTAHTML() {
    return '<section class="lp-final">' +
      '<div class="lp-container">' +
        '<h2 class="lp-reveal">No sigas confiando en tu memoria.</h2>' +
        '<p class="lp-reveal">Tu obra merece números claros. Empezá hoy, es gratis 45 días.</p>' +
        '<button class="lp-btn lp-btn-primary lp-btn-glow lp-reveal" data-lp="register">Empezar gratis 45 días</button>' +
        '<div class="lp-final-links lp-reveal">' +
          '<a href="#" data-lp="terms">Términos</a><span>·</span><a href="#" data-lp="privacy">Privacidad</a><span>·</span><span class="lp-copy">© 2026 GADU</span>' +
        '</div>' +
      '</div>' +
    '</section>';
  }

  function buildHTML() {
    return '<div class="lp">' + heroHTML() + painHTML() + whatsappHTML() + featuresHTML() + stepsHTML() + pricingHTML() + faqHTML() + finalCTAHTML() + '</div>';
  }

  /* ============================ Bindings ============================ */
  function bind(root) {
    root.querySelectorAll('[data-lp]').forEach(el => el.addEventListener('click', e => {
      e.preventDefault();
      const a = el.dataset.lp;
      if (a === 'register') register();
      else if (a === 'como') scrollToId('wa');
      else if (a === 'terms') legal('terms');
      else if (a === 'privacy') legal('privacy');
    }));

    root.querySelectorAll('[data-periodo]').forEach(b => b.addEventListener('click', () => setPeriodo(b.dataset.periodo)));

    root.querySelectorAll('.lp-faq-item').forEach(d => {
      d.querySelector('summary').addEventListener('click', () => {
        const open = d.open;
        root.querySelectorAll('.lp-faq-item[open]').forEach(o => { if (o !== d) o.open = false; });
      });
    });
  }

  function setPeriodo(p) {
    document.querySelectorAll('[data-periodo]').forEach(b => b.classList.toggle('active', b.dataset.periodo === p));
    ['pro', 'pyme', 'empresa'].forEach(plan => {
      const pe = document.getElementById('lp-p-' + plan);
      const de = document.getElementById('lp-d-' + plan);
      if (pe) pe.textContent = fmt(PRICES[plan][p]);
      if (de) de.textContent = PRICES[plan].dias[p];
    });
  }

  /* ============================ Animaciones ============================ */
  function initAnimations(root) {
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('lp-visible'); io.unobserve(e.target); } });
    }, { threshold: 0.12 });
    root.querySelectorAll('.lp-reveal').forEach(el => io.observe(el));

    const countIO = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (!e.isIntersecting) return;
        const el = e.target;
        const target = Number(el.dataset.count || 0);
        const dur = 1400; const t0 = performance.now();
        const tick = now => {
          const p = Math.min(1, (now - t0) / dur);
          el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3)));
          if (p < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
        countIO.unobserve(el);
      });
    }, { threshold: 0.4 });
    root.querySelectorAll('[data-count]').forEach(el => countIO.observe(el));
  }

  function render(root) {
    if (!root) return;
    root.innerHTML = buildHTML();
    bind(root);
    initAnimations(root);
  }

  G.landing = { render };
})(typeof window !== 'undefined' ? window : globalThis);
