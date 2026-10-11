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
    const segAlerta = S.data.seguros.filter(s => {
      const st = S.seguroEstado(s);
      return st.key === 'vencido' || st.key === 'hoy' || st.key === 'por-vencer';
    }).length;
    const b3 = document.getElementById('badgeSeguros');
    if (b3) { b3.textContent = segAlerta; b3.hidden = !segAlerta; }
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
    const sb = document.getElementById('sidebar');
    const bd = document.getElementById('backdrop');
    if (sb) sb.classList.remove('open');
    if (bd) bd.classList.remove('show');
  }

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  /* Bind seguro: nunca lanza si un elemento falta (DOM alterado por extensiones) */
  function $id(id) { return document.getElementById(id); }
  function bind(id, evt, fn) { const el = $id(id); if (el) el.addEventListener(evt, fn); }

  function initSidebar() {
    const sb = $id('sidebar');
    const collapsed = lsGet('gadu_sb_collapsed') === '1';
    document.body.classList.toggle('sb-collapsed', collapsed);
    syncCollapse(collapsed);
    bind('btnCollapse', 'click', () => {
      const now = !document.body.classList.contains('sb-collapsed');
      document.body.classList.toggle('sb-collapsed', now);
      lsSet('gadu_sb_collapsed', now ? '1' : '0');
      syncCollapse(now);
    });
    bind('btnMenu', 'click', () => {
      if (sb) sb.classList.add('open');
      const bd = $id('backdrop');
      if (bd) bd.classList.add('show');
    });
    bind('sidebarClose', 'click', closeMobileSidebar);
    bind('backdrop', 'click', closeMobileSidebar);
    document.querySelectorAll('.nav-link[data-route]').forEach(a => a.addEventListener('click', closeMobileSidebar));
    bind('btnBackup', 'click', closeMobileSidebar);
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
        const qm = $id('quickMenu');
        if (qm) qm.hidden = true;
      });
    });
    const more = $id('btnMore');
    const menu = $id('quickMenu');
    if (more && menu) {
      more.addEventListener('click', e => { e.stopPropagation(); menu.hidden = !menu.hidden; });
      document.addEventListener('click', () => { menu.hidden = true; });
    }
    bind('btnTheme', 'click', () => {
      const d = S.data;
      if (!d || !d.settings) return;
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
    /* Fondo claro durante el login: evita el atenuado automático de pantallas
       con brillo adaptativo (notebooks que oscurecen el contenido oscuro) */
    try { document.documentElement.dataset.theme = 'light'; } catch (e) {}
    document.body.classList.add('no-session');
    /* IMPORTANTE: el login se monta FUERA de .app. La clase no-session oculta
       .app por completo (y #view está dentro de .app), así que el login debe
       vivir en el body para ser visible. */
    const prev = document.getElementById('loginRoot');
    if (prev) prev.remove();
    const host = document.createElement('div');
    host.id = 'loginRoot';
    host.innerHTML =
      '<div class="login-wrap"><div class="login-card login-card-center">' +
      '<img src="logo.png" alt="GADU Construye" class="login-logo">' +
      '<p class="login-slogan">Tu gestión, perfecta</p>' +
      '<p class="login-sub">Ingresá con tu cuenta de Google para acceder a tu panel.</p>' +
      '<button class="btn btn-google" id="btnGoogle" type="button">' +
      '<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>' +
      'Continuar con Google</button>' +
      '<p class="form-hint" id="loginMsg" style="margin-top:12px;text-align:center"></p>' +
      '</div></div>';
    document.body.appendChild(host);
    const setMsg = (msg, err) => {
      const el = document.getElementById('loginMsg');
      el.textContent = msg || '';
      el.style.color = err ? 'var(--danger)' : 'var(--muted)';
    };
    document.getElementById('btnGoogle').addEventListener('click', () => {
      try { G.auth.signInWithGoogle(); }
      catch (err) { setMsg('No se pudo abrir Google: ' + ((err && err.message) || err), true); }
    });
  }

  /* ---------- Mejora de plan (límite alcanzado) ---------- */
  function openUpgrade() {
    const planes = G.plan.planes || [];
    const m = UI.openModal({
      title: 'Límite de tu plan alcanzado',
      subtitle: 'Tu plan actual no permite seguir agregando. Mejorá a Pro o Empresa para continuar.',
      body:
        '<div class="stack">' +
        (planes.map(p =>
          '<div class="split-row">' +
          '<div class="split-row-main"><strong>' + UI.escapeHtml(p.nombre) + '</strong>' +
          '<span class="muted small">' + (p.limite_obras_activas >= 999 ? 'Obras ilimitadas' : p.limite_obras_activas + ' obras activas') + ' · ' + (p.limite_empleados >= 999 ? 'empleados ilimitados' : p.limite_empleados + ' empleados') + '</span></div>' +
          '<div class="split-row-end"><b>' + (Number(p.precio_mensual) > 0 ? UI.fmtMoney(Number(p.precio_mensual)) + '/mes' : 'Gratis') + '</b></div>' +
          '</div>').join('') || '<p class="form-hint">No hay planes disponibles.</p>') +
        '</div>',
      footer: '<button class="btn btn-ghost" data-cancel>Ahora no</button><a class="btn btn-primary" href="https://wa.me/5493547469000?text=' + encodeURIComponent('Hola! Quiero mejorar mi plan de GADU.') + '" target="_blank" rel="noopener">' + UI.icon('whatsapp', 15) + 'Mejorar por WhatsApp</a>',
    });
    m.panel.querySelector('[data-cancel]').addEventListener('click', m.close);
  }
  G.upgrade = openUpgrade;

  async function startApp() {
    const sess = G.auth.getSession();
    if (!sess) { renderLogin('login'); return; }
    S.attachUser(sess.userId);
    S.load();
    applyTheme(S.data.settings.theme || 'dark');
    document.body.classList.remove('no-session');
    const lr = document.getElementById('loginRoot');
    if (lr) lr.remove();

    try { profile = await G.auth.getProfile(); } catch (e) { profile = null; }
    const pi = planInfo();
    if (pi.locked) { renderLock(); return; }

    /* Planes, límites y rol de administrador */
    try { await G.plan.load(); } catch (e) {}
    const navAdmin = document.getElementById('navAdmin');
    if (navAdmin) navAdmin.hidden = !G.plan.isAdmin();
    const pc = document.getElementById('planChip');
    if (pc) {
      const p = G.plan.currentPlan();
      const st = G.plan.profile ? G.plan.profile.subscription_status : 'trialing';
      const tone = st === 'active' ? 'success' : (st === 'past_due' ? 'danger' : (st === 'canceled' ? 'neutral' : 'info'));
      pc.className = 'chip chip-' + tone;
      pc.textContent = p.nombre + (st === 'active' ? '' : (st === 'trialing' ? ' · prueba' : ' · ' + st));
      pc.hidden = false;
      pc.title = 'Plan ' + p.nombre + ' · ' + st;
    }

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

  /* Pantalla de error visible: si algo falla al arrancar, nunca quedará
     una pantalla en negro muda — se muestra el motivo y un botón de reinicio */
  function renderBootError(err) {
    const msg = String((err && err.message) || err || 'Error desconocido');
    try {
      const el = document.createElement('div');
      el.setAttribute('data-boot-error', '1');
      el.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#0b1020;color:#fff;display:grid;place-items:center;padding:20px;font-family:Arial,sans-serif;text-align:center';
      el.innerHTML =
        '<div style="max-width:520px">' +
        '<div style="font-size:40px;margin-bottom:8px">⚠️</div>' +
        '<h2 style="margin:0 0 10px;font-size:20px">GADU no pudo iniciar</h2>' +
        '<p style="color:#94a3b8;margin:0 0 10px">Motivo: <b style="color:#f87171">' + UI.escapeHtml(msg) + '</b></p>' +
        '<p style="color:#94a3b8;margin:0 0 16px;font-size:13px">Suele pasar por una extensión del navegador (como el traductor automático). Probá abrir en una pestaña privada (Ctrl+Shift+N), o reiniciá la app limpia con el botón:</p>' +
        '<a href="?reset=1" style="display:inline-block;background:#f59e0b;color:#0b1020;padding:11px 20px;border-radius:10px;font-weight:700;text-decoration:none">Reiniciar GADU limpio</a>' +
        '</div>';
      document.body.appendChild(el);
    } catch (e2) { /* último recurso: consola */ console.error(err); }
  }

  /* ---------- Arranque ---------- */
  document.addEventListener('DOMContentLoaded', () => {
    try {
      /* Soporte: abrir con ?reset=1 limpia los datos locales de GADU
         (útil para empezar de cero en un dispositivo con datos viejos) */
      try {
        const qp = new URLSearchParams(location.search);
        if (qp.get('reset') === '1') {
          localStorage.removeItem('gadu_auth_v1');
          Object.keys(localStorage).filter(k => k.indexOf('gadu_data_v1') === 0).forEach(k => localStorage.removeItem(k));
          location.replace(location.pathname + location.hash);
          return;
        }
      } catch (e) {}

      document.querySelectorAll('[data-icon]').forEach(el => {
        const size = el.getAttribute('data-size');
        el.innerHTML = UI.icon(el.getAttribute('data-icon'), size ? +size : 18);
      });
      initSidebar();
      initTopbar();
      bind('btnBackup', 'click', openBackup);
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
          try {
            await G.auth.refresh();
            if (!G.auth.getSession()) { renderLogin('login'); return; }
            await startApp();
          } catch (err) {
            try { renderLogin('login'); } catch (e2) { renderBootError(e2); }
          }
        })();
      } else {
        /* ¿Volvemos de Google? Parsear el token del hash antes de mostrar el login */
        G.auth.handleOAuthRedirect()
          .then(ok => { if (ok && G.auth.getSession()) startApp(); else renderLogin('login'); })
          .catch(() => renderLogin('login'));
      }

      /* Vigilante: solo en la pantalla de login, avisa si una extensión oculta la
         página. No actúa dentro de la app (contenido dinámico) para evitar falsos
         positivos. El aviso es descartable y no bloquea el menú. */
      (function watchTampering() {
        let checks = 0;
        const iv = setInterval(() => {
          checks++;
          if (document.querySelector('[data-tamper-warn]') || document.querySelector('[data-boot-error]')) { clearInterval(iv); return; }
          if (!document.body.classList.contains('no-session')) { if (checks > 3) clearInterval(iv); return; }
          const hayLogin = !!document.querySelector('.login-card');
          if (!hayLogin && checks > 4) {
            clearInterval(iv);
            const b = document.createElement('div');
            b.setAttribute('data-tamper-warn', '1');
            b.style.cssText = 'position:fixed;left:12px;right:12px;bottom:calc(12px + env(safe-area-inset-bottom));z-index:99998;background:rgba(127,29,29,.96);color:#fff;padding:10px 12px;border-radius:10px;font-family:Arial,sans-serif;font-size:12.5px;line-height:1.45;box-shadow:0 4px 18px rgba(0,0,0,.4);display:flex;gap:10px;align-items:flex-start';
            b.innerHTML = '<span style="flex:1"><b>Algo ocultó la pantalla de inicio.</b><br>Probá en una pestaña privada (Ctrl+Shift+N) o desactivá las extensiones del navegador.</span>' +
              '<button type="button" style="background:none;border:none;color:#fff;font-size:18px;line-height:1;cursor:pointer;padding:0 2px" title="Cerrar">×</button>';
            b.querySelector('button').addEventListener('click', () => b.remove());
            document.body.appendChild(b);
          }
          if (checks > 30) clearInterval(iv);
        }, 800);
      })();
    } catch (err) {
      renderBootError(err);
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
