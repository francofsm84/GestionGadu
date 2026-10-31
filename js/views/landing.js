/* ============================================================
   GADU · Landing Page pública
   Ruta #/landing — accesible sin sesión. Cara comercial del negocio.
   ============================================================ */
(function (root) {
  'use strict';
  const G = root.GADU;

  function render(root) {
    if (!root) return;

    const go = (h) => { location.hash = h; };
    const legal = (t) => { try { if (G.openLegal) G.openLegal(t); } catch (e) {} };
    const register = () => { try { if (G.app && G.app.renderLogin) G.app.renderLogin('register'); } catch (e) { go('#/login'); } };

    root.innerHTML =
      '<div class="landing">' +

      /* ===== Hero ===== */
      '<section class="landing-hero">' +
        '<div class="landing-hero-badge">🇦🇷 Pensada para contratistas y oficios</div>' +
        '<h1>Tu obra. Tu plata.<br><span class="landing-accent">Sin cuaderno.</span></h1>' +
        '<p class="landing-sub">Cargá gastos por audio con nuestro Bot de WhatsApp y gestioná todo desde una sola app.</p>' +
        '<div class="landing-cta">' +
          '<button class="btn btn-primary btn-lg" data-landing="register">Empezar gratis 45 días</button>' +
          '<button class="btn btn-soft btn-lg" data-landing="planes">Ver planes</button>' +
        '</div>' +
      '</section>' +

      /* ===== Features ===== */
      '<section class="landing-features">' +
        '<div class="landing-feature">' +
          '<div class="landing-ico">🎙️</div>' +
          '<h3>Cargá por WhatsApp</h3>' +
          '<p>Mandá un audio o una foto del ticket. La IA hace el resto.</p>' +
        '</div>' +
        '<div class="landing-feature">' +
          '<div class="landing-ico">📊</div>' +
          '<h3>Control total</h3>' +
          '<p>Mirá tus gastos, ingresos y margen de obra en tiempo real.</p>' +
        '</div>' +
        '<div class="landing-feature">' +
          '<div class="landing-ico">📱</div>' +
          '<h3>Funciona offline</h3>' +
          '<p>Instalala en tu celular y usala incluso en obras sin señal.</p>' +
        '</div>' +
      '</section>' +

      /* ===== Pricing (breve) ===== */
      '<section class="landing-pricing">' +
        '<h2>Planes simples, sin sorpresas</h2>' +
        '<div class="landing-plans">' +
          '<div class="landing-plan">' +
            '<div class="landing-plan-head"><h3>Plan Pro</h3><span class="landing-chip">Más elegido</span></div>' +
            '<div class="landing-price">$5.000<span>/90 días</span></div>' +
            '<ul><li>2 obras activas</li><li>10 empleados</li><li>Reportes en PDF</li><li>Bot de WhatsApp</li></ul>' +
            '<button class="btn btn-primary btn-block" data-landing="register">Empezar ahora</button>' +
          '</div>' +
          '<div class="landing-plan">' +
            '<div class="landing-plan-head"><h3>Plan Pyme</h3></div>' +
            '<div class="landing-price">$20.000<span>/90 días</span></div>' +
            '<ul><li>5 obras activas</li><li>20 empleados</li><li>Reportes en PDF</li><li>Todo lo de Pro</li></ul>' +
            '<button class="btn btn-soft btn-block" data-landing="register">Empezar ahora</button>' +
          '</div>' +
        '</div>' +
      '</section>' +

      /* ===== Footer ===== */
      '<footer class="landing-footer">' +
        '<div class="landing-footer-links">' +
          '<a href="#" data-landing="terms">Términos y Condiciones</a>' +
          '<a href="#" data-landing="privacy">Aviso de Privacidad</a>' +
        '</div>' +
        '<p class="muted small">Copyright © 2026 GADU · Tu gestión, perfecta</p>' +
      '</footer>' +

      '</div>';

    root.querySelectorAll('[data-landing]').forEach(el => {
      el.addEventListener('click', e => {
        e.preventDefault();
        const a = el.dataset.landing;
        if (a === 'register') register();
        else if (a === 'planes') go('#/planes');
        else if (a === 'terms') legal('terms');
        else if (a === 'privacy') legal('privacy');
      });
    });
  }

  G.landing = { render };
})(typeof window !== 'undefined' ? window : globalThis);
