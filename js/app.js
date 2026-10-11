/* ============================================================
   GADU · Núcleo de la aplicación
   Router hash, sidebar, topbar, tema, respaldos y arranque
   ============================================================ */
(function (root) {
  'use strict';
  const G = root.GADU;
  const S = G.store, UI = G.ui;

  const routes = [];
  let current = null;
  let resizeTimer = null;

  const router = {
    add(key, pattern, title, subtitle, render) {
      routes.push({ key, pattern, title, subtitle: subtitle || '', render });
    },
    navigate(hash) {
      if (location.hash === hash) renderNow();
      else location.hash = hash;
    },
    refresh() { renderNow(); },
  };
  G.router = router;
  G.actions = G.actions || {};

  function parseSegs() { return location.hash.replace(/^#\/?/, '').split('/').filter(Boolean); }

  function match(segs) {
    for (const r of routes) {
      const parts = r.pattern.split('/').filter(Boolean);
      if (parts.length !== segs.length) continue;
      const params = {};
      let ok = true;
      parts.forEach((p, i) => {
        if (p.startsWith(':')) params[p.slice(1)] = decodeURIComponent(segs[i]);
        else if (p !== segs[i]) ok = false;
      });
      if (ok) return { route: r, params };
    }
    return null;
  }

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme === 'light' ? 'light' : 'dark';
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'light' ? '#f2f4fa' : '#0b1020');
    const btn = document.getElementById('btnTheme');
    if (btn) {
      btn.innerHTML = UI.icon(theme === 'light' ? 'moon' : 'sun');
      btn.title = theme === 'light' ? 'Cambiar a modo oscuro' : 'Cambiar a modo claro';
    }
  }

  async function renderNow() {
    const m = match(parseSegs()) || match(['dashboard']);
    current = m;
    const { route, params } = m;
    document.title = route.title + ' · GADU Construye · Tu gestión perfecta';
    document.getElementById('pageTitle').textContent = route.title;
    document.getElementById('pageSubtitle').textContent = route.subtitle || '';
    document.querySelectorAll('.nav-link').forEach(a => {
      const r = a.getAttribute('data-route');
      if (r) a.classList.toggle('active', r === route.key || (route.key === 'obra' && r === 'obras') || (route.key === 'empleado' && r === 'empleados'));
    });
    const view = document.getElementById('view');
    view.innerHTML = '';
    window.scrollTo(0, 0);
    try {
      await route.render(view, params);
    } catch (err) {
      console.error(err);
      view.innerHTML = UI.emptyState('alert-triangle', 'No se pudo mostrar esta sección', String((err && err.message) || err));
    }
    updateBadges();
    closeMobileSidebar();
  }

  function updateBadges() {
    const data = S.data;
    const active = data.works.filter(w => w.status === 'activa').length;
    const b1 = document.getElementById('badgeObras');
    if (b1) { b1.textContent = active; b1.hidden = !active; }
    const over = S.distributionSummary().overdue.length;
    const b2 = document.getElementById('badgeLiquidaciones');
    if (b2) { b2.textContent = over; b2.hidden = !over; }
  }

  /* ---------- Sidebar ---------- */
  function syncCollapse(collapsed) {
    document.querySelectorAll('.nav-link .nav-label').forEach(el => { el.hidden = collapsed; });
    document.querySelectorAll('.nav-section').forEach(el => { el.classList.toggle('collapsed', collapsed); });
    document.querySelectorAll('.nav-link').forEach(a => {
      const lbl = a.querySelector('.nav-label');
      a.title = collapsed && lbl ? lbl.textContent : '';
    });
  }

  function closeMobileSidebar() {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('backdrop').classList.remove('show');
  }

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  function initSidebar() {
    const sb = document.getElementById('sidebar');
    const collapsed = lsGet('gadu_sb_collapsed') === '1';
    document.body.classList.toggle('sb-collapsed', collapsed);
    syncCollapse(collapsed);
    document.getElementById('btnCollapse').addEventListener('click', () => {
      const now = !document.body.classList.contains('sb-collapsed');
      document.body.classList.toggle('sb-collapsed', now);
      lsSet('gadu_sb_collapsed', now ? '1' : '0');
      syncCollapse(now);
    });
    document.getElementById('btnMenu').addEventListener('click', () => {
      sb.classList.add('open');
      document.getElementById('backdrop').classList.add('show');
    });
    document.getElementById('sidebarClose').addEventListener('click', closeMobileSidebar);
    document.getElementById('backdrop').addEventListener('click', closeMobileSidebar);
    document.querySelectorAll('.nav-link[data-route]').forEach(a => a.addEventListener('click', closeMobileSidebar));
    document.getElementById('btnBackup').addEventListener('click', closeMobileSidebar);
  }

  /* ---------- Topbar ---------- */
  function initTopbar() {
    document.querySelectorAll('[data-action]').forEach(el => {
      el.addEventListener('click', e => {
        e.stopPropagation();
        const fn = G.actions[el.getAttribute('data-action')];
        if (fn) {
          try { fn(); }
          catch (err) { console.error(err); UI.toast('No se pudo abrir: ' + ((err && err.message) || err), 'error'); }
        } else {
          UI.toast('Función no disponible', 'error');
        }
        document.getElementById('quickMenu').hidden = true;
      });
    });
    const more = document.getElementById('btnMore');
    const menu = document.getElementById('quickMenu');
    more.addEventListener('click', e => { e.stopPropagation(); menu.hidden = !menu.hidden; });
    document.addEventListener('click', () => { menu.hidden = true; });
    document.getElementById('btnTheme').addEventListener('click', () => {
      const d = S.data;
      const next = d.settings.theme === 'dark' ? 'light' : 'dark';
      d.settings.theme = next;
      S.save();
      applyTheme(next);
    });
  }

  /* ---------- Respaldos ---------- */
  function openBackup() {
    const cfg = (S.data.settings && S.data.settings.cloud) || {};
    const sess = G.auth.getSession();
    const pi = planInfo();
    const m = UI.openModal({
      title: 'Respaldos y datos',
      subtitle: 'Tu información se guarda automáticamente en este navegador (localStorage).',
      body:
        '<div class="backup-options">' +
        '<button class="btn btn-soft" id="bExport">' + UI.icon('download') + 'Exportar respaldo JSON</button>' +
        '<button class="btn btn-soft" id="bImport">' + UI.icon('upload') + 'Importar respaldo</button>' +
        '<input type="file" id="fileImport" accept="application/json,.json" hidden>' +
        '<button class="btn btn-danger" id="bReset">' + UI.icon('trash') + 'Restaurar datos de ejemplo</button>' +
        '</div>' +
        '<p class="form-hint" style="margin-top:14px">Recomendación: exportá un respaldo antes de importar o restablecer. El respaldo incluye obras, presupuestos, ingresos, gastos, contactos, empleados, herramientas y liquidaciones.</p>' +
        '<div class="card-inset">' +
        '<h4>Empezar con datos reales</h4>' +
        '<p class="form-hint">Borra los datos de demostración y deja <strong>un ejemplo por módulo</strong> (obra, cliente, proveedor, empleado, herramienta, etc.) con montos en $0, para que cargues tus datos reales encima editando o reemplazando cada ejemplo.</p>' +
        '<div class="backup-options" style="margin-top:8px">' +
        '<button class="btn btn-soft-success" id="bStartReal">' + UI.icon('check-circle') + 'Dejar 1 ejemplo por módulo</button>' +
        '<button class="btn btn-danger" id="bStartEmpty">' + UI.icon('trash') + 'Vaciar por completo (sin ejemplos)</button>' +
        '</div></div>' +
        '<div class="card-inset">' +
        '<h4>👤 Mi cuenta</h4>' +
        '<p class="form-hint">' + UI.escapeHtml((sess && sess.email) || '') + ' · ' + UI.chip(pi.label, pi.tone, piIcon(pi)) + '</p>' +
        '<div class="backup-options" style="margin-top:10px">' +
        '<button class="btn btn-soft-success" id="bPush">' + UI.icon('upload') + 'Subir mis datos ahora</button>' +
        '<button class="btn btn-soft-info" id="bPull">' + UI.icon('download') + 'Descargar mis datos</button>' +
        '<button class="btn btn-soft" id="bCloudTest">' + UI.icon('activity') + 'Probar conexión</button>' +
        '</div>' +
        '<label class="form-hint" style="display:block;margin-top:10px"><input type="checkbox" id="cAuto"' + (cfg.autoPush ? ' checked' : '') + ' style="accent-color:var(--primary)"> Sincronizar automáticamente cada vez que guardo</label>' +
        '<p class="form-hint" id="cloudStatus" style="margin-top:8px"></p>' +
        '<button class="btn btn-danger" id="bLogout" style="margin-top:10px">' + UI.icon('log-out', 15) + 'Cerrar sesión</button>' +
        '</div>',
    });
    m.panel.querySelector('#bExport').addEventListener('click', () => {
      UI.download('gadu-respaldo-' + S.todayISO() + '.json', S.exportJSON(), 'application/json');
      UI.toast('Respaldo exportado');
    });
    m.panel.querySelector('#bImport').addEventListener('click', () => m.panel.querySelector('#fileImport').click());
    m.panel.querySelector('#fileImport').addEventListener('change', e => {
      const input = e.target;
      const f = input.files && input.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const ok = await UI.confirm({
            title: 'Importar respaldo',
            message: 'Se reemplazarán <strong>todos</strong> los datos actuales por el contenido de <strong>' + UI.escapeHtml(f.name) + '</strong>. Esta acción no se puede deshacer. ¿Continuar?',
            okLabel: 'Importar',
            tone: 'danger',
          });
          if (!ok) return;
          S.importJSON(String(reader.result));
          UI.toast('Respaldo importado correctamente');
          m.close();
          renderNow();
        } catch (err) {
          UI.toast('No se pudo importar: ' + ((err && err.message) || 'archivo inválido'), 'error');
        } finally {
          input.value = '';
        }
      };
      reader.readAsText(f);
    });
    m.panel.querySelector('#bReset').addEventListener('click', async () => {
      const ok = await UI.confirm({
        title: 'Restaurar datos de ejemplo',
        message: 'Se reemplazará toda la información actual por los datos de demostración. ¿Continuar?',
        okLabel: 'Restaurar',
      });
      if (ok) {
        S.reset();
        UI.toast('Datos de ejemplo restaurados');
        m.close();
        renderNow();
      }
    });
    m.panel.querySelector('#bStartReal').addEventListener('click', async () => {
      const ok = await UI.confirm({
        title: 'Empezar con datos reales',
        message: 'Se eliminarán los datos actuales y quedará <strong>un ejemplo por módulo</strong> (obra, cliente, proveedor, empleado, herramienta, liquidación, etc.) con montos en $0 para que cargues tus datos reales. Exportá un respaldo antes si querés conservar lo actual.',
        okLabel: 'Sí, empezar de cero',
      });
      if (ok) {
        S.startReal();
        UI.toast('Listo: quedó un ejemplo en cada módulo');
        m.close();
        renderNow();
      }
    });
    m.panel.querySelector('#bStartEmpty').addEventListener('click', async () => {
      const ok = await UI.confirm({
        title: 'Vaciar por completo',
        message: 'Se vaciará <strong>todo</strong>: obras, presupuestos, ingresos, gastos, contactos, empleados, herramientas y liquidaciones. La app quedará sin ningún dato. ¿Continuar?',
        okLabel: 'Vaciar todo',
        tone: 'danger',
      });
      if (ok) {
        S.startEmpty();
        UI.toast('Datos vaciados');
        m.close();
        renderNow();
      }
    });
    /* ---------- Nube (Supabase) ---------- */
    const setStatus = (msg, ok) => {
      const el = m.panel.querySelector('#cloudStatus');
      el.textContent = msg;
      el.style.color = ok ? 'var(--success)' : 'var(--danger)';
    };
    m.panel.querySelector('#cAuto').addEventListener('change', e => {
      S.data.settings.cloud = { autoPush: e.target.checked };
      S.save();
      if (e.target.checked) UI.toast('Sincronización automática activada', 'info');
    });
    m.panel.querySelector('#bCloudTest').addEventListener('click', async () => {
      setStatus('Probando conexión…');
      try {
        await G.sync.test();
        setStatus('✅ Conexión OK: todo listo para sincronizar.', true);
      } catch (err) {
        setStatus('❌ No se pudo conectar: ' + ((err && err.message) || err), false);
      }
    });
    m.panel.querySelector('#bPush').addEventListener('click', async () => {
      setStatus('Subiendo…');
      try {
        await G.sync.push(S.data);
        S.data.settings.lastCloudSync = new Date().toISOString();
        S.save();
        setStatus('✅ Datos subidos a la nube (' + new Date().toLocaleTimeString('es-AR') + ').', true);
      } catch (err) {
        setStatus('❌ No se pudo subir: ' + ((err && err.message) || err), false);
      }
    });
    m.panel.querySelector('#bPull').addEventListener('click', async () => {
      setStatus('Buscando datos en la nube…');
      try {
        const remote = await G.sync.pull();
        if (!remote) { setStatus('No hay datos guardados en la nube todavía. Subí primero desde el otro dispositivo.', false); return; }
        const ok = await UI.confirm({
          title: 'Descargar desde la nube',
          message: 'Se reemplazarán los datos de este dispositivo por los de la nube (última actualización: <strong>' + UI.escapeHtml(String(remote.updatedAt || '—')) + '</strong>). ¿Continuar?',
          okLabel: 'Descargar y reemplazar',
          tone: 'danger',
        });
        if (!ok) return;
        S.importJSON(JSON.stringify(remote.data));
        S.data.settings.lastCloudSync = String(remote.updatedAt);
        S.save();
        setStatus('✅ Datos descargados. La app se actualizó.', true);
        m.close();
        renderNow();
      } catch (err) {
        setStatus('❌ No se pudo descargar: ' + ((err && err.message) || err), false);
      }
    });
    m.panel.querySelector('#bLogout').addEventListener('click', async () => {
      const ok = await UI.confirm({
        title: 'Cerrar sesión',
        message: 'Se cerrará tu sesión. Tus datos quedan guardados en este dispositivo y en la nube.',
        okLabel: 'Cerrar sesión',
      });
      if (ok) {
        await G.auth.logout();
        S.attachUser(null);
        location.reload();
      }
    });
  }

  /* ---------- Sesión, plan y arranque (SaaS) ---------- */
  let profile = null;

  function planInfo() {
    if (!profile) return { label: 'Plan', tone: 'neutral', locked: false };
    const now = Date.now();
    if (profile.plan === 'pro') {
      const until = profile.paid_until ? new Date(profile.paid_until).getTime() : null;
      if (until && until < now) return { label: 'Pro vencido', tone: 'warning', locked: true };
      return { label: 'Plan Pro', tone: 'success', locked: false };
    }
    if (profile.plan === 'suspendido') return { label: 'Suspendido', tone: 'danger', locked: true };
    const end = profile.trial_end ? new Date(profile.trial_end).getTime() : now;
    const days = Math.max(0, Math.ceil((end - now) / 86400000));
    if (end < now) return { label: 'Prueba vencida', tone: 'danger', locked: true };
    return { label: 'Prueba · ' + days + ' día' + (days !== 1 ? 's' : ''), tone: 'info', locked: false };
  }

  function piIcon(pi) {
    if (pi.locked) return 'alert-triangle';
    return pi.tone === 'success' ? 'check-circle' : 'user';
  }

  function renderLock() {
    const pi = planInfo();
    const sess = G.auth.getSession();
    const overlay = document.createElement('div');
    overlay.className = 'lock-overlay';
    overlay.innerHTML =
      '<div class="lock-card">' +
      '<span class="lock-ico">🔒</span>' +
      '<h2>' + (pi.label === 'Suspendido' ? 'Tu cuenta está suspendida' : 'Tu período de prueba terminó') + '</h2>' +
      '<p>Tus datos están guardados y seguros. Para seguir usando GADU, escribinos por WhatsApp y te activamos el plan al instante.</p>' +
      '<a class="btn btn-primary" href="https://wa.me/5493547469000?text=' + encodeURIComponent('Hola! Quiero activar mi plan de GADU. Mi email: ' + (sess ? sess.email : '')) + '" target="_blank" rel="noopener">' + UI.icon('whatsapp', 16) + 'Activar por WhatsApp</a>' +
      '<button class="btn btn-ghost" id="lockLogout">Cerrar sesión</button>' +
      '</div>';
    document.body.appendChild(overlay);
    overlay.querySelector('#lockLogout').addEventListener('click', () => {
      G.auth.logout();
      S.attachUser(null);
      location.reload();
    });
  }

  function renderLogin(mode) {
    document.body.classList.add('no-session');
    const view = document.getElementById('view');
    const signup = mode === 'signup';
    view.innerHTML =
      '<div class="login-wrap"><div class="login-card">' +
      '<img src="logo.png" alt="GADU Construye" class="login-logo">' +
      '<p class="login-slogan">Tu gestión, perfecta</p>' +
      '<div class="login-tabs">' +
      '<button id="tLogin"' + (signup ? '' : ' class="active"') + '>Iniciar sesión</button>' +
      '<button id="tSignup"' + (signup ? ' class="active"' : '') + '>Crear cuenta</button>' +
      '</div>' +
      '<div class="grid-form" style="margin-top:14px">' +
      '<div class="field span-2"><label>Email</label><input class="input" type="email" id="lEmail" placeholder="tu@email.com" autocomplete="email"></div>' +
      '<div class="field span-2"><label>Contraseña</label><input class="input" type="password" id="lPass" placeholder="Mínimo 6 caracteres" autocomplete="current-password"></div>' +
      '</div>' +
      '<p class="form-hint" id="loginMsg" style="margin-top:8px"></p>' +
      '<button class="btn btn-primary" id="lGo" style="width:100%">' + (signup ? 'Crear cuenta y empezar gratis' : 'Entrar') + '</button>' +
      '<p class="form-hint" style="margin-top:12px;text-align:center">' + (signup ? 'Probá 14 días gratis · sin tarjeta.' : '¿No tenés cuenta? Creala: es gratis.') + '</p>' +
      '</div></div>';
    const setMsg = (msg, err) => {
      const el = document.getElementById('loginMsg');
      el.textContent = msg || '';
      el.style.color = err ? 'var(--danger)' : 'var(--muted)';
    };
    document.getElementById('tLogin').addEventListener('click', () => renderLogin('login'));
    document.getElementById('tSignup').addEventListener('click', () => renderLogin('signup'));
    const go = async () => {
      const email = document.getElementById('lEmail').value.trim();
      const pass = document.getElementById('lPass').value;
      if (!email || !pass) { setMsg('Completá email y contraseña.', true); return; }
      if (pass.length < 6) { setMsg('La contraseña necesita al menos 6 caracteres.', true); return; }
      setMsg(signup ? 'Creando tu cuenta…' : 'Entrando…');
      try {
        if (signup) await G.auth.signup(email, pass);
        else await G.auth.login(email, pass);
        await startApp();
      } catch (err) {
        if (err && err.message === 'CONFIRMA_EMAIL') {
          setMsg('Te enviamos un email de confirmación. Confirmalo y después iniciá sesión.', true);
        } else {
          setMsg('No se pudo ' + (signup ? 'crear la cuenta' : 'entrar') + ': ' + ((err && err.message) || err), true);
        }
      }
    };
    document.getElementById('lGo').addEventListener('click', go);
    document.getElementById('lPass').addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
  }

  async function startApp() {
    const sess = G.auth.getSession();
    if (!sess) { renderLogin('login'); return; }
    S.attachUser(sess.userId);
    S.load();
    applyTheme(S.data.settings.theme || 'dark');
    document.body.classList.remove('no-session');

    try { profile = await G.auth.getProfile(); } catch (e) { profile = null; }
    const pi = planInfo();
    if (pi.locked) { renderLock(); return; }

    const bu = document.getElementById('btnUser');
    if (bu) {
      bu.hidden = false;
      bu.textContent = '👤 ' + (sess.email || 'Cuenta').split('@')[0];
      bu.title = (sess.email || '') + ' · ' + pi.label;
      bu.addEventListener('click', openBackup);
    }

    /* Datos: nube vs dispositivo local */
    try {
      const remote = await G.sync.pull();
      const lastSync = S.data.settings.lastCloudSync || '';
      if (remote && (!lastSync || String(remote.updatedAt) > String(lastSync))) {
        const ok = await UI.confirm({
          title: 'Tus datos están en la nube',
          message: 'Encontré tus datos en la nube (última actualización: <strong>' + UI.escapeHtml(String(remote.updatedAt || '—')) + '</strong>). ¿Descargarlos a este dispositivo?',
          okLabel: 'Descargar',
        });
        if (ok) {
          S.importJSON(JSON.stringify(remote.data));
          S.data.settings.lastCloudSync = String(remote.updatedAt);
          S.save();
          UI.toast('Datos descargados de la nube');
        }
      } else if (!remote && !S.hasLocalData()) {
        S.startReal();
        UI.toast('¡Bienvenido a GADU! Dejamos un ejemplo en cada módulo para que arranques.');
        try {
          await G.sync.push(S.data);
          S.data.settings.lastCloudSync = new Date().toISOString();
          S.save();
        } catch (e) {}
      } else if (!remote && S.hasLocalData()) {
        try {
          await G.sync.push(S.data);
          S.data.settings.lastCloudSync = new Date().toISOString();
          S.save();
          UI.toast('Tus datos locales se subieron a la nube');
        } catch (e) {}
      }
    } catch (e) { /* sin conexión: la app sigue en modo local */ }

    if (!location.hash || location.hash === '#') location.hash = '#/dashboard';
    else renderNow();
  }

  /* API interna (para pruebas e integración) */
  G.app = { startApp, renderLogin, planInfo };

  /* ---------- Arranque ---------- */
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-icon]').forEach(el => {
      const size = el.getAttribute('data-size');
      el.innerHTML = UI.icon(el.getAttribute('data-icon'), size ? +size : 18);
    });
    initSidebar();
    initTopbar();
    document.getElementById('btnBackup').addEventListener('click', openBackup);
    window.addEventListener('hashchange', renderNow);
    let lastWidth = window.innerWidth;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (window.innerWidth === lastWidth) return;
        lastWidth = window.innerWidth;
        if (current) renderNow();
      }, 250);
    });
    window.addEventListener('storage', e => {
      const sess = G.auth.getSession();
      if (!sess) return;
      const userKey = S.KEY + '_' + sess.userId;
      if (e.key !== userKey && e.key !== null) return;
      S.reload();
      UI.toast('Datos actualizados desde otra pestaña', 'info');
      renderNow();
    });
    const sess = G.auth.load();
    if (sess) {
      (async () => {
        try { await G.auth.refresh(); } catch (e) {}
        if (!G.auth.getSession()) { renderLogin('login'); return; }
        await startApp();
      })();
    } else {
      renderLogin('login');
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
