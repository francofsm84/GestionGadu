/* ============================================================
   GADU · Vista: Empleados
   Panel global (tabla ordenada), asistencia, horas por obra,
   sueldos, adelantos de dinero y legajo completo por empleado
   ============================================================ */
(function (root) {
  'use strict';
  const G = root.GADU, S = G.store, UI = G.ui;
  const state = { q: '', filter: 'activos', view: 'tarjetas', tab: 'pagos', upTo: '', page: 'fichas', selJornadas: {}, selFinanzas: {}, selFichas: {} };
  let currentView2 = null;

  G.router.add('empleados', 'empleados', 'Empleados', 'Fichas del personal, control de jornadas y resumen financiero', render);
  G.router.add('empleado', 'empleado/:id', 'Legajo de empleado', 'Historial completo: pagos, adelantos, asistencia y horas', renderDetail);
  G.actions.employee = openEmployeeModal;
  G.actions.attendance = openAttendanceModal;
  /* Puente con la ruta #/jornadas: abre esta vista unificada en su pestaña */
  G.empleadosOpen = { page: 'fichas' };

  function kpi(icon, tone, label, value, sub) {
    return '<div class="kpi-card">' +
      '<span class="kpi-ico kpi-' + tone + '">' + UI.icon(icon, 20) + '</span>' +
      '<div class="kpi-body">' +
      '<span class="kpi-label">' + label + '</span>' +
      '<strong class="kpi-value">' + value + '</strong>' +
      '<span class="kpi-sub">' + sub + '</span>' +
      '</div></div>';
  }

  function aliasChip(text) {
    if (!text) return '<span class="muted small">Sin alias/CVU</span>';
    return '<span class="alias-chip">' + UI.icon('wallet', 13) +
      '<code title="' + UI.escapeHtml(text) + '">' + UI.escapeHtml(text) + '</code>' +
      '<button class="copy-btn" data-copy="' + UI.escapeHtml(text) + '" title="Copiar alias/CVU">' + UI.icon('copy', 13) + '</button></span>';
  }

  function empOptions(selected) {
    return S.data.employees.slice().sort((a, b) => S.employeeName(a).localeCompare(S.employeeName(b)))
      .map(x => '<option value="' + x.id + '"' + (selected === x.id ? ' selected' : '') + '>' +
        UI.escapeHtml(S.employeeName(x)) + (x.active === false ? ' (de baja)' : '') + '</option>').join('');
  }

  /* ============================================================
     Vista de listado: panel global (tabla / tarjetas)
     ============================================================ */
  function filtered() {
    const q = state.q.toLowerCase();
    return S.data.employees.slice().sort((a, b) => S.employeeName(a).localeCompare(S.employeeName(b))).filter(e => {
      const hay = (S.employeeName(e) + ' ' + (e.role || '') + ' ' + (e.paymentData || '') + ' ' + (e.notes || '')).toLowerCase();
      const activeOk = state.filter === 'todos' || (state.filter === 'activos' ? e.active !== false : e.active === false);
      return activeOk && (!q || hay.includes(q));
    });
  }

  function render(view) {
    currentView2 = view;
    /* Si se llegó desde la ruta #/jornadas, abrir la pestaña correspondiente */
    try { if (G.empleadosOpen && G.empleadosOpen.page && G.empleadosOpen.page !== 'fichas') { state.page = G.empleadosOpen.page; G.empleadosOpen.page = 'fichas'; } } catch (e) {}

    view.innerHTML =
      '<div class="tabs page-tabs">' +
      '<button class="tab ' + (state.page === 'fichas' ? 'active' : '') + '" data-page="fichas">👤 Fichas / Empleados</button>' +
      '<button class="tab ' + (state.page === 'jornadas' ? 'active' : '') + '" data-page="jornadas">📅 Control de Jornadas</button>' +
      '<button class="tab ' + (state.page === 'finanzas' ? 'active' : '') + '" data-page="finanzas">💰 Resumen Financiero</button>' +
      '<button class="tab ' + (state.page === 'cuadrillas' ? 'active' : '') + '" data-page="cuadrillas">👥 Cuadrillas</button>' +
      '</div>' +
      '<div id="pageWrap">' + pageHTML() + '</div>';

    UI.on(view, '[data-page]', 'click', e => {
      state.page = e.currentTarget.dataset.page;
      view.querySelectorAll('[data-page]').forEach(b => b.classList.toggle('active', b.dataset.page === state.page));
      view.querySelector('#pageWrap').innerHTML = pageHTML();
      bindPage(view);
    });
    bindPage(view);
  }

  /* Contenido por pestaña de la vista unificada Empleados + Jornadas */
  function pageHTML() {
    if (state.page === 'jornadas') return jornadasHTML();
    if (state.page === 'finanzas') return finanzasHTML();
    if (state.page === 'cuadrillas') return cuadrillasHTML();
    return fichasHTML();
  }

  function bindPage(view) {
    const wrap = view.querySelector('#pageWrap');
    if (state.page === 'jornadas') { bindJornadas(wrap); return; }
    if (state.page === 'finanzas') { bindFinanzas(wrap); return; }
    if (state.page === 'cuadrillas') { bindCuadrillas(wrap); return; }
    bindFichas(view);
  }

  /* ---------- Pestaña: Cuadrillas (agrupación lógica de empleados) ---------- */
  function crewMembers(crew) {
    return (crew.employeeIds || []).map(id => S.employeeById(id)).filter(Boolean);
  }
  function cuadrillasHTML() {
    const crews = S.data.crews || [];
    const total = crews.reduce((s, c) => s + (c.employeeIds || []).length, 0);
    return '<section class="kpi-grid kpi-3">' +
      kpi('users', 'violet', 'Cuadrillas', String(crews.length), 'Agrupaciones lógicas de personal') +
      kpi('user', 'info', 'Integrantes asignados', String(total), 'Empleados dentro de cuadrillas') +
      kpi('zap', 'success', 'Carga rápida', '1 clic', 'Registrar toda la cuadrilla de una') +
      '</section>' +
      '<div class="toolbar">' +
      '<span class="form-hint">Agrupá empleados para cargar jornadas masivas. No altera los legajos.</span>' +
      '<div class="grow"></div>' +
      '<button class="btn btn-primary" id="btnNewCrew">' + UI.icon('plus', 16) + 'Nueva cuadrilla</button>' +
      '</div>' +
      (crews.length
        ? '<div class="cards-grid">' + crews.map(c => {
            const members = crewMembers(c);
            return '<div class="card">' +
              '<div class="card-head"><strong>' + UI.escapeHtml(c.name || 'Cuadrilla') + '</strong><span class="badge badge-info">' + members.length + '</span></div>' +
              '<div class="muted small" style="margin:6px 0">' + (members.length ? members.map(e => UI.escapeHtml(S.employeeName(e))).join(' · ') : 'Sin integrantes') + '</div>' +
              '<div style="margin-top:auto;display:flex;gap:8px"><button class="btn btn-soft btn-sm" data-crew-edit="' + c.id + '">Editar</button><button class="btn btn-soft-danger btn-sm" data-crew-del="' + c.id + '">Eliminar</button></div>' +
              '</div>';
          }).join('') + '</div>'
        : '<div class="card">' + UI.emptyState('users', 'Sin cuadrillas', 'Creá una para agilizar la carga diaria de jornadas.') + '</div>');
  }
  function bindCuadrillas(wrap) {
    wrap.querySelector('#btnNewCrew').addEventListener('click', () => openCrewModal());
    UI.on(wrap, '[data-crew-edit]', 'click', e => {
      const crew = (S.data.crews || []).find(c => c.id === e.currentTarget.dataset.crewEdit);
      if (crew) openCrewModal(crew);
    });
    UI.on(wrap, '[data-crew-del]', 'click', async e => {
      const crew = (S.data.crews || []).find(c => c.id === e.currentTarget.dataset.crewDel);
      if (!crew) return;
      const ok = await UI.confirm({ title: 'Eliminar cuadrilla', message: '¿Eliminar <strong>' + UI.escapeHtml(crew.name || 'la cuadrilla') + '</strong>? No borra empleados ni jornadas.', okLabel: 'Eliminar' });
      if (ok) { S.remove('crews', crew.id); UI.toast('Cuadrilla eliminada'); G.router.refresh(); }
    });
  }
  function openCrewModal(crew) {
    const isEdit = !!crew;
    const emps = S.data.employees.filter(e => e.active !== false).sort((a, b) => S.employeeName(a).localeCompare(S.employeeName(b)));
    const selected = crew ? (crew.employeeIds || []) : [];
    const checks = emps.map(e =>
      '<label class="ai-check"><input type="checkbox" class="ai-check-input" value="' + e.id + '"' + (selected.indexOf(e.id) >= 0 ? ' checked' : '') + '> ' + UI.escapeHtml(S.employeeName(e)) + '</label>'
    ).join('');
    const m = UI.openModal({
      title: isEdit ? 'Editar cuadrilla' : 'Nueva cuadrilla',
      subtitle: 'Elegí el nombre y los integrantes (no altera los legajos).',
      body:
        '<div class="grid-form">' +
        '<div class="field span-2"><label>Nombre *</label><input class="input" id="fCrewName" value="' + UI.escapeHtml(crew ? crew.name : '') + '" placeholder="Ej.: Cuadrilla 1 / Albañiles principales"></div>' +
        '<div class="field span-2"><label>Integrantes</label><div id="crewChecks" class="ai-multi" style="max-height:240px;overflow:auto">' + (checks || '<span class="muted">No hay empleados activos</span>') + '</div></div>' +
        '</div>',
      footer: '<button class="btn btn-ghost" data-cancel>Cancelar</button><button class="btn btn-primary" data-save>' + (isEdit ? 'Guardar' : 'Crear cuadrilla') + '</button>',
    });
    m.panel.querySelector('[data-save]').addEventListener('click', () => {
      const name = m.panel.querySelector('#fCrewName').value.trim();
      if (!name) { UI.toast('Poné un nombre a la cuadrilla', 'error'); return; }
      const ids = Array.from(m.panel.querySelectorAll('.ai-check-input:checked')).map(cb => cb.value);
      if (!ids.length) { UI.toast('Elegí al menos un integrante', 'error'); return; }
      if (isEdit) { S.update('crews', crew.id, { name, employeeIds: ids }); UI.toast('Cuadrilla actualizada'); }
      else { S.add('crews', { name, employeeIds: ids }); UI.toast('Cuadrilla creada'); }
      m.close();
      G.router.refresh();
    });
    m.panel.querySelector('[data-cancel]').addEventListener('click', m.close);
  }

  function fichasHTML() {
    const actives = S.data.employees.filter(e => e.active !== false).length;
    const salaryAll = S.sum(S.data.expenses.filter(x => x.employeeId && x.expenseKind !== 'adelanto').map(x => x.amount));
    const advancesAll = S.sum(S.data.expenses.filter(x => x.employeeId && x.expenseKind === 'adelanto').map(x => x.amount));
    /* Saldo pendiente de pago: jornales devengados del mes − pagos del mes */
    const pendAll = S.sum(S.data.employees.filter(e => e.active !== false).map(e => {
      const m = S.employeeMonth(e.id);
      const devengado = (m.hours || 0) * (Number(e.hourlyRate) || 0);
      return Math.max(0, devengado - m.salary - m.advances);
    }));
    const today = S.presentToday();
    const monthKey = S.todayISO().slice(0, 7);
    const monthDays = S.data.attendance.filter(a => a.date.slice(0, 7) === monthKey && a.status === 'presente').length;

    return '<section class="kpi-grid">' +
      kpi('user', 'info', 'Empleados activos', String(actives), S.data.employees.length + ' legajos en total') +
      kpi('wallet', 'success', 'Sueldos acumulados', UI.fmtMoney(salaryAll), 'Histórico al personal') +
      kpi('zap', 'warning', 'Adelantos', UI.fmtMoney(advancesAll), 'Dinero adelantado · para descontar') +
      kpi('clock', pendAll > 0 ? 'danger' : 'success', 'Saldo pendiente a pagar', UI.fmtMoney(pendAll), 'Jornales devengados sin liquidar') +
      kpi('check-circle', 'violet', 'Presentes hoy', String(today.length), monthDays + ' jornadas este mes') +
      '</section>' +
      '<div class="toolbar">' +
      '<div class="search">' + UI.icon('search', 16) + '<input id="fq" class="input" placeholder="Buscar por nombre, rol, alias o notas…" value="' + UI.escapeHtml(state.q) + '"></div>' +
      '<select id="ff" class="select" style="max-width:160px">' +
      '<option value="activos"' + (state.filter === 'activos' ? ' selected' : '') + '>Activos</option>' +
      '<option value="todos"' + (state.filter === 'todos' ? ' selected' : '') + '>Todos</option>' +
      '<option value="bajas"' + (state.filter === 'bajas' ? ' selected' : '') + '>De baja</option>' +
      '</select>' +
      '<div class="seg">' +
      '<button class="' + (state.view === 'tabla' ? 'active' : '') + '" data-view="tabla">Tabla</button>' +
      '<button class="' + (state.view === 'tarjetas' ? 'active' : '') + '" data-view="tarjetas">Tarjetas</button>' +
      '</div>' +
      '<button class="btn btn-soft-info" id="btnAtt">' + UI.icon('calendar-plus', 16) + 'Registrar jornada</button>' +
      '<div class="grow"></div>' +
      '<button class="btn btn-primary" id="btnNew">' + UI.icon('plus', 16) + 'Nuevo empleado</button>' +
      '</div>' +
      '<div id="bulkBarE" class="bulk-bar" hidden></div>' +
      '<div id="listWrap">' + (state.view === 'tabla' ? tableHTML(filtered()) : cardsHTML(filtered())) + '</div>';
  }

  function bindFichas(view) {
    view.querySelector('#fq').addEventListener('input', e => { state.q = e.target.value; updateList(view); });
    view.querySelector('#ff').addEventListener('change', e => { state.filter = e.target.value; updateList(view); });
    UI.on(view, '[data-view]', 'click', e => {
      state.view = e.currentTarget.dataset.view;
      view.querySelectorAll('[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === state.view));
      updateList(view);
    });
    view.querySelector('#btnNew').addEventListener('click', () => openEmployeeModal());
    view.querySelector('#btnAtt').addEventListener('click', () => openAttendanceModal());
    bindList(view.querySelector('#listWrap'));
    bindEmpSelection(view);
    refreshBulkBarE(view);
  }

  function bindEmpSelection(view) {
    const wrap = view.querySelector('#listWrap');
    if (!wrap) return;
    UI.on(wrap, '.row-check-e', 'change', e => {
      e.stopPropagation();
      const id = e.target.closest('.row-check-e').dataset.id;
      if (e.target.checked) state.selFichas[id] = true; else delete state.selFichas[id];
      const master = wrap.querySelector('#selAllFichas');
      if (master) master.checked = filtered().length > 0 && filtered().every(x => state.selFichas[x.id]);
      refreshBulkBarE(view);
    });
    UI.on(wrap, '#selAllFichas', 'change', e => {
      const checked = e.target.checked;
      filtered().forEach(x => { if (checked) state.selFichas[x.id] = true; else delete state.selFichas[x.id]; });
      updateList(view);
    });
  }

  function refreshBulkBarE(view) {
    const bar = view ? view.querySelector('#bulkBarE') : null;
    if (!bar) return;
    const n = Object.keys(state.selFichas).filter(id => state.selFichas[id]).length;
    bar.hidden = n === 0;
    bar.innerHTML = n ? '<button class="btn btn-soft-danger" id="btnBulkDelE">🗑️ Eliminar seleccionados (' + n + ')</button>' : '';
    if (n) bar.querySelector('#btnBulkDelE').addEventListener('click', async () => {
      const ids = Object.keys(state.selFichas).filter(id => state.selFichas[id]);
      const ok = await UI.confirm({ title: 'Eliminar empleados', message: '¿Eliminar <strong>' + ids.length + '</strong> empleado(s)? Se eliminará su asistencia y el vínculo con sus pagos (los gastos se conservan).', okLabel: 'Eliminar', tone: 'danger' });
      if (!ok) return;
      ids.forEach(id => S.removeEmployee(id));
      state.selFichas = {};
      UI.toast('Eliminados ' + ids.length + ' empleado(s)');
      G.router.refresh();
    });
  }

  /* ---------- Pestaña: Control de Jornadas (todas las jornadas) ---------- */
  function jornadasHTML() {
    const hoy = S.todayISO();
    const monthKey = hoy.slice(0, 7);
    const presentesHoy = S.data.attendance.filter(a => a.date === hoy && a.status === 'presente').length;
    const jornadasMes = S.data.attendance.filter(a => (a.date || '').slice(0, 7) === monthKey && a.status === 'presente').length;
    const horasMes = S.sum(S.data.attendance.filter(a => (a.date || '').slice(0, 7) === monthKey).flatMap(a => (a.hours || []).map(h => h.hours)));
    const att = S.data.attendance.slice().sort((a, b) => b.date.localeCompare(a.date));
    const allSel = att.length > 0 && att.every(a => state.selJornadas[a.id]);
    return '<section class="kpi-grid kpi-3">' +
      kpi('check-circle', 'violet', 'Presentes hoy', String(presentesHoy), 'Jornadas cargadas para hoy') +
      kpi('calendar', 'info', 'Jornadas este mes', String(jornadasMes), 'Días con asistencia registrada') +
      kpi('clock', 'success', 'Horas este mes', String(horasMes), 'Suma de horas por obra') +
      '</section>' +
      '<div class="toolbar">' +
      '<span class="form-hint">Todas las jornadas del personal (las del asistente y las de acá).</span>' +
      '<div class="grow"></div>' +
      '<button class="btn btn-soft-info" id="btnAttJ">' + UI.icon('calendar-plus', 16) + 'Registrar jornada</button>' +
      '</div>' +
      '<div id="bulkBarJ" class="bulk-bar" hidden></div>' +
      '<div class="card table-card"><div class="table-wrap"><table class="data-table">' +
      '<thead><tr><th class="chk"><input type="checkbox" id="selAllJ"' + (allSel ? ' checked' : '') + ' title="Seleccionar todas"></th><th>Fecha</th><th>Empleado</th><th>Estado</th><th>Obra · Horas</th><th>Notas</th><th class="num"></th></tr></thead>' +
      '<tbody>' +
      (att.map(a => {
        const emp = S.employeeById(a.employeeId);
        const horas = (a.hours || []).map(h => {
          const w = S.data.works.find(x => x.id === h.workId);
          return '<div class="split-row" style="gap:8px"><span>' + UI.escapeHtml(w ? w.name : 'General') + '</span><b>' + (Number(h.hours) || 0) + ' hs' + (h.tipo === 'extra' ? ' ⚡' : '') + '</b></div>';
        }).join('');
        return '<tr>' +
          '<td class="chk"><input type="checkbox" class="row-check-j" data-id="' + a.id + '"' + (state.selJornadas[a.id] ? ' checked' : '') + '></td>' +
          '<td class="muted">' + UI.fmtDate(a.date) + '</td>' +
          '<td><strong>' + UI.escapeHtml(emp ? S.employeeName(emp) : '—') + '</strong></td>' +
          '<td>' + (a.status === 'presente' ? UI.chip('Presente', 'success', 'check-circle') : UI.chip('Ausente', 'neutral', 'x-circle')) + '</td>' +
          '<td>' + (horas || '<span class="muted">—</span>') + '</td>' +
          '<td class="muted">' + UI.escapeHtml(a.notes || '—') + '</td>' +
          '<td class="num"><div class="row-actions" style="justify-content:flex-end">' +
          '<button class="icon-btn sm" data-jatt="' + a.id + '" title="Editar">' + UI.icon('edit', 15) + '</button>' +
          '<button class="icon-btn sm danger" data-jdel="' + a.id + '" title="Eliminar">' + UI.icon('trash', 15) + '</button>' +
          '</div></td></tr>';
      }).join('') || '<tr><td colspan="7">' + UI.emptyState('calendar', 'Sin jornadas todavía', 'Registralas desde acá o por el asistente.') + '</td></tr>') +
      '</tbody></table></div></div>';
  }

  function refreshBulkBarJ() {
    const view = currentView2;
    const bar = view ? view.querySelector('#bulkBarJ') : null;
    if (!bar) return;
    const n = Object.keys(state.selJornadas).filter(id => state.selJornadas[id]).length;
    bar.hidden = n === 0;
    bar.innerHTML = n ? '<button class="btn btn-soft-danger" id="btnBulkDelJ">🗑️ Eliminar jornadas seleccionadas (' + n + ')</button>' : '';
    if (n) bar.querySelector('#btnBulkDelJ').addEventListener('click', async () => {
      const ids = Object.keys(state.selJornadas).filter(id => state.selJornadas[id]);
      const ok = await UI.confirm({ title: 'Eliminar jornadas', message: '¿Eliminar <strong>' + ids.length + '</strong> jornada(s)? Esta acción no se puede deshacer.', okLabel: 'Eliminar', tone: 'danger' });
      if (!ok) return;
      ids.forEach(id => S.remove('attendance', id));
      state.selJornadas = {};
      UI.toast('Eliminadas ' + ids.length + ' jornada(s)');
      G.router.refresh();
    });
  }

  function bindJornadas(wrap) {
    const btn = wrap.querySelector('#btnAttJ');
    if (btn) btn.addEventListener('click', () => openAttendanceModal());
    UI.on(wrap, '[data-jatt]', 'click', e => {
      const a = S.data.attendance.find(x => x.id === e.target.closest('[data-jatt]').dataset.jatt);
      if (a) openAttendanceModal({ attendance: a });
    });
    UI.on(wrap, '[data-jdel]', 'click', async e => {
      const a = S.data.attendance.find(x => x.id === e.target.closest('[data-jdel]').dataset.jdel);
      if (!a) return;
      const ok = await UI.confirm({ title: 'Eliminar jornada', message: '¿Eliminar esta jornada?', okLabel: 'Eliminar' });
      if (ok) { S.remove('attendance', a.id); UI.toast('Jornada eliminada'); G.router.refresh(); }
    });
    UI.on(wrap, '.row-check-j', 'change', e => {
      const id = e.target.closest('.row-check-j').dataset.id;
      if (e.target.checked) state.selJornadas[id] = true; else delete state.selJornadas[id];
      const master = wrap.querySelector('#selAllJ');
      if (master) master.checked = S.data.attendance.length > 0 && S.data.attendance.every(a => state.selJornadas[a.id]);
      refreshBulkBarJ();
    });
    UI.on(wrap, '#selAllJ', 'change', e => {
      const checked = e.target.checked;
      S.data.attendance.forEach(a => { if (checked) state.selJornadas[a.id] = true; else delete state.selJornadas[a.id]; });
      currentView2.innerHTML = '';
      G.router.refresh();
    });
    refreshBulkBarJ();
  }

  /* ---------- Pestaña: Resumen Financiero ---------- */
  function finanzasHTML() {
    const emps = S.data.employees.slice().sort((a, b) => S.employeeName(a).localeCompare(S.employeeName(b)));
    const allSel = emps.length > 0 && emps.every(e => state.selFinanzas[e.id]);
    const rows = emps.map(e => {
      const m = S.employeeMonth(e.id);
      const st = S.employeeStats(e.id);
      const devengado = (m.hours || 0) * (Number(e.hourlyRate) || 0);
      const saldo = devengado - m.salary - m.advances;
      return '<tr>' +
        '<td class="chk"><input type="checkbox" class="row-check-f" data-id="' + e.id + '"' + (state.selFinanzas[e.id] ? ' checked' : '') + '></td>' +
        '<td><strong>' + UI.escapeHtml(S.employeeName(e)) + '</strong>' + (e.active === false ? ' ' + UI.chip('De baja', 'danger') : '') + '</td>' +
        '<td class="num">' + m.hours + '</td>' +
        '<td class="num pos">' + UI.fmtMoney(st.salary) + '</td>' +
        '<td class="num warning-text">' + UI.fmtMoney(st.advances) + '</td>' +
        '<td class="num ' + (saldo > 0 ? 'neg' : 'pos') + '"><b>' + (saldo > 0 ? UI.fmtMoney(saldo) : 'Al día ✓') + '</b></td>' +
        '<td class="num"><div class="row-actions" style="justify-content:flex-end">' +
        '<button class="btn btn-soft-success btn-sm" data-fpay="' + e.id + '">' + UI.icon('wallet', 13) + ' Pagar</button>' +
        '<button class="btn btn-soft-warning btn-sm" data-fadv="' + e.id + '">' + UI.icon('zap', 13) + ' Adelanto</button>' +
        '</div></td></tr>';
    }).join('');
    const tSueldos = S.sum(S.data.expenses.filter(x => x.employeeId && x.expenseKind !== 'adelanto').map(x => x.amount));
    const tAdel = S.sum(S.data.expenses.filter(x => x.employeeId && x.expenseKind === 'adelanto').map(x => x.amount));
    return '<div id="bulkBarF" class="bulk-bar" hidden></div>' +
      '<div class="card table-card"><div class="table-wrap"><table class="data-table">' +
      '<thead><tr><th class="chk"><input type="checkbox" id="selAllF"' + (allSel ? ' checked' : '') + ' title="Seleccionar todos"></th><th>Empleado</th><th class="num">Horas mes</th><th class="num">Sueldos</th><th class="num">Adelantos</th><th class="num">Saldo a liquidar</th><th class="num"></th></tr></thead>' +
      '<tbody>' +
      (rows || '<tr><td colspan="7">' + UI.emptyState('wallet', 'Sin empleados', 'Cargá el primero desde Fichas / Empleados.') + '</td></tr>') +
      '</tbody></table></div>' +
      '<div class="table-foot">' +
      '<span>' + S.data.employees.length + ' legajo' + (S.data.employees.length !== 1 ? 's' : '') + '</span>' +
      '<span>Sueldos <b class="pos">' + UI.fmtMoney(tSueldos) + '</b> · Adelantos <b class="warning-text">' + UI.fmtMoney(tAdel) + '</b></span>' +
      '</div></div>';
  }

  function refreshBulkBarF() {
    const bar = currentView2 ? currentView2.querySelector('#bulkBarF') : null;
    if (!bar) return;
    const n = Object.keys(state.selFinanzas).filter(id => state.selFinanzas[id]).length;
    bar.hidden = n === 0;
    bar.innerHTML = n
      ? '<button class="btn btn-soft-success" id="btnBulkPay">💵 Registrar Pago Masivo (' + n + ')</button> ' +
        '<button class="btn btn-soft-warning" id="btnBulkAdv">⚡ Registrar Adelanto Masivo (' + n + ')</button>'
      : '';
    if (n) {
      bar.querySelector('#btnBulkPay').addEventListener('click', () => openBulkPay('pago'));
      bar.querySelector('#btnBulkAdv').addEventListener('click', () => openBulkPay('adelanto'));
    }
  }

  function openBulkPay(kind) {
    const ids = Object.keys(state.selFinanzas).filter(id => state.selFinanzas[id]);
    if (!ids.length) return;
    const m = UI.openModal({
      title: kind === 'adelanto' ? 'Adelanto masivo' : 'Pago masivo',
      subtitle: 'Se aplicará a <strong>' + ids.length + '</strong> empleado(s) seleccionado(s).',
      body: '<div class="grid-form"><div class="field span-2"><label>Monto por empleado *</label><input class="input" type="number" id="fBulkAmt" min="0" step="100" placeholder="0"></div></div>',
      footer: '<button class="btn btn-ghost" data-cancel>Cancelar</button><button class="btn btn-primary" data-save>Aplicar</button>',
    });
    m.panel.querySelector('[data-save]').addEventListener('click', () => {
      const amt = UI.readNum(m.panel.querySelector('#fBulkAmt'));
      if (!amt || amt <= 0) { UI.toast('Ingresá un monto válido', 'error'); return; }
      const hoy = S.todayISO();
      ids.forEach(id => {
        S.add('expenses', {
          type: 'general', workId: null, date: hoy, amount: amt, category: 'Sueldos', providerId: null, employeeId: id,
          description: kind === 'adelanto' ? 'Adelanto' : 'Pago de sueldo', invoiceNumber: '', paymentMethod: 'Efectivo',
          expenseKind: kind === 'adelanto' ? 'adelanto' : null, source: 'web',
        });
      });
      state.selFinanzas = {};
      m.close();
      UI.toast((kind === 'adelanto' ? 'Adelantos' : 'Pagos') + ' registrados (' + ids.length + ')');
      G.router.refresh();
    });
    m.panel.querySelector('[data-cancel]').addEventListener('click', m.close);
  }

  function bindFinanzas(wrap) {
    UI.on(wrap, '[data-fpay]', 'click', e => {
      e.stopPropagation();
      G.actions.expense({ type: 'general', employeeId: e.target.closest('[data-fpay]').dataset.fpay, category: 'Sueldos' });
    });
    UI.on(wrap, '[data-fadv]', 'click', e => {
      e.stopPropagation();
      G.actions.expense({ type: 'general', employeeId: e.target.closest('[data-fadv]').dataset.fadv, category: 'Sueldos', expenseKind: 'adelanto' });
    });
    UI.on(wrap, '.row-check-f', 'change', e => {
      const id = e.target.closest('.row-check-f').dataset.id;
      if (e.target.checked) state.selFinanzas[id] = true; else delete state.selFinanzas[id];
      const master = wrap.querySelector('#selAllF');
      if (master) master.checked = S.data.employees.length > 0 && S.data.employees.every(x => state.selFinanzas[x.id]);
      refreshBulkBarF();
    });
    UI.on(wrap, '#selAllF', 'change', e => {
      const checked = e.target.checked;
      S.data.employees.forEach(x => { if (checked) state.selFinanzas[x.id] = true; else delete state.selFinanzas[x.id]; });
      G.router.refresh();
    });
    refreshBulkBarF();
  }

  function updateList(view) {
    const wrap = view.querySelector('#listWrap');
    if (!wrap) return;
    wrap.innerHTML = state.view === 'tabla' ? tableHTML(filtered()) : cardsHTML(filtered());
    bindList(wrap);
    bindEmpSelection(view);
    refreshBulkBarE(view);
  }

  function lastCell(last) {
    if (!last) return '<span class="muted">—</span>';
    return UI.fmtDateShort(last.date) + ' · ' +
      (last.status === 'presente' ? UI.chip('P', 'success') : UI.chip('A', 'danger'));
  }

  function tableHTML(list) {
    if (!list.length) {
      return '<div class="card">' + UI.emptyState('user', 'No hay empleados que coincidan', 'Probá con otra búsqueda o filtro.') + '</div>';
    }
    const allSel = list.length > 0 && list.every(e => state.selFichas[e.id]);
    return '<div class="card table-card"><div class="table-wrap">' +
      '<table class="data-table">' +
      '<thead><tr><th class="chk"><input type="checkbox" id="selAllFichas"' + (allSel ? ' checked' : '') + ' title="Seleccionar todos los visibles"></th><th>Empleado</th><th>Teléfono</th><th class="num">Mes P/A</th><th class="num">Horas mes</th><th class="num">Sueldos</th><th class="num">Adelantos</th><th class="num">Saldo a liquidar</th><th>Última jornada</th><th>Alias / CVU</th><th></th></tr></thead>' +
      '<tbody>' +
      list.map(e => {
        const st = S.employeeStats(e.id);
        const mst = S.employeeMonth(e.id);
        const last = st.attendance.length ? st.attendance[0] : null;
        const devengado = (mst.hours || 0) * (Number(e.hourlyRate) || 0);
        const saldo = devengado - mst.salary - mst.advances;
        return '<tr class="clickable" data-id="' + e.id + '">' +
          '<td class="chk" data-norow="1"><input type="checkbox" class="row-check-e" data-id="' + e.id + '"' + (state.selFichas[e.id] ? ' checked' : '') + '></td>' +
          '<td><div style="display:flex;align-items:center;gap:9px">' + UI.avatar(S.employeeName(e), 30, e.photo) +
          '<span><strong>' + UI.escapeHtml(S.employeeName(e)) + '</strong>' +
          (e.active === false ? ' ' + UI.chip('De baja', 'danger') : '') + '</span></div></td>' +
          '<td class="muted">' + UI.escapeHtml(e.phone || '—') + '</td>' +
          '<td class="num"><b>' + mst.present + '</b> / ' + mst.absent + '</td>' +
          '<td class="num">' + mst.hours + '</td>' +
          '<td class="num pos">' + UI.fmtMoney(st.salary) + '</td>' +
          '<td class="num warning-text">' + UI.fmtMoney(st.advances) + '</td>' +
          '<td class="num ' + (saldo > 0 ? 'neg' : 'pos') + '"><b>' + (saldo > 0 ? UI.fmtMoney(saldo) : 'Al día ✓') + '</b></td>' +
          '<td>' + lastCell(last) + '</td>' +
          '<td>' + (e.paymentData
            ? '<span class="alias-chip" style="padding:3px 8px"><code style="max-width:110px" title="' + UI.escapeHtml(e.paymentData) + '">' + UI.escapeHtml(e.paymentData) + '</code>' +
              '<button class="copy-btn" data-copy="' + UI.escapeHtml(e.paymentData) + '" title="Copiar">' + UI.icon('copy', 12) + '</button></span>'
            : '<span class="muted">—</span>') + '</td>' +
          '<td><div class="row-actions">' +
          '<a class="icon-btn sm" href="#/empleado/' + e.id + '" title="Historial">' + UI.icon('eye', 15) + '</a>' +
          '<button class="icon-btn sm" data-pay="' + e.id + '" title="Registrar pago">' + UI.icon('wallet', 15) + '</button>' +
          '<button class="icon-btn sm" data-adv="' + e.id + '" title="Registrar adelanto">' + UI.icon('zap', 15) + '</button>' +
          '<button class="icon-btn sm" data-att="' + e.id + '" title="Registrar jornada">' + UI.icon('calendar-plus', 15) + '</button>' +
          '<button class="icon-btn sm" data-edit="' + e.id + '" title="Editar">' + UI.icon('edit', 15) + '</button>' +
          '<button class="icon-btn sm danger" data-del="' + e.id + '" title="Eliminar">' + UI.icon('trash', 15) + '</button>' +
          '</div></td></tr>';
      }).join('') +
      '</tbody></table></div></div>';
  }

  function cardsHTML(list) {
    if (!list.length) {
      return '<div class="card">' + UI.emptyState('user', 'No hay empleados que coincidan', 'Probá con otra búsqueda o filtro.') + '</div>';
    }
    return '<div class="cards-grid">' + list.map(empCard).join('') + '</div>';
  }

  /* Selector rápido de rendimiento (Alto/Medio/Bajo) con color distintivo */
  function rendimientoSelect(e) {
    const cur = e.rendimiento || '';
    const opts = [
      ['', 'Sin calificar', ''],
      ['alto', 'Alto', 'rend-alto'],
      ['medio', 'Medio', 'rend-medio'],
      ['bajo', 'Bajo', 'rend-bajo'],
    ];
    return '<select class="select rend-select ' + (cur === 'alto' ? 'rend-alto' : cur === 'medio' ? 'rend-medio' : cur === 'bajo' ? 'rend-bajo' : '') + '" data-rend="' + e.id + '" title="Rendimiento">' +
      opts.map(o => '<option value="' + o[0] + '"' + (cur === o[0] ? ' selected' : '') + '>' + o[1] + '</option>').join('') +
      '</select>';
  }

  function empCard(e) {
    const st = S.employeeStats(e.id);
    const mst = S.employeeMonth(e.id);
    const devengado = (mst.hours || 0) * (Number(e.hourlyRate) || 0);
    const saldo = devengado - mst.salary - mst.advances;
    const acc = S.employeeAccumulated(e.id);
    return '<article class="contact-card" data-id="' + e.id + '">' +
      '<input type="checkbox" class="row-check-e card-check" data-id="' + e.id + '"' + (state.selFichas[e.id] ? ' checked' : '') + ' title="Seleccionar">' +
      '<div class="contact-head">' +
      UI.avatar(S.employeeName(e), 42, e.photo) +
      '<div class="contact-info"><strong>' + UI.escapeHtml(S.employeeName(e)) + '</strong>' +
      '<span>' + UI.escapeHtml(e.phone || 'Sin teléfono') + (e.hourlyRate ? ' · $' + UI.fmtNum(e.hourlyRate) + '/h' : '') + '</span></div>' +
      (e.active === false ? UI.chip('De baja', 'danger') : UI.chip('Activo', 'success')) +
      '</div>' +
      '<div class="contact-chips">' + aliasChip(e.paymentData) + '</div>' +
      '<div style="margin-top:8px;display:flex;align-items:center;gap:8px">' +
      '<span class="muted small">Rendimiento</span>' + rendimientoSelect(e) +
      '</div>' +
      /* Dinero acumulado pendiente: destacado en tiempo real (horas × tarifa − adelantos) */
      '<div style="margin-top:2px;padding:8px 11px;border-radius:10px;background:var(--primary-soft);display:flex;align-items:center;gap:8px;flex-wrap:wrap">' +
      '<b style="color:var(--primary);font-size:12.5px">💰 Dinero acumulado pendiente</b>' +
      '<b style="margin-left:auto;color:' + (acc.acumulado >= 0 ? 'var(--success)' : 'var(--danger)') + '">' + UI.fmtMoney(Math.abs(acc.acumulado)) + (acc.acumulado < 0 ? ' a favor' : '') + '</b>' +
      '</div>' +
      '<div class="asset-stats">' +
      '<span>Total cobrado<b class="pos">' + UI.fmtMoney(st.paidTotal) + '</b></span>' +
      '<span>Adelantos<b class="warning-text">' + UI.fmtMoney(st.advances) + '</b></span>' +
      '<span>Días · Horas<b>' + st.daysWorked + ' · ' + st.hoursTotal + '</b></span>' +
      '<span>Saldo a liquidar (mes)<b class="' + (saldo > 0 ? 'neg' : 'pos') + '">' + (saldo > 0 ? UI.fmtMoney(saldo) : 'Al día ✓') + '</b></span>' +
      '</div>' +
      '<div class="asset-foot">' +
      '<a class="btn btn-soft btn-sm" href="#/empleado/' + e.id + '">' + UI.icon('eye', 14) + 'Historial</a>' +
      '<button class="btn btn-soft-success btn-sm" data-pay="' + e.id + '">' + UI.icon('wallet', 14) + 'Pagar</button>' +
      '<button class="btn btn-soft-warning btn-sm" data-adv="' + e.id + '">' + UI.icon('zap', 14) + 'Adelanto</button>' +
      '<button class="btn btn-soft-info btn-sm" data-att="' + e.id + '">' + UI.icon('calendar-plus', 14) + 'Jornada</button>' +
      '<div class="spacer"></div>' +
      '<button class="icon-btn sm" data-edit="' + e.id + '" title="Editar">' + UI.icon('edit', 15) + '</button>' +
      '<button class="icon-btn sm danger" data-del="' + e.id + '" title="Eliminar">' + UI.icon('trash', 15) + '</button>' +
      '</div></article>';
  }

  function bindList(wrap) {
    UI.on(wrap, '.contact-card, tr.clickable', 'click', e => {
      if (e.target.closest('button') || e.target.closest('a') || e.target.closest('input') || e.target.closest('select')) return;
      location.hash = '#/empleado/' + e.currentTarget.dataset.id;
    });
    UI.on(wrap, '[data-pay]', 'click', e => {
      e.stopPropagation();
      G.actions.expense({ type: 'general', employeeId: e.target.closest('[data-pay]').dataset.pay, category: 'Sueldos' });
    });
    UI.on(wrap, '[data-adv]', 'click', e => {
      e.stopPropagation();
      G.actions.expense({ type: 'general', employeeId: e.target.closest('[data-adv]').dataset.adv, category: 'Sueldos', expenseKind: 'adelanto' });
    });
    UI.on(wrap, '[data-att]', 'click', e => {
      e.stopPropagation();
      openAttendanceModal({ employeeId: e.target.closest('[data-att]').dataset.att });
    });
    UI.on(wrap, '[data-rend]', 'change', e => {
      e.stopPropagation();
      const id = e.target.closest('[data-rend]').dataset.rend;
      const val = e.target.value;
      S.update('employees', id, { rendimiento: val || null });
      UI.toast('✅ Rendimiento actualizado');
    });
    UI.on(wrap, '[data-edit]', 'click', e => {
      e.stopPropagation();
      openEmployeeModal(S.data.employees.find(x => x.id === e.target.closest('[data-edit]').dataset.edit));
    });
    UI.on(wrap, '[data-del]', 'click', async e => {
      e.stopPropagation();
      const emp = S.data.employees.find(x => x.id === e.target.closest('[data-del]').dataset.del);
      if (!emp) return;
      const ok = await UI.confirm({
        title: 'Eliminar empleado',
        message: 'Se eliminará a <strong>' + UI.escapeHtml(S.employeeName(emp)) + '</strong>, su asistencia y el vínculo con sus pagos (los gastos se conservan).',
        okLabel: 'Eliminar',
      });
      if (ok) {
        S.removeEmployee(emp.id);
        UI.toast('Empleado eliminado');
        G.router.refresh();
      }
    });
    UI.on(wrap, '[data-copy]', 'click', e => {
      e.stopPropagation();
      UI.copyText(e.target.closest('[data-copy]').dataset.copy);
    });
  }

  /* ============================================================
     Vista de detalle (legajo)
     ============================================================ */
  function renderDetail(view, params) {
    const e = S.data.employees.find(x => x.id === params.id);
    if (!e) {
      view.innerHTML = UI.emptyState('alert-triangle', 'Empleado no encontrado', 'Puede haber sido eliminado.', '<a class="btn btn-soft" href="#/empleados">Volver a empleados</a>');
      return;
    }
    const upTo = state.upTo || S.todayISO();
    const st = S.employeeStats(e.id, upTo);
    const stAll = S.employeeStats(e.id);
    /* Saldo de la semana en curso (devengado − adelantos de los últimos 7 días) */
    const desdeSemana = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    const horasSemana = (S.data.attendance || []).filter(a => a.employeeId === e.id && (a.date || '') >= desdeSemana && a.status === 'presente')
      .reduce((s, a) => s + (a.hours || []).reduce((s2, h) => s2 + (Number(h.hours) || 0), 0), 0);
    const devengadoSemana = horasSemana * (Number(e.hourlyRate) || 0);
    const adelantosSemana = (S.data.expenses || []).filter(x => x.employeeId === e.id && x.expenseKind === 'adelanto' && (x.date || '') >= desdeSemana)
      .reduce((s, x) => s + (Number(x.amount) || 0), 0);
    const pendSemana = Math.max(0, devengadoSemana - adelantosSemana);
    const ctx = { e, st, stAll, upTo, pendSemana };

    view.innerHTML =
      '<div class="detail-head card">' +
      '<a class="btn btn-ghost btn-sm" href="#/empleados">' + UI.icon('chevron-left', 15) + 'Empleados</a>' +
      '<div class="detail-title">' +
      '<h2>' + UI.escapeHtml(S.employeeName(e)) +
      (e.active === false ? ' ' + UI.chip('De baja', 'danger') : ' ' + UI.chip('Activo', 'success')) + '</h2>' +
      '<p class="muted">' + UI.icon('phone', 13) + ' <a href="' + UI.telLink(e.phone) + '">' + UI.escapeHtml(e.phone || '—') + '</a>' +
      (e.phone ? ' · <a href="' + UI.waLink(e.phone) + '" target="_blank" rel="noopener">WhatsApp</a>' : '') +
      (e.hourlyRate ? ' · $' + UI.fmtNum(e.hourlyRate) + ' por hora' : '') +
      (e.notes ? ' · ' + UI.escapeHtml(e.notes) : '') + '</p>' +
      '</div>' +
      '<div class="detail-actions">' +
      '<button class="btn btn-soft-success" id="btnPayWeek" title="Liquidar la semana (devengado − adelantos)">' + UI.icon('calendar-plus', 15) + 'Pagar Semana' + (pendSemana > 0 ? ' · ' + UI.fmtMoney(pendSemana) : '') + '</button>' +
      '<button class="btn btn-soft-success" id="btnPay">' + UI.icon('wallet', 15) + 'Registrar pago</button>' +
      '<button class="btn btn-soft-warning" id="btnAdv">' + UI.icon('zap', 15) + 'Adelanto</button>' +
      '<button class="btn btn-soft-info" id="btnAtt2">' + UI.icon('calendar-plus', 15) + 'Jornada</button>' +
      '<button class="btn btn-soft" id="btnEdit">' + UI.icon('edit', 15) + 'Editar</button>' +
      '<button class="btn btn-soft-danger" id="btnDel" title="Eliminar">' + UI.icon('trash', 15) + '</button>' +
      '</div></div>' +

      '<div class="card" style="padding:12px 16px">' + aliasChip(e.paymentData) +
      ' <span class="form-hint">Alias / CBU / CVU donde se le paga. Tocá el ícono para copiar.</span></div>' +

      /* Dinero acumulado pendiente: destacado en el legajo (horas × tarifa − adelantos) */
      (() => {
        const acc = S.employeeAccumulated(e.id);
        return '<div class="card" style="padding:12px 16px;border:1px solid var(--primary);display:flex;align-items:center;gap:12px;flex-wrap:wrap">' +
          '<b>💰 Dinero acumulado pendiente</b>' +
          '<span class="muted small" style="flex:1;min-width:0">' + stAll.hoursTotal + ' h × ' + UI.fmtMoney(Number(e.hourlyRate) || 0) + ' − adelantos ' + UI.fmtMoney(acc.adelantos) + '</span>' +
          '<b class="' + (acc.acumulado >= 0 ? 'pos' : 'neg') + '" style="font-size:17px">' + UI.fmtMoney(Math.abs(acc.acumulado)) + (acc.acumulado < 0 ? ' a favor' : '') + '</b>' +
          '</div>';
      })() +

      '<section class="kpi-grid kpi-4">' +
      kpi('wallet', 'success', 'Cobrado hasta la fecha', UI.fmtMoney(st.paidTotal),
        'Hasta el <input type="date" class="input up-to-input" id="upTo" value="' + upTo + '"> · incluye adelantos') +
      kpi('zap', 'warning', 'Adelantos', UI.fmtMoney(stAll.advances), S.employeeAdvances(e.id).list.length + ' registrados') +
      kpi('check-circle', 'info', 'Días trabajados', String(stAll.daysWorked), 'Jornadas con asistencia') +
      kpi('clock', 'violet', 'Horas totales', String(stAll.hoursTotal), stAll.byWorkList.length + ' obra(s) con horas') +
      '</section>' +

      '<section class="card">' +
      '<div class="tabs">' +
      '<button class="tab ' + (state.tab === 'pagos' ? 'active' : '') + '" data-tab="pagos">Pagos (' + stAll.pays.length + ')</button>' +
      '<button class="tab ' + (state.tab === 'asistencia' ? 'active' : '') + '" data-tab="asistencia">Asistencia (' + stAll.attendance.length + ')</button>' +
      '<button class="tab ' + (state.tab === 'obra' ? 'active' : '') + '" data-tab="obra">Horas por obra (' + stAll.byWorkList.length + ')</button>' +
      '<button class="tab ' + (state.tab === 'hist' ? 'active' : '') + '" data-tab="hist">Historial completo</button>' +
      '</div>' +
      '<div id="tabWrap">' + tabHTML(state.tab, ctx) + '</div>' +
      '</section>';

    view.querySelector('#upTo').addEventListener('change', ev => {
      state.upTo = ev.target.value;
      G.router.refresh();
    });
    view.querySelector('#btnPayWeek').addEventListener('click', () => {
      G.actions.expense({ type: 'general', employeeId: e.id, category: 'Sueldos', amount: pendSemana > 0 ? pendSemana : '' });
    });
    view.querySelector('#btnPay').addEventListener('click', () => G.actions.expense({ type: 'general', employeeId: e.id, category: 'Sueldos' }));
    view.querySelector('#btnAdv').addEventListener('click', () => G.actions.expense({ type: 'general', employeeId: e.id, category: 'Sueldos', expenseKind: 'adelanto' }));
    view.querySelector('#btnAtt2').addEventListener('click', () => openAttendanceModal({ employeeId: e.id }));
    view.querySelector('#btnEdit').addEventListener('click', () => openEmployeeModal(e));
    view.querySelector('#btnDel').addEventListener('click', async () => {
      const ok = await UI.confirm({
        title: 'Eliminar empleado',
        message: 'Se eliminará a <strong>' + UI.escapeHtml(S.employeeName(e)) + '</strong>, su asistencia y el vínculo con sus pagos (los gastos se conservan).',
        okLabel: 'Eliminar',
      });
      if (ok) {
        S.removeEmployee(e.id);
        UI.toast('Empleado eliminado');
        location.hash = '#/empleados';
      }
    });
    UI.on(view, '.tab', 'click', ev => {
      state.tab = ev.currentTarget.dataset.tab;
      view.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === state.tab));
      const wrap = view.querySelector('#tabWrap');
      wrap.innerHTML = tabHTML(state.tab, ctx);
      bindTab(view, ctx);
    });
    bindTab(view, ctx);
  }

  function workShort(id) {
    const w = S.data.works.find(x => x.id === id);
    return w ? (w.code || '') + ' · ' + w.name : 'Obra sin asignar';
  }

  function hoursCell(hours) {
    if (!hours || !hours.length) return '<span class="muted">—</span>';
    return hours.map(h => UI.escapeHtml(workShort(h.workId)) + ' · <b>' + UI.fmtNum(h.hours) + ' h</b>' +
      (h.tipo === 'extra' ? ' ' + UI.chip('Extra', 'warning', 'zap') : '')).join('<br>');
  }

  function tabHTML(tab, ctx) {
    const { e, stAll } = ctx;
    if (tab === 'pagos') {
      const pays = S.employeePayments(e.id);
      return '<div class="toolbar" style="margin-bottom:12px">' +
        '<button class="btn btn-soft-success btn-sm" id="btnAddPay">' + UI.icon('wallet', 15) + 'Registrar pago</button>' +
        '<button class="btn btn-soft-warning btn-sm" id="btnAddAdv">' + UI.icon('zap', 15) + 'Registrar adelanto</button>' +
        '<span class="form-hint">Sueldos y adelantos quedan ordenados por fecha en este legajo.</span></div>' +
        '<div class="split-row" style="margin-bottom:12px">' +
        '<span class="muted">Total sueldos: <b class="pos">' + UI.fmtMoney(stAll.salary) + '</b></span>' +
        '<span class="muted">Total adelantos: <b class="warning-text">' + UI.fmtMoney(stAll.advances) + '</b></span>' +
        '</div>' +
        '<div class="table-wrap"><table class="data-table">' +
        '<thead><tr><th>Fecha</th><th>Tipo</th><th>Concepto</th><th>Método</th><th class="num">Monto</th><th></th></tr></thead>' +
        '<tbody>' +
        (pays.map(p => '<tr>' +
          '<td class="muted">' + UI.fmtDate(p.date) + '</td>' +
          '<td>' + (p.expenseKind === 'adelanto' ? UI.chip('Adelanto', 'warning', 'zap') : UI.chip('Sueldo', 'success', 'wallet')) + '</td>' +
          '<td><strong>' + UI.escapeHtml(p.description) + '</strong></td>' +
          '<td class="muted">' + UI.escapeHtml(p.paymentMethod || '—') + '</td>' +
          '<td class="num neg"><b>−' + UI.fmtMoney(p.amount) + '</b></td>' +
          '<td><div class="row-actions">' +
          '<button class="icon-btn sm" data-edit="' + p.id + '" title="Editar">' + UI.icon('edit', 15) + '</button>' +
          '<button class="icon-btn sm danger" data-del="' + p.id + '" title="Eliminar">' + UI.icon('trash', 15) + '</button>' +
          '</div></td></tr>').join('') ||
          '<tr><td colspan="6">' + UI.emptyState('wallet', 'Sin pagos registrados', 'Registrá el primer pago o adelanto de este empleado.') + '</td></tr>') +
        '</tbody></table></div>';
    }
    if (tab === 'asistencia') {
      const att = stAll.attendance.slice().reverse();
      const hasToday = S.attendanceFor(e.id, S.todayISO());
      return '<div class="toolbar" style="margin-bottom:12px">' +
        '<button class="btn btn-soft-info btn-sm" id="btnAddAtt">' + UI.icon('calendar-plus', 15) + 'Registrar jornada</button>' +
        (hasToday ? '' : '<button class="btn btn-soft-danger btn-sm" id="btnAbsent">' + UI.icon('alert-triangle', 14) + 'Marcar ausente hoy</button>') +
        '<span class="form-hint">Presente / ausente por fecha, con horas por obra.</span></div>' +
        '<div class="table-wrap"><table class="data-table">' +
        '<thead><tr><th>Fecha</th><th>Estado</th><th>Horas por obra</th><th>Notas</th><th></th></tr></thead>' +
        '<tbody>' +
        (att.map(a => '<tr>' +
          '<td class="muted">' + UI.fmtDate(a.date) + '</td>' +
          '<td>' + (a.status === 'presente' ? UI.chip('Presente', 'success', 'check') : UI.chip('Ausente', 'danger', 'x')) + '</td>' +
          '<td>' + hoursCell(a.hours) + '</td>' +
          '<td class="muted">' + UI.escapeHtml(a.notes || '—') + '</td>' +
          '<td><div class="row-actions">' +
          '<button class="icon-btn sm" data-eatt="' + a.id + '" title="Editar">' + UI.icon('edit', 15) + '</button>' +
          '<button class="icon-btn sm danger" data-datt="' + a.id + '" title="Eliminar">' + UI.icon('trash', 15) + '</button>' +
          '</div></td></tr>').join('') ||
          '<tr><td colspan="5">' + UI.emptyState('calendar', 'Sin registros de asistencia', 'Cargá la primera jornada.') + '</td></tr>') +
        '</tbody></table></div>';
    }
    /* Historial completo: línea de tiempo cronológica (jornadas + pagos + adelantos) */
    if (tab === 'hist') {
      const events = [];
      (stAll.attendance || []).forEach(a => {
        events.push({
          date: a.date,
          html: (a.status === 'presente' ? UI.chip('Presente', 'success') : UI.chip('Ausente', 'danger')) +
            ' ' + hoursCell(a.hours) +
            (a.notes ? ' <span class="muted small">· ' + UI.escapeHtml(a.notes) + '</span>' : ''),
        });
      });
      (stAll.pays || []).forEach(p => {
        events.push({
          date: p.date,
          html: (p.expenseKind === 'adelanto' ? UI.chip('Adelanto', 'warning', 'zap') : UI.chip('Sueldo pagado', 'success', 'wallet')) +
            ' <b class="neg">−' + UI.fmtMoney(p.amount) + '</b>' +
            ' <span class="muted small">' + UI.escapeHtml(p.description || '') + '</span>',
        });
      });
      events.sort((a, b) => String(b.date).localeCompare(String(a.date)));
      /* Antigüedad: fecha de alta del legajo o primera actividad registrada */
      const startDate = e.createdAt || (events.length ? events[events.length - 1].date : S.todayISO());
      let meses = Math.max(0, Math.round((new Date(S.todayISO()) - new Date(startDate)) / (86400000 * 30.44)));
      const antig = meses >= 24 ? Math.floor(meses / 12) + ' años' + (meses % 12 ? ' y ' + (meses % 12) + ' meses' : '') : (meses || 'menos de 1 mes');
      return '<div class="split-row" style="margin-bottom:12px">' +
        '<span class="muted">📅 En el legajo desde el <b>' + UI.fmtDate(startDate) + '</b> · ' + antig + '</span>' +
        '<span class="muted">' + events.length + ' evento' + (events.length !== 1 ? 's' : '') + '</span></div>' +
        '<div class="stack">' +
        (events.map(ev => '<div class="split-row" style="align-items:flex-start;gap:10px">' +
          '<span class="muted small" style="min-width:88px;padding-top:4px">' + UI.fmtDate(ev.date) + '</span>' +
          '<span style="flex:1;min-width:0">' + ev.html + '</span></div>').join('') ||
          UI.emptyState('clock', 'Sin historial todavía', 'Registrá jornadas, pagos o adelantos para armar la línea de tiempo.')) +
        '</div>';
    }
    const rows = stAll.byWorkList;
    return '<div class="table-wrap"><table class="data-table">' +
      '<thead><tr><th>Obra</th><th class="num">Días</th><th class="num">Horas</th><th class="num">% del total</th>' +
      (e.hourlyRate ? '<th class="num">Costo estimado</th>' : '') + '</tr></thead>' +
      '<tbody>' +
      (rows.map(r => {
        const pct = stAll.hoursTotal ? r.hours / stAll.hoursTotal * 100 : 0;
        return '<tr class="clickable" data-obra="' + r.workId + '">' +
          '<td><strong>' + UI.escapeHtml(workShort(r.workId)) + '</strong></td>' +
          '<td class="num">' + r.days + '</td>' +
          '<td class="num"><b>' + UI.fmtNum(r.hours) + '</b></td>' +
          '<td class="num muted">' + pct.toFixed(1) + '%</td>' +
          (e.hourlyRate ? '<td class="num">' + UI.fmtMoney(r.hours * Number(e.hourlyRate)) + '</td>' : '') +
          '</tr>';
      }).join('') || '<tr><td colspan="5">' + UI.emptyState('clock', 'Sin horas registradas', 'Registrá jornadas con horas por obra.') + '</td></tr>') +
      '</tbody></table></div>';
  }

  function bindTab(view, ctx) {
    const wrap = view.querySelector('#tabWrap');
    const addPay = wrap.querySelector('#btnAddPay');
    if (addPay) addPay.addEventListener('click', () => G.actions.expense({ type: 'general', employeeId: ctx.e.id, category: 'Sueldos' }));
    const addAdv = wrap.querySelector('#btnAddAdv');
    if (addAdv) addAdv.addEventListener('click', () => G.actions.expense({ type: 'general', employeeId: ctx.e.id, category: 'Sueldos', expenseKind: 'adelanto' }));
    const addAtt = wrap.querySelector('#btnAddAtt');
    if (addAtt) addAtt.addEventListener('click', () => openAttendanceModal({ employeeId: ctx.e.id }));
    const absent = wrap.querySelector('#btnAbsent');
    if (absent) absent.addEventListener('click', () => {
      S.addAttendance({ employeeId: ctx.e.id, date: S.todayISO(), status: 'ausente', hours: [], notes: '' });
      UI.toast('Ausencia de hoy registrada');
      G.router.refresh();
    });
    UI.on(wrap, '[data-obra]', 'click', e => { location.hash = '#/obra/' + e.currentTarget.dataset.obra; });
    UI.on(wrap, '[data-edit]', 'click', e => {
      const id = e.target.closest('[data-edit]').dataset.edit;
      G.actions.expense({ expense: S.data.expenses.find(x => x.id === id) });
    });
    UI.on(wrap, '[data-del]', 'click', async e => {
      const id = e.target.closest('[data-del]').dataset.del;
      const ok = await UI.confirm({ title: 'Eliminar pago', message: '¿Eliminar este pago? Los totales se actualizarán.', okLabel: 'Eliminar' });
      if (ok) { S.remove('expenses', id); UI.toast('Pago eliminado'); G.router.refresh(); }
    });
    UI.on(wrap, '[data-eatt]', 'click', e => {
      const id = e.target.closest('[data-eatt]').dataset.eatt;
      openAttendanceModal({ attendance: S.data.attendance.find(a => a.id === id) });
    });
    UI.on(wrap, '[data-datt]', 'click', async e => {
      const id = e.target.closest('[data-datt]').dataset.datt;
      const ok = await UI.confirm({ title: 'Eliminar registro', message: '¿Eliminar este registro de asistencia?', okLabel: 'Eliminar' });
      if (ok) { S.remove('attendance', id); UI.toast('Registro eliminado'); G.router.refresh(); }
    });
    UI.on(wrap, '[data-copy]', 'click', e => UI.copyText(e.target.closest('[data-copy]').dataset.copy));
  }

  /* ============================================================
     Modales
     ============================================================ */
  function openEmployeeModal(e, onSaved) {
    const isEdit = !!e;
    let photo = e ? (e.photo || null) : null;
    const m = UI.openModal({
      title: isEdit ? 'Editar empleado' : 'Nuevo empleado',
      subtitle: isEdit ? S.employeeName(e) : 'Cargá los datos del personal.',
      body:
        '<div class="grid-form">' +
        '<div class="field"><label>Foto</label><div id="photoSlot"></div></div>' +
        '<div class="field"><label>Contacto</label><button type="button" class="btn btn-soft btn-sm" id="btnImportContact" style="margin-top:6px">📇 Importar desde contactos</button></div>' +
        '<div class="field"><label>Nombre *</label><input class="input" id="fFirst" value="' + UI.escapeHtml(e ? e.firstName : '') + '" placeholder="Ej.: Ramón"></div>' +
        '<div class="field"><label>Apellido *</label><input class="input" id="fLast" value="' + UI.escapeHtml(e ? e.lastName : '') + '" placeholder="Ej.: Quiroga"></div>' +
        '<div class="field"><label>Teléfono</label><input class="input" id="fPhone" value="' + UI.escapeHtml(e ? e.phone : '') + '" placeholder="+54 9 3547 …"></div>' +
        '<div class="field"><label>Alias / CBU / CVU de pago</label><input class="input" id="fPay" value="' + UI.escapeHtml(e ? e.paymentData : '') + '" placeholder="alias.mp o número de CBU/CVU"></div>' +
        '<div class="field"><label>Valor hora ($) *</label><input class="input" type="number" id="fRate" min="0" step="50" value="' + (e && e.hourlyRate ? e.hourlyRate : '') + '" placeholder="0"></div>' +
        '<div class="field"><label>Categoría / Oficio *</label><select class="select" id="fRole">' +
        '<option value=""' + (!e || !e.role ? ' selected' : '') + '>— Elegir —</option>' +
        ['Oficial', 'Medio Oficial', 'Peón', 'Ayudante', 'Capataz', 'Albañil', 'Electricista', 'Plomero', 'Pintor', 'Carpintero', 'Herrero', 'Gasista', 'Yesero', 'Tornero'].map(r => '<option value="' + r + '"' + (e && e.role === r ? ' selected' : '') + '>' + r + '</option>').join('') +
        '</select></div>' +
        '<div class="field"><label>Rendimiento</label><select class="select" id="fRend">' +
        '<option value=""' + (!e || !e.rendimiento ? ' selected' : '') + '>Sin calificar</option>' +
        '<option value="alto"' + (e && e.rendimiento === 'alto' ? ' selected' : '') + '>🟢 Alto</option>' +
        '<option value="medio"' + (e && e.rendimiento === 'medio' ? ' selected' : '') + '>🟡 Medio</option>' +
        '<option value="bajo"' + (e && e.rendimiento === 'bajo' ? ' selected' : '') + '>🔴 Bajo</option>' +
        '</select></div>' +
        '<div class="field"><label>Estado</label><select class="select" id="fActive">' +
        '<option value="1"' + (!e || e.active !== false ? ' selected' : '') + '>Activo</option>' +
        '<option value="0"' + (e && e.active === false ? ' selected' : '') + '>De baja</option>' +
        '</select></div>' +
        '<div class="field span-2"><label>Notas</label><textarea class="textarea" id="fNotes" rows="2" placeholder="Rol, categoría, referencias…">' + UI.escapeHtml(e ? e.notes : '') + '</textarea></div>' +
        '</div>',
      footer: '<button class="btn btn-ghost" data-cancel>Cancelar</button><button class="btn btn-primary" data-save>' + (isEdit ? 'Guardar cambios' : 'Agregar empleado') + '</button>',
    });
    const renderPhoto = () => {
      const box = m.panel.querySelector('#photoSlot');
      box.innerHTML = '';
      box.appendChild(UI.photoField(photo, url => { photo = url; renderPhoto(); }));
    };
    renderPhoto();
    m.panel.querySelector('#btnImportContact').addEventListener('click', async () => {
      try {
        const cc = await UI.pickContact();
        if (!cc) return;
        const parts = (cc.name || '').trim().split(/\s+/);
        if (parts.length) {
          m.panel.querySelector('#fFirst').value = parts[0] || '';
          m.panel.querySelector('#fLast').value = parts.slice(1).join(' ') || '';
        }
        if (cc.phone) m.panel.querySelector('#fPhone').value = cc.phone;
        UI.toast('Datos del contacto cargados', 'info');
      } catch (err) {
        UI.toast((err && err.message) || 'No se pudo importar el contacto', 'error');
      }
    });
    m.panel.querySelector('[data-cancel]').addEventListener('click', m.close);
    m.panel.querySelector('[data-save]').addEventListener('click', () => {
      const firstName = m.panel.querySelector('#fFirst').value.trim();
      const lastName = m.panel.querySelector('#fLast').value.trim();
      const rate = UI.readNum(m.panel.querySelector('#fRate'));
      const role = m.panel.querySelector('#fRole').value;
      if (!firstName || !lastName) { UI.toast('Ingresá nombre y apellido', 'error'); return; }
      /* Campos obligatorios: costo por hora + categoría/oficio */
      if (!(rate > 0)) { UI.toast('Ingresá el valor por hora (obligatorio)', 'error'); return; }
      if (!role) { UI.toast('Elegí la categoría / oficio (obligatorio)', 'error'); return; }
      const payload = {
        firstName,
        lastName,
        phone: m.panel.querySelector('#fPhone').value.trim(),
        paymentData: m.panel.querySelector('#fPay').value.trim(),
        hourlyRate: rate,
        role,
        rendimiento: m.panel.querySelector('#fRend').value || null,
        active: m.panel.querySelector('#fActive').value === '1',
        notes: m.panel.querySelector('#fNotes').value.trim(),
        photo: photo || null,
      };
      if (isEdit) {
        S.update('employees', e.id, payload);
        UI.toast('Empleado actualizado');
        if (onSaved) onSaved(S.employeeById(e.id));
      } else {
        if (G.plan && !G.plan.checkLimit('empleados')) return;
        payload.createdAt = S.todayISO();   // fecha de alta del legajo (antigüedad)
        const emp = S.add('employees', payload);
        UI.toast('Empleado "' + S.employeeName(emp) + '" agregado');
        if (onSaved) onSaved(emp);
      }
      m.close();
      G.router.refresh();
    });
  }

  function openAttendanceModal(opts) {
    opts = opts || {};
    const att = opts.attendance || null;
    const isEdit = !!att;
    const m = UI.openModal({
      title: isEdit ? 'Editar jornada' : 'Registrar jornada',
      subtitle: 'Asistencia del día, con horas por obra cuando está presente.',
      body:
        '<div class="grid-form">' +
        '<div class="field"><label>Empleado *</label>' +
        '<div class="select-with-add">' +
        '<select class="select" id="fEmp">' + empOptions(att ? att.employeeId : (opts.employeeId || '')) + '</select>' +
        '<button type="button" class="icon-btn sm" data-newemp title="Nuevo empleado">' + UI.icon('plus', 14) + '</button>' +
        '</div>' +
        (S.data.employees.length === 0
          ? '<span class="form-hint">Todavía no hay empleados cargados. Tocá <b>+</b> para crear el primero: al guardarlo va a aparecer seleccionado acá.</span>'
          : '') +
        '</div>' +
        '<div class="field span-2"><label>⚡ Carga rápida por cuadrilla (opcional)</label>' +
        '<select class="select" id="fCrew"><option value="">— Individual (un empleado) —</option>' +
        (S.data.crews || []).map(c => '<option value="' + c.id + '">' + UI.escapeHtml(c.name || 'Cuadrilla') + ' · ' + (c.employeeIds || []).length + ' integrante' + ((c.employeeIds || []).length !== 1 ? 's' : '') + '</option>').join('') +
        '</select>' +
        '<span class="form-hint">Si elegís una cuadrilla, se carga la asistencia de TODOS sus integrantes a la vez.</span></div>' +
        '<div class="field"><label>Fecha</label><input class="input" type="date" id="fDate" value="' + (att ? att.date : (opts.date || S.todayISO())) + '"></div>' +
        '<div class="field"><label>Estado</label><select class="select" id="fStatus">' +
        '<option value="presente"' + (!att || att.status === 'presente' ? ' selected' : '') + '>Presente</option>' +
        '<option value="ausente"' + (att && att.status === 'ausente' ? ' selected' : '') + '>Ausente</option>' +
        '</select></div>' +
        '<div class="field span-2"><label>Notas</label><input class="input" id="fNotes" value="' + UI.escapeHtml(att ? att.notes : '') + '" placeholder="Ej.: Media jornada, lluvia, etc."></div>' +
        '<div class="field span-2" id="hoursBlock"><label>Horas normales por obra</label>' +
        '<div id="hoursWrap"></div>' +
        '<button class="btn btn-soft btn-sm" id="btnAddHora">' + UI.icon('plus', 14) + 'Agregar obra</button>' +
        '</div>' +
        '<div class="field span-2" id="hoursExtraBlock"><label>⚡ Horas extras (doble turno)</label>' +
        '<div id="hoursWrapExtra"></div>' +
        '<button class="btn btn-soft-warning btn-sm" id="btnAddExtra">' + UI.icon('plus', 14) + 'Agregar horas extras</button>' +
        '<span class="form-hint">Quedan registradas por separado de la jornada regular: no duplican la asistencia del día.</span>' +
        '</div>' +
        '</div>',
      footer: '<button class="btn btn-ghost" data-cancel>Cancelar</button><button class="btn btn-primary" data-save>' + (isEdit ? 'Guardar cambios' : 'Registrar') + '</button>',
    });

    const worksOpts = '<option value="">— Sin obra —</option>' +
      S.data.works.filter(w => w.status !== 'finalizada').map(w => '<option value="' + w.id + '">' + UI.escapeHtml(w.code + ' · ' + w.name) + '</option>').join('');

    function hourRow(h) {
      h = h || {};
      return '<div class="att-row">' +
        '<select class="select" data-k="work">' + worksOpts.replace('value="' + (h.workId || '') + '"', 'value="' + (h.workId || '') + '" selected') + '</select>' +
        '<input class="input" type="number" data-k="hours" min="0" max="24" step="0.5" value="' + (h.hours != null ? h.hours : 8) + '">' +
        '<button class="icon-btn sm danger" data-delrow title="Quitar">' + UI.icon('trash', 14) + '</button>' +
        '</div>';
    }

    const hoursWrap = m.panel.querySelector('#hoursWrap');
    const hoursWrapExtra = m.panel.querySelector('#hoursExtraBlock').querySelector('#hoursWrapExtra');
    const normales = (att && att.hours && att.hours.length ? att.hours : [{ workId: opts.workId || '', hours: 8 }]).filter(h => h.tipo !== 'extra');
    const extras = (att && att.hours ? att.hours : []).filter(h => h.tipo === 'extra');
    normales.forEach(h => {
      const div = document.createElement('div');
      div.innerHTML = hourRow(h);
      const row = div.firstElementChild;
      row.querySelector('[data-delrow]').addEventListener('click', () => { row.remove(); });
      hoursWrap.appendChild(row);
    });
    extras.forEach(h => {
      const div = document.createElement('div');
      div.innerHTML = hourRow(h);
      const row = div.firstElementChild;
      row.querySelector('[data-delrow]').addEventListener('click', () => { row.remove(); });
      hoursWrapExtra.appendChild(row);
    });
    m.panel.querySelector('#btnAddHora').addEventListener('click', () => {
      const div = document.createElement('div');
      div.innerHTML = hourRow({});
      const row = div.firstElementChild;
      row.querySelector('[data-delrow]').addEventListener('click', () => { row.remove(); });
      hoursWrap.appendChild(row);
    });
    m.panel.querySelector('#btnAddExtra').addEventListener('click', () => {
      const div = document.createElement('div');
      div.innerHTML = hourRow({ hours: 2 });
      const row = div.firstElementChild;
      row.querySelector('[data-delrow]').addEventListener('click', () => { row.remove(); });
      hoursWrapExtra.appendChild(row);
    });

    /* Alta rápida de empleado desde la jornada: al guardar, se refresca el selector */
    const empSel = m.panel.querySelector('#fEmp');
    m.panel.querySelector('[data-newemp]').addEventListener('click', () => {
      openEmployeeModal(null, newEmp => {
        empSel.innerHTML = empOptions(newEmp ? newEmp.id : '');
      });
    });

    /* Carga rápida por cuadrilla: oculta el selector individual y guarda para todos */
    const crewSel = m.panel.querySelector('#fCrew');
    crewSel.addEventListener('change', () => {
      const usingCrew = !!crewSel.value;
      const empField = empSel.closest('.field');
      if (empField) empField.style.display = usingCrew ? 'none' : '';
    });

    const syncStatus = () => {
      m.panel.querySelector('#hoursBlock').hidden = m.panel.querySelector('#fStatus').value !== 'presente';
      m.panel.querySelector('#hoursExtraBlock').hidden = m.panel.querySelector('#fStatus').value !== 'presente';
    };
    m.panel.querySelector('#fStatus').addEventListener('change', syncStatus);
    syncStatus();

    m.panel.querySelector('[data-cancel]').addEventListener('click', m.close);
    m.panel.querySelector('[data-save]').addEventListener('click', () => {
      const crewId = crewSel.value;
      const employeeId = empSel.value;
      const date = m.panel.querySelector('#fDate').value;
      if (!date) { UI.toast('Ingresá la fecha', 'error'); return; }
      const status = m.panel.querySelector('#fStatus').value;
      const hours = [];
      hoursWrap.querySelectorAll('.att-row').forEach(row => {
        const workId = row.querySelector('[data-k="work"]').value;
        const h = UI.readNum(row.querySelector('[data-k="hours"]'));
        if (workId && h > 0) hours.push({ workId, hours: h, tipo: 'normal' });
      });
      hoursWrapExtra.querySelectorAll('.att-row').forEach(row => {
        const workId = row.querySelector('[data-k="work"]').value;
        const h = UI.readNum(row.querySelector('[data-k="hours"]'));
        if (h > 0) hours.push({ workId: workId || null, hours: h, tipo: 'extra' });
      });
      const notes = m.panel.querySelector('#fNotes').value.trim();
      const horasFinal = status === 'presente' ? hours : [];

      /* Carga rápida por cuadrilla: registrar para TODOS los integrantes */
      if (crewId) {
        const crew = (S.data.crews || []).find(c => c.id === crewId);
        const members = crew ? (crew.employeeIds || []).map(id => S.employeeById(id)).filter(Boolean) : [];
        if (!members.length) { UI.toast('Esa cuadrilla no tiene integrantes', 'error'); return; }
        members.forEach(member => {
          const payload = { employeeId: member.id, date, status, hours: horasFinal, notes };
          const existing = S.attendanceFor(member.id, date);
          if (existing) S.update('attendance', existing.id, payload);
          else S.addAttendance(payload);
        });
        UI.toast('✅ Asistencia cargada para ' + members.length + ' integrante' + (members.length !== 1 ? 's' : '') + ' de ' + (crew ? crew.name : 'la cuadrilla'), 'success');
        m.close();
        G.router.refresh();
        return;
      }

      /* Individual: un empleado */
      if (!employeeId) { UI.toast('Primero creá y seleccioná un empleado', 'error'); return; }
      const payload = { employeeId, date, status, hours: horasFinal, notes };
      const existing = isEdit ? att : S.attendanceFor(employeeId, date);
      if (existing) {
        S.update('attendance', existing.id, payload);
        UI.toast('Jornada actualizada');
      } else {
        S.addAttendance(payload);   // anti-duplicados: fusiona si ya existía la fecha
        UI.toast('Jornada registrada');
      }
      m.close();
      G.router.refresh();
    });
  }
})(typeof window !== 'undefined' ? window : globalThis);
