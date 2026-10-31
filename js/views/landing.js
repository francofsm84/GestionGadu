/* ============================================================
   GADU · Landing Page pública (integración SPA)
   Ruta #/landing — accesible sin sesión. Contenido alineado con
   landing-gadu.html (WhatsApp wizard, precios, 3 pasos, reglas).
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

  function register() {
    try { if (G.app && G.app.renderLogin) G.app.renderLogin('register'); } catch (e) { location.hash = '#/login'; }
  }
  function legal(t) { try { if (G.openLegal) G.openLegal(t); } catch (e) {} }
  function scrollToPrecios() {
    const sec = document.getElementById('precios');
    if (sec) sec.scrollIntoView({ behavior: 'smooth' });
  }
  function setPeriodo(p) {
    document.querySelectorAll('[data-periodo]').forEach(b => {
      b.classList.toggle('active', b.dataset.periodo === p);
    });
    ['pro', 'pyme', 'empresa'].forEach(plan => {
      const pe = document.getElementById('p-' + plan);
      const de = document.getElementById('d-' + plan);
      if (pe) pe.textContent = fmt(PRICES[plan][p]);
      if (de) de.textContent = PRICES[plan].dias[p];
    });
  }

  function heroHTML() {
    return '<section class="landing-hero">' +
      '<div class="landing-hero-badge">🇦🇷 Pensada para contratistas y oficios</div>' +
      '<h1>Tu obra. Tu plata.<br><span class="landing-accent">Sin cuaderno.</span></h1>' +
      '<p class="landing-sub">Gestioná tu obra con nuestro Bot de WhatsApp. Creá obras, empleados y registrá asistencias con simples toques y menús guiados.</p>' +
      '<div class="landing-cta">' +
        '<button class="btn btn-primary btn-lg" data-landing="register">Empezar gratis 45 días</button>' +
        '<button class="btn btn-soft btn-lg" data-landing="planes">Ver planes</button>' +
      '</div>' +
      '<div class="landing-hero-trust">✓ Sin tarjeta de crédito · ✓ 45 días de prueba · ✓ Funciona offline</div>' +
    '</section>';
  }

  function featuresHTML() {
    const feats = [
      ['💬', 'Gestión por WhatsApp', 'No necesitas instalar nada. Chateá con el bot para crear obras, clientes o socios paso a paso. Llená formularios guiados y registrá la asistencia de tu equipo con un clic.'],
      ['📊', 'Control total', 'Mirá tus gastos, ingresos y margen de obra en tiempo real. Sabé exactamente cuánto entró, cuánto salió y cuánto te queda.'],
      ['📱', 'Funciona offline', 'Instalala en tu celular y usala incluso en obras sin señal. Tus datos se sincronizan cuando vuelve la conexión.'],
    ];
    return '<section class="landing-features">' + feats.map(f =>
      '<div class="landing-feature"><div class="landing-ico">' + f[0] + '</div><h3>' + f[1] + '</h3><p>' + f[2] + '</p></div>'
    ).join('') + '</section>';
  }

  function dayHTML() {
    return '<section class="landing-day">' +
      '<h2>Un día con GADU</h2>' +
      '<p class="landing-sub">Así se ve una mañana de obra con el bot de WhatsApp.</p>' +
      '<div class="landing-chat-card">' +
        '<div class="landing-chat-head"><span class="landing-chat-time">7:00</span><strong>Registrar la jornada</strong></div>' +
        '<div class="landing-chat">' +
          '<div class="landing-chat-row user"><div class="landing-bubble user">Registrar jornada</div></div>' +
          '<div class="landing-chat-row bot"><div class="landing-bubble bot">👷 ¿Quién vino hoy? Tocá un nombre.</div></div>' +
          '<div class="landing-chat-btns"><span class="landing-chat-btn active">Juan</span><span class="landing-chat-btn">Pedro</span><span class="landing-chat-btn">Luis</span></div>' +
          '<div class="landing-chat-row user"><div class="landing-bubble user">Juan</div></div>' +
          '<div class="landing-chat-row bot"><div class="landing-bubble bot">🏗️ ¿En qué obra trabajó? Tocá una.</div></div>' +
          '<div class="landing-chat-btns"><span class="landing-chat-btn active">Casa Pérez</span><span class="landing-chat-btn">Remodelación</span></div>' +
          '<div class="landing-chat-row bot"><div class="landing-bubble bot">✅ Listo. Registré la jornada de <b>Juan</b> en <b>Casa Pérez</b>.</div></div>' +
        '</div>' +
        '<p class="landing-chat-note">Llegás a la obra y le escribís al bot: <b>"Registrar jornada"</b>. Elegís quién vino (Juan) y la obra. El bot te confirma y lo guarda.</p>' +
      '</div>' +
    '</section>';
  }

  function pricingHTML() {
    const planCard = (titulo, precio, dias, feats, destacado, badge) =>
      '<div class="landing-plan' + (destacado ? ' destacado' : '') + '">' +
      (badge ? '<div class="landing-badge">' + badge + '</div>' : '') +
      '<h3>' + titulo + '</h3>' +
      '<div class="landing-price">' + precio + (dias ? '<span> / ' + dias + '</span>' : '') + '</div>' +
      '<ul>' + feats.map(f => '<li>' + f + '</li>').join('') + '</ul>' +
      '<button class="btn ' + (destacado ? 'btn-primary' : 'btn-soft') + ' btn-block" data-landing="register">Elegir Plan</button>' +
      '</div>';

    return '<section class="landing-pricing" id="precios">' +
      '<h2>Planes simples, sin sorpresas</h2>' +
      '<p class="landing-sub">Elegí el período que mejor te quede.</p>' +
      '<div class="landing-toggle">' +
        '<button class="landing-toggle-btn active" data-periodo="trimestral">Trimestral</button>' +
        '<button class="landing-toggle-btn" data-periodo="semestral">Semestral</button>' +
        '<button class="landing-toggle-btn" data-periodo="anual">Anual</button>' +
      '</div>' +
      '<div class="landing-plans landing-plans-5">' +
        planCard('Free Básico', '$0', '', ['1 obra activa', '3 empleados', 'Respaldos locales'], false) +
        planCard('Prueba', 'Gratis', '45 días', ['Todo ilimitado', 'Bot de WhatsApp', 'Sin tarjeta'], false) +
        planCard('Plan Pro', '$<span id="p-pro">5.000</span>', '<span id="d-pro">90</span> días', ['2 obras activas', '10 empleados', 'Reportes en PDF', 'Bot de WhatsApp'], true, 'Más elegido') +
        planCard('Plan Pyme', '$<span id="p-pyme">20.000</span>', '<span id="d-pyme">90</span> días', ['5 obras activas', '20 empleados', 'Reportes en PDF', 'Todo lo de Pro'], false) +
        planCard('Plan Empresa', '$<span id="p-empresa">50.000</span>', '<span id="d-empresa">90</span> días', ['Obras ilimitadas', 'Empleados ilimitados', 'Reportes en PDF', 'Soporte prioritario'], false) +
      '</div>' +
    '</section>';
  }

  function stepsHTML() {
    const steps = [
      ['1', 'Creá tu obra', 'Con el botón + en la app, o charlando con el bot de WhatsApp.'],
      ['2', 'Cargá cobros, gastos y jornadas', 'Todo guiado, paso a paso, sin dejar nada a medias.'],
      ['3', 'Mirá tu balance', 'En el Panel general, con margen de ganancia en tiempo real.'],
    ];
    return '<section class="landing-steps">' +
      '<h2>Empezás en 3 pasos</h2>' +
      '<div class="landing-steps-grid">' + steps.map(s =>
        '<div class="landing-step"><div class="landing-step-num">' + s[0] + '</div><h3>' + s[1] + '</h3><p>' + s[2] + '</p></div>'
      ).join('') + '</div>' +
    '</section>';
  }

  function rulesHTML() {
    const rules = [
      'Cargá todo <b>el mismo día</b>. Si lo dejás para mañana, se olvida.',
      '<b>Cada gasto va a su obra</b>. Nada de "gastos sueltos" sin dueño.',
      'Tené el <b>presupuesto claro</b> antes de arrancar. Es tu brújula.',
      '<b>Registrá la jornada</b> de tu gente ni bien llegan a la obra.',
      'Revisá tu <b>balance semanal</b>. Lo que no se mide, no se controla.',
    ];
    return '<section class="landing-rules">' +
      '<h2>Las 5 Reglas de Oro</h2>' +
      '<div class="landing-rules-list">' + rules.map((r, i) =>
        '<div class="landing-rule"><span class="landing-rule-num">' + (i + 1) + '.</span><p>' + r + '</p></div>'
      ).join('') + '</div>' +
    '</section>';
  }

  function faqHTML() {
    const faqs = [
      ['¿Necesito tarjeta para empezar?', 'No. Empezás con una prueba gratis de 45 días con todo ilimitado. Sin tarjeta.'],
      ['¿Funciona sin señal?', 'Sí. La app guarda tus datos en el celular y los sincroniza cuando vuelve la conexión.'],
      ['¿Cómo se usa con WhatsApp?', 'Vinculás tu número y chateás con el bot: creás obras, clientes o socios con formularios guiados y menús de botones.'],
    ];
    return '<section class="landing-faq">' +
      '<h2>Preguntas frecuentes</h2>' +
      faqs.map(f =>
        '<details class="landing-faq-item"><summary>' + f[0] + '</summary><p>' + f[1] + '</p></details>'
      ).join('') +
    '</section>';
  }

  function footerHTML() {
    return '<footer class="landing-footer">' +
      '<div class="landing-footer-links">' +
        '<a href="#" data-landing="terms">Términos y Condiciones</a>' +
        '<a href="#" data-landing="privacy">Aviso de Privacidad</a>' +
      '</div>' +
      '<p class="muted small">Copyright © 2026 GADU · Tu gestión, perfecta</p>' +
    '</footer>';
  }

  function render(root) {
    if (!root) return;
    root.innerHTML = '<div class="landing">' + heroHTML() + featuresHTML() + dayHTML() + pricingHTML() + stepsHTML() + rulesHTML() + faqHTML() + footerHTML() + '</div>';

    root.querySelectorAll('[data-landing]').forEach(el => el.addEventListener('click', e => {
      e.preventDefault();
      const a = el.dataset.landing;
      if (a === 'register') register();
      else if (a === 'planes') scrollToPrecios();
      else if (a === 'terms') legal('terms');
      else if (a === 'privacy') legal('privacy');
    }));
    root.querySelectorAll('[data-periodo]').forEach(b => b.addEventListener('click', () => setPeriodo(b.dataset.periodo)));
  }

  G.landing = { render };
})(typeof window !== 'undefined' ? window : globalThis);
