/* ============================================================
   GADU · Vista: Dashboard general
   KPIs, flujo de caja, distribución de gastos, obras en curso,
   liquidaciones y últimos movimientos
   ============================================================ */
(function (root) {
  'use strict';
  const G = root.GADU, S = G.store, UI = G.ui;

  G.router.add('dashboard', 'dashboard', 'Panel general', 'Tu gestión, perfecta · resumen financiero y operativo en tiempo real', render);

  const PALETTE = ['#38bdf8', '#a78bfa', '#fbbf24', '#34d399', '#f97316', '#22d3ee', '#e879f9', '#4ade80'];
  const period = { preset: 'todo', from: '', to: '' };

  function periodRange() {
    if (period.preset === 'mes') return { from: S.todayISO().slice(0, 8) + '01', to: S.todayISO(), label: 'este mes' };
    if (period.preset === '3m') return { from: S.daysAgo(90), to: S.todayISO(), label: 'últimos 3 meses' };
    if (period.preset === '6m') return { from: S.daysAgo(180), to: S.todayISO(), label: 'últimos 6 meses' };
    if (period.preset === '12m') return { from: S.daysAgo(365), to: S.todayISO(), label: 'últimos 12 meses' };
    if (period.preset === 'custom') {
      const from = period.from || '';
      const to = period.to || S.todayISO();
      return { from, to, label: (from ? 'desde ' + UI.fmtDate(from) : 'desde el inicio') + (to ? ' hasta ' + UI.fmtDate(to) : '') };
    }
    return { from: '', to: '', label: 'todo el historial' };
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

  function render(view) {
    const range = periodRange();
    const t = S.totalsBetween(range.from, range.to);
    const works = S.data.works;
    const active = works.filter(w => w.status === 'activa');
    const paused = works.filter(w => w.status === 'pausada');
    const done = works.filter(w => w.status === 'finalizada');
    const avg = active.length ? active.reduce((a, w) => a + (Number(w.advanceFisico) || 0), 0) / active.length : 0;
    const ds = S.distributionSummary();
    const series = S.monthlySeries(8);
    const dist = S.expenseDistribution();
    const distTotal = dist.reduce((a, d) => a + d.value, 0);
    const balanceTone = t.net >= 0 ? 'success' : 'danger';
    const present = S.presentToday();
    const paidMonth = S.employeesPaidThisMonth();
    const advMonth = S.employeeAdvancesThisMonth();
    const activeEmps = S.data.employees.filter(e => e.active !== false);
    const monthKey = S.todayISO().slice(0, 7);
    const monthJornadas = S.data.attendance.filter(a => a.date.slice(0, 7) === monthKey && a.status === 'presente').length;

    const moves = S.data.incomes.map(x => ({ date: x.date, kind: 'ingreso', workId: x.workId, label: x.concept, amount: Number(x.amount) }))
      .concat(S.data.expenses.map(x => ({ date: x.date, kind: 'gasto', workId: x.workId, label: x.description, amount: Number(x.amount), type: x.type })))
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 8);
    const workById = id => works.find(w => w.id === id);

    view.innerHTML =
      '<div class="card period-bar">' +
      '<span class="period-label">Período de análisis</span>' +
      '<select class="select" id="periodSel">' +
      '<option value="todo"' + (period.preset === 'todo' ? ' selected' : '') + '>Todo el historial</option>' +
      '<option value="mes"' + (period.preset === 'mes' ? ' selected' : '') + '>Este mes</option>' +
      '<option value="3m"' + (period.preset === '3m' ? ' selected' : '') + '>Últimos 3 meses</option>' +
      '<option value="6m"' + (period.preset === '6m' ? ' selected' : '') + '>Últimos 6 meses</option>' +
      '<option value="12m"' + (period.preset === '12m' ? ' selected' : '') + '>Últimos 12 meses</option>' +
      '<option value="custom"' + (period.preset === 'custom' ? ' selected' : '') + '>Personalizado</option>' +
      '</select>' +
      '<input type="date" class="input" id="pFrom" value="' + period.from + '"' + (period.preset === 'custom' ? '' : ' hidden') + '>' +
      '<input type="date" class="input" id="pTo" value="' + period.to + '"' + (period.preset === 'custom' ? '' : ' hidden') + '>' +
      '<span class="muted small" id="periodDesc">' + UI.escapeHtml(range.label) + '</span>' +
      '</div>' +

      '<section class="kpi-grid">' +
      kpi('trending-up', 'success', 'Ingresos del período', UI.fmtMoney(t.incomes), t.incomesCount + ' cobros · ' + range.label) +
      kpi('arrow-up-right', 'danger', 'Gastos del período', UI.fmtMoney(t.expenses), 'Directos ' + UI.fmtMoney(t.direct) + ' · Generales ' + UI.fmtMoney(t.general)) +
      kpi('activity', balanceTone, 'Balance neto', UI.fmtMoney(t.net), 'Ingresos menos todos los gastos') +
      kpi('wrench', 'violet', 'Inversión en herramientas', UI.fmtMoney(t.assets), t.assetsCount + ' compras · mant. ' + UI.fmtMoney(t.maint)) +
      kpi('hard-hat', 'info', 'Estado de obras', active.length + ' activas', paused.length + ' pausadas · ' + done.length + ' finalizadas · avance prom. ' + Math.round(avg) + '%') +
      '</section>' +

      '<section class="charts-grid">' +
      '<div class="card">' +
      '<div class="card-head">' +
      '<div><h3>Flujo de caja</h3><p class="muted">Ingresos vs egresos · últimos 8 meses</p></div>' +
      '<div class="legend-inline">' +
      '<span class="legend-item"><i style="background:#34d399"></i>Ingresos</span>' +
      '<span class="legend-item"><i style="background:#fb7185"></i>Egresos</span>' +
      '</div></div>' +
      '<canvas id="chartCash" class="chart" style="height:270px"></canvas>' +
      '</div>' +
      '<div class="card">' +
      '<div class="card-head"><div><h3>Distribución de gastos</h3><p class="muted">Por obra y gastos generales</p></div></div>' +
      '<div class="donut-wrap">' +
      '<canvas id="chartDonut" class="chart" style="height:210px;max-width:230px"></canvas>' +
      '<div class="donut-legend">' +
      dist.map((d, i) => {
        const color = d.id === 'general' ? '#fb7185' : PALETTE[i % PALETTE.length];
        const pct = distTotal ? d.value / distTotal * 100 : 0;
        return '<div class="legend-row"><i style="background:' + color + '"></i>' +
          '<span class="legend-label" title="' + UI.escapeHtml(d.label) + '">' + UI.escapeHtml(d.label) + '</span>' +
          '<b>' + UI.fmtMoney(d.value) + '</b><span class="muted small">' + pct.toFixed(1) + '%</span></div>';
      }).join('') +
      '</div></div></div>' +
      '</section>' +

      '<section class="card">' +
      '<div class="card-head">' +
      '<div><h3>Empleados y jornales</h3><p class="muted">Asistencia, horas y pagos al personal</p></div>' +
      '<a class="link-btn" href="#/empleados">Ver empleados ' + UI.icon('chevron-right', 14) + '</a>' +
      '</div>' +
      '<div class="emp-dash">' +
      '<div>' +
      '<span class="muted small" style="text-transform:uppercase;letter-spacing:.08em;font-size:10.5px">Presentes hoy</span>' +
      '<div class="emp-dash-today" style="margin-top:6px">' +
      (present.map(a => {
        const emp = S.employeeById(a.employeeId);
        const hrs = S.sum((a.hours || []).map(h => h.hours));
        return emp ? '<a class="emp-chip" href="#/empleado/' + emp.id + '">' + UI.avatar(S.employeeName(emp), 24) + UI.escapeHtml(S.employeeName(emp)) + (hrs ? ' · ' + hrs + ' h' : '') + '</a>' : '';
      }).join('') || '<span class="muted">Sin jornales registrados hoy</span>') +
      '</div></div>' +
      '<div class="emp-dash-stats">' +
      '<div class="emp-stat"><b>' + UI.fmtMoney(paidMonth) + '</b><span>sueldos este mes</span></div>' +
      '<div class="emp-stat"><b class="warning-text">' + UI.fmtMoney(advMonth) + '</b><span>adelantos este mes</span></div>' +
      '<div class="emp-stat"><b>' + activeEmps.length + '</b><span>empleados activos</span></div>' +
      '<div class="emp-stat"><b>' + monthJornadas + '</b><span>jornadas este mes</span></div>' +
      '</div>' +
      '<div class="emp-dash-actions">' +
      '<button class="btn btn-soft-info btn-sm" id="btnAttDash">' + UI.icon('calendar-plus', 15) + 'Registrar jornada</button>' +
      '<button class="btn btn-soft btn-sm" id="btnEmpDash">' + UI.icon('user', 15) + 'Nuevo empleado</button>' +
      '</div></div></div>' +
      '</section>' +

      '<section class="grid-2">' +
      '<div class="card">' +
      '<div class="card-head">' +
      '<div><h3>Obras en curso</h3><p class="muted">Avance físico y de cobro</p></div>' +
      '<a class="link-btn" href="#/obras">Ver todas ' + UI.icon('chevron-right', 14) + '</a>' +
      '</div>' +
      '<div class="stack">' +
      (works.filter(w => w.status !== 'finalizada').slice(0, 6).map(w => {
        const st = S.workStats(w.id);
        return '<a class="work-row" href="#/obra/' + w.id + '">' +
          '<div class="work-row-main">' +
          '<span class="dot dot-' + w.status + '"></span>' +
          '<div><strong>' + UI.escapeHtml(w.name) + '</strong>' +
          '<span class="muted small">' + UI.escapeHtml((S.contactById(w.clientId) || {}).name || '—') + ' · ' + UI.escapeHtml(w.location || '') + '</span></div>' +
          '</div>' +
          '<div class="work-row-prog">' +
          '<div class="work-row-bar"><span>Físico</span>' + UI.progress(w.advanceFisico) + '<b>' + Math.round(Number(w.advanceFisico) || 0) + '%</b></div>' +
          '<div class="work-row-bar"><span>Cobro</span>' + UI.progress(st.advanceCobro, 'var(--info)') + '<b>' + Math.round(st.advanceCobro) + '%</b></div>' +
          '</div></a>';
      }).join('') || UI.emptyState('hard-hat', 'No hay obras en curso', 'Registrá una nueva obra para empezar.')) +
      '</div></div>' +

      '<div class="card">' +
      '<div class="card-head">' +
      '<div><h3>Liquidaciones y compromisos</h3><p class="muted">Reparto a socios</p></div>' +
      '<a class="link-btn" href="#/socios">Cronograma ' + UI.icon('chevron-right', 14) + '</a>' +
      '</div>' +
      '<div class="stack">' +
      (ds.overdue.length
        ? '<div class="alert alert-danger">' + UI.icon('alert-triangle', 16) +
          '<span><strong>' + ds.overdue.length + ' liquidación' + (ds.overdue.length > 1 ? 'es' : '') + ' vencida' + (ds.overdue.length > 1 ? 's' : '') + '</strong> · ' +
          UI.fmtMoney(S.sum(ds.overdue.map(x => x.amount))) + ' sin pagar. <a href="#/socios">Resolver</a></span></div>'
        : '') +
      S.data.distributions.slice().sort((a, b) => a.date.localeCompare(b.date)).slice(-4).reverse().map(d => {
        const isOver = d.status === 'pendiente' && d.date < S.todayISO();
        const chip = d.status === 'pagada' ? UI.chip('Pagada', 'success', 'check')
          : isOver ? UI.chip('Vencida', 'danger', 'alert-triangle')
          : UI.chip('Pendiente', 'warning', 'clock');
        return '<div class="split-row">' +
          '<div class="split-row-main"><strong>' + UI.escapeHtml(d.period) + '</strong>' +
          '<span class="muted small">' + UI.fmtDate(d.date) + ' · ' + (d.splits ? d.splits.length : 0) + ' socios</span></div>' +
          '<div class="split-row-end">' + chip + '<b>' + UI.fmtMoney(d.amount) + '</b></div>' +
          '</div>';
      }).join('') +
      '<a class="btn btn-soft btn-block" href="#/socios">Ver cronograma completo</a>' +
      '</div></div>' +
      '</section>' +

      '<section class="card">' +
      '<div class="card-head"><div><h3>Últimos movimientos</h3><p class="muted">Ingresos y gastos recientes</p></div></div>' +
      '<div class="table-wrap"><table class="data-table">' +
      '<thead><tr><th>Fecha</th><th>Tipo</th><th>Obra / Destino</th><th>Concepto</th><th class="num">Monto</th></tr></thead>' +
      '<tbody>' +
      moves.map(mx => {
        const w = mx.workId ? workById(mx.workId) : null;
        const name = mx.kind === 'ingreso' ? (w ? w.name : '—') : (mx.type === 'general' ? 'Gastos generales' : (w ? w.name : '—'));
        return '<tr>' +
          '<td class="muted">' + UI.fmtDate(mx.date) + '</td>' +
          '<td>' + (mx.kind === 'ingreso' ? UI.chip('Ingreso', 'success', 'trending-up') : UI.chip('Gasto', 'danger', 'arrow-up-right')) + '</td>' +
          '<td>' + UI.escapeHtml(name) + '</td>' +
          '<td>' + UI.escapeHtml(mx.label) + '</td>' +
          '<td class="num ' + (mx.kind === 'ingreso' ? 'pos' : 'neg') + '">' + (mx.kind === 'ingreso' ? '+' : '−') + UI.fmtMoney(mx.amount) + '</td>' +
          '</tr>';
      }).join('') +
      '</tbody></table></div>' +
      '</section>';

    view.querySelector('#periodSel').addEventListener('change', e => {
      period.preset = e.target.value;
      if (period.preset === 'custom') {
        if (!period.from) period.from = S.daysAgo(30);
        if (!period.to) period.to = S.todayISO();
      }
      render(view);
    });
    view.querySelector('#pFrom').addEventListener('change', e => { period.from = e.target.value; render(view); });
    view.querySelector('#pTo').addEventListener('change', e => { period.to = e.target.value; render(view); });
    const btnAttDash = view.querySelector('#btnAttDash');
    if (btnAttDash) btnAttDash.addEventListener('click', () => G.actions.attendance());
    const btnEmpDash = view.querySelector('#btnEmpDash');
    if (btnEmpDash) btnEmpDash.addEventListener('click', () => G.actions.employee());

    const c1 = view.querySelector('#chartCash');
    const c2 = view.querySelector('#chartDonut');
    if (c1) {
      G.charts.cashflow(c1, [
        { label: 'Ingresos', color: '#34d399', values: series.map(s => s.inc) },
        { label: 'Egresos', color: '#fb7185', values: series.map(s => s.exp) },
      ], series.map(s => ({ label: s.label, full: s.full })));
    }
    if (c2) {
      G.charts.donut(c2, dist.map((d, i) => ({
        label: d.label,
        value: d.value,
        color: d.id === 'general' ? '#fb7185' : PALETTE[i % PALETTE.length],
      })));
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);
