/* ============================================================
   GADU · Onboarding inicial ("Antes de arrancar")
   Configuración de perfil (nombre, apellido, apodo, moneda)
   y preparación de la vinculación con WhatsApp.
   - Se muestra UNA sola vez, solo para usuarios nuevos SIN datos.
   - NUNCA bloquea a usuarios con datos cargados.
   - Se puede saltear y completar después desde "Respaldos y datos".
   ============================================================ */
(function (root) {
  'use strict';
  const G = root.GADU;

  function currentProfile() {
    const S = G.store;
    const st = (S && S.data && S.data.settings) || {};
    return st.profile || { nombre: '', apellido: '', apodo: '', moneda: 'ARS', whatsapp: { phone: '', code: '', linked: false } };
  }

  /* Número de destino del bot de GADU para la vinculación por WhatsApp
     (bot de prueba de Meta Cloud API). El enlace wa.me apunta SIEMPRE
     a este número, nunca al teléfono del usuario. */
  const BOT_WHATSAPP_NUMBER = '15556643689';

  /* Genera el código de verificación de WhatsApp. Intenta el endpoint del
     backend; si no está disponible, cae a un código local alfanumérico. */
  async function generateVerificationCode() {
    try {
      if (G.api) {
        const res = await G.api('POST', '/rpc/generate_whatsapp_code', {});
        const c = res && (res.code || (res.data && res.data.code));
        if (c) return String(c);
      }
    } catch (e) { /* sin backend: código local */ }
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let out = '';
    for (let i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)];
    return out;
  }

  function open() {
    const S = G.store, UI = G.ui;
    if (!S || !S.data || !UI || !UI.openModal) return;
    const p = currentProfile();
    const sess = G.auth && G.auth.getSession ? G.auth.getSession() : null;
    const prefNombre = p.nombre || (sess && sess.email ? sess.email.split('@')[0] : '');
    let phone = (p.whatsapp && p.whatsapp.phone) || '';
    let code = (p.whatsapp && p.whatsapp.code) || '';
    const linked = !!(p.whatsapp && p.whatsapp.linked);

    const m = UI.openModal({
      title: (S.data.settings && S.data.settings.onboardingDone) ? '👤 Mi perfil' : '👋 Antes de arrancar',
      subtitle: 'Configurá tu perfil y vinculá WhatsApp para recibir avisos.',
      body:
        '<div class="grid-form">' +
        '<div class="field"><label>Nombre</label><input class="input" id="obNombre" value="' + UI.escapeHtml(prefNombre) + '" placeholder="Tu nombre"></div>' +
        '<div class="field"><label>Apellido</label><input class="input" id="obApellido" value="' + UI.escapeHtml(p.apellido) + '" placeholder="Tu apellido"></div>' +
        '<div class="field"><label>Apodo / Nombre de usuario (se muestra en el encabezado)</label><input class="input" id="obApodo" value="' + UI.escapeHtml(p.apodo) + '" placeholder="Ej.: Fran, Colo, Tano…"></div>' +
        '<div class="field"><label>Moneda principal</label><select class="select" id="obMoneda">' +
        '<option value="ARS"' + (p.moneda !== 'USD' ? ' selected' : '') + '>Pesos ARS ($)</option>' +
        '<option value="USD"' + (p.moneda === 'USD' ? ' selected' : '') + '>Dólares USD (US$)</option>' +
        '</select></div>' +
        '</div>' +
        '<div class="card-inset" style="margin-top:14px">' +
        '<h4>📱 Vinculación con WhatsApp</h4>' +
        (linked
          ? '<div class="split-row" style="gap:8px;align-items:center;margin-bottom:6px">' + UI.chip('Vinculado', 'success', 'whatsapp') + '<span class="muted small">' + UI.escapeHtml(phone) + '</span></div>'
          : '<p class="form-hint">Generá tu código y envialo por WhatsApp para activar los avisos.</p>') +
        '<div class="grid-form" style="margin-top:8px">' +
        '<div class="field"><label>Tu teléfono (con código de país)</label><input class="input" id="obPhone" value="' + UI.escapeHtml(phone) + '" placeholder="+54 9 3547 55-1234" inputmode="tel"></div>' +
        '<div class="field"><label>Código de verificación</label><div class="split-row" style="gap:8px;align-items:center">' +
        '<input class="input" id="obCode" readonly value="' + UI.escapeHtml(code) + '" placeholder="Ej: 99DKFR" style="text-transform:uppercase;letter-spacing:2px;font-weight:700">' +
        '<button type="button" class="btn btn-soft btn-sm" id="obGen" style="flex:none">' + UI.icon('zap', 14) + 'Generar código</button>' +
        '</div></div>' +
        '</div>' +
        '<a class="btn btn-soft-success btn-sm" id="obWaLink" target="_blank" rel="noopener" style="margin-top:10px;display:none">' + UI.icon('whatsapp', 15) + 'Abrir WhatsApp y vincular</a>' +
        '</div>',
      footer:
        '<button class="btn btn-ghost" data-cancel id="obSkip">Saltar por ahora</button>' +
        '<button class="btn btn-primary" data-save>' + UI.icon('check', 15) + 'Guardar y arrancar</button>',
    });

    const updateLink = () => {
      const a = m.panel.querySelector('#obWaLink');
      if (!a) return;
      if (code) {
        a.href = 'https://wa.me/' + BOT_WHATSAPP_NUMBER + '?text=' +
          encodeURIComponent('GADU · Vincular WhatsApp · Código: ' + code + ' · Teléfono: ' + phone);
        a.style.display = '';
      } else {
        a.style.display = 'none';
      }
    };
    m.panel.querySelector('#obGen').addEventListener('click', async () => {
      const btn = m.panel.querySelector('#obGen');
      btn.disabled = true;
      btn.textContent = 'Generando…';
      try {
        code = await generateVerificationCode();
      } catch (e) {
        code = 'ERRGEN';
      }
      m.panel.querySelector('#obCode').value = code;
      updateLink();
      btn.disabled = false;
      btn.innerHTML = UI.icon('zap', 14) + 'Generar código';
    });
    m.panel.querySelector('#obPhone').addEventListener('input', e => { phone = e.target.value; updateLink(); });
    updateLink();

    m.panel.querySelector('[data-cancel]').addEventListener('click', () => {
      try {
        S.data.settings.onboardingDone = true;
        S.save();
      } catch (e) {}
      UI.toast('Listo, podés completar tu perfil cuando quieras desde "Respaldos y datos".', 'info');
      m.close();
    });
    m.panel.querySelector('[data-save]').addEventListener('click', () => {
      try {
        S.data.settings.profile = {
          nombre: m.panel.querySelector('#obNombre').value.trim(),
          apellido: m.panel.querySelector('#obApellido').value.trim(),
          apodo: m.panel.querySelector('#obApodo').value.trim(),
          moneda: m.panel.querySelector('#obMoneda').value,
          whatsapp: { phone, code, linked: !!((p.whatsapp && p.whatsapp.linked)) },
        };
        S.data.settings.onboardingDone = true;
        S.save();
      } catch (e) {}
      UI.toast('¡Perfil guardado! Bienvenido a GADU 👋', 'success');
      m.close();
    });
  }

  /* Puerta de entrada: SOLO usuarios nuevos sin datos y que no lo completaron */
  function maybeShow() {
    try {
      const S = G.store;
      if (!S || !S.data || !S.data.settings) return;
      if (S.data.settings.onboardingDone) return;
      if (S.hasLocalData && S.hasLocalData()) return;   // jamás interrumpir a quien ya tiene datos
      open();
    } catch (e) { /* nunca bloquear el dashboard */ }
  }

  G.onboarding = { maybeShow, open };
})(typeof window !== 'undefined' ? window : globalThis);
