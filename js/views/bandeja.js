/* ============================================================
   GADU · Vista: Bandeja WhatsApp
   Gastos que llegaron por WhatsApp y quedaron sin obra (workId null)
   ============================================================ */
(function (root) {
  'use strict';
  const G = root.GADU, S = G.store, UI = G.ui;
  const state = { sel: {} };
  let currentView = null;

  G.router.add('bandeja', 'bandeja', 'Bandeja WhatsApp', 'Gastos de WhatsApp sin asignar a obra', render);

  /* Pendientes = source whatsapp + sin obra + no resueltos aún */
  function pendientes() {
    return S.data.expenses
      .slice()
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))
      .filter(x => x.source === 'whatsapp' && x.workId == null && !x.resolved);
  }

  async function persistir() {
    try {
      if (G.sync && G.sync.push) {
        await G.sync.push(S.data);
        try { S.data.settings.lastCloudSync = new Date().toISOString(); S.save(); } catch (e) {}
      }
    } catch (e) { /* sin conexión: el push programado reintenta */ }
  }

  function workName(w) { return String(w.name || w.nombre || 'Obra'); }

  /* Modal con la foto del ticket en grande */
  function openTicket(url) {
    const m = UI.openModal({
      title: 'Ticket / comprobante',
      size: 'wide',
      body: '<div style="text-align:center"><img src="' + UI.escapeHtml(url) + '" style="max-width:100%;max-height:70vh;border-radius:10px" alt="Ticket"></div>',
      footer: '<a class="btn btn-soft" href="' + UI.escapeHtml(url) + '" target="_blank" rel="noopener">' + UI.icon('image', 14) + 'Abrir en pestaña</a><button class="btn btn-ghost" data-cancel>Cerrar</button>',
    });
    m.panel.querySelector('[data-cancel]').addEventListener('click', m.close);
  }

  /* Forzar recarga de obras desde la nube si S.data.works está vacío */
  async function reloadWorks() {
    try {
      if (!G.sync || typeof G.sync.pull !== 'function') return;
      const remote = await G.sync.pull();
      if (remote && remote.data && Array.isArray(remote.data.works) && remote.data.works.length) {
        S.applyRemote(remote.data);
      }
    } catch (e) {
      console.warn('[bandeja] no se pudo recargar obras:', e);
    }
  }

  function render(view) {
    currentView = view;
    view.innerHTML =
      '<div class="toolbar">' +
        '<div class="grow"></div>' +
        '<button class="btn btn-ghost btn-sm" id="btnRefresh">' + UI.icon('refresh', 15) + 'Actualizar</button>' +
      '</div>' +
      '<div id="bulkBar" class="bulk-bar" hidden></div>' +
      '<div id="listWrap">' + listHTML(pendientes()) + '</div>';

    UI.on(view, '#btnRefresh', 'click', () => {
      view.querySelector('#listWrap').innerHTML = listHTML(pendientes());
      bindList(view.querySelector('#listWrap'));
      bindSelection(view);
      refreshBulkBar(view);
    });
    bindList(view.querySelector('#listWrap'));
    bindSelection(view);
    refreshBulkBar(view);

    /* Si no hay obras en memoria, traerlas de la nube y re-renderizar el select */
    if (!(S.data.works && S.data.works.length)) {
      reloadWorks().then(() => {
        const wrap = view.querySelector('#listWrap');
        if (wrap) { wrap.innerHTML = listHTML(pendientes()); bindList(wrap); }
      });
    }
  }

  function listHTML(list) {
    const allSel = list.length > 0 && list.every(x => state.sel[x.id]);
    return '<div class="card table-card">' +
      '<div class="table-wrap"><table class="data-table">' +
      '<thead><tr><th class="chk"><input type="checkbox" id="masterSel"' + (allSel ? ' checked' : '') + ' title="Seleccionar todos los visibles"></th><th>Fecha</th><th>Categoría</th><th>Descripción</th><th class="num">Monto</th><th style="min-width:300px">Asignar</th></tr></thead>' +
      '<tbody>' +
      (list.map(x => {
        const cats = Array.from(new Set((S.CATS_OBRA || []).concat(S.CATS_GENERAL || []).concat([x.category]).filter(Boolean)));
        const catOpts =
          '<select class="select" data-cat="' + x.id + '" style="max-width:160px">' +
            cats.map(c => '<option value="' + UI.escapeHtml(c) + '"' + (c === x.category ? ' selected' : '') + '>' + UI.escapeHtml(c) + '</option>').join('') +
          '</select>';
        const wOpts =
          '<select class="select" data-sel="' + x.id + '" style="max-width:180px">' +
            '<option value="">— Asignar a obra —</option>' +
            (S.data.works || []).filter(w => w && w.id).map(w => '<option value="' + w.id + '">' + UI.escapeHtml(workName(w)) + '</option>').join('') +
          '</select>';
        return '<tr>' +
          '<td class="chk"><input type="checkbox" class="row-check-b" data-id="' + x.id + '"' + (state.sel[x.id] ? ' checked' : '') + '></td>' +
          '<td class="muted">' + UI.fmtDate(x.date) + '</td>' +
          '<td>' + UI.chip(x.category || 'Otros', 'neutral') + '</td>' +
          '<td>' + UI.escapeHtml(x.description || '') + (x.receiptUrl ? ' <button class="icon-btn sm" data-ticket="' + UI.escapeHtml(x.receiptUrl) + '" title="Ver ticket">' + UI.icon('camera', 14) + '</button>' : '') + '</td>' +
          '<td class="num neg"><b>−' + UI.fmtMoney(x.amount) + '</b></td>' +
          '<td><div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">' +
            catOpts +
            wOpts +
            '<button class="btn btn-ghost btn-sm" data-general="' + x.id + '">Gasto General</button>' +
            '<button class="icon-btn sm" data-edit="' + x.id + '" title="Editar completo">' + UI.icon('edit', 15) + '</button>' +
          '</div></td></tr>';
      }).join('') ||
      '<tr><td colspan="6">' + UI.emptyState('inbox', 'No hay gastos sin asignar', 'Los gastos que cargues por WhatsApp sin obra van a aparecer acá.') + '</td></tr>') +
      '</tbody></table></div>' +
      '<div class="table-foot"><span>' + list.length + ' gasto' + (list.length !== 1 ? 's' : '') + ' sin asignar</span></div></div>';
  }

  function bindSelection(view) {
    const wrap = view.querySelector('#listWrap');
    if (!wrap) return;
    UI.on(wrap, '.row-check-b', 'change', e => {
      const id = e.target.closest('.row-check-b').dataset.id;
      if (e.target.checked) state.sel[id] = true; else delete state.sel[id];
      const master = wrap.querySelector('#masterSel');
      if (master) master.checked = pendientes().length > 0 && pendientes().every(x => state.sel[x.id]);
      refreshBulkBar(view);
    });
    UI.on(wrap, '#masterSel', 'change', e => {
      const checked = e.target.checked;
      pendientes().forEach(x => { if (checked) state.sel[x.id] = true; else delete state.sel[x.id]; });
      wrap.innerHTML = listHTML(pendientes());
      bindList(wrap);
      bindSelection(view);
      refreshBulkBar(view);
    });
  }

  function refreshBulkBar(view) {
    const bar = view ? view.querySelector('#bulkBar') : null;
    if (!bar) return;
    const n = Object.keys(state.sel).filter(id => state.sel[id]).length;
    bar.hidden = n === 0;
    bar.innerHTML = n ? '<button class="btn btn-soft-danger" id="btnBulkDel">🗑️ Eliminar seleccionados (' + n + ')</button>' : '';
    if (n) bar.querySelector('#btnBulkDel').addEventListener('click', async () => {
      const ids = Object.keys(state.sel).filter(id => state.sel[id]);
      const ok = await UI.confirm({ title: 'Eliminar gastos', message: '¿Eliminar <strong>' + ids.length + '</strong> gasto(s) de la bandeja? Irán a la papelera.', okLabel: 'Eliminar', tone: 'danger' });
      if (!ok) return;
      ids.forEach(id => S.remove('expenses', id));
      state.sel = {};
      UI.toast('Eliminados ' + ids.length + ' gasto(s)');
      G.router.refresh();
    });
  }

  function bindList(wrap) {
    /* Ver ticket / comprobante */
    UI.on(wrap, '[data-ticket]', 'click', e => {
      const url = e.target.closest('[data-ticket]').dataset.ticket;
      openTicket(url);
    });
    /* Cambiar categoría inline */
    UI.on(wrap, '[data-cat]', 'change', async e => {
      const id = e.target.dataset.cat;
      const category = e.target.value;
      if (!category) return;
      S.update('expenses', id, { category });
      await persistir();
      UI.toast('Categoría actualizada');
      G.router.refresh();
    });
    /* Editar completo: abre el modal de gasto con todos los campos */
    UI.on(wrap, '[data-edit]', 'click', e => {
      const id = e.target.closest('[data-edit]').dataset.edit;
      const x = S.data.expenses.find(exp => exp.id === id);
      if (x && G.actions && typeof G.actions.expense === 'function') {
        G.actions.expense({ expense: x });
      }
    });
    /* Asignar a obra */
    UI.on(wrap, '[data-sel]', 'change', async e => {
      const id = e.target.dataset.sel;
      const workId = e.target.value;
      if (!workId) return;
      const w = S.data.works.find(wk => wk.id === workId);
      S.update('expenses', id, { workId, type: 'obra', resolved: true });
      await persistir();
      UI.toast('Gasto asignado a ' + workName(w));
      G.router.refresh();
    });
    /* Marcar como Gasto General */
    UI.on(wrap, '[data-general]', 'click', async e => {
      const id = e.target.closest('[data-general]').dataset.general;
      S.update('expenses', id, { workId: null, type: 'general', resolved: true });
      await persistir();
      UI.toast('Marcado como Gasto General');
      G.router.refresh();
    });
  }
})(typeof window !== 'undefined' ? window : globalThis);
