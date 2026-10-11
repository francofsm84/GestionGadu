/* ============================================================
   GADU · Vista: Ingresos
   Registro detallado de cobros por obra con filtros y CSV
   ============================================================ */
(function (root) {
  'use strict';
  const G = root.GADU, S = G.store, UI = G.ui;
  const state = { q: '', work: 'todas', method: 'todas' };

  G.router.add('ingresos', 'ingresos', 'Ingresos', 'Cobros por obra: fecha, monto, concepto y método de pago', render);
  G.actions.income = openIncomeModal;

  const M_TONE = { 'Efectivo': 'success', 'Transferencia': 'info', 'Cheque': 'violet', 'Mercado Pago': 'primary', 'Otro': 'neutral' };

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
      '<div id="listWrap">' + listHTML(filtered()) + '</div>';

    view.querySelector('#fq').addEventListener('input', e => { state.q = e.target.value; updateList(view); });
    view.querySelector('#fw').addEventListener('change', e => { state.work = e.target.value; updateList(view); });
    view.querySelector('#fm').addEventListener('change', e => { state.method = e.target.value; updateList(view); });
    view.querySelector('#btnNew').addEventListener('click', () => openIncomeModal());
    view.querySelector('#btnCsv').addEventListener('click', exportCSV);
    bindList(view.querySelector('#listWrap'));
  }

  function updateList(view) {
    const wrap = view.querySelector('#listWrap');
    wrap.innerHTML = listHTML(filtered());
    bindList(wrap);
  }

  function listHTML(list) {
    const total = S.sum(list.map(x => x.amount));
    return '<div class="card table-card">' +
      '<div class="table-wrap"><table class="data-table">' +
      '<thead><tr><th>Fecha</th><th>Obra</th><th>Cliente</th><th>Concepto</th><th>Método</th><th>Referencia</th><th class="num">Monto</th><th></th></tr></thead>' +
      '<tbody>' +
      (list.map(x => {
        const w = S.data.works.find(wk => wk.id === x.workId);
        const client = S.contactById(x.clientId) || (w ? S.contactById(w.clientId) : null);
        return '<tr>' +
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
      }).join('') || '<tr><td colspan="8">' + UI.emptyState('trending-up', 'No hay ingresos que coincidan', 'Probá con otra búsqueda o filtro.') + '</td></tr>') +
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
      if (ok) { S.remove('incomes', id); UI.toast('Ingreso eliminado'); G.router.refresh(); }
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
