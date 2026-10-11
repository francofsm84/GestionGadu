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
        '<h4>☁️ Sincronización en la nube (Supabase)</h4>' +
        '<p class="form-hint">Configurá lo mismo en la PC y en el celular: tocá <strong>Subir mis datos</strong> en uno y <strong>Descargar mis datos</strong> en el otro. Con "automática" activada, cada cambio se sube solo.</p>' +
        '<div class="grid-form" style="margin-top:8px">' +
        '<div class="field span-2"><label>URL del proyecto</label><input class="input" id="cUrl" placeholder="https://xxxx.supabase.co" value="' + UI.escapeHtml(cfg.url || '') + '"></div>' +
        '<div class="field span-2"><label>anon public key</label><input class="input" id="cKey" placeholder="eyJ…" value="' + UI.escapeHtml(cfg.anonKey || '') + '"></div>' +
        '<div class="field"><label>Código de sincronización</label><input class="input" id="cCode" placeholder="Ej.: gadu2026" value="' + UI.escapeHtml(cfg.code || '') + '"></div>' +
        '<div class="field"><label>Automática</label><label class="form-hint" style="margin-top:7px"><input type="checkbox" id="cAuto"' + (cfg.autoPush ? ' checked' : '') + ' style="accent-color:var(--primary)"> Subir cada vez que guardo</label></div>' +
        '</div>' +
        '<div class="backup-options" style="margin-top:10px">' +
        '<button class="btn btn-soft" id="bCloudSave">' + UI.icon('check') + 'Guardar configuración</button>' +
        '<button class="btn btn-soft" id="bCloudTest">' + UI.icon('activity') + 'Probar conexión</button>' +
        '<button class="btn btn-soft-success" id="bPush">' + UI.icon('upload') + 'Subir mis datos ahora</button>' +
        '<button class="btn btn-soft-info" id="bPull">' + UI.icon('download') + 'Descargar mis datos</button>' +
        '</div>' +
        '<p class="form-hint" id="cloudStatus" style="margin-top:8px"></p>' +
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
    const readCfg = () => ({
      url: m.panel.querySelector('#cUrl').value.trim(),
      anonKey: m.panel.querySelector('#cKey').value.trim(),
      code: m.panel.querySelector('#cCode').value.trim(),
      autoPush: m.panel.querySelector('#cAuto').checked,
    });
    const setStatus = (msg, ok) => {
      const el = m.panel.querySelector('#cloudStatus');
      el.textContent = msg;
      el.style.color = ok ? 'var(--success)' : 'var(--danger)';
    };
    m.panel.querySelector('#bCloudSave').addEventListener('click', () => {
      S.data.settings.cloud = readCfg();
      S.save();
      setStatus('Configuración guardada. Usá el mismo código en la PC y en el celular.', true);
    });
    m.panel.querySelector('#bCloudTest').addEventListener('click', async () => {
      setStatus('Probando conexión…');
      try {
        await G.sync.test(readCfg());
        setStatus('✅ Conexión OK: todo listo para sincronizar.', true);
      } catch (err) {
        setStatus('❌ No se pudo conectar: ' + ((err && err.message) || err), false);
      }
    });
    m.panel.querySelector('#bPush').addEventListener('click', async () => {
      setStatus('Subiendo…');
      try {
        S.data.settings.cloud = readCfg();
        await G.sync.push(S.data.settings.cloud, S.data);
        S.save();
        setStatus('✅ Datos subidos a la nube (' + new Date().toLocaleTimeString('es-AR') + ').', true);
      } catch (err) {
        setStatus('❌ No se pudo subir: ' + ((err && err.message) || err), false);
      }
    });
    m.panel.querySelector('#bPull').addEventListener('click', async () => {
      setStatus('Buscando datos en la nube…');
      try {
        const cfg2 = readCfg();
        const remote = await G.sync.pull(cfg2);
        if (!remote) { setStatus('No hay datos guardados en la nube todavía. Subí primero desde el otro dispositivo.', false); return; }
        const ok = await UI.confirm({
          title: 'Descargar desde la nube',
          message: 'Se reemplazarán los datos de este dispositivo por los de la nube (última actualización: <strong>' + UI.escapeHtml(String(remote.updatedAt || '—')) + '</strong>). ¿Continuar?',
          okLabel: 'Descargar y reemplazar',
          tone: 'danger',
        });
        if (!ok) return;
        S.importJSON(JSON.stringify(remote.data));
        S.data.settings.cloud = cfg2;
        S.save();
        setStatus('✅ Datos descargados. La app se actualizó.', true);
        m.close();
        renderNow();
      } catch (err) {
        setStatus('❌ No se pudo descargar: ' + ((err && err.message) || err), false);
      }
    });
  }

  /* ---------- Arranque ---------- */
  document.addEventListener('DOMContentLoaded', () => {
    S.load();
    applyTheme(S.data.settings.theme || 'dark');
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
      if (e.key !== S.KEY && e.key !== null) return;
      S.reload();
      UI.toast('Datos actualizados desde otra pestaña', 'info');
      renderNow();
    });
    if (!location.hash || location.hash === '#') location.hash = '#/dashboard';
    else renderNow();
  });
})(typeof window !== 'undefined' ? window : globalThis);
