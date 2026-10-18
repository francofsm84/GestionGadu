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

  /* Número de destino del bot de GADU para la vinculación por WhatsApp.
     Centralizado en G.BOT_PHONE_NUMBER (definido en js/app.js). */
  const BOT_WHATSAPP_NUMBER = G.BOT_PHONE_NUMBER || '5493547665984';

  /* Prefijos de país más comunes (Argentina +54 por defecto) */
  const COUNTRY_CODES = [
    { v: '54', l: 'Argentina' }, { v: '598', l: 'Uruguay' }, { v: '56', l: 'Chile' },
    { v: '52', l: 'México' }, { v: '593', l: 'Ecuador' }, { v: '57', l: 'Colombia' },
    { v: '51', l: 'Perú' }, { v: '595', l: 'Paraguay' }, { v: '591', l: 'Bolivia' },
    { v: '55', l: 'Brasil' }, { v: '34', l: 'España' }, { v: '1', l: 'EE.UU. / Canadá' },
  ];

  /* Separa un teléfono completo guardado en prefijo + número local */
  function splitPhone(full) {
    const digits = String(full || '').replace(/\D/g, '');
    for (const c of COUNTRY_CODES) {
      if (digits.startsWith(c.v)) {
        return { prefix: c.v, local: digits.slice(c.v.length).replace(/^0+/, '') };
      }
    }
    return { prefix: '54', local: digits.replace(/^0+/, '') };
  }

  /* Genera el código de verificación de WhatsApp: 6 DÍGITOS numéricos.
     Se genera en el cliente y se persiste en settings.profile.whatsapp.code
     para que el webhook lo valide contra app_data (búsqueda ilike). */
  async function generateVerificationCode() {
    return String(Math.floor(100000 + Math.random() * 900000));
  }

  function open() {
    const S = G.store, UI = G.ui;
    if (!S || !S.data || !UI || !UI.openModal) return;
    const p = currentProfile();
    const sess = G.auth && G.auth.getSession ? G.auth.getSession() : null;
    const prefNombre = p.nombre || (sess && sess.email ? sess.email.split('@')[0] : '');
    const split = splitPhone((p.whatsapp && p.whatsapp.phone) || '');
    let prefix = split.prefix;
    let local = split.local;
    let code = (p.whatsapp && p.whatsapp.code) || '';
    const linked = !!(p.whatsapp && p.whatsapp.linked);
    const phoneDigits = () => '+' + prefix + local.replace(/[^\d]/g, '').replace(/^0+/, '');
    let photo = p.photo || null;

    const m = UI.openModal({
      title: (S.data.settings && S.data.settings.onboardingDone) ? '👤 Mi perfil' : '👋 Antes de arrancar',
      subtitle: 'Configurá tu perfil y vinculá WhatsApp para recibir avisos.',
      body:
        '<div style="display:flex;align-items:center;gap:14px;margin-bottom:16px">' +
        '<div id="obAvatar">' + UI.avatar((prefNombre + ' ' + (p.apellido || '')).trim() || 'U', 64, photo) + '</div>' +
        '<div style="flex:1;min-width:0">' +
        '<button type="button" class="btn btn-soft btn-sm" id="obPhotoBtn">' + UI.icon('camera', 15) + (photo ? ' Cambiar foto' : ' Subir foto') + '</button>' +
        (photo ? '<button type="button" class="btn btn-ghost btn-sm" id="obPhotoDel" style="margin-left:6px">' + UI.icon('trash', 14) + '</button>' : '') +
        '<input type="file" id="obPhotoInput" accept="image/*" hidden>' +
        '<div class="form-hint" style="margin-top:4px">Se guarda como tu foto de perfil.</div>' +
        '</div>' +
        '</div>' +
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
          ? '<div class="split-row" style="gap:8px;align-items:center;margin-bottom:6px">' + UI.chip('Vinculado', 'success', 'whatsapp') + '<span class="muted small">' + UI.escapeHtml(phoneDigits()) + '</span></div>'
          : '<p class="form-hint">Generá tu código y envialo por WhatsApp para activar los avisos.</p>') +
        '<div class="grid-form" style="margin-top:8px">' +
        '<div class="field"><label>Tu teléfono</label>' +
        '<div class="split-row" style="gap:8px;align-items:center">' +
        '<select class="select" id="obPrefix" style="max-width:120px">' +
        COUNTRY_CODES.map(c => '<option value="' + c.v + '"' + (prefix === c.v ? ' selected' : '') + '>+' + c.v + ' ' + c.l + '</option>').join('') +
        '</select>' +
        '<input class="input" id="obPhone" value="' + UI.escapeHtml(local) + '" placeholder="Ej: 9 3547 55-1234" inputmode="tel" style="flex:1;min-width:0">' +
        '</div>' +
        '<span class="form-hint" id="obPhoneFull" style="margin-top:4px">Número completo: ' + UI.escapeHtml(phoneDigits()) + '</span></div>' +
        '<div class="field"><label>Código de verificación</label><div class="split-row" style="gap:8px;align-items:center">' +
        '<input class="input" id="obCode" readonly value="' + UI.escapeHtml(code) + '" placeholder="Ej: 99DKFR" style="text-transform:uppercase;letter-spacing:2px;font-weight:700">' +
        '<button type="button" class="btn btn-soft btn-sm" id="obGen" style="flex:none">' + UI.icon('zap', 14) + 'Generar código</button>' +
        '</div></div>' +
        '</div>' +
        '<div style="margin-top:10px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">' +
          '<a class="btn btn-soft-success btn-sm" id="obWaLink" target="_blank" rel="noopener" style="display:none">' + UI.icon('whatsapp', 15) + 'Abrir WhatsApp y vincular</a>' +
          '<button type="button" class="btn btn-soft btn-sm" id="obCopy">' + UI.icon('copy', 15) + 'Copiar código</button>' +
        '</div>' +
        '<p class="muted small" style="margin-top:8px">Si tenés más de un WhatsApp, usá "Copiar código" y pegalo en el chat del bot desde la app que prefieras.</p>' +
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
          encodeURIComponent('GADU · Vincular WhatsApp · Código: ' + code + ' · Teléfono: ' + phoneDigits());
        a.style.display = '';
      } else {
        a.style.display = 'none';
      }
    };
    const syncPhone = () => {
      const fullEl = m.panel.querySelector('#obPhoneFull');
      if (fullEl) fullEl.textContent = 'Número completo: ' + phoneDigits();
      updateLink();
    };
    m.panel.querySelector('#obGen').addEventListener('click', async () => {
      const btn = m.panel.querySelector('#obGen');
      btn.disabled = true;
      btn.textContent = 'Generando…';
      try {
        code = await generateVerificationCode();
      } catch (e) {
        code = '123456';
      }
      m.panel.querySelector('#obCode').value = code;
      /* Persistir YA el código + teléfono: el webhook lo valida contra app_data
         sin esperar al botón "Guardar". */
      try {
        const st = S.data.settings;
        st.profile = st.profile || {};
        const wa = st.profile.whatsapp || {};
        st.profile.whatsapp = {
          ...wa,
          phone: phoneDigits(),
          code,
          linked: !!wa.linked,
          linkedPhone: wa.linkedPhone || '',
          linkedAt: wa.linkedAt || '',
        };
        S.save();
      } catch (e) { /* no bloquear la UI */ }
      updateLink();
      btn.disabled = false;
      btn.innerHTML = UI.icon('zap', 14) + 'Generar código';
    });
    m.panel.querySelector('#obPrefix').addEventListener('change', e => { prefix = e.target.value; syncPhone(); });
    m.panel.querySelector('#obPhone').addEventListener('input', e => { local = e.target.value; syncPhone(); });
    updateLink();

    /* ---------- Foto de perfil (avatar) ---------- */
    const avatarName = () => {
      const n = m.panel.querySelector('#obNombre').value.trim();
      const a = m.panel.querySelector('#obApellido').value.trim();
      return (n + ' ' + a).trim() || prefNombre || 'U';
    };
    const renderAvatar = () => {
      const slot = m.panel.querySelector('#obAvatar');
      if (slot) slot.innerHTML = UI.avatar(avatarName(), 64, photo);
      const del = m.panel.querySelector('#obPhotoDel');
      if (del) del.style.display = photo ? '' : 'none';
      const btn = m.panel.querySelector('#obPhotoBtn');
      if (btn) btn.innerHTML = UI.icon('camera', 15) + (photo ? ' Cambiar foto' : ' Subir foto');
    };
    const blobToDataURL = blob => new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = () => rej(new Error('No se pudo leer la imagen'));
      r.readAsDataURL(blob);
    });
    m.panel.querySelector('#obPhotoBtn').addEventListener('click', () => m.panel.querySelector('#obPhotoInput').click());
    m.panel.querySelector('#obPhotoInput').addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      try {
        const blob = await UI.compressImage(file, 320, 0.82);
        photo = await blobToDataURL(blob);
        renderAvatar();
        UI.toast('Foto cargada. Guardá para confirmar.', 'info');
      } catch (err) {
        UI.toast('No se pudo cargar la foto: ' + ((err && err.message) || err), 'error');
      }
      e.target.value = '';
    });
    m.panel.querySelector('#obNombre').addEventListener('input', renderAvatar);
    m.panel.querySelector('#obApellido').addEventListener('input', renderAvatar);
    const photoDel = m.panel.querySelector('#obPhotoDel');
    if (photoDel) photoDel.addEventListener('click', () => { photo = null; renderAvatar(); });

    /* Copiar el código al portapapeles (con fallback para navegadores viejos) */
    const copyFallback = (text) => {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        ta.setSelectionRange(0, text.length);
        document.execCommand('copy');
        document.body.removeChild(ta);
        UI.toast('Mensaje copiado al portapapeles');
      } catch (e) {
        try { UI.toast('No se pudo copiar. Copiá el código a mano.', 'error'); } catch (e2) {}
      }
    };
    m.panel.querySelector('#obCopy').addEventListener('click', () => {
      const text = 'GADU · Vincular WhatsApp · Código: ' + code;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(
          () => UI.toast('Mensaje copiado al portapapeles'),
          () => copyFallback(text),
        );
      } else {
        copyFallback(text);
      }
    });

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
          photo: photo || (p.photo || null),
          whatsapp: {
            phone: phoneDigits(),
            code,
            linked: !!((p.whatsapp && p.whatsapp.linked)),
            linkedPhone: (p.whatsapp && p.whatsapp.linkedPhone) || '',
            linkedAt: (p.whatsapp && p.whatsapp.linkedAt) || '',
          },
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
      if (!S) return;
      const forceDone = () => {
        if (S.data && S.data.settings) S.data.settings.onboardingDone = true;
        try { S.save(); } catch (e) {}
      };
      /* 1) Admin → forzar bandera y nunca interrumpir */
      if (G.plan && G.plan.isAdmin && G.plan.isAdmin()) { forceDone(); return; }
      /* 2) Bandera completada (memoria + localStorage, síncrono) */
      if (S.hasOnboarded && S.hasOnboarded()) return;
      if (!S.data || !S.data.settings) return;
      /* 3) WhatsApp vinculado o datos existentes → forzar true y no interrumpir */
      const wa = S.data.settings.profile && S.data.settings.profile.whatsapp;
      if ((wa && wa.linked) || (S.hasLocalData && S.hasLocalData())) {
        forceDone();
        return;
      }
      open();
    } catch (e) { /* nunca bloquear el dashboard */ }
  }

  /* ---------- Tutorial de bienvenida (3 pasos) ---------- */
  const TUTORIAL_STEPS = [
    { icon: 'whatsapp', title: 'Vinculá tu WhatsApp', text: '¡Bienvenido a GADU! Vinculá tu WhatsApp desde "Mi Perfil" para cargar gastos por audio.' },
    { icon: 'hard-hat', title: 'Creá tu primera obra', text: 'Creá tu primera obra para empezar a controlar tus costos.' },
    { icon: 'zap', title: 'Usá el asistente', text: 'Usá el asistente (el robot del costado) para pedir presupuestos o consultar saldos en segundos.' },
  ];

  function showTutorial() {
    const UI = G.ui;
    if (!UI || !UI.openModal) return;
    let step = 0;
    const m = UI.openModal({
      title: '👋 Bienvenido a GADU',
      subtitle: 'Tres pasos para sacarle el máximo provecho',
      body: '<div id="tutBody"></div>',
      footer: '<button class="btn btn-ghost" data-cancel>Saltar</button><button class="btn btn-primary" data-next>Siguiente</button>',
    });
    const renderStep = () => {
      const s = TUTORIAL_STEPS[step];
      m.panel.querySelector('#tutBody').innerHTML =
        '<div style="text-align:center;padding:6px 0">' +
        '<div style="margin-bottom:10px">' + UI.icon(s.icon, 44) + '</div>' +
        '<strong style="font-size:16px;display:block;margin-bottom:8px">' + s.title + '</strong>' +
        '<p class="muted" style="margin:0">' + s.text + '</p>' +
        '<div style="margin-top:16px">' +
        TUTORIAL_STEPS.map((_, i) => '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + (i === step ? 'var(--primary)' : 'var(--muted)') + ';margin:0 4px"></span>').join('') +
        '</div></div>';
      m.panel.querySelector('[data-next]').textContent = step === TUTORIAL_STEPS.length - 1 ? 'Finalizar' : 'Siguiente';
    };
    renderStep();
    const done = () => { try { localStorage.setItem('gadu_onboarding_done', 'true'); } catch (e) {} };
    m.panel.querySelector('[data-next]').addEventListener('click', () => {
      if (step < TUTORIAL_STEPS.length - 1) { step++; renderStep(); }
      else { done(); m.close(); }
    });
    m.panel.querySelector('[data-cancel]').addEventListener('click', () => { done(); m.close(); });
  }

  function maybeTutorial() {
    try {
      if (localStorage.getItem('gadu_onboarding_done')) return;
      showTutorial();
    } catch (e) { /* nunca bloquear */ }
  }

  /* ---------- Banner de instalación PWA ---------- */
  let deferredPrompt = null;

  function initPWA() {
    if (typeof window === 'undefined') return;
    const standalone = !!(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
    if (standalone || window.navigator.standalone === true) return;
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
      showInstallBanner();
    });
  }

  function showInstallBanner() {
    if (document.getElementById('pwaBanner')) return;
    const host = document.createElement('div');
    host.id = 'pwaBanner';
    host.className = 'pwa-banner';
    host.innerHTML =
      '<span style="flex:1;min-width:0">📲 Instalá GADU en tu celular para usarla sin internet</span>' +
      '<button class="btn btn-primary btn-sm" id="pwaInstall">Instalar</button>' +
      '<button class="icon-btn sm" id="pwaClose" title="Cerrar" style="flex:none">×</button>';
    document.body.appendChild(host);
    host.querySelector('#pwaInstall').addEventListener('click', async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      try {
        const choice = await deferredPrompt.userChoice;
        if (choice && choice.outcome === 'accepted') { try { G.ui && G.ui.toast('✅ ¡GADU instalada!'); } catch (e) {} }
      } catch (e) {}
      deferredPrompt = null;
      host.remove();
    });
    host.querySelector('#pwaClose').addEventListener('click', () => host.remove());
  }

  G.onboarding = { maybeShow, open, maybeTutorial, showTutorial };
  G.pwa = { init: initPWA };
})(typeof window !== 'undefined' ? window : globalThis);
