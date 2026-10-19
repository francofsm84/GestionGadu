/* ============================================================
   GADU · Vista: Bandeja WhatsApp
   Gastos que llegaron por WhatsApp y quedaron sin obra (workId null)
   ============================================================ */
(function (root) {
  'use strict';
  const G = root.GADU, S = G.store, UI = G.ui;

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

  function render(view) {
    view.innerHTML =
      '<div class="toolbar">' +
        '<div class="grow"></div>' +
        '<button class="btn btn-ghost btn-sm" id="btnRefresh">' + UI.icon('refresh', 15) + 'Actualizar</button>' +
      '</div>' +
      '<div id="listWrap">' + listHTML(pendientes()) + '</div>';

    UI.on(view, '#btnRefresh', 'click', () => {
      view.querySelector('#listWrap').innerHTML = listHTML(pendientes());
      bindList(view.querySelector('#listWrap'));
    });
    bindList(view.querySelector('#listWrap'));
  }

  function listHTML(list) {
    return '<div class="card table-card">' +
      '<div class="table-wrap"><table class="data-table">' +
      '<thead><tr><th>Fecha</th><th>Categoría</th><th>Descripción</th><th class="num">Monto</th><th style="min-width:300px">Asignar</th></tr></thead>' +
      '<tbody>' +
      (list.map(x => {
        const wOpts =
          '<select class="select" data-sel="' + x.id + '" style="max-width:180px">' +
            '<option value="">— Asignar a obra —</option>' +
            (S.data.works || []).filter(w => w && w.id).map(w => '<option value="' + w.id + '">' + UI.escapeHtml(workName(w)) + '</option>').join('') +
          '</select>';
        return '<tr>' +
          '<td class="muted">' + UI.fmtDate(x.date) + '</td>' +
          '<td>' + UI.chip(x.category || 'Otros', 'neutral') + '</td>' +
          '<td>' + UI.escapeHtml(x.description || '') + (x.receiptUrl ? ' <button class="icon-btn sm" data-ticket="' + UI.escapeHtml(x.receiptUrl) + '" title="Ver ticket">' + UI.icon('camera', 14) + '</button>' : '') + '</td>' +
          '<td class="num neg"><b>−' + UI.fmtMoney(x.amount) + '</b></td>' +
          '<td><div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">' +
            wOpts +
            '<button class="btn btn-ghost btn-sm" data-general="' + x.id + '">Gasto General</button>' +
          '</div></td></tr>';
      }).join('') ||
      '<tr><td colspan="5">' + UI.emptyState('inbox', 'No hay gastos sin asignar', 'Los gastos que cargues por WhatsApp sin obra van a aparecer acá.') + '</td></tr>') +
      '</tbody></table></div>' +
      '<div class="table-foot"><span>' + list.length + ' gasto' + (list.length !== 1 ? 's' : '') + ' sin asignar</span></div></div>';
  }

  function bindList(wrap) {
    /* Ver ticket / comprobante */
    UI.on(wrap, '[data-ticket]', 'click', e => {
      const url = e.target.closest('[data-ticket]').dataset.ticket;
      openTicket(url);
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
