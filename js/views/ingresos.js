/* ============================================================
   GADU · Vista: Ingresos
   Registro detallado de cobros por obra con filtros y CSV
   ============================================================ */
(function (root) {
  'use strict';
  const G = root.GADU, S = G.store, UI = G.ui;
  const state = { q: '', work: 'todas', method: 'todas', sel: [] };

  G.router.add('ingresos', 'ingresos', 'Ingresos', 'Cobros por obra: fecha, monto, concepto y método de pago', render);
  G.actions.income = openIncomeModal;

  const M_TONE = { 'Efectivo': 'success', 'Transferencia': 'info', 'Cheque': 'violet', 'Mercado Pago': 'primary', 'Otro': 'neutral' };

  /* Persistencia del borrado: empuja a la nube para que el registro eliminado
     NO reaparezca al recargar (el pull de arranque traería la copia vieja). */
  async function syncAfterDelete() {
    try {
      if (G.sync && G.sync.push) {
        await G.sync.push(S.data);
        try { S.data.settings.lastCloudSync = new Date().toISOString(); S.save(); } catch (e) {}
      }
    } catch (e) { /* sin conexión: el push automático programado reintenta */ }
  }

  function filtered() {
    const q = state.q.toLowerCase();
    return S.data.incomes.slice().sort((a, b) => b.date.localeCompare(a.date)).filter(x => {
      const w = S.data.works.find(wk => wk.id === x.workId);
      const client = S.contactById(x.clientId);
      const hay = (x.concept + ' ' + (w ? w.name : '') + ' ' + (client ? client.name : '') + ' ' + (x.reference || '')).toLowerCase();
      return (state.work === 'todas' || x.workId === state.work) &&
        (state.method === 'todas' || x.method === state.method) &&
        (!q || hay.includes(q));
    });
  }

  function render(view) {
    view.innerHTML =
      '<div class="toolbar">' +
      '<div class="search">' + UI.icon('search', 16) + '<input id="fq" class="input" placeholder="Buscar por concepto, obra o cliente…" value="' + UI.escapeHtml(state.q) + '"></div>' +
      '<select id="fw" class="select" style="max-width:220px">' +
      '<option value="todas"' + (state.work === 'todas' ? ' selected' : '') + '>Todas las obras</option>' +
      S.data.works.map(w => '<option value="' + w.id + '"' + (state.work === w.id ? ' selected' : '') + '>' + UI.escapeHtml(w.code + ' · ' + w.name) + '</option>').join('') +
      '</select>' +
      '<select id="fm" class="select" style="max-width:170px">' +
      '<option value="todas"' + (state.method === 'todas' ? ' selected' : '') + '>Todos los métodos</option>' +
      S.METODOS.map(mt => '<option value="' + mt + '"' + (state.method === mt ? ' selected' : '') + '>' + mt + '</option>').join('') +
      '</select>' +
      '<button class="btn btn-soft btn-sm" id="btnCsv">' + UI.icon('download', 15) + 'Exportar CSV</button>' +
      '<div class="grow"></div>' +
      '<button class="btn btn-primary" id="btnNew">' + UI.icon('plus', 16) + 'Nuevo ingreso</button>' +
      '</div>' +
      batchBarHTML() +
      '<div id="listWrap">' + listHTML(filtered()) + '</div>';

    view.querySelector('#fq').addEventListener('input', e => { state.q = e.target.value; updateList(view); });
    view.querySelector('#fw').addEventListener('change', e => { state.work = e.target.value; updateList(view); });
    view.querySelector('#fm').addEventListener('change', e => { state.method = e.target.value; updateList(view); });
    view.querySelector('#btnNew').addEventListener('click', () => openIncomeModal());
    view.querySelector('#btnCsv').addEventListener('click', exportCSV);
    /* Borrado en lote: elimina todos los seleccionados y persiste en la nube */
    view.querySelector('#batchDel').addEventListener('click', async () => {
      const n = state.sel.length;
      if (!n) return;
      const ok = await UI.confirm({ title: 'Eliminar seleccionados', message: '¿Eliminar <strong>' + n + '</strong> cobro' + (n !== 1 ? 's' : '') + '? Esta acción no se puede deshacer.', okLabel: 'Eliminar' });
      if (!ok) return;
      state.sel.forEach(id => S.remove('incomes', id));
      state.sel = [];
      await syncAfterDelete();
      UI.toast(n + ' ingreso' + (n !== 1 ? 's' : '') + ' eliminado' + (n !== 1 ? 's' : ''));
      updateList(view);
      G.router.refresh();
    });
    view.querySelector('#batchClear').addEventListener('click', () => { state.sel = []; updateList(view); });
    bindList(view.querySelector('#listWrap'));
    bindSelection(view);
  }

  /* Barra de acciones en lote: aparece solo cuando hay selección */
  function batchBarHTML() {
    return '<div id="batchBar" class="card" hidden style="display:flex;align-items:center;gap:10px;margin-bottom:12px;padding:10px 14px;border:1px solid var(--primary);border-radius:12px;box-shadow:var(--shadow)">' +
      '<b id="batchCount" style="white-space:nowrap">0 seleccionados</b>' +
      '<div style="flex:1"></div>' +
      '<button class="btn btn-ghost btn-sm" id="batchClear">Limpiar</button>' +
      '<button class="btn btn-danger btn-sm" id="batchDel">' + UI.icon('trash', 14) + 'Eliminar seleccionados</button>' +
      '</div>';
  }

  function updateList(view) {
    const wrap = view.querySelector('#listWrap');
    wrap.innerHTML = listHTML(filtered());
    bindList(wrap);
    bindSelection(view);
  }

  /* Selección múltiple: checkbox maestro (visibles) + por fila + borrado en lote */
  function bindSelection(view) {
    const bar = view.querySelector('#batchBar');
    if (!bar) return;
    const master = view.querySelector('#masterSel');
    const rows = view.querySelectorAll('.sel-row');
    const upd = () => {
      bar.hidden = !state.sel.length;
      const cnt = view.querySelector('#batchCount');
      if (cnt) cnt.textContent = state.sel.length + ' seleccionado' + (state.sel.length !== 1 ? 's' : '');
    };
    if (master) master.addEventListener('click', () => {
      const ids = filtered().map(x => x.id);
      if (master.checked) ids.forEach(id => { if (state.sel.indexOf(id) < 0) state.sel.push(id); });
      else state.sel = state.sel.filter(id => ids.indexOf(id) < 0);
      updateList(view);
    });
    rows.forEach(cb => cb.addEventListener('click', () => {
      const id = cb.dataset.sel;
      state.sel = cb.checked ? state.sel.concat(id) : state.sel.filter(x => x !== id);
      updateList(view);
    }));
    upd();
  }

  function listHTML(list) {
    const total = S.sum(list.map(x => x.amount));
    const allSel = list.length > 0 && list.every(x => state.sel.indexOf(x.id) >= 0);
    return '<div class="card table-card">' +
      '<div class="table-wrap"><table class="data-table">' +
      '<thead><tr><th style="width:36px"><input type="checkbox" id="masterSel" title="Seleccionar todos los visibles"' + (allSel ? ' checked' : '') + '></th><th>Fecha</th><th>Obra</th><th>Cliente</th><th>Concepto</th><th>Método</th><th>Referencia</th><th class="num">Monto</th><th></th></tr></thead>' +
      '<tbody>' +
      (list.map(x => {
        const w = S.data.works.find(wk => wk.id === x.workId);
        const client = S.contactById(x.clientId) || (w ? S.contactById(w.clientId) : null);
        return '<tr>' +
          '<td><input type="checkbox" class="sel-row" data-sel="' + x.id + '"' + (state.sel.indexOf(x.id) >= 0 ? ' checked' : '') + '></td>' +
          '<td class="muted">' + UI.fmtDate(x.date) + '</td>' +
          '<td><strong>' + UI.escapeHtml(w ? w.name : '—') + '</strong></td>' +
          '<td>' + UI.escapeHtml(client ? client.name : '—') + '</td>' +
          '<td>' + (x.incomeKind === 'adelanto' ? UI.chip('Adelanto', 'warning', 'zap') + ' ' : '') + UI.escapeHtml(x.concept) + '</td>' +
          '<td>' + UI.chip(x.method || 'Otro', M_TONE[x.method] || 'neutral') + '</td>' +
          '<td class="muted">' + UI.escapeHtml(x.reference || '—') + '</td>' +
          '<td class="num pos"><b>+' + UI.fmtMoney(x.amount) + '</b></td>' +
          '<td><div class="row-actions">' +
          '<button class="icon-btn sm" data-edit="' + x.id + '" title="Editar">' + UI.icon('edit', 15) + '</button>' +
          '<button class="icon-btn sm danger" data-del="' + x.id + '" title="Eliminar">' + UI.icon('trash', 15) + '</button>' +
          '</div></td></tr>';
      }).join('') || '<tr><td colspan="9">' + UI.emptyState('trending-up', 'No hay ingresos que coincidan', 'Probá con otra búsqueda o filtro.') + '</td></tr>') +
      '</tbody></table></div>' +
      '<div class="table-foot">' +
      '<span>' + list.length + ' cobro' + (list.length !== 1 ? 's' : '') + '</span>' +
      '<span>Total filtrado: <b class="pos">' + UI.fmtMoney(total) + '</b></span>' +
      '</div></div>';
  }

  function bindList(wrap) {
    UI.on(wrap, '[data-edit]', 'click', e => {
      const id = e.target.closest('[data-edit]').dataset.edit;
      openIncomeModal({ income: S.data.incomes.find(x => x.id === id) });
    });
    UI.on(wrap, '[data-del]', 'click', async e => {
      const id = e.target.closest('[data-del]').dataset.del;
      const ok = await UI.confirm({ title: 'Eliminar ingreso', message: '¿Eliminar este cobro? Los totales y márgenes se actualizarán.', okLabel: 'Eliminar' });
      if (ok) {
        S.remove('incomes', id);
        await syncAfterDelete();   // persistencia: el borrado llega a la nube
        UI.toast('Ingreso eliminado');
        G.router.refresh();
      }
    });
  }

  function exportCSV() {
    const rows = [['Fecha', 'Obra', 'Cliente', 'Concepto', 'Tipo', 'Método', 'Referencia', 'Monto']];
    filtered().forEach(x => {
      const w = S.data.works.find(wk => wk.id === x.workId);
      const client = S.contactById(x.clientId) || (w ? S.contactById(w.clientId) : null);
      rows.push([x.date, w ? w.name : '', client ? client.name : '', x.concept, x.incomeKind === 'adelanto' ? 'Adelanto' : 'Cobro', x.method || '', x.reference || '', String(Number(x.amount) || 0)]);
    });
    UI.csv('gadu-ingresos.csv', rows);
    UI.toast('CSV de ingresos exportado');
  }

  function openIncomeModal(opts) {
    opts = opts || {};
    const inc = opts.income || null;
    const isEdit = !!inc;
    const selWork = inc ? inc.workId : (opts.workId || '');
    const curMethod = inc && inc.method ? inc.method : S.METODOS[0];
    const methodList = (inc && inc.method && !S.METODOS.includes(inc.method) ? S.METODOS.concat([inc.method]) : S.METODOS);
    const methodOpts = methodList.map(mt => '<option value="' + UI.escapeHtml(mt) + '"' + (mt === curMethod ? ' selected' : '') + '>' + UI.escapeHtml(mt) + '</option>').join('');
    const m = UI.openModal({
      title: isEdit ? 'Editar ingreso' : 'Nuevo ingreso',
      subtitle: isEdit ? '' : 'Registrá un cobro recibido de una obra.',
      body:
        '<div class="grid-form">' +
        '<div class="field span-2"><label>Obra *</label><select class="select" id="fWork">' +
        UI.selectOptions(S.data.works.map(w => ({ v: w.id, l: w.code + ' · ' + w.name })), selWork, true, '— Seleccionar obra —') +
        '</select><span class="form-hint" id="clientHint">Cliente: —</span></div>' +
        '<div class="field"><label>Fecha</label><input class="input" type="date" id="fDate" value="' + (inc ? inc.date : S.todayISO()) + '"></div>' +
        '<div class="field"><label>Monto ($) *</label><input class="input" type="number" id="fAmount" min="0" step="100" value="' + (inc ? inc.amount : (opts.amount || '')) + '" placeholder="0"></div>' +
        '<div class="field"><label>Tipo de ingreso</label><select class="select" id="fKind">' +
        '<option value="pago"' + (!inc || inc.incomeKind !== 'adelanto' ? ' selected' : '') + '>Cobro / certificación</option>' +
        '<option value="adelanto"' + ((inc && inc.incomeKind === 'adelanto') || (opts.incomeKind === 'adelanto') ? ' selected' : '') + '>Adelanto / anticipo del cliente</option>' +
        '</select><span class="form-hint">Los adelantos quedan marcados en la obra.</span></div>' +
        '<div class="field span-2"><label>Concepto *</label><input class="input" id="fConcept" value="' + UI.escapeHtml(inc ? inc.concept : (opts.concept || '')) + '" placeholder="Ej.: Anticipo 40%, Certificación N°1, Saldo final…"></div>' +
        '<div class="field"><label>Método de pago</label><select class="select" id="fMethod">' +
        methodOpts +
        '</select></div>' +
        '<div class="field"><label>Referencia / comprobante</label><input class="input" id="fRef" value="' + UI.escapeHtml(inc ? inc.reference : '') + '" placeholder="N° de transferencia, cheque…"></div>' +
        '<div class="field span-2"><label>Notas</label><input class="input" id="fNotes" value="' + UI.escapeHtml(inc ? inc.notes : '') + '" placeholder="Opcional"></div>' +
        '</div>',
      footer: '<button class="btn btn-ghost" data-cancel>Cancelar</button><button class="btn btn-primary" data-save>' + (isEdit ? 'Guardar cambios' : 'Registrar ingreso') + '</button>',
    });

    const updClient = () => {
      const w = S.data.works.find(wk => wk.id === m.panel.querySelector('#fWork').value);
      const c = w ? S.contactById(w.clientId) : null;
      m.panel.querySelector('#clientHint').textContent = 'Cliente: ' + (c ? c.name : '—');
    };
    m.panel.querySelector('#fWork').addEventListener('change', updClient);
    updClient();

    m.panel.querySelector('[data-cancel]').addEventListener('click', m.close);
    m.panel.querySelector('[data-save]').addEventListener('click', () => {
      const workId = m.panel.querySelector('#fWork').value;
      const amount = UI.readNum(m.panel.querySelector('#fAmount'));
      const concept = m.panel.querySelector('#fConcept').value.trim();
      if (!workId) { UI.toast('Seleccioná la obra', 'error'); return; }
      if (amount <= 0) { UI.toast('Ingresá un monto mayor a cero', 'error'); return; }
      if (!concept) { UI.toast('Ingresá el concepto del cobro', 'error'); return; }
      const w = S.data.works.find(wk => wk.id === workId);
      const payload = {
        workId,
        clientId: w ? w.clientId : null,
        date: m.panel.querySelector('#fDate').value || S.todayISO(),
        amount,
        concept,
        incomeKind: m.panel.querySelector('#fKind').value,
        method: m.panel.querySelector('#fMethod').value,
        reference: m.panel.querySelector('#fRef').value.trim(),
        notes: m.panel.querySelector('#fNotes').value.trim(),
      };
      if (isEdit) {
        S.update('incomes', inc.id, payload);
        UI.toast('Ingreso actualizado');
      } else {
        S.add('incomes', payload);
        UI.toast('Ingreso registrado');
      }
      m.close();
      G.router.refresh();
    });
  }
})(typeof window !== 'undefined' ? window : globalThis);
