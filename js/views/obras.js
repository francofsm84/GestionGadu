/* ============================================================
   GADU · Vista: Obras y proyectos
   Tablero kanban + lista con búsqueda y filtros por estado
   ============================================================ */
(function (root) {
  'use strict';
  const G = root.GADU, S = G.store, UI = G.ui;
  const state = { q: '', status: 'todas', view: 'board', sel: {} };
  let currentView = null;

  G.router.add('obras', 'obras', 'Obras y proyectos', 'Avance físico y financiero de cada obra', render);
  G.actions.work = openWorkModal;

  const STATUS_LABEL = { activa: ['Activa', 'success'], pausada: ['Pausada', 'warning'], finalizada: ['Finalizada', 'neutral'] };

  function filtered() {
    const q = state.q.toLowerCase();
    return S.data.works.filter(w => {
      const client = S.contactById(w.clientId);
      const hay = (w.name + ' ' + (w.code || '') + ' ' + (w.location || '') + ' ' + (client ? client.name : '')).toLowerCase();
      return (state.status === 'todas' || w.status === state.status) && (!q || hay.includes(q));
    });
  }

  function render(view) {
    currentView = view;
    const counts = {
      activa: S.data.works.filter(w => w.status === 'activa').length,
      pausada: S.data.works.filter(w => w.status === 'pausada').length,
      finalizada: S.data.works.filter(w => w.status === 'finalizada').length,
    };
    view.innerHTML =
      '<div class="toolbar">' +
      '<div class="search">' + UI.icon('search', 16) + '<input id="fq" class="input" placeholder="Buscar obra, cliente o ubicación…" value="' + UI.escapeHtml(state.q) + '"></div>' +
      '<select id="fs" class="select" style="max-width:210px">' +
      '<option value="todas"' + (state.status === 'todas' ? ' selected' : '') + '>Todas (' + S.data.works.length + ')</option>' +
      '<option value="activa"' + (state.status === 'activa' ? ' selected' : '') + '>Activas (' + counts.activa + ')</option>' +
      '<option value="pausada"' + (state.status === 'pausada' ? ' selected' : '') + '>Pausadas (' + counts.pausada + ')</option>' +
      '<option value="finalizada"' + (state.status === 'finalizada' ? ' selected' : '') + '>Finalizadas (' + counts.finalizada + ')</option>' +
      '</select>' +
      '<div class="seg">' +
      '<button class="' + (state.view === 'board' ? 'active' : '') + '" data-view="board">Tablero</button>' +
      '<button class="' + (state.view === 'table' ? 'active' : '') + '" data-view="table">Lista</button>' +
      '</div>' +
      '<div class="grow"></div>' +
      '<button class="btn btn-primary" id="btnNew">' + UI.icon('plus', 16) + 'Nueva obra</button>' +
      '</div>' +
      '<div id="bulkBar" class="bulk-bar" hidden></div>' +
      '<div id="listWrap">' + (state.view === 'board' ? boardHTML(filtered()) : tableHTML(filtered())) + '</div>';

    view.querySelector('#fq').addEventListener('input', e => { state.q = e.target.value; updateList(view); });
    view.querySelector('#fs').addEventListener('change', e => { state.status = e.target.value; updateList(view); });
    UI.on(view, '[data-view]', 'click', e => {
      state.view = e.currentTarget.dataset.view;
      const seg = view.querySelector('.seg');
      seg.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.view === state.view));
      updateList(view);
    });
    view.querySelector('#btnNew').addEventListener('click', () => openWorkModal());
    bindListActions(view.querySelector('#listWrap'));
    bindSelection(view);
    refreshBulkBar(view);
  }

  function updateList(view) {
    const wrap = view.querySelector('#listWrap');
    wrap.innerHTML = state.view === 'board' ? boardHTML(filtered()) : tableHTML(filtered());
    bindListActions(wrap);
    bindSelection(view);
    refreshBulkBar(view);
  }

  function boardHTML(list) {
    const cols = [
      { key: 'activa', label: 'Activas' },
      { key: 'pausada', label: 'Pausadas' },
      { key: 'finalizada', label: 'Finalizadas' },
    ];
    return '<div class="kanban">' + cols.map(c => {
      const items = list.filter(w => w.status === c.key);
      const total = S.sum(items.map(w => Number(w.budgetTotal) || 0));
      return '<div class="kanban-col">' +
        '<div class="kanban-head">' +
        '<span class="dot dot-' + c.key + '"></span><strong>' + c.label + '</strong>' +
        '<span class="chip chip-neutral">' + items.length + '</span>' +
        '<span class="muted small">' + UI.fmtMoney(total) + '</span>' +
        '</div>' +
        '<div class="kanban-items">' +
        (items.map(cardHTML).join('') || '<div class="empty mini"><p>Sin obras en este estado</p></div>') +
        '</div></div>';
    }).join('') + '</div>';
  }

  /* Consumo presupuestario ejecutado: gastos de obra + jornales de mano de obra.
     Los jornales se calculan en tiempo real desde attendance × tarifa horaria. */
  function budgetConsumption(w) {
    const st = S.workStats(w.id);
    const labor = S.sum(S.workEmployees(w.id).map(e => Number(e.cost) || 0));
    const ejecutado = st.costs + labor;
    const budget = Number(w.budgetTotal) || 0;
    const pct = budget > 0 ? Math.round(ejecutado / budget * 100) : (ejecutado > 0 ? 100 : 0);
    return { ejecutado, budget, pct };
  }

  /* Semáforo de alerta presupuestaria: verde <75% · amarillo 75–95% · rojo >95% */
  function budgetAlert(pct) {
    if (pct < 75) return { tone: 'success', label: 'Saludable' };
    if (pct <= 95) return { tone: 'warning', label: 'Presupuesto cercano al límite' };
    return { tone: 'danger', label: 'Riesgo de margen / Desvío de presupuesto' };
  }

  function cardHTML(w) {
    const st = S.workStats(w.id);
    const client = S.contactById(w.clientId);
    const c = budgetConsumption(w);
    const a = budgetAlert(c.pct);
    const barColor = c.pct < 75 ? 'var(--success)' : (c.pct <= 95 ? 'var(--warning)' : 'var(--danger)');
    const tone = st.margin >= 0 ? 'success' : 'danger';
    return '<article class="work-card" data-id="' + w.id + '">' +
      '<div class="work-card-head">' +
      '<span class="code">' + UI.escapeHtml(w.code || '') + '</span>' +
      '<div class="row-actions">' +
      '<button class="icon-btn sm" data-edit="' + w.id + '" title="Editar">' + UI.icon('edit', 15) + '</button>' +
      '<button class="icon-btn sm danger" data-del="' + w.id + '" title="Eliminar">' + UI.icon('trash', 15) + '</button>' +
      '</div></div>' +
      '<h4 class="work-name">' + UI.escapeHtml(w.name) + '</h4>' +
      '<div class="muted small work-meta">' + UI.icon('map-pin', 13) + UI.escapeHtml(w.location || 'Sin ubicación') + '</div>' +
      '<div class="muted small work-meta">' + UI.icon('users', 13) + UI.escapeHtml(client ? client.name : 'Sin cliente') + '</div>' +
      '<div class="work-progress">' +
      '<div class="work-progress-row"><span>Físico</span><b>' + Math.round(Number(w.advanceFisico) || 0) + '%</b></div>' +
      UI.progress(w.advanceFisico) +
      '</div>' +
      '<div class="work-progress">' +
      '<div class="work-progress-row"><span>Cobro</span><b>' + Math.round(st.advanceCobro) + '%</b></div>' +
      UI.progress(st.advanceCobro, 'var(--info)') +
      '</div>' +
      '<div class="work-progress">' +
      '<div class="work-progress-row"><span>Consumo</span><b>' + c.pct + '%</b></div>' +
      UI.progress(Math.min(100, c.pct), barColor) +
      '</div>' +
      '<div class="work-foot">' +
      '<span class="muted small">Presupuesto <b>' + UI.fmtMoney(w.budgetTotal) + '</b> · Ejecutado <b>' + UI.fmtMoney(c.ejecutado) + '</b></span>' +
      UI.chip(st.margin >= 0 ? 'Margen +' + UI.fmtMoney(st.margin) : 'Margen −' + UI.fmtMoney(Math.abs(st.margin)), tone) +
      '</div>' +
      '<div class="work-foot" style="justify-content:flex-end;padding-top:0">' + UI.chip(a.label, a.tone) + '</div>' +
      '</article>';
  }

  function tableHTML(list) {
    const allSel = list.length > 0 && list.every(w => state.sel[w.id]);
    return '<div class="card table-card"><div class="table-wrap">' +
      '<table class="data-table">' +
      '<thead><tr><th class="chk"><input type="checkbox" id="masterSel"' + (allSel ? ' checked' : '') + ' title="Seleccionar todas las visibles"></th><th>Obra</th><th>Cliente</th><th>Ubicación</th><th>Estado</th><th class="num">Presupuesto</th><th class="num">Cobrado</th><th class="num">Costos</th><th class="num">Margen</th><th style="width:150px">Avance físico</th><th></th></tr></thead>' +
      '<tbody>' +
      (list.map(w => {
        const st = S.workStats(w.id);
        const client = S.contactById(w.clientId);
        const sl = STATUS_LABEL[w.status] || ['', 'neutral'];
        return '<tr class="clickable" data-id="' + w.id + '">' +
          '<td class="chk"><input type="checkbox" class="row-check-o" data-id="' + w.id + '"' + (state.sel[w.id] ? ' checked' : '') + '></td>' +
          '<td><strong>' + UI.escapeHtml(w.name) + '</strong><div class="muted small">' + UI.escapeHtml(w.code || '') + '</div></td>' +
          '<td>' + UI.escapeHtml(client ? client.name : '—') + '</td>' +
          '<td class="muted">' + UI.escapeHtml(w.location || '—') + '</td>' +
          '<td>' + UI.chip(sl[0], sl[1]) + '</td>' +
          '<td class="num">' + UI.fmtMoney(w.budgetTotal) + '</td>' +
          '<td class="num">' + UI.fmtMoney(st.incomes) + '</td>' +
          '<td class="num">' + UI.fmtMoney(st.costs) + '</td>' +
          '<td class="num ' + UI.signClass(st.margin) + '">' + UI.fmtMoney(st.margin) + '</td>' +
          '<td><div class="progress-cell">' + UI.progress(w.advanceFisico) + '<span class="muted small">' + Math.round(Number(w.advanceFisico) || 0) + '%</span></div></td>' +
          '<td><div class="row-actions">' +
          '<button class="icon-btn sm" data-edit="' + w.id + '" title="Editar">' + UI.icon('edit', 15) + '</button>' +
          '<button class="icon-btn sm danger" data-del="' + w.id + '" title="Eliminar">' + UI.icon('trash', 15) + '</button>' +
          '</div></td></tr>';
      }).join('') || '<tr><td colspan="11">' + UI.emptyState('hard-hat', 'No hay obras que coincidan', 'Probá con otra búsqueda o estado.') + '</td></tr>') +
      '</tbody></table></div></div>';
  }

  function bindListActions(wrap) {
    UI.on(wrap, '.work-card', 'click', e => {
      if (e.target.closest('button') || e.target.closest('input')) return;
      location.hash = '#/obra/' + e.currentTarget.dataset.id;
    });
    UI.on(wrap, 'tr.clickable', 'click', e => {
      if (e.target.closest('button') || e.target.closest('input')) return;
      location.hash = '#/obra/' + e.currentTarget.dataset.id;
    });
    UI.on(wrap, '[data-edit]', 'click', e => {
      e.stopPropagation();
      const id = e.target.closest('[data-edit]').dataset.edit;
      openWorkModal(S.data.works.find(w => w.id === id));
    });
    UI.on(wrap, '[data-del]', 'click', async e => {
      e.stopPropagation();
      const id = e.target.closest('[data-del]').dataset.del;
      const w = S.data.works.find(x => x.id === id);
      if (!w) return;
      const ok = await UI.confirm({
        title: 'Eliminar obra',
        message: 'Se eliminará <strong>' + UI.escapeHtml(w.name) + '</strong> junto con sus ingresos y gastos asociados. Esta acción no se puede deshacer.',
        okLabel: 'Eliminar obra',
      });
      if (ok) {
        S.removeWork(id);
        UI.toast('Obra eliminada');
        G.router.refresh();
      }
    });
  }

  function bindSelection(view) {
    const wrap = view.querySelector('#listWrap');
    if (!wrap) return;
    UI.on(wrap, '.row-check-o', 'change', e => {
      const id = e.target.closest('.row-check-o').dataset.id;
      if (e.target.checked) state.sel[id] = true; else delete state.sel[id];
      const master = wrap.querySelector('#masterSel');
      if (master) master.checked = filtered().length > 0 && filtered().every(w => state.sel[w.id]);
      refreshBulkBar(view);
    });
    UI.on(wrap, '#masterSel', 'change', e => {
      const checked = e.target.checked;
      filtered().forEach(w => { if (checked) state.sel[w.id] = true; else delete state.sel[w.id]; });
      updateList(view);
    });
  }

  function refreshBulkBar(view) {
    const bar = view ? view.querySelector('#bulkBar') : null;
    if (!bar) return;
    const n = Object.keys(state.sel).filter(id => state.sel[id]).length;
    bar.hidden = n === 0;
    bar.innerHTML = n ? '<button class="btn btn-soft-danger" id="btnBulkDel">🗑️ Eliminar seleccionadas (' + n + ')</button>' : '';
    if (n) bar.querySelector('#btnBulkDel').addEventListener('click', async () => {
      const ids = Object.keys(state.sel).filter(id => state.sel[id]);
      const ok = await UI.confirm({ title: 'Eliminar obras', message: '¿Eliminar <strong>' + ids.length + '</strong> obra(s) junto con sus ingresos y gastos asociados? Esta acción no se puede deshacer.', okLabel: 'Eliminar', tone: 'danger' });
      if (!ok) return;
      ids.forEach(id => S.removeWork(id));
      state.sel = {};
      UI.toast('Eliminadas ' + ids.length + ' obra(s)');
      G.router.refresh();
    });
  }

  function openWorkModal(work, opts) {
    const isEdit = !!work;
    opts = opts || {};
    const selClient = work ? work.clientId : (opts.clientId || '');
    /* Opciones del selector de cliente + opción destacada de alta al vuelo */
    const clientOptionsHTML = (selectedId) =>
      UI.selectOptions(S.data.contacts.filter(c => c.type === 'cliente').map(c => ({ v: c.id, l: c.name })), selectedId, true, 'Sin cliente asignado') +
      '<option value="__new__">+ Agregar nuevo cliente</option>';
    const m = UI.openModal({
      title: isEdit ? 'Editar obra' : 'Nueva obra',
      subtitle: isEdit ? (work.code || '') : 'Cargá los datos principales del proyecto.',
      size: 'wide',
      body:
        '<div class="grid-form">' +
        '<div class="field span-2"><label>Nombre de la obra *</label><input class="input" id="fName" value="' + UI.escapeHtml(work ? work.name : '') + '" placeholder="Ej.: Remodelación cocina y living"></div>' +
        '<div class="field"><label>Cliente</label>' +
        '<div class="select-with-add">' +
        '<select class="select" id="fClient">' +
        clientOptionsHTML(selClient) +
        '</select>' +
        '<button type="button" class="icon-btn sm" id="btnNewClient" title="Agregar nuevo cliente">' + UI.icon('plus', 14) + '</button>' +
        '</div>' +
        '</div>' +
        '<div class="field"><label>Ubicación</label><input class="input" id="fLoc" value="' + UI.escapeHtml(work ? work.location : '') + '" placeholder="Barrio, ciudad"></div>' +
        '<div class="field"><label>Estado</label><select class="select" id="fStatus">' +
        S.WORK_STATUS.map(s => '<option value="' + s + '"' + (work && work.status === s ? ' selected' : '') + '>' + STATUS_LABEL[s][0] + '</option>').join('') +
        '</select></div>' +
        '<div class="field"><label>Presupuesto total ($)</label><input class="input" type="number" id="fBudget" min="0" step="1000" value="' + (work ? work.budgetTotal : '') + '" placeholder="0"></div>' +
        '<div class="field"><label>Avance físico (%)</label><input class="input" type="number" id="fAdv" min="0" max="100" value="' + (work ? work.advanceFisico : 0) + '"></div>' +
        '<div class="field"><label>Fecha de inicio</label><input class="input" type="date" id="fStart" value="' + (work ? work.startDate : S.todayISO()) + '"></div>' +
        '<div class="field"><label>Fecha estimada de fin</label><input class="input" type="date" id="fEnd" value="' + (work && work.endDate ? work.endDate : '') + '"></div>' +
        '<div class="field span-2"><label>Descripción</label><textarea class="textarea" id="fDesc" rows="3" placeholder="Alcance del trabajo…">' + UI.escapeHtml(work ? work.description : '') + '</textarea></div>' +
        '</div>',
      footer: '<button class="btn btn-ghost" data-cancel>Cancelar</button><button class="btn btn-primary" data-save>' + (isEdit ? 'Guardar cambios' : 'Crear obra') + '</button>',
    });
    const fClient = m.panel.querySelector('#fClient');
    /* Alta de cliente al vuelo: abre el modal sin perder el progreso de la obra */
    const openNewClient = () => {
      G.actions.client(null, nuevo => {
        fClient.innerHTML = clientOptionsHTML(nuevo ? nuevo.id : '');
      });
    };
    m.panel.querySelector('#btnNewClient').addEventListener('click', openNewClient);
    /* La opción "+ Agregar nuevo cliente" del desplegable también abre el modal */
    fClient.addEventListener('change', () => {
      if (fClient.value === '__new__') openNewClient();
    });
    m.panel.querySelector('[data-cancel]').addEventListener('click', m.close);
    m.panel.querySelector('[data-save]').addEventListener('click', () => {
      const name = m.panel.querySelector('#fName').value.trim();
      const clientIdRaw = m.panel.querySelector('#fClient').value || null;
      const clientId = clientIdRaw === '__new__' ? null : clientIdRaw;   // no guardar la opción de alta
      const location = m.panel.querySelector('#fLoc').value.trim();
      if (!name) { UI.toast('Ingresá el nombre de la obra', 'error'); return; }
      /* Obra nueva: exigir ubicación + cliente (sin obra huérfana) */
      if (!isEdit && !location) { UI.toast('Ingresá la ubicación de la obra (obligatorio)', 'error'); return; }
      if (!isEdit && !clientId) { UI.toast('Seleccioná el cliente (podés crearlo al vuelo con +)', 'error'); return; }
      const payload = {
        name,
        clientId,
        location,
        status: m.panel.querySelector('#fStatus').value,
        budgetTotal: UI.readNum(m.panel.querySelector('#fBudget')),
        advanceFisico: Math.max(0, Math.min(100, UI.readNum(m.panel.querySelector('#fAdv')))),
        startDate: m.panel.querySelector('#fStart').value || S.todayISO(),
        endDate: m.panel.querySelector('#fEnd').value || '',
        description: m.panel.querySelector('#fDesc').value.trim(),
      };
      if (isEdit) {
        S.update('works', work.id, payload);
        UI.toast('Obra actualizada');
      } else {
        if (G.plan && !G.plan.checkLimit('obras')) return;
        payload.code = S.nextCode('OB', 'works');
        const creada = S.add('works', payload);
        UI.toast('Obra creada');
        if (opts.onSaved) opts.onSaved(creada);
      }
      m.close();
      G.router.refresh();
    });
  }
})(typeof window !== 'undefined' ? window : globalThis);
