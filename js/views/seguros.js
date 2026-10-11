/* ============================================================
   GADU · Vista: Seguros y vencimientos
   Pólizas (ART, Vehículo, VTV, Caución, Otro) con semáforo de
   alertas por días restantes y generación del gasto de pago.
   ============================================================ */
(function (root) {
  'use strict';
  const G = root.GADU, S = G.store, UI = G.ui;
  const state = { q: '', f: 'todas' };

  G.router.add('seguros', 'seguros', 'Seguros y vencimientos', 'Pólizas y cuotas con semáforo de alertas · pagos al libro de gastos', render);
  G.actions.seguro = () => openSeguroModal();

  const TIPO_ICON = { 'ART': 'shield', 'Vehículo': 'truck', 'VTV': 'file-text', 'Caución': 'file-text', 'Otro': 'box' };

  function list() {
    const q = state.q.toLowerCase();
    return S.data.seguros.slice().sort((a, b) => S.seguroDaysLeft(a) - S.seguroDaysLeft(b)).filter(s => {
      const st = S.seguroEstado(s);
      const matchF = state.f === 'todas' ||
        (state.f === 'activo' && (st.key === 'al-dia' || st.key === 'por-vencer')) ||
        (state.f === 'vencido' && (st.key === 'vencido' || st.key === 'hoy'));
      const w = s.obraId ? S.data.works.find(x => x.id === s.obraId) : null;
      const hay = (s.tipo + ' ' + s.compania + ' ' + (s.numeroPoliza || '') + ' ' + (w ? w.name : '')).toLowerCase();
      return matchF && (!q || hay.includes(q));
    });
  }

  function render(view) {
    const t = S.totals();
    const st = S.data.seguros.map(S.seguroEstado);
    const alDia = st.filter(x => x.key === 'al-dia').length;
    const porVencer = st.filter(x => x.key === 'por-vencer' || x.key === 'hoy').length;
    const vencidos = st.filter(x => x.key === 'vencido').length;
    view.innerHTML =
      '<section class="kpi-grid kpi-4">' +
      kpi('shield', 'success', 'Al día', String(alDia), 'Sin vencimientos próximos') +
      kpi('calendar', 'warning', 'Por vencer', String(porVencer), 'Vencen en 7 días o menos') +
      kpi('alert-triangle', vencidos ? 'danger' : 'neutral', 'Vencidos', String(vencidos), vencidos ? 'Requieren renovación' : 'Todo en orden') +
      kpi('wallet', 'violet', 'Costo anual', UI.fmtMoney(t.seguros), S.data.seguros.length + ' pólizas registradas') +
      '</section>' +
      '<div class="toolbar">' +
      '<div class="search">' + UI.icon('search', 16) + '<input id="fq" class="input" placeholder="Buscar por tipo, compañía, póliza u obra…" value="' + UI.escapeHtml(state.q) + '"></div>' +
      '<select id="ff" class="select" style="max-width:200px">' +
      '<option value="todas"' + (state.f === 'todas' ? ' selected' : '') + '>Todos</option>' +
      '<option value="activo"' + (state.f === 'activo' ? ' selected' : '') + '>Activos</option>' +
      '<option value="vencido"' + (state.f === 'vencido' ? ' selected' : '') + '>Vencidos</option>' +
      '</select>' +
      '<div class="grow"></div>' +
      '<button class="btn btn-primary" id="btnNew">' + UI.icon('plus', 16) + 'Nuevo seguro</button>' +
      '</div>' +
      '<div id="listWrap">' + listHTML(list()) + '</div>';

    view.querySelector('#fq').addEventListener('input', e => { state.q = e.target.value; updateList(view); });
    view.querySelector('#ff').addEventListener('change', e => { state.f = e.target.value; updateList(view); });
    view.querySelector('#btnNew').addEventListener('click', () => openSeguroModal());
    bindList(view.querySelector('#listWrap'));
  }

  function kpi(icon, tone, label, value, sub) {
    return '<div class="kpi-card">' +
      '<span class="kpi-ico kpi-' + tone + '">' + UI.icon(icon, 20) + '</span>' +
      '<div class="kpi-body">' +
      '<span class="kpi-label">' + label + '</span>' +
      '<strong class="kpi-value">' + value + '</strong>' +
      '<span class="kpi-sub">' + sub + '</span>' +
      '</div></div>';
  }

  function updateList(view) {
    const wrap = view.querySelector('#listWrap');
    wrap.innerHTML = listHTML(list());
    bindList(wrap);
  }

  function listHTML(items) {
    if (!items.length) {
      return '<div class="card">' + UI.emptyState('shield', 'No hay seguros que coincidan', 'Probá con otra búsqueda o registrá un nuevo seguro.') + '</div>';
    }
    return '<div class="cards-grid">' + items.map(seguroCard).join('') + '</div>';
  }

  function seguroCard(s) {
    const st = S.seguroEstado(s);
    const w = s.obraId ? S.data.works.find(x => x.id === s.obraId) : null;
    return '<article class="asset-card" data-id="' + s.id + '">' +
      '<div class="asset-head">' +
      '<span class="asset-ico">' + UI.icon(TIPO_ICON[s.tipo] || 'shield', 20) + '</span>' +
      '<div class="asset-info"><strong>' + UI.escapeHtml(s.tipo) + '</strong>' +
      '<span class="muted small">' + UI.escapeHtml(s.compania) + '</span></div>' +
      UI.chip(st.label, st.tone, st.key === 'al-dia' ? 'check-circle' : 'alert-triangle') +
      '</div>' +
      '<div class="muted small">' + UI.icon('file-text', 13) + ' Póliza ' + UI.escapeHtml(s.numeroPoliza || '—') +
      ' · vence el ' + UI.fmtDate(s.fechaVencimiento) + '</div>' +
      (w ? '<div class="contact-chips">' + UI.chip('Obra: ' + UI.escapeHtml(w.code + ' ' + w.name), 'info', 'hard-hat') + '</div>' : '') +
      '<div class="asset-stats">' +
      '<span>Cuota / costo<b>' + UI.fmtMoney(s.costo) + '</b></span>' +
      '<span>Días restantes<b>' + (st.days >= 0 ? st.days : 'vencido') + '</b></span>' +
      '<span>Estado<b>' + UI.escapeHtml(s.estado) + '</b></span>' +
      '</div>' +
      '<div class="asset-foot">' +
      '<button class="btn btn-soft-success btn-sm" data-pay="' + s.id + '">' + UI.icon('arrow-up-right', 14) + 'Registrar pago</button>' +
      '<div class="spacer"></div>' +
      '<button class="icon-btn sm" data-edit="' + s.id + '" title="Editar">' + UI.icon('edit', 15) + '</button>' +
      '<button class="icon-btn sm danger" data-del="' + s.id + '" title="Eliminar">' + UI.icon('trash', 15) + '</button>' +
      '</div></article>';
  }

  function bindList(wrap) {
    UI.on(wrap, '[data-pay]', 'click', async e => {
      const s = S.data.seguros.find(x => x.id === e.target.closest('[data-pay]').dataset.pay);
      if (!s) return;
      const ok = await UI.confirm({
        title: 'Registrar pago del seguro',
        message: 'Se abrirá el formulario de <strong>Gastos</strong> con los datos del seguro (' + UI.escapeHtml(s.tipo + ' · ' + s.compania) + ', $' + UI.fmtMoney(s.costo) + '). Al guardarlo queda registrado en el libro de gastos.' + (s.obraId ? ' Se vinculará a la obra asociada.' : ''),
        okLabel: 'Continuar',
      });
      if (!ok) return;
      G.actions.expense({
        type: s.obraId ? 'obra' : 'general',
        category: 'Seguros',
        workId: s.obraId || null,
        amount: s.costo,
        description: s.tipo + ' · ' + s.compania + (s.numeroPoliza ? ' · Póliza ' + s.numeroPoliza : ''),
      });
    });
    UI.on(wrap, '[data-edit]', 'click', e => openSeguroModal(S.data.seguros.find(x => x.id === e.target.closest('[data-edit]').dataset.edit)));
    UI.on(wrap, '[data-del]', 'click', async e => {
      const s = S.data.seguros.find(x => x.id === e.target.closest('[data-del]').dataset.del);
      if (!s) return;
      const ok = await UI.confirm({
        title: 'Eliminar seguro',
        message: '¿Eliminar la póliza de <strong>' + UI.escapeHtml(s.tipo + ' · ' + s.compania) + '</strong>? Los gastos ya registrados no se tocan.',
        okLabel: 'Eliminar',
      });
      if (ok) { S.remove('seguros', s.id); UI.toast('Seguro eliminado'); G.router.refresh(); }
    });
  }

  function openSeguroModal(s) {
    const isEdit = !!s;
    const m = UI.openModal({
      title: isEdit ? 'Editar seguro' : 'Nuevo seguro / póliza',
      subtitle: 'El semáforo de alertas se calcula solo según la fecha de vencimiento.',
      body:
        '<div class="grid-form">' +
        '<div class="field"><label>Tipo *</label><select class="select" id="fTipo">' +
        S.SEGURO_TIPOS.map(t => '<option' + (s && s.tipo === t ? ' selected' : '') + '>' + t + '</option>').join('') +
        '</select></div>' +
        '<div class="field"><label>Compañía *</label><input class="input" id="fComp" value="' + UI.escapeHtml(s ? s.compania : '') + '" placeholder="Ej.: Provincia ART, La Caja…"></div>' +
        '<div class="field"><label>Nº de póliza</label><input class="input" id="fNum" value="' + UI.escapeHtml(s ? s.numeroPoliza : '') + '" placeholder="Ej.: ART-45821-7"></div>' +
        '<div class="field"><label>Costo / cuota ($)</label><input class="input" type="number" id="fCosto" min="0" step="100" value="' + (s ? s.costo : '') + '" placeholder="0"></div>' +
        '<div class="field"><label>Fecha de vencimiento *</label><input class="input" type="date" id="fFecha" value="' + (s ? s.fechaVencimiento : S.todayISO()) + '"></div>' +
        '<div class="field"><label>Obra asociada (opcional)</label><select class="select" id="fObra">' +
        UI.selectOptions(S.data.works.map(w => ({ v: w.id, l: w.code + ' · ' + w.name })), s ? s.obraId : '', true, 'Sin obra (general)') +
        '</select></div>' +
        '</div>',
      footer: '<button class="btn btn-ghost" data-cancel>Cancelar</button><button class="btn btn-primary" data-save>' + (isEdit ? 'Guardar cambios' : 'Registrar seguro') + '</button>',
    });
    m.panel.querySelector('[data-cancel]').addEventListener('click', m.close);
    m.panel.querySelector('[data-save]').addEventListener('click', () => {
      const compania = m.panel.querySelector('#fComp').value.trim();
      const fecha = m.panel.querySelector('#fFecha').value;
      if (!compania) { UI.toast('Ingresá la compañía', 'error'); return; }
      if (!fecha) { UI.toast('Ingresá la fecha de vencimiento', 'error'); return; }
      const payload = {
        tipo: m.panel.querySelector('#fTipo').value,
        compania,
        numeroPoliza: m.panel.querySelector('#fNum').value.trim(),
        costo: UI.readNum(m.panel.querySelector('#fCosto')),
        fechaVencimiento: fecha,
        obraId: m.panel.querySelector('#fObra').value || null,
      };
      payload.estado = payload.fechaVencimiento < S.todayISO() ? 'vencido' : 'activo';
      if (isEdit) {
        payload.updatedAt = new Date().toISOString();
        S.update('seguros', s.id, payload);
        UI.toast('Seguro actualizado');
      } else {
        payload.createdAt = new Date().toISOString();
        payload.updatedAt = payload.createdAt;
        S.add('seguros', payload);
        UI.toast('Seguro registrado');
      }
      m.close();
      G.router.refresh();
    });
  }
})(typeof window !== 'undefined' ? window : globalThis);
