/* ============================================================
   GADU · Vista: Detalle de obra
   Presupuesto, cobros, costos, margen, personal asignado por
   obra y adelantos en ambas direcciones (cliente ⇄ empleados)
   ============================================================ */
(function (root) {
  'use strict';
  const G = root.GADU, S = G.store, UI = G.ui;
  const state = { tab: 'ingresos' };

  G.router.add('obra', 'obra/:id', 'Detalle de obra', 'Todos los movimientos de la obra en un solo lugar', render);

  function kpi(icon, tone, label, value, sub) {
    return '<div class="kpi-card">' +
      '<span class="kpi-ico kpi-' + tone + '">' + UI.icon(icon, 20) + '</span>' +
      '<div class="kpi-body">' +
      '<span class="kpi-label">' + label + '</span>' +
      '<strong class="kpi-value">' + value + '</strong>' +
      '<span class="kpi-sub">' + sub + '</span>' +
      '</div></div>';
  }

  function barRow(label, pct, color, sub) {
    return '<div class="bar-row">' +
      '<div class="bar-row-head"><span>' + label + '</span><b>' + Math.round(pct) + '%</b></div>' +
      UI.progress(pct, color) +
      '<span class="muted small">' + sub + '</span></div>';
  }

  function sumRow(label, value, cls, xl) {
    return '<div class="split-row"><span class="muted">' + label + '</span><b class="' + (cls || '') + (xl ? ' xl' : '') + '">' + value + '</b></div>';
  }

  /* Abre una ventana con un reporte formal de la obra e imprime a PDF (window.print) */
  function exportPDF(ctx) {
    const w = ctx.w, st = ctx.st;
    const client = S.contactById(w.clientId);
    const hoy = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' });
    const html =
      '<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Reporte de obra — ' + UI.escapeHtml(w.name) + '</title>' +
      '<style>' +
      'body{font-family:-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#1e293b;margin:0;padding:32px;background:#fff}' +
      '.report{max-width:720px;margin:0 auto}' +
      'h1{font-size:24px;margin:0 0 4px;color:#0f172a}' +
      '.sub{color:#64748b;font-size:13px;margin:0 0 28px}' +
      'table{width:100%;border-collapse:collapse}' +
      'th,td{text-align:left;padding:11px 12px;border-bottom:1px solid #e2e8f0;font-size:14px}' +
      'th{color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:.06em;border-bottom:2px solid #cbd5e1}' +
      'td.num{text-align:right;font-variant-numeric:tabular-nums}' +
      'tr.margen td{font-weight:800;font-size:17px;border-top:2px solid #cbd5e1;color:#0f172a}' +
      '.footer{color:#94a3b8;font-size:12px;margin-top:36px;text-align:center}' +
      '.actions{text-align:right;margin-bottom:24px}' +
      '.actions button{background:#f59e0b;color:#fff;border:0;border-radius:8px;padding:10px 18px;font-size:14px;font-weight:600;cursor:pointer}' +
      '@page{size:A4;margin:16mm}' +
      '@media print{.actions{display:none!important}body{padding:0}}' +
      '</style></head><body>' +
      '<div class="report">' +
      '<div class="actions"><button onclick="window.print()">Guardar como PDF</button></div>' +
      '<h1>' + UI.escapeHtml(w.name) + (w.code ? ' <span style="color:#94a3b8;font-size:15px;font-weight:400">' + UI.escapeHtml(w.code) + '</span>' : '') + '</h1>' +
      '<p class="sub">Cliente: ' + UI.escapeHtml(client ? client.name : 'Sin cliente') + ' · ' + UI.escapeHtml(w.location || '') + ' · Generado el ' + hoy + '</p>' +
      '<table>' +
      '<tr><th>Concepto</th><th class="num">Monto</th></tr>' +
      '<tr><td>Presupuesto total</td><td class="num">' + UI.fmtMoney(w.budgetTotal) + '</td></tr>' +
      '<tr><td>Ingresos recibidos</td><td class="num">' + UI.fmtMoney(st.incomes) + '</td></tr>' +
      '<tr><td>Gastos totales (directos)</td><td class="num">−' + UI.fmtMoney(st.costs) + '</td></tr>' +
      '<tr class="margen"><td>Margen de ganancia</td><td class="num">' + UI.fmtMoney(st.margin) + '</td></tr>' +
      '</table>' +
      '<p class="footer">Reporte generado por GADU Construye · gestiongadu.vercel.app</p>' +
      '</div></body></html>';

    const win = window.open('', '_blank');
    if (!win) { UI.toast('No se pudo abrir la ventana. Permití las ventanas emergentes.', 'error'); return; }
    win.document.open();
    win.document.write(html);
    win.document.close();
  }

  function render(view, params) {
    const w = S.data.works.find(x => x.id === params.id);
    if (!w) {
      view.innerHTML = UI.emptyState('alert-triangle', 'Obra no encontrada', 'Puede haber sido eliminada.', '<a class="btn btn-soft" href="#/obras">Volver a obras</a>');
      return;
    }
    const st = S.workStats(w.id);
    const client = S.contactById(w.clientId);
    const incomes = S.data.incomes.filter(x => x.workId === w.id).slice().sort((a, b) => b.date.localeCompare(a.date));
    const costs = S.data.expenses.filter(x => x.type === 'obra' && x.workId === w.id).slice().sort((a, b) => b.date.localeCompare(a.date));
    const budget = S.data.budgets.filter(b => b.workId === w.id).slice().sort((a, b) => b.date.localeCompare(a.date))[0] || null;
    const clientAdv = S.workClientAdvances(w.id);
    const empAdv = S.workEmployeeAdvances(w.id);
    const workEmps = S.workEmployees(w.id);
    const advNet = clientAdv.total - empAdv.total;
    const ctx = { w, st, incomes, costs, budget, clientAdv, empAdv, workEmps, advNet };

    view.innerHTML =
      '<div class="detail-head card">' +
      '<a class="btn btn-ghost btn-sm" href="#/obras">' + UI.icon('chevron-left', 15) + 'Obras</a>' +
      '<div class="detail-title">' +
      '<h2>' + UI.escapeHtml(w.name) + ' <span class="code">' + UI.escapeHtml(w.code || '') + '</span></h2>' +
      '<p class="muted">' + UI.icon('map-pin', 13) + UI.escapeHtml(w.location || 'Sin ubicación') +
      ' · ' + UI.icon('users', 13) + UI.escapeHtml(client ? client.name : 'Sin cliente') +
      ' · ' + UI.fmtDate(w.startDate) + ' → ' + (w.endDate ? UI.fmtDate(w.endDate) : '—') + '</p>' +
      '</div>' +
      '<div class="detail-actions">' +
      '<select class="select" id="statusSel" style="max-width:160px">' +
      S.WORK_STATUS.map(s => '<option value="' + s + '"' + (w.status === s ? ' selected' : '') + '>' + (s === 'activa' ? 'Activa' : s === 'pausada' ? 'Pausada' : 'Finalizada') + '</option>').join('') +
      '</select>' +
      '<button class="btn btn-soft" id="btnPdf">' + UI.icon('file-text', 15) + 'Exportar PDF</button>' +
      '<button class="btn btn-soft" id="btnEdit">' + UI.icon('edit', 15) + 'Editar</button>' +
      '<button class="btn btn-soft-danger" id="btnDel" title="Eliminar obra">' + UI.icon('trash', 15) + '</button>' +
      '</div></div>' +

      '<section class="kpi-grid kpi-4">' +
      kpi('file-text', 'neutral', 'Presupuesto', UI.fmtMoney(w.budgetTotal), budget ? 'Según ' + budget.code : 'Sin presupuesto asociado') +
      kpi('trending-up', 'success', 'Cobrado', UI.fmtMoney(st.incomes), Math.round(st.advanceCobro) + '% del presupuesto') +
      kpi('arrow-up-right', 'danger', 'Costos directos', UI.fmtMoney(st.costs), Math.round(st.advanceCosto) + '% del presupuesto') +
      kpi('activity', st.margin >= 0 ? 'success' : 'danger', 'Margen', UI.fmtMoney(st.margin), st.marginPct.toFixed(1) + '% sobre lo cobrado') +
      '</section>' +

      '<section class="grid-2">' +
      '<div class="card">' +
      '<div class="card-head"><h3>Avance físico de la obra</h3></div>' +
      '<div class="range-wrap">' +
      '<div class="range-head"><span class="muted">Progreso</span><b id="advLabel">' + Math.round(Number(w.advanceFisico) || 0) + '%</b></div>' +
      '<input type="range" class="range" id="advRange" min="0" max="100" step="1" value="' + Math.round(Number(w.advanceFisico) || 0) + '">' +
      '<p class="form-hint">Movelo para actualizar el avance físico. Se guarda automáticamente.</p>' +
      '</div>' +
      '<div class="bars-block">' +
      barRow('Avance de cobro', st.advanceCobro, 'var(--info)', UI.fmtMoney(st.incomes) + ' cobrados') +
      barRow('Avance de costos', st.advanceCosto, 'var(--warning)', UI.fmtMoney(st.costs) + ' ejecutados') +
      '</div></div>' +
      '<div class="card">' +
      '<div class="card-head"><h3>Resumen financiero</h3></div>' +
      '<div class="stack">' +
      sumRow('Presupuesto total', UI.fmtMoney(w.budgetTotal)) +
      sumRow('Ingresos recibidos', UI.fmtMoney(st.incomes), 'pos') +
      sumRow('Gastos directos', '−' + UI.fmtMoney(st.costs), 'neg') +
      sumRow('Margen de ganancia', UI.fmtMoney(st.margin), st.margin >= 0 ? 'pos' : 'neg', true) +
      '<div class="split-row"><span class="muted">Adelantos del cliente (' + clientAdv.list.length + ')</span><b class="pos">+' + UI.fmtMoney(clientAdv.total) + '</b></div>' +
      '<div class="split-row"><span class="muted">Adelantos a empleados (' + empAdv.list.length + ')</span><b class="warning-text">−' + UI.fmtMoney(empAdv.total) + '</b></div>' +
      '<div class="split-row"><span class="muted">Saldo neto de adelantos</span><b class="' + (advNet >= 0 ? 'pos' : 'neg') + '">' + (advNet >= 0 ? '+' : '−') + UI.fmtMoney(Math.abs(advNet)) + '</b></div>' +
      (st.costs > Number(w.budgetTotal) && Number(w.budgetTotal) > 0
        ? '<div class="alert alert-danger">' + UI.icon('alert-triangle', 16) + ' Los costos superan el presupuesto en ' + UI.fmtMoney(st.costs - Number(w.budgetTotal)) + '.</div>'
        : '') +
      (w.description ? '<p class="form-hint">' + UI.escapeHtml(w.description) + '</p>' : '') +
      '</div></div>' +
      '</section>' +

      '<section class="card">' +
      '<div class="tabs">' +
      '<button class="tab ' + (state.tab === 'ingresos' ? 'active' : '') + '" data-tab="ingresos">Ingresos (' + incomes.length + ')</button>' +
      '<button class="tab ' + (state.tab === 'gastos' ? 'active' : '') + '" data-tab="gastos">Gastos directos (' + costs.length + ')</button>' +
      '<button class="tab ' + (state.tab === 'personal' ? 'active' : '') + '" data-tab="personal">Personal (' + workEmps.length + ')</button>' +
      '<button class="tab ' + (state.tab === 'presupuesto' ? 'active' : '') + '" data-tab="presupuesto">Presupuesto</button>' +
      '</div>' +
      '<div id="tabWrap">' + tabHTML(state.tab, ctx) + '</div>' +
      '</section>';

    /* Avance físico */
    const range = view.querySelector('#advRange');
    range.addEventListener('input', () => { view.querySelector('#advLabel').textContent = range.value + '%'; });
    range.addEventListener('change', () => {
      S.update('works', w.id, { advanceFisico: Number(range.value) });
      UI.toast('Avance físico actualizado');
    });

    /* Estado */
    view.querySelector('#statusSel').addEventListener('change', e => {
      S.update('works', w.id, { status: e.target.value });
      UI.toast('Estado actualizado');
      G.router.refresh();
    });

    view.querySelector('#btnEdit').addEventListener('click', () => G.actions.work(w));
    view.querySelector('#btnPdf').addEventListener('click', () => exportPDF(ctx));
    view.querySelector('#btnDel').addEventListener('click', async () => {
      const ok = await UI.confirm({
        title: 'Eliminar obra',
        message: 'Se eliminará <strong>' + UI.escapeHtml(w.name) + '</strong> junto con sus ingresos y gastos. Esta acción no se puede deshacer.',
        okLabel: 'Eliminar obra',
      });
      if (ok) {
        S.removeWork(w.id);
        UI.toast('Obra eliminada');
        location.hash = '#/obras';
      }
    });

    /* Pestañas */
    UI.on(view, '.tab', 'click', e => {
      state.tab = e.currentTarget.dataset.tab;
      view.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === state.tab));
      const wrap = view.querySelector('#tabWrap');
      wrap.innerHTML = tabHTML(state.tab, ctx);
      bindTabContent(view, ctx);
    });
    bindTabContent(view, ctx);
  }

  function tabHTML(tab, ctx) {
    const { w, incomes, costs, budget, workEmps } = ctx;
    if (tab === 'ingresos') {
      return '<div class="toolbar" style="margin-bottom:12px">' +
        '<button class="btn btn-soft-success btn-sm" id="btnAddInc">' + UI.icon('plus', 15) + 'Registrar cobro</button>' +
        '<button class="btn btn-soft-warning btn-sm" id="btnAddAdvCli">' + UI.icon('zap', 15) + 'Adelanto del cliente</button>' +
        '<span class="form-hint">Cobros y adelantos recibidos de esta obra.</span></div>' +
        '<div class="table-wrap"><table class="data-table">' +
        '<thead><tr><th>Fecha</th><th>Tipo</th><th>Concepto</th><th>Método</th><th>Referencia</th><th class="num">Monto</th><th></th></tr></thead>' +
        '<tbody>' +
        (incomes.map(i => '<tr>' +
          '<td class="muted">' + UI.fmtDate(i.date) + '</td>' +
          '<td>' + (i.incomeKind === 'adelanto' ? UI.chip('Adelanto', 'warning', 'zap') : UI.chip('Cobro', 'success', 'check')) + '</td>' +
          '<td><strong>' + UI.escapeHtml(i.concept) + '</strong></td>' +
          '<td>' + UI.chip(i.method || 'Otro', methodTone(i.method)) + '</td>' +
          '<td class="muted">' + UI.escapeHtml(i.reference || '—') + '</td>' +
          '<td class="num pos">+' + UI.fmtMoney(i.amount) + '</td>' +
          '<td><div class="row-actions">' +
          '<button class="icon-btn sm" data-einc="' + i.id + '" title="Editar">' + UI.icon('edit', 15) + '</button>' +
          '<button class="icon-btn sm danger" data-dinc="' + i.id + '" title="Eliminar">' + UI.icon('trash', 15) + '</button>' +
          '</div></td></tr>').join('') ||
          '<tr><td colspan="7">' + UI.emptyState('trending-up', 'Sin ingresos registrados', 'Registrá el primer cobro de esta obra.') + '</td></tr>') +
        '</tbody></table></div>';
    }
    if (tab === 'gastos') {
      return '<div class="toolbar" style="margin-bottom:12px">' +
        '<button class="btn btn-soft-danger btn-sm" id="btnAddExp">' + UI.icon('plus', 15) + 'Cargar gasto</button>' +
        '<button class="btn btn-soft-warning btn-sm" id="btnAdvEmp">' + UI.icon('zap', 15) + 'Adelanto a empleado</button>' +
        '<span class="form-hint">Costos directos y adelantos de dinero al personal de esta obra.</span></div>' +
        '<div class="table-wrap"><table class="data-table">' +
        '<thead><tr><th>Fecha</th><th>Categoría</th><th>Proveedor / Empleado</th><th>Descripción</th><th>Factura</th><th class="num">Monto</th><th></th></tr></thead>' +
        '<tbody>' +
        (costs.map(x => '<tr>' +
          '<td class="muted">' + UI.fmtDate(x.date) + '</td>' +
          '<td>' + UI.chip(x.category || 'Otros', 'neutral') + (x.expenseKind === 'adelanto' ? ' ' + UI.chip('Adelanto', 'warning', 'zap') : '') + '</td>' +
          '<td>' + (x.employeeId
            ? '<strong>' + UI.escapeHtml(S.employeeName(S.employeeById(x.employeeId)) || '—') + '</strong> ' + UI.chip('Empleado', 'info')
            : UI.escapeHtml((S.contactById(x.providerId) || {}).name || '—')) + '</td>' +
          '<td>' + UI.escapeHtml(x.description) + '</td>' +
          '<td class="muted">' + UI.escapeHtml(x.invoiceNumber || '—') + '</td>' +
          '<td class="num neg">−' + UI.fmtMoney(x.amount) + '</td>' +
          '<td><div class="row-actions">' +
          '<button class="icon-btn sm" data-eexp="' + x.id + '" title="Editar">' + UI.icon('edit', 15) + '</button>' +
          '<button class="icon-btn sm danger" data-dexp="' + x.id + '" title="Eliminar">' + UI.icon('trash', 15) + '</button>' +
          '</div></td></tr>').join('') ||
          '<tr><td colspan="7">' + UI.emptyState('arrow-up-right', 'Sin gastos directos', 'Cargá los costos de esta obra.') + '</td></tr>') +
        '</tbody></table></div>';
    }
    if (tab === 'personal') {
      return '<div class="toolbar" style="margin-bottom:12px">' +
        '<button class="btn btn-soft-info btn-sm" id="btnAssign">' + UI.icon('calendar-plus', 15) + 'Asignar jornada en esta obra</button>' +
        '<span class="form-hint">El personal que trabajó en esta obra según las jornadas cargadas.</span></div>' +
        '<div class="table-wrap"><table class="data-table">' +
        '<thead><tr><th>Empleado</th><th class="num">Días en obra</th><th class="num">Horas</th><th class="num">Costo estimado</th><th>Última jornada</th><th></th></tr></thead>' +
        '<tbody>' +
        (workEmps.map(we => '<tr class="clickable" data-emp="' + (we.employee ? we.employee.id : '') + '">' +
          '<td>' + UI.avatar(we.name, 30, we.employee ? we.employee.photo : null) + ' <strong>' + UI.escapeHtml(we.name || '—') + '</strong></td>' +
          '<td class="num">' + we.days + '</td>' +
          '<td class="num"><b>' + UI.fmtNum(we.hours) + '</b></td>' +
          '<td class="num">' + (we.cost ? UI.fmtMoney(we.cost) : '—') + '</td>' +
          '<td class="muted">' + UI.fmtDateShort(we.last) + '</td>' +
          '<td><div class="row-actions">' +
          '<a class="icon-btn sm" href="#/empleado/' + (we.employee ? we.employee.id : '') + '" title="Ver legajo">' + UI.icon('eye', 15) + '</a>' +
          '<button class="icon-btn sm" data-att="' + (we.employee ? we.employee.id : '') + '" title="Registrar jornada">' + UI.icon('calendar-plus', 15) + '</button>' +
          '</div></td></tr>').join('') ||
          '<tr><td colspan="6">' + UI.emptyState('user', 'Sin personal asignado', 'Registrá jornadas con horas en esta obra para ver quién trabaja acá.') + '</td></tr>') +
        '</tbody></table></div>';
    }
    if (budget) {
      return '<div class="toolbar" style="margin-bottom:12px">' +
        '<span class="code">' + UI.escapeHtml(budget.code) + '</span>' +
        '<strong>' + UI.escapeHtml(budget.name) + '</strong>' +
        UI.chip(budget.status === 'aprobado' ? 'Aprobado' : budget.status, budget.status === 'aprobado' ? 'success' : 'neutral') +
        '<div class="grow"></div>' +
        '<button class="btn btn-soft btn-sm" id="btnEditBudget">' + UI.icon('edit', 15) + 'Editar presupuesto</button>' +
        '</div>' +
        '<div class="table-wrap"><table class="data-table">' +
        '<thead><tr><th>Ítem</th><th>Unidad</th><th class="num">Cant.</th><th class="num">P. unitario</th><th class="num">Subtotal</th></tr></thead>' +
        '<tbody>' +
        budget.items.map(it => '<tr>' +
          '<td>' + UI.escapeHtml(it.desc) + '</td>' +
          '<td class="muted">' + UI.escapeHtml(it.unit || '—') + '</td>' +
          '<td class="num">' + UI.fmtNum(it.qty) + '</td>' +
          '<td class="num">' + UI.fmtMoney(it.price, 2) + '</td>' +
          '<td class="num">' + UI.fmtMoney(Number(it.price || 0) * Number(it.qty || 0), 2) + '</td>' +
          '</tr>').join('') +
        '</tbody></table></div>' +
        '<div class="budget-totals">' +
        '<div class="budget-total-row"><span>Subtotal</span><span>' + UI.fmtMoney(budget.subtotal) + '</span></div>' +
        (budget.discount ? '<div class="budget-total-row"><span>Descuento (' + budget.discount + '%)</span><span class="neg">−' + UI.fmtMoney(budget.subtotal - budget.total) + '</span></div>' : '') +
        '<div class="budget-total-row grand"><span>Total</span><span>' + UI.fmtMoney(budget.total) + '</span></div>' +
        '</div>' +
        (budget.notes ? '<p class="form-hint" style="margin-top:10px">' + UI.escapeHtml(budget.notes) + '</p>' : '');
    }
    return UI.emptyState('file-text', 'Sin presupuesto asociado', 'Creá un presupuesto para esta obra.', '<button class="btn btn-primary" id="btnNewBudget">' + UI.icon('plus', 15) + 'Crear presupuesto</button>');
  }

  function methodTone(m) {
    return ({ 'Efectivo': 'success', 'Transferencia': 'info', 'Cheque': 'violet', 'Mercado Pago': 'primary' })[m] || 'neutral';
  }

  function bindTabContent(view, ctx) {
    const wrap = view.querySelector('#tabWrap');
    const addInc = wrap.querySelector('#btnAddInc');
    if (addInc) addInc.addEventListener('click', () => G.actions.income({ workId: ctx.w.id }));
    const addAdvCli = wrap.querySelector('#btnAddAdvCli');
    if (addAdvCli) addAdvCli.addEventListener('click', () => G.actions.income({ workId: ctx.w.id, incomeKind: 'adelanto', concept: 'Adelanto de cliente' }));
    const addExp = wrap.querySelector('#btnAddExp');
    if (addExp) addExp.addEventListener('click', () => G.actions.expense({ type: 'obra', workId: ctx.w.id }));
    const advEmp = wrap.querySelector('#btnAdvEmp');
    if (advEmp) advEmp.addEventListener('click', () => G.actions.expense({ type: 'obra', workId: ctx.w.id, expenseKind: 'adelanto' }));
    const assign = wrap.querySelector('#btnAssign');
    if (assign) assign.addEventListener('click', () => G.actions.attendance({ workId: ctx.w.id }));
    const editBudget = wrap.querySelector('#btnEditBudget');
    if (editBudget) editBudget.addEventListener('click', () => G.actions.budget(ctx.budget));
    const newBudget = wrap.querySelector('#btnNewBudget');
    if (newBudget) newBudget.addEventListener('click', () => G.actions.budget(null, { workId: ctx.w.id, clientId: ctx.w.clientId }));

    UI.on(wrap, '[data-emp]', 'click', e => {
      if (e.target.closest('button') || e.target.closest('a')) return;
      location.hash = '#/empleado/' + e.currentTarget.dataset.emp;
    });
    UI.on(wrap, '[data-att]', 'click', e => {
      const empId = e.target.closest('[data-att]').dataset.att;
      if (empId) G.actions.attendance({ employeeId: empId, workId: ctx.w.id });
    });
    UI.on(wrap, '[data-einc]', 'click', e => {
      const id = e.target.closest('[data-einc]').dataset.einc;
      G.actions.income({ income: S.data.incomes.find(x => x.id === id) });
    });
    UI.on(wrap, '[data-dinc]', 'click', async e => {
      const id = e.target.closest('[data-dinc]').dataset.dinc;
      const ok = await UI.confirm({ title: 'Eliminar ingreso', message: '¿Eliminar este cobro? El cálculo del margen se actualizará.', okLabel: 'Eliminar' });
      if (ok) { S.remove('incomes', id); UI.toast('Ingreso eliminado'); G.router.refresh(); }
    });
    UI.on(wrap, '[data-eexp]', 'click', e => {
      const id = e.target.closest('[data-eexp]').dataset.eexp;
      G.actions.expense({ expense: S.data.expenses.find(x => x.id === id) });
    });
    UI.on(wrap, '[data-dexp]', 'click', async e => {
      const id = e.target.closest('[data-dexp]').dataset.dexp;
      const ok = await UI.confirm({ title: 'Eliminar gasto', message: '¿Eliminar este gasto? El cálculo del margen se actualizará.', okLabel: 'Eliminar' });
      if (ok) { S.remove('expenses', id); UI.toast('Gasto eliminado'); G.router.refresh(); }
    });
  }
})(typeof window !== 'undefined' ? window : globalThis);
