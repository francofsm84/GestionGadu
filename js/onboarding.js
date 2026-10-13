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

  function open() {
    const S = G.store, UI = G.ui;
    if (!S || !S.data || !UI || !UI.openModal) return;
    const p = currentProfile();
    const sess = G.auth && G.auth.getSession ? G.auth.getSession() : null;
    const prefNombre = p.nombre || (sess && sess.email ? sess.email.split('@')[0] : '');
    let phone = (p.whatsapp && p.whatsapp.phone) || '';
    let code = (p.whatsapp && p.whatsapp.code) || '';

    const m = UI.openModal({
      title: '👋 Antes de arrancar',
      subtitle: 'Configurá tu perfil en 30 segundos. Podés saltearlo cuando quieras.',
      body:
        '<div class="grid-form">' +
        '<div class="field"><label>Nombre</label><input class="input" id="obNombre" value="' + UI.escapeHtml(prefNombre) + '" placeholder="Tu nombre"></div>' +
        '<div class="field"><label>Apellido</label><input class="input" id="obApellido" value="' + UI.escapeHtml(p.apellido) + '" placeholder="Tu apellido"></div>' +
        '<div class="field"><label>Apodo (cómo te dicen en la obra)</label><input class="input" id="obApodo" value="' + UI.escapeHtml(p.apodo) + '" placeholder="Ej.: Fran, Colo, Tano…"></div>' +
        '<div class="field"><label>Moneda principal</label><select class="select" id="obMoneda">' +
        '<option value="ARS"' + (p.moneda !== 'USD' ? ' selected' : '') + '>Pesos ARS ($)</option>' +
        '<option value="USD"' + (p.moneda === 'USD' ? ' selected' : '') + '>Dólares USD (US$)</option>' +
        '</select></div>' +
        '</div>' +
        '<div class="card-inset" style="margin-top:14px">' +
        '<h4>📱 Vinculación con WhatsApp</h4>' +
        '<p class="form-hint">Te vamos a avisar por WhatsApp sobre vencimientos y avisos de obra.</p>' +
        '<div class="grid-form" style="margin-top:8px">' +
        '<div class="field"><label>Tu teléfono (con código de país)</label><input class="input" id="obPhone" value="' + UI.escapeHtml(phone) + '" placeholder="+54 9 3547 55-1234" inputmode="tel"></div>' +
        '<div class="field"><label>Código de verificación</label><div class="split-row" style="gap:8px;align-items:center">' +
        '<input class="input" id="obCode" readonly value="' + UI.escapeHtml(code) + '" placeholder="—">' +
        '<button type="button" class="btn btn-soft btn-sm" id="obGen" style="flex:none">' + UI.icon('zap', 14) + 'Generar</button>' +
        '</div></div>' +
        '</div>' +
        '<a class="btn btn-soft-success btn-sm" id="obWaLink" target="_blank" rel="noopener" style="margin-top:10px;display:none">' + UI.icon('whatsapp', 15) + 'Enviar código por WhatsApp</a>' +
        '</div>',
      footer:
        '<button class="btn btn-ghost" data-cancel id="obSkip">Saltar por ahora</button>' +
        '<button class="btn btn-primary" data-save>' + UI.icon('check', 15) + 'Guardar y arrancar</button>',
    });

    const updateLink = () => {
      const a = m.panel.querySelector('#obWaLink');
      if (!a) return;
      if (code) {
        const num = phone.replace(/[^0-9]/g, '');
        a.href = 'https://api.whatsapp.com/send?phone=' + encodeURIComponent(num) +
          '&text=' + encodeURIComponent('GADU · Mi código de verificación: ' + code);
        a.style.display = '';
      } else {
        a.style.display = 'none';
      }
    };
    m.panel.querySelector('#obGen').addEventListener('click', () => {
      code = String(Math.floor(100000 + Math.random() * 900000));
      m.panel.querySelector('#obCode').value = code;
      updateLink();
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
          whatsapp: { phone, code, linked: false },
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
