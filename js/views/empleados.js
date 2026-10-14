/* ============================================================
   GADU · Vista: Empleados
   Panel global (tabla ordenada), asistencia, horas por obra,
   sueldos, adelantos de dinero y legajo completo por empleado
   ============================================================ */
(function (root) {
  'use strict';
  const G = root.GADU, S = G.store, UI = G.ui;
  const state = { q: '', filter: 'activos', view: 'tabla', tab: 'pagos', upTo: '' };

  G.router.add('empleados', 'empleados', 'Empleados', 'Panel global del personal: asistencia, horas, sueldos y adelantos', render);
  G.router.add('empleado', 'empleado/:id', 'Legajo de empleado', 'Historial completo: pagos, adelantos, asistencia y horas', renderDetail);
  G.actions.employee = openEmployeeModal;
  G.actions.attendance = openAttendanceModal;

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
      const hay = (S.employeeName(e) + ' ' + (e.paymentData || '') + ' ' + (e.notes || '')).toLowerCase();
      const activeOk = state.filter === 'todos' || (state.filter === 'activos' ? e.active !== false : e.active === false);
      return activeOk && (!q || hay.includes(q));
    });
  }

  function render(view) {
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

    view.innerHTML =
      '<section class="kpi-grid">' +
      kpi('user', 'info', 'Empleados activos', String(actives), S.data.employees.length + ' legajos en total') +
      kpi('wallet', 'success', 'Sueldos acumulados', UI.fmtMoney(salaryAll), 'Histórico al personal') +
      kpi('zap', 'warning', 'Adelantos', UI.fmtMoney(advancesAll), 'Dinero adelantado · para descontar') +
      kpi('clock', pendAll > 0 ? 'danger' : 'success', 'Saldo pendiente a pagar', UI.fmtMoney(pendAll), 'Jornales devengados sin liquidar') +
      kpi('check-circle', 'violet', 'Presentes hoy', String(today.length), monthDays + ' jornadas este mes') +
      '</section>' +

      '<div class="toolbar">' +
      '<div class="search">' + UI.icon('search', 16) + '<input id="fq" class="input" placeholder="Buscar por nombre, alias o notas…" value="' + UI.escapeHtml(state.q) + '"></div>' +
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
      '<div id="listWrap">' + (state.view === 'tabla' ? tableHTML(filtered()) : cardsHTML(filtered())) + '</div>';

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
  }

  function updateList(view) {
    const wrap = view.querySelector('#listWrap');
    wrap.innerHTML = state.view === 'tabla' ? tableHTML(filtered()) : cardsHTML(filtered());
    bindList(wrap);
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
    return '<div class="card table-card"><div class="table-wrap">' +
      '<table class="data-table">' +
      '<thead><tr><th>Empleado</th><th>Teléfono</th><th class="num">Mes P/A</th><th class="num">Horas mes</th><th class="num">Sueldos</th><th class="num">Adelantos</th><th class="num">Saldo a liquidar</th><th>Última jornada</th><th>Alias / CVU</th><th></th></tr></thead>' +
      '<tbody>' +
      list.map(e => {
        const st = S.employeeStats(e.id);
        const mst = S.employeeMonth(e.id);
        const last = st.attendance.length ? st.attendance[0] : null;
        const devengado = (mst.hours || 0) * (Number(e.hourlyRate) || 0);
        const saldo = devengado - mst.salary - mst.advances;
        return '<tr class="clickable" data-id="' + e.id + '">' +
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

  function empCard(e) {
    const st = S.employeeStats(e.id);
    const mst = S.employeeMonth(e.id);
    const devengado = (mst.hours || 0) * (Number(e.hourlyRate) || 0);
    const saldo = devengado - mst.salary - mst.advances;
    return '<article class="contact-card" data-id="' + e.id + '">' +
      '<div class="contact-head">' +
      UI.avatar(S.employeeName(e), 42, e.photo) +
      '<div class="contact-info"><strong>' + UI.escapeHtml(S.employeeName(e)) + '</strong>' +
      '<span>' + UI.escapeHtml(e.phone || 'Sin teléfono') + (e.hourlyRate ? ' · $' + UI.fmtNum(e.hourlyRate) + '/h' : '') + '</span></div>' +
      (e.active === false ? UI.chip('De baja', 'danger') : UI.chip('Activo', 'success')) +
      '</div>' +
      '<div class="contact-chips">' + aliasChip(e.paymentData) + '</div>' +
      '<div class="asset-stats">' +
      '<span>Total cobrado<b class="pos">' + UI.fmtMoney(st.paidTotal) + '</b></span>' +
      '<span>Adelantos<b class="warning-text">' + UI.fmtMoney(st.advances) + '</b></span>' +
      '<span>Días · Horas<b>' + st.daysWorked + ' · ' + st.hoursTotal + '</b></span>' +
      '<span>Saldo a liquidar<b class="' + (saldo > 0 ? 'neg' : 'pos') + '">' + (saldo > 0 ? UI.fmtMoney(saldo) : 'Al día ✓') + '</b></span>' +
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
      if (e.target.closest('button') || e.target.closest('a')) return;
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
    const ctx = { e, st, stAll, upTo };

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
      '<button class="btn btn-soft-success" id="btnPay">' + UI.icon('wallet', 15) + 'Registrar pago</button>' +
      '<button class="btn btn-soft-warning" id="btnAdv">' + UI.icon('zap', 15) + 'Adelanto</button>' +
      '<button class="btn btn-soft-info" id="btnAtt2">' + UI.icon('calendar-plus', 15) + 'Jornada</button>' +
      '<button class="btn btn-soft" id="btnEdit">' + UI.icon('edit', 15) + 'Editar</button>' +
      '<button class="btn btn-soft-danger" id="btnDel" title="Eliminar">' + UI.icon('trash', 15) + '</button>' +
      '</div></div>' +

      '<div class="card" style="padding:12px 16px">' + aliasChip(e.paymentData) +
      ' <span class="form-hint">Alias / CBU / CVU donde se le paga. Tocá el ícono para copiar.</span></div>' +

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
      '</div>' +
      '<div id="tabWrap">' + tabHTML(state.tab, ctx) + '</div>' +
      '</section>';

    view.querySelector('#upTo').addEventListener('change', ev => {
      state.upTo = ev.target.value;
      G.router.refresh();
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
    return hours.map(h => UI.escapeHtml(workShort(h.workId)) + ' · <b>' + UI.fmtNum(h.hours) + ' h</b>').join('<br>');
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
      S.add('attendance', { employeeId: ctx.e.id, date: S.todayISO(), status: 'ausente', hours: [], notes: '' });
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
        '<div class="field"><label>Valor hora ($)</label><input class="input" type="number" id="fRate" min="0" step="50" value="' + (e && e.hourlyRate ? e.hourlyRate : '') + '" placeholder="0"></div>' +
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
      if (!firstName || !lastName) { UI.toast('Ingresá nombre y apellido', 'error'); return; }
      const payload = {
        firstName,
        lastName,
        phone: m.panel.querySelector('#fPhone').value.trim(),
        paymentData: m.panel.querySelector('#fPay').value.trim(),
        hourlyRate: UI.readNum(m.panel.querySelector('#fRate')),
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
        '<div class="field"><label>Fecha</label><input class="input" type="date" id="fDate" value="' + (att ? att.date : (opts.date || S.todayISO())) + '"></div>' +
        '<div class="field"><label>Estado</label><select class="select" id="fStatus">' +
        '<option value="presente"' + (!att || att.status === 'presente' ? ' selected' : '') + '>Presente</option>' +
        '<option value="ausente"' + (att && att.status === 'ausente' ? ' selected' : '') + '>Ausente</option>' +
        '</select></div>' +
        '<div class="field span-2"><label>Notas</label><input class="input" id="fNotes" value="' + UI.escapeHtml(att ? att.notes : '') + '" placeholder="Ej.: Media jornada, lluvia, etc."></div>' +
        '<div class="field span-2" id="hoursBlock"><label>Horas por obra</label>' +
        '<div id="hoursWrap"></div>' +
        '<button class="btn btn-soft btn-sm" id="btnAddHora">' + UI.icon('plus', 14) + 'Agregar obra</button>' +
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
    const rows = att && att.hours && att.hours.length ? att.hours : [{ workId: opts.workId || '', hours: 8 }];
    rows.forEach(h => {
      const div = document.createElement('div');
      div.innerHTML = hourRow(h);
      const row = div.firstElementChild;
      row.querySelector('[data-delrow]').addEventListener('click', () => { row.remove(); });
      hoursWrap.appendChild(row);
    });
    m.panel.querySelector('#btnAddHora').addEventListener('click', () => {
      const div = document.createElement('div');
      div.innerHTML = hourRow({});
      const row = div.firstElementChild;
      row.querySelector('[data-delrow]').addEventListener('click', () => { row.remove(); });
      hoursWrap.appendChild(row);
    });

    /* Alta rápida de empleado desde la jornada: al guardar, se refresca el selector */
    const empSel = m.panel.querySelector('#fEmp');
    m.panel.querySelector('[data-newemp]').addEventListener('click', () => {
      openEmployeeModal(null, newEmp => {
        empSel.innerHTML = empOptions(newEmp ? newEmp.id : '');
      });
    });

    const syncStatus = () => {
      m.panel.querySelector('#hoursBlock').hidden = m.panel.querySelector('#fStatus').value !== 'presente';
    };
    m.panel.querySelector('#fStatus').addEventListener('change', syncStatus);
    syncStatus();

    m.panel.querySelector('[data-cancel]').addEventListener('click', m.close);
    m.panel.querySelector('[data-save]').addEventListener('click', () => {
      const employeeId = empSel.value;
      const date = m.panel.querySelector('#fDate').value;
      if (!employeeId) { UI.toast('Primero creá y seleccioná un empleado', 'error'); return; }
      if (!date) { UI.toast('Ingresá la fecha', 'error'); return; }
      const status = m.panel.querySelector('#fStatus').value;
      const hours = [];
      hoursWrap.querySelectorAll('.att-row').forEach(row => {
        const workId = row.querySelector('[data-k="work"]').value;
        const h = UI.readNum(row.querySelector('[data-k="hours"]'));
        if (workId && h > 0) hours.push({ workId, hours: h });
      });
      const payload = { employeeId, date, status, hours: status === 'presente' ? hours : [], notes: m.panel.querySelector('#fNotes').value.trim() };
      const existing = isEdit ? att : S.attendanceFor(employeeId, date);
      if (existing) {
        S.update('attendance', existing.id, payload);
        UI.toast('Jornada actualizada');
      } else {
        S.add('attendance', payload);
        UI.toast('Jornada registrada');
      }
      m.close();
      G.router.refresh();
    });
  }
})(typeof window !== 'undefined' ? window : globalThis);
