/* ============================================================
   GADU · Landing Page Premium (#/landing) · v2
   Técnicas: PAS · Value Stacking · Risk Reversal · Social Proof
   ============================================================ */
(function (root) {
  'use strict';
  const G = root.GADU;

  const PRICES = {
    pro: { trimestral: 5000, semestral: 9000, anual: 16000, dias: { trimestral: 90, semestral: 180, anual: 365 } },
    pyme: { trimestral: 20000, semestral: 36000, anual: 64000, dias: { trimestral: 90, semestral: 180, anual: 365 } },
    empresa: { trimestral: 50000, semestral: 90000, anual: 160000, dias: { trimestral: 90, semestral: 180, anual: 365 } },
  };
  const fmt = n => Number(n).toLocaleString('es-AR');

  /* ---------- Íconos SVG inline (sin emojis) ---------- */
  const ICONS = {
    rocket: '<path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>',
    bolt: '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>',
    chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    chart: '<path d="M3 3v18h18"/><path d="M7 16v-5"/><path d="M12 16V8"/><path d="M17 16v-8"/>',
    phone: '<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M12 18h.01"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    wrench: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
    database: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/>',
    receipt: '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1z"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 17.5v-11"/>',
    alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    dollar: '<path d="M12 2v20"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    hardhat: '<path d="M2 18a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1z"/><path d="M4 15v-3a8 8 0 0 1 16 0v3"/><path d="M2 18h20"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
    moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/>',
  };
  function icon(name, size) {
    const s = size || 20;
    const body = ICONS[name] || ICONS.bolt;
    return '<span class="lp-ic" style="width:' + s + 'px;height:' + s + 'px" aria-hidden="true">' +
      '<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + body + '</svg></span>';
  }
  function googleIcon(size) {
    const s = size || 18;
    return '<span class="lp-ic" style="width:' + s + 'px;height:' + s + 'px" aria-hidden="true">' +
      '<svg viewBox="0 0 48 48" width="100%" height="100%">' +
      '<path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>' +
      '<path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>' +
      '<path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>' +
      '<path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>' +
      '</svg></span>';
  }

  function register() { openAuthModal(); }
  function legal(t) { try { if (G.openLegal) G.openLegal(t); } catch (e) {} }
  function scrollToId(id) { const el = document.getElementById(id); if (el) el.scrollIntoView({ behavior: 'smooth' }); }

  /* ---------- Modal futurista de registro/login ---------- */
  let authMode = 'signup';
  function closeAuthModal() {
    const ov = document.getElementById('lp-auth-overlay');
    if (ov) ov.remove();
  }
  function openAuthModal() {
    const existing = document.getElementById('lp-auth-overlay');
    if (existing) existing.remove();
    authMode = 'signup';
    const overlay = document.createElement('div');
    overlay.id = 'lp-auth-overlay';
    overlay.className = 'lp-auth-overlay';
    overlay.innerHTML =
      '<div class="lp-auth-card" role="dialog" aria-modal="true">' +
        '<button class="lp-auth-close" aria-label="Cerrar" title="Cerrar">' + icon('x', 18) + '</button>' +
        '<div class="lp-auth-head"><span class="lp-nav-mark">G</span><h3>Empezá gratis</h3></div>' +
        '<p class="lp-auth-sub">45 días gratis · sin tarjeta · sin compromiso</p>' +
        '<button class="lp-auth-google" id="lp-auth-google">' + googleIcon(18) + '<span>Continuar con Google</span></button>' +
        '<div class="lp-auth-sep"><span>o con tu email</span></div>' +
        '<input class="lp-auth-input" id="lp-auth-email" type="email" placeholder="tu@email.com" autocomplete="email" inputmode="email">' +
        '<input class="lp-auth-input" id="lp-auth-pass" type="password" placeholder="Contraseña (mín. 6 caracteres)" autocomplete="current-password">' +
        '<button class="lp-auth-submit" id="lp-auth-submit">Registrarse</button>' +
        '<p class="lp-auth-err" id="lp-auth-err" hidden></p>' +
        '<p class="lp-auth-toggle">¿Ya tenés cuenta? <a href="#" id="lp-auth-switch">Iniciar sesión</a></p>' +
      '</div>';
    document.body.appendChild(overlay);

    overlay.querySelector('.lp-auth-close').addEventListener('click', closeAuthModal);
    overlay.addEventListener('click', e => { if (e.target === overlay) closeAuthModal(); });
    overlay.querySelector('#lp-auth-google').addEventListener('click', () => {
      try { if (G.auth && G.auth.signInWithGoogle) G.auth.signInWithGoogle(); } catch (e) {}
    });
    overlay.querySelector('#lp-auth-switch').addEventListener('click', e => {
      e.preventDefault();
      authMode = authMode === 'signup' ? 'login' : 'signup';
      const sub = overlay.querySelector('#lp-auth-submit');
      const tog = overlay.querySelector('#lp-auth-switch');
      const title = overlay.querySelector('.lp-auth-head h3');
      if (authMode === 'login') {
        sub.textContent = 'Iniciar sesión';
        tog.innerHTML = '¿No tenés cuenta? <a href="#" id="lp-auth-switch">Registrate</a>';
        title.textContent = 'Bienvenido de nuevo';
      } else {
        sub.textContent = 'Registrarse';
        tog.innerHTML = '¿Ya tenés cuenta? <a href="#" id="lp-auth-switch">Iniciar sesión</a>';
        title.textContent = 'Empezá gratis';
      }
      overlay.querySelector('#lp-auth-err').hidden = true;
    });
    overlay.querySelector('#lp-auth-submit').addEventListener('click', doAuth);
  }
  async function doAuth() {
    const emailEl = document.getElementById('lp-auth-email');
    const passEl = document.getElementById('lp-auth-pass');
    const sub = document.getElementById('lp-auth-submit');
    const err = document.getElementById('lp-auth-err');
    const email = (emailEl.value || '').trim();
    const pass = passEl.value || '';
    if (!email || !pass) { err.textContent = 'Completá tu email y contraseña.'; err.hidden = false; return; }
    if (pass.length < 6) { err.textContent = 'La contraseña debe tener al menos 6 caracteres.'; err.hidden = false; return; }
    sub.disabled = true; sub.textContent = 'Procesando…'; err.hidden = true;
    try {
      if (authMode === 'signup') await G.auth.signup(email, pass);
      else await G.auth.login(email, pass);
      closeAuthModal();
      const landRoot = document.getElementById('landingRoot');
      if (landRoot) landRoot.remove();
      location.hash = '#/dashboard';
      try { if (G.app && G.app.startApp) G.app.startApp(); } catch (e) {}
    } catch (e) {
      const m = String(e && e.message || e);
      if (m === 'CONFIRMA_EMAIL') err.textContent = 'Te enviamos un mail para confirmar tu cuenta. Revisá tu bandeja.';
      else if (m === 'DB_ERROR') err.textContent = 'Hubo un problema creando tu cuenta. Probá de nuevo.';
      else err.textContent = m;
      err.hidden = false;
      sub.disabled = false;
      sub.textContent = authMode === 'signup' ? 'Registrarse' : 'Iniciar sesión';
    }
  }

  function applyTheme(t) {
    document.documentElement.dataset.theme = t;
    try { localStorage.setItem('gadu_lp_theme', t); } catch (e) {}
    const btn = document.getElementById('lp-theme-btn');
    if (btn) btn.innerHTML = t === 'light' ? icon('sun', 18) : icon('moon', 18);
  }
  function initTheme() {
    let saved = 'dark';
    try { saved = localStorage.getItem('gadu_lp_theme') || 'dark'; } catch (e) {}
    applyTheme(saved);
  }
  function toggleTheme() {
    const cur = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    applyTheme(cur);
  }

  function buildHTML() {
    return `
<div class="lp">
  <canvas id="lp-stars" aria-hidden="true"></canvas>

  <!-- SECCIÓN 0 · Barra sticky -->
  <nav class="lp-nav">
    <a class="lp-nav-logo" href="#top"><span class="lp-nav-mark">G</span> GADU</a>
    <div class="lp-nav-actions">
      <button class="lp-nav-icon" id="lp-theme-btn" title="Cambiar tema" aria-label="Cambiar tema">${icon('moon', 18)}</button>
      <button class="lp-nav-cta" data-lp="register">Empezar gratis</button>
    </div>
  </nav>

  <!-- SECCIÓN 1 · HERO -->
  <header class="lp-hero" id="top">
    <div class="lp-glow lp-glow-a"></div>
    <div class="lp-glow lp-glow-b"></div>
    <div class="lp-hero-inner">
      <span class="lp-badge lp-reveal">${icon('hardhat', 16)} Hecho para gente de obra</span>
      <h1 class="lp-hero-title lp-reveal">Dejá de perder plata por no anotar a tiempo.<br><span class="lp-grad">Gestioná tu obra desde el WhatsApp que ya usás todos los días.</span></h1>
      <p class="lp-hero-sub lp-reveal">Sin planillas, sin cuadernos, sin instalar apps raras. Cargá gastos, obras y empleados en 3 toques. Mirá tu balance en tiempo real.</p>
      <div class="lp-hero-cta lp-reveal">
        <button class="lp-btn lp-btn-primary lp-btn-pulse" data-lp="register">${icon('rocket', 18)} Empezar Gratis 45 Días</button>
        <button class="lp-btn lp-btn-ghost" data-lp="como">Ver cómo funciona ↓</button>
      </div>
      <div class="lp-hero-stats lp-reveal">
        <div class="lp-stat"><span class="lp-stat-num" data-count="500">0</span><span class="lp-stat-label">obras gestionadas</span></div>
        <div class="lp-stat"><span class="lp-stat-num" data-count="100">0</span><span class="lp-stat-label">% control de gastos</span></div>
        <div class="lp-stat"><span class="lp-stat-num" data-count="0">0</span><span class="lp-stat-label">% margen perdido</span></div>
      </div>
    </div>
  </header>

  <!-- SECCIÓN 1.5 · STORY · El problema del papel -->
  <section class="lp-section lp-story">
    <div class="lp-container">
      <div class="lp-story-card lp-reveal">
        <span class="lp-story-kicker">El problema del papel</span>
        <p class="lp-story-text">El cuaderno de papel guarda la información, pero <b>no la conecta</b>. No te dice cuánto le debés a tus empleados esta semana. No te dice en qué obra trabajó cada uno. No te genera un libro contable automático. Y si querés buscar un gasto de hace 6 meses, <b>perdés media hora pasando páginas</b>.</p>
        <p class="lp-story-bridge">Ahora imaginá que podés hacerle esa pregunta al WhatsApp…</p>
      </div>
    </div>
  </section>

  <!-- SECCIÓN 2 · PAS -->
  <section class="lp-section">
    <div class="lp-container">
      <h2 class="lp-title lp-reveal">Si te pasa esto, <span class="lp-grad">estás perdiendo plata. Y mucha.</span></h2>
      <div class="lp-pain-grid">${[
        ['receipt', 'El ticket del corralón que se perdió en el bolsillo.'],
        ['alert', 'No sabés si la obra te dejó ganancia o pérdida.'],
        ['users', 'Tu socio te pide cuentas y no tenés los números claros.'],
        ['dollar', 'El cliente dice que ya te pagó y vos no te acordás.'],
      ].map((p, i) => `<div class="lp-pain-card lp-reveal"><span class="lp-pain-ico">${icon(p[0], 26)}</span><p>${p[1]}</p></div>`).join('')}</div>
      <p class="lp-transition lp-reveal">Ahora imaginá lo contrario…</p>
    </div>
  </section>

  <!-- SECCIÓN 3 · SOLUCIÓN WhatsApp -->
  <section class="lp-section lp-wa" id="wa">
    <div class="lp-container">
      <h2 class="lp-title lp-reveal">Tu nueva secretaria <span class="lp-grad">vive en WhatsApp.</span></h2>
      <div class="lp-wa-grid">
        <div class="lp-phone lp-reveal">
          <div class="lp-phone-notch"></div>
          <div class="lp-chat">
            <div class="lp-msg lp-msg-bot">Hola Franco, ¿qué querés hacer?</div>
            <div class="lp-chips"><span class="lp-chip">Nueva Obra</span><span class="lp-chip">Cargar Gasto</span><span class="lp-chip lp-chip-on">Registrar Jornada</span></div>
            <div class="lp-msg lp-msg-user">Registrar Jornada</div>
            <div class="lp-msg lp-msg-bot">${icon('user', 14)} ¿Quién trabajó hoy?</div>
            <div class="lp-chips"><span class="lp-chip lp-chip-on">Juan</span><span class="lp-chip">Pedro</span></div>
            <div class="lp-msg lp-msg-user">Juan</div>
            <div class="lp-msg lp-msg-bot lp-msg-ok">${icon('check', 14)} Listo. Juan trabajó en 'Casa Pérez' 8hs. Ya está en tu panel web.</div>
          </div>
        </div>
        <div class="lp-wa-copy lp-reveal">
          <h3>Chateás. El bot entiende. La app web se actualiza sola.</h3>
          <p>Cero formularios aburridos. Solo toques y menús guiados. Vos hablás, GADU anota.</p>
          <button class="lp-btn lp-btn-ghost" data-lp="register">Probar ahora →</button>
        </div>
      </div>
    </div>
  </section>

  <!-- SECCIÓN 4 · VALUE STACKING -->
  <section class="lp-section">
    <div class="lp-container">
      <h2 class="lp-title lp-reveal">Todo lo que te llevás con GADU<br><span class="lp-sub">por menos de lo que gastás en un café por día.</span></h2>
      <div class="lp-feat-grid">${[
        ['chart', 'Control de Obra en Vivo', 'Avance físico y de cobro en tiempo real, con barras de progreso.'],
        ['phone', 'Offline-First', 'Funciona en el fondo de la obra, sin señal. Se sincroniza solo.'],
        ['users', 'Multi-socio', 'Reparto automático de ganancias según el porcentaje de cada uno.'],
        ['user', 'Empleados y Jornales', 'Asistencia con un toque y liquidación de sueldos sin errores.'],
        ['wrench', 'Herramientas', 'Inventario y mantenimiento de máquinas, siempre controlado.'],
        ['database', 'Respaldos automáticos', 'Tus datos se guardan solos, en tu celular y en la nube.'],
      ].map((f, i) => `<div class="lp-feat lp-reveal"><span class="lp-feat-ico">${icon(f[0], 26)}</span><h3>${f[1]}</h3><p>${f[2]}</p></div>`).join('')}</div>
    </div>
  </section>

  <!-- SECCIÓN 5 · CÓMO FUNCIONA -->
  <section class="lp-section">
    <div class="lp-container">
      <h2 class="lp-title lp-reveal">Empezás en 3 pasos. <span class="lp-grad">En 5 minutos.</span></h2>
      <div class="lp-timeline">${[
        ['1', 'Vinculá tu WhatsApp', 'Escaneás un QR y listo. Dos toques.'],
        ['2', 'Chateás con el bot', 'Creás tu obra y cargás el primer gasto hablando.'],
        ['3', 'Entrás a la web', 'Ves tu balance mágicamente actualizado.'],
      ].map((s, i) => `<div class="lp-step lp-reveal"><span class="lp-step-num">${s[0]}</span><h3>${s[1]}</h3><p>${s[2]}</p></div>`).join('')}</div>
    </div>
  </section>

  <!-- SECCIÓN 6 · PRECIOS -->
  <section class="lp-section lp-pricing" id="precios">
    <div class="lp-container">
      <h2 class="lp-title lp-reveal">Probá 45 días gratis. <span class="lp-grad">Sin tarjeta. Sin compromiso.</span></h2>
      <div class="lp-toggle lp-reveal">
        <button class="lp-toggle-btn active" data-periodo="trimestral">Trimestral</button>
        <button class="lp-toggle-btn" data-periodo="semestral">Semestral <span class="lp-disc">Ahorrá 10%</span></button>
        <button class="lp-toggle-btn" data-periodo="anual">Anual <span class="lp-disc">Ahorrá 20%</span></button>
      </div>
      <div class="lp-plans">${[
        ['Free Básico', '$0', '', ['1 obra activa', '3 empleados'], false],
        ['PRO', '$<span id="lp-p-pro">5.000</span>', '<span id="lp-d-pro">90</span> días', ['2 obras activas', '10 empleados', 'Soporte prioritario'], true],
        ['Pyme', '$<span id="lp-p-pyme">20.000</span>', '<span id="lp-d-pyme">90</span> días', ['5 obras activas', '20 empleados'], false],
        ['Empresa', '$<span id="lp-p-empresa">50.000</span>', '<span id="lp-d-empresa">90</span> días', ['Todo ilimitado'], false],
      ].map(p => `<div class="lp-plan${p[4] ? ' lp-plan-hot' : ''}">${p[4] ? '<span class="lp-plan-badge">Más elegido</span>' : ''}<h3>${p[0]}</h3><div class="lp-plan-price">${p[1]}${p[2] ? '<span> / ' + p[2] + '</span>' : ''}</div><ul>${p[3].map(f => '<li>' + f + '</li>').join('')}</ul><button class="lp-btn ${p[4] ? 'lp-btn-primary' : 'lp-btn-ghost'} lp-btn-block" data-lp="register">Elegir Plan</button></div>`).join('')}</div>
      <p class="lp-reversal lp-reveal">Cancelás cuando quieras. Sin preguntas.</p>
    </div>
  </section>

  <!-- SECCIÓN 7 · PRUEBA SOCIAL + FAQ -->
  <section class="lp-section">
    <div class="lp-container">
      <h2 class="lp-title lp-reveal">Los que ya ordenaron su plata</h2>
      <div class="lp-testimonials">${[
        ['RQ', 'Ramón Q.', 'Albañil', 'Antes usaba 3 cuadernos. Ahora le mando un audio al bot y me olvido.'],
        ['LM', 'Laura M.', 'Contratista', 'El reporte PDF me ayudó a cobrar una deuda de $2M.'],
        ['DP', 'Diego P.', 'Electricista', 'El reparto con mi socio se hace solo. Se acabaron las peleas.'],
      ].map(t => `<div class="lp-testimonial lp-reveal"><span class="lp-testimonial-avatar">${t[0]}</span><div><p>"${t[3]}"</p><span class="lp-testimonial-name">${t[1]} · ${t[2]}</span></div></div>`).join('')}</div>
      <div class="lp-faq-list">${[
        ['¿Tengo que instalar algo?', 'No. GADU es una PWA: entrás desde el navegador y la "instalás" en tu celular en dos toques.'],
        ['¿Qué pasa si se cae el internet?', 'Nada. Funciona offline: guarda todo en tu celular y sincroniza cuando vuelve la señal.'],
        ['¿Mis datos están seguros?', 'Sí. Usamos Supabase con RLS (Row Level Security) y encriptación. Solo vos y quien autorices ven tus datos.'],
        ['¿Y si tengo varios socios?', 'GADU reparte la ganancia automáticamente según el porcentaje de cada socio.'],
        ['¿Puedo cancelar cuando quiera?', 'Sí. Sin compromiso, sin permanencia. Cancelás y listo.'],
      ].map((f, i) => `<details class="lp-faq-item lp-reveal"${i === 0 ? ' open' : ''}><summary>${f[0]}<span class="lp-faq-arrow">+</span></summary><p>${f[1]}</p></details>`).join('')}</div>
    </div>
  </section>

  <!-- SECCIÓN 8 · CTA FINAL -->
  <section class="lp-final">
    <div class="lp-container">
      <h2 class="lp-reveal">No sigas confiando en tu memoria. Empezá hoy mismo.</h2>
      <button class="lp-btn lp-btn-primary lp-btn-pulse lp-btn-xl lp-reveal" data-lp="register">${icon('rocket', 20)} Empezar Gratis 45 Días</button>
      <p class="lp-final-micro lp-reveal">Ya son 500+ contratistas los que ordenaron su plata. ¿Vos qué esperás?</p>
    </div>
  </section>

  <!-- FOOTER -->
  <footer class="lp-footer">
    <div class="lp-footer-top"><span class="lp-nav-mark">G</span> GADU</div>
    <div class="lp-footer-links">
      <a href="#" data-lp="terms">Términos y Condiciones</a>
      <span>·</span>
      <a href="#" data-lp="privacy">Aviso de Privacidad</a>
    </div>
    <p class="lp-footer-copy">Copyright © 2026 GADU · Hecho en Alta Gracia, Córdoba</p>
    <p class="lp-footer-credit">desarrollado por <a href="https://www.instagram.com/jacinto.cards" target="_blank" rel="noopener noreferrer">@Jacinto.Cars</a></p>
  </footer>

</div>`;
  }

  function bind(root) {
    root.querySelectorAll('[data-lp]').forEach(el => el.addEventListener('click', e => {
      e.preventDefault();
      const a = el.dataset.lp;
      if (a === 'register') register();
      else if (a === 'como') scrollToId('wa');
      else if (a === 'terms') legal('terms');
      else if (a === 'privacy') legal('privacy');
    }));

    const themeBtn = root.querySelector('#lp-theme-btn');
    if (themeBtn) themeBtn.addEventListener('click', toggleTheme);

    root.querySelectorAll('[data-periodo]').forEach(b => b.addEventListener('click', () => setPeriodo(b.dataset.periodo)));

    root.querySelectorAll('.lp-faq-item').forEach(d => {
      const s = d.querySelector('summary');
      if (s) s.addEventListener('click', () => {
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

  function initStars() {
    const canvas = document.getElementById('lp-stars');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let W = 0, H = 0, stars = [], meteors = [];
    let scrollY = window.scrollY || 0;

    function resize() {
      W = canvas.width = window.innerWidth;
      H = canvas.height = window.innerHeight;
      makeStars();
    }
    function makeStars() {
      const n = Math.min(180, Math.max(60, Math.floor(W * H / 9000)));
      stars = [];
      for (let i = 0; i < n; i++) {
        stars.push({
          x: Math.random() * W, y: Math.random() * H,
          r: Math.random() * 1.4 + 0.3,
          a: Math.random() * 0.7 + 0.2,
          v: Math.random() * 0.15 + 0.03,
          orange: Math.random() < 0.25,
        });
      }
    }
    function spawnMeteor() {
      meteors.push({ x: W * (0.4 + Math.random() * 0.6), y: Math.random() * H * 0.35, vx: -(Math.random() * 4 + 4), vy: Math.random() * 2 + 2, life: 1 });
    }
    function draw() {
      ctx.clearRect(0, 0, W, H);
      const t = Date.now() / 1000;
      /* Posiciones con parallax */
      const pts = stars.map(s => {
        let yy = (s.y - scrollY * (s.r * 0.22)) % H;
        if (yy < 0) yy += H;
        return { ...s, yy };
      });
      /* Constelación: líneas sutiles entre estrellas cercanas */
      const LINK = 110;
      ctx.lineWidth = 0.5;
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const dx = pts[i].x - pts[j].x;
          const dy = pts[i].yy - pts[j].yy;
          const d2 = dx * dx + dy * dy;
          if (d2 < LINK * LINK) {
            const alpha = (1 - Math.sqrt(d2) / LINK) * 0.12;
            ctx.strokeStyle = `rgba(148,163,184,${alpha.toFixed(3)})`;
            ctx.beginPath();
            ctx.moveTo(pts[i].x, pts[i].yy);
            ctx.lineTo(pts[j].x, pts[j].yy);
            ctx.stroke();
          }
        }
      }
      /* Estrellas */
      for (const s of pts) {
        const tw = 0.55 + 0.45 * Math.sin(t * s.v * 6 + s.x);
        ctx.beginPath();
        ctx.arc(s.x, s.yy, s.r, 0, Math.PI * 2);
        ctx.fillStyle = s.orange ? `rgba(249,115,22,${(s.a * tw).toFixed(3)})` : `rgba(255,255,255,${(s.a * tw).toFixed(3)})`;
        ctx.fill();
      }
      /* Estrellas fugaces */
      for (let i = meteors.length - 1; i >= 0; i--) {
        const m = meteors[i];
        m.x += m.vx; m.y += m.vy; m.life -= 0.012;
        if (m.life <= 0) { meteors.splice(i, 1); continue; }
        const tx = m.x - m.vx * 9, ty = m.y - m.vy * 9;
        const g = ctx.createLinearGradient(m.x, m.y, tx, ty);
        g.addColorStop(0, `rgba(255,205,160,${m.life.toFixed(3)})`);
        g.addColorStop(1, 'rgba(255,205,160,0)');
        ctx.strokeStyle = g;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(m.x, m.y);
        ctx.lineTo(tx, ty);
        ctx.stroke();
      }
      requestAnimationFrame(draw);
    }

    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('scroll', () => { scrollY = window.scrollY || 0; }, { passive: true });
    setInterval(spawnMeteor, 3800);
    requestAnimationFrame(draw);
  }

  function initAnimations(root) {
    initStars();
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('lp-visible'); io.unobserve(e.target); } });
    }, { threshold: 0.12 });
    root.querySelectorAll('.lp-reveal').forEach(el => io.observe(el));

    const countIO = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (!e.isIntersecting) return;
        const el = e.target;
        const target = Number(el.dataset.count || 0);
        const dur = 1500; const t0 = performance.now();
        const tick = now => {
          const p = Math.min(1, (now - t0) / dur);
          el.textContent = (target >= 100 ? '+' : '') + Math.round(target * (1 - Math.pow(1 - p, 3)));
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
    try {
      try { document.body.setAttribute('data-route', 'landing'); } catch (e) {}
      initTheme();
      root.innerHTML = buildHTML();
      bind(root);
      initAnimations(root);
    } catch (e) {
      console.error('Error en Landing:', e);
      root.innerHTML = '<div style="padding:60px 20px;text-align:center;color:#e2e8f0;font-family:sans-serif"><p>Error al cargar la página. Revisá la consola.</p></div>';
    }
  }

  G.landing = { render };
})(typeof window !== 'undefined' ? window : globalThis);
