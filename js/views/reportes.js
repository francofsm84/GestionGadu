/* ============================================================
   GADU · Vistas públicas de reportes (SOLO LECTURA)
   Rutas hash: #/reporte/empleados · #/reporte/obra/<id>
   Estilo tarjeta tipo portal, sin alterar app_data.
   ============================================================ */
(function (root) {
  'use strict';
  const G = root.GADU, S = G.store, UI = G.ui;
  const fmt = n => UI.fmtMoney(Number(n) || 0);
  const sum = arr => (arr || []).reduce((a, b) => a + (Number(b) || 0), 0);

  G.router.add('reporte-empleados', 'reporte/empleados', 'Reporte de Sueldos', 'Desglose semanal por empleado', renderEmpleados);
  G.router.add('reporte-obra', 'reporte/obra/:id', 'Reporte de Obra', 'Balance financiero de la obra', renderObra);

  function renderEmpleados(view) {
    const employees = S.data.employees || [];
    const attendance = S.data.attendance || [];
    const expenses = S.data.expenses || [];
    const desde = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    const att = attendance.filter(a => (a.date || '') >= desde && a.status === 'presente');
    let total = 0;
    const rows = employees.map(e => {
      const nombre = ((e.firstName || '') + ' ' + (e.lastName || '')).trim() || 'Empleado';
      const a = att.filter(x => x.employeeId === e.id);
      const horas = sum(a.flatMap(x => x.hours || []).map(h => h.hours));
      const dias = a.length;
      const devengado = horas * (Number(e.hourlyRate) || 0);
      const adelantos = sum(expenses.filter(x => x.employeeId === e.id && x.expenseKind === 'adelanto' && (x.date || '') >= desde).map(x => x.amount));
      total += devengado - adelantos;
      return '<div class="report-row"><div><strong>' + UI.escapeHtml(nombre) + '</strong><span class="muted small">' + dias + 'd · ' + horas + 'h' + (adelantos ? ' · adelantos -' + fmt(adelantos) : '') + '</span></div><b>' + fmt(devengado) + '</b></div>';
    }).join('');
    view.innerHTML =
      '<div class="portal-wrap"><div class="portal-card">' +
        '<div class="portal-head"><div class="portal-logo">GADU <span>Reportes</span></div><div class="portal-chip">Sueldos</div></div>' +
        '<h1 class="portal-title">Sueldos de la semana</h1>' +
        '<p class="portal-addr">Total a pagar: <b class="pos">' + fmt(total) + '</b></p>' +
        (rows || '<p class="portal-no-photos">Sin jornadas registradas esta semana.</p>') +
        '<p class="portal-foot">Solo lectura · Generado por GADU</p>' +
      '</div></div>';
  }

  function renderObra(view, params) {
    const w = (S.data.works || []).find(x => x.id === (params && params.id));
    if (!w) { view.innerHTML = '<div class="portal-empty">No encontramos esa obra.</div>'; return; }
    const wid = String(w.id || '');
    const ing = sum((S.data.incomes || []).filter(i => i.workId === wid).map(i => i.amount));
    const cos = sum((S.data.expenses || []).filter(x => x.workId === wid).map(x => x.amount));
    const margen = ing - cos;
    const presupuesto = Number(w.budgetTotal) || 0;
    const pendiente = Math.max(0, presupuesto - ing);
    const pct = presupuesto > 0 ? Math.min(100, Math.round(ing / presupuesto * 100)) : 0;
    view.innerHTML =
      '<div class="portal-wrap"><div class="portal-card">' +
        '<div class="portal-head"><div class="portal-logo">GADU <span>Reportes</span></div><div class="portal-chip">Balance</div></div>' +
        '<h1 class="portal-title">' + UI.escapeHtml(w.name || w.nombre || 'Obra') + '</h1>' +
        '<div class="portal-bar-item"><div class="portal-bar-label"><span>Avance de cobro</span><b>' + pct + '%</b></div>' +
        '<div class="portal-bar"><div class="portal-bar-fill portal-bar-fill--info" style="width:' + pct + '%"></div></div></div>' +
        '<div class="report-row"><span>Ingresos</span><b class="pos">' + fmt(ing) + '</b></div>' +
        '<div class="report-row"><span>Costos directos</span><b class="neg">−' + fmt(cos) + '</b></div>' +
        '<div class="report-row"><span>Margen de ganancia</span><b>' + fmt(margen) + '</b></div>' +
        '<div class="report-row"><span>Presupuesto</span><b>' + fmt(presupuesto) + '</b></div>' +
        '<div class="report-row"><span>Pendiente de cobrar</span><b>' + fmt(pendiente) + '</b></div>' +
        '<p class="portal-foot">Solo lectura · Generado por GADU</p>' +
      '</div></div>';
  }
})(typeof window !== 'undefined' ? window : globalThis);
