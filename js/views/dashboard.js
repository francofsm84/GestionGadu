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

  function kpi(icon, tone, label, value, sub, nav) {
    const inner = '<span class="kpi-ico kpi-' + tone + '">' + UI.icon(icon, 20) + '</span>' +
      '<div class="kpi-body">' +
      '<span class="kpi-label">' + label + '</span>' +
      '<strong class="kpi-value">' + value + '</strong>' +
      '<span class="kpi-sub">' + sub + '</span>' +
      '</div>';
    return nav
      ? '<a class="kpi-card kpi-link" href="' + nav + '">' + inner + '</a>'
      : '<div class="kpi-card">' + inner + '</div>';
  }

  /* Reporte Ejecutivo Mensual en PDF (solo planes PRO) */
  async function exportExecutiveReport(range, t) {
    const plan = (G.plan && G.plan.currentPlan) ? G.plan.currentPlan() : { id: 'free' };
    if (plan.id !== 'pro' && plan.id !== 'empresa') {
      UI.toast('Los reportes en PDF son exclusivos del Plan PRO', 'warning');
      if (G.upgrade) G.upgrade();
      return;
    }
    if (typeof html2pdf === 'undefined') { UI.toast('Cargando el generador de PDF…', 'info'); return; }

    const inRange = x => (!range.from || String(x.date || '') >= range.from) && (!range.to || String(x.date || '') <= range.to);
    const incF = S.data.incomes.filter(inRange);
    const expF = S.data.expenses.filter(inRange);
    const incTotal = S.sum(incF.map(x => Number(x.amount) || 0));
    const expTotal = S.sum(expF.map(x => Number(x.amount) || 0));
    const directTotal = S.sum(expF.filter(x => x.type === 'obra').map(x => Number(x.amount) || 0));
    const generalTotal = S.sum(expF.filter(x => x.type !== 'obra').map(x => Number(x.amount) || 0));
    const net = incTotal - expTotal;
    const sueldos = S.sum(expF.filter(x => x.employeeId && x.expenseKind !== 'adelanto').map(x => Number(x.amount) || 0));
    const adelantos = S.sum(expF.filter(x => x.employeeId && x.expenseKind === 'adelanto').map(x => Number(x.amount) || 0));

    const workRows = (S.data.works || []).map(w => ({
      w,
      inc: S.sum(incF.filter(x => x.workId === w.id).map(x => Number(x.amount) || 0)),
      exp: S.sum(expF.filter(x => x.workId === w.id).map(x => Number(x.amount) || 0)),
      budget: Number(w.budgetTotal) || 0,
    }));

    const cats = {};
    expF.forEach(x => { const c = String(x.category || 'Otros'); cats[c] = (cats[c] || 0) + (Number(x.amount) || 0); });
    const catRows = Object.entries(cats).sort((a, b) => b[1] - a[1]);

    const today = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' });
    const periodLabel = range.label || 'período';
    const html =
      '<div style="font-family:Arial,Helvetica,sans-serif;color:#1e293b;padding:26px;background:#fff;max-width:780px">' +
      '<div style="display:flex;justify-content:space-between;border-bottom:3px solid #4f46e5;padding-bottom:12px;margin-bottom:16px">' +
        '<div><div style="font-size:22px;font-weight:800;color:#0f172a">GADU Construye</div><div style="font-size:14px;color:#4f46e5;font-weight:700">Reporte Ejecutivo</div></div>' +
        '<div style="text-align:right;font-size:12px;color:#94a3b8">' + today + '<br>' + UI.escapeHtml(periodLabel) + '</div>' +
      '</div>' +

      '<div style="font-weight:700;margin:14px 0 6px">Resumen financiero</div>' +
      '<table style="width:100%;border-collapse:collapse;margin-bottom:16px">' +
        '<tr><td style="padding:6px 8px;color:#64748b">Total ingresos</td><td style="text-align:right;color:#16a34a;font-weight:700">' + UI.fmtMoney(incTotal) + '</td></tr>' +
        '<tr><td style="padding:6px 8px;color:#64748b">Gastos directos</td><td style="text-align:right;color:#dc2626;font-weight:700">−' + UI.fmtMoney(directTotal) + '</td></tr>' +
        '<tr><td style="padding:6px 8px;color:#64748b">Gastos generales</td><td style="text-align:right;color:#dc2626;font-weight:700">−' + UI.fmtMoney(generalTotal) + '</td></tr>' +
        '<tr><td style="padding:6px 8px;color:#64748b">Total gastos</td><td style="text-align:right;color:#dc2626;font-weight:700">−' + UI.fmtMoney(expTotal) + '</td></tr>' +
        '<tr style="border-top:2px solid #cbd5e1"><td style="padding:9px 8px;font-weight:800">Balance neto</td><td style="text-align:right;font-weight:800;font-size:16px;color:' + (net >= 0 ? '#16a34a' : '#dc2626') + '">' + UI.fmtMoney(net) + '</td></tr>' +
      '</table>' +

      '<div style="font-weight:700;margin:14px 0 6px">Desglose de obras</div>' +
      '<table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:16px">' +
        '<tr style="background:#f1f5f9"><th style="text-align:left;padding:6px 8px;color:#64748b">Obra</th><th style="text-align:right;padding:6px 8px;color:#64748b">Presupuesto</th><th style="text-align:right;padding:6px 8px;color:#64748b">Cobrado</th><th style="text-align:right;padding:6px 8px;color:#64748b">Gastado</th></tr>' +
        (workRows.map(r => '<tr><td style="padding:6px 8px;border-bottom:1px solid #e2e8f0">' + UI.escapeHtml(r.w.name) + '</td><td style="text-align:right;padding:6px 8px;border-bottom:1px solid #e2e8f0">' + UI.fmtMoney(r.budget) + '</td><td style="text-align:right;padding:6px 8px;border-bottom:1px solid #e2e8f0;color:#16a34a">' + UI.fmtMoney(r.inc) + '</td><td style="text-align:right;padding:6px 8px;border-bottom:1px solid #e2e8f0;color:#dc2626">' + UI.fmtMoney(r.exp) + '</td></tr>').join('') || '<tr><td colspan="4" style="padding:8px;color:#94a3b8">Sin obras.</td></tr>') +
      '</table>' +

      '<div style="font-weight:700;margin:14px 0 6px">Gastos por categoría</div>' +
      '<table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:16px">' +
        (catRows.map(c => '<tr><td style="padding:5px 8px;border-bottom:1px solid #e2e8f0">' + UI.escapeHtml(c[0]) + '</td><td style="text-align:right;padding:5px 8px;border-bottom:1px solid #e2e8f0">' + UI.fmtMoney(c[1]) + '</td></tr>').join('') || '<tr><td style="padding:8px;color:#94a3b8">Sin gastos.</td></tr>') +
      '</table>' +

      '<div style="font-weight:700;margin:14px 0 6px">Empleados</div>' +
      '<table style="width:100%;border-collapse:collapse;margin-bottom:16px">' +
        '<tr><td style="padding:6px 8px;color:#64748b">Sueldos pagados</td><td style="text-align:right;font-weight:700">' + UI.fmtMoney(sueldos) + '</td></tr>' +
        '<tr><td style="padding:6px 8px;color:#64748b">Adelantos</td><td style="text-align:right;font-weight:700;color:#dc2626">−' + UI.fmtMoney(adelantos) + '</td></tr>' +
      '</table>' +

      '<div style="text-align:center;color:#94a3b8;font-size:12px;margin-top:22px;border-top:1px solid #e2e8f0;padding-top:12px">Generado por GADU · Tu gestión, perfecta</div>' +
      '</div>';

    const container = document.createElement('div');
    container.style.position = 'fixed';
    container.style.left = '0'; container.style.top = '0';
    container.style.width = '800px'; container.style.maxWidth = '100%';
    container.style.zIndex = '-9999'; container.style.opacity = '0'; container.style.pointerEvents = 'none';
    container.style.background = '#ffffff'; container.style.color = '#111827';
    container.innerHTML = html;
    document.body.appendChild(container);

    const fname = 'Reporte_Ejecutivo_' + String(periodLabel).replace(/[^a-z0-9áéíóúñ ]/gi, '').replace(/\s+/g, '_') + '.pdf';
    await new Promise(r => setTimeout(r, 250));

    try {
      await html2pdf().from(container).set({
        margin: 8,
        filename: fname,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, allowTaint: true, logging: false },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      }).save();
      UI.toast('✅ Reporte ejecutivo descargado', 'success');
    } catch (e) {
      UI.toast('❌ No se pudo generar el reporte: ' + ((e && e.message) || e), 'error');
    } finally {
      try { document.body.removeChild(container); } catch (e) {}
    }
  }

  /* Empty state de bienvenida (usuario nuevo sin obras ni gastos) */
  function emptyStateHTML() {
    const prof = (S.data && S.data.settings && S.data.settings.profile) || {};
    const wa = prof.whatsapp || {};
    const linked = !!(wa.linked || wa.verified || prof.whatsapp_verified);
    return '<div class="card" style="text-align:center;padding:48px 24px;max-width:560px;margin:0 auto">' +
      '<span class="empty-ico">' + UI.icon('hard-hat', 40) + '</span>' +
      '<h2 style="margin:12px 0 6px">¡Bienvenido a GADU! 👋</h2>' +
      '<p class="muted" style="margin-bottom:20px">Tu gestión, perfecta. Para empezar, vinculá tu WhatsApp y mandale un audio al bot con tu primer gasto.</p>' +
      '<div class="stack" style="gap:10px">' +
        '<button class="btn btn-primary btn-block" id="btnGuide">📖 Ver Guía de Inicio Rápido</button>' +
        '<button class="btn btn-soft btn-block" id="btnFirstWork">🏗️ Crear mi primera Obra</button>' +
        '<button class="btn btn-soft btn-block" id="btnFirstExpense">💸 Cargar un Gasto</button>' +
        (linked ? '' : '<button class="btn btn-soft-success btn-block" id="btnFirstWhatsApp">🔗 Vincular mi WhatsApp</button>') +
      '</div>' +
    '</div>';
  }

  /* Un paso de la guía de inicio rápido */
  function guideStep(emoji, title, desc) {
    return '<div class="card-inset" style="display:flex;gap:12px;align-items:flex-start;margin-bottom:8px">' +
      '<span style="font-size:28px;line-height:1">' + emoji + '</span>' +
      '<div><strong>' + UI.escapeHtml(title) + '</strong><p class="muted" style="margin:2px 0 0">' + UI.escapeHtml(desc) + '</p></div>' +
      '</div>';
  }

  /* Modal de la Guía de Inicio Rápido (4 pasos) */
  function openGuideModal() {
    const m = UI.openModal({
      title: '📖 Guía de Inicio Rápido',
      subtitle: '4 pasos para sacarle el máximo provecho a GADU.',
      body:
        '<div>' +
        guideStep('🔗', 'Vinculá tu WhatsApp', 'Andá a "Mi Perfil" y seguí los pasos para conectar tu número.') +
        guideStep('🎙️', 'Mandá un Audio', 'Escribile al bot de GADU: "Gasté 5000 en cemento". El bot lo procesará automáticamente.') +
        guideStep('📥', 'Revisá la Bandeja', 'Si el gasto no tiene obra, aparecerá en "Bandeja WhatsApp". Asignalo a una obra con un clic.') +
        guideStep('🔄', 'Recuperá lo borrado', 'Si borraste algo por error, andá a "Respaldos y datos" > "Papelera de Reciclaje".') +
        '</div>',
      footer: '<button class="btn btn-primary btn-block" id="btnGuideDone">¡Entendido, a trabajar!</button>',
    });
    m.panel.querySelector('#btnGuideDone').addEventListener('click', () => {
      try { localStorage.setItem('gadu_guide_seen', 'true'); } catch (e) {}
      m.close();
    });
  }

  function bindEmptyState(view) {
    const guide = view.querySelector('#btnGuide');
    if (guide) guide.addEventListener('click', openGuideModal);
    const firstWork = view.querySelector('#btnFirstWork');
    if (firstWork) firstWork.addEventListener('click', () => { try { G.actions.work(); } catch (e) { location.hash = '#/obras'; } });
    const firstExp = view.querySelector('#btnFirstExpense');
    if (firstExp) firstExp.addEventListener('click', () => { try { G.actions.expense(); } catch (e) { location.hash = '#/gastos'; } });
    const firstWa = view.querySelector('#btnFirstWhatsApp');
    if (firstWa) firstWa.addEventListener('click', () => { try { G.onboarding.open(); } catch (e) {} });
  }

  function render(view) {
    /* Guard defensivo: dispara el getter de datos (auto-seed) y valida
       colecciones ANTES de calcular, evitando "Cannot read properties of
       null (reading 'incomes')" durante la carga inicial. */
    const d = S.data;
    if (!d || !Array.isArray(d.incomes) || !Array.isArray(d.works) || !Array.isArray(d.expenses)) {
      view.innerHTML = UI.emptyState('activity', 'Cargando tus datos…', '');
      return;
    }
    /* Empty state: usuario nuevo sin obras ni gastos → bienvenida + guía */
    if (S.data.works.length === 0 && S.data.expenses.length === 0) {
      view.innerHTML = emptyStateHTML();
      bindEmptyState(view);
      /* Auto-abrir la guía la primera vez (no vuelve a aparecer si ya la cerró) */
      try { if (!localStorage.getItem('gadu_guide_seen')) openGuideModal(); } catch (e) {}
      return;
    }
    const range = periodRange();
    const t = S.totalsBetween(range.from, range.to);
    const works = S.data.works;
    const pendingTasks = (S.data.tasks || []).filter(t => !t.isDone)
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
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
    /* Sueldos acumulados + saldo pendiente de pago a empleados (mes en curso) */
    const salaryAll = S.sum(S.data.expenses.filter(x => x.employeeId && x.expenseKind !== 'adelanto').map(x => x.amount));
    const pendEmps = S.sum(activeEmps.map(e => {
      const m = S.employeeMonth(e.id);
      const devengado = (m.hours || 0) * (Number(e.hourlyRate) || 0);
      return Math.max(0, devengado - m.salary - m.advances);
    }));

    const moves = S.data.incomes.map(x => ({ date: x.date, kind: 'ingreso', workId: x.workId, label: x.concept, amount: Number(x.amount) }))
      .concat(S.data.expenses.map(x => ({ date: x.date, kind: 'gasto', workId: x.workId, label: x.description, amount: Number(x.amount), type: x.type })))
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 8);
    const workById = id => works.find(w => w.id === id);
    /* Deudas activas que vencen en 7 días o ya vencieron (alerta del dashboard) */
    const debtsVencer = (S.data.debts || []).filter(d => !d.finalizada && (() => {
      const dias = Math.ceil((new Date(d.fechaVencimiento + 'T00:00:00') - new Date()) / 86400000);
      return dias <= 7;
    })());

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
      '<div style="flex:1"></div>' +
      '<button class="btn btn-soft" id="btnReport">' + UI.icon('file-text', 16) + 'Exportar Reporte Mensual</button>' +
      '<a class="btn btn-primary" href="https://wa.me/' + (G.BOT_PHONE_NUMBER || '5493547665984') + '?text=' + encodeURIComponent('Hola GADU, quiero cargar un gasto rápido.') + '" target="_blank" rel="noopener">' + UI.icon('whatsapp', 16) + ' Cargar por WhatsApp</a>' +
      '</div>' +

      '<section class="kpi-grid">' +
      kpi('trending-up', 'success', 'Ingresos del período', UI.fmtMoney(t.incomes), t.incomesCount + ' cobros · ' + range.label, '#/ingresos') +
      kpi('arrow-up-right', 'danger', 'Gastos del período', UI.fmtMoney(t.expenses), 'Directos ' + UI.fmtMoney(t.direct) + ' · Generales ' + UI.fmtMoney(t.general), '#/gastos') +
      kpi('activity', balanceTone, 'Balance neto', UI.fmtMoney(t.net), 'Ingresos menos todos los gastos', '#/libro') +
      kpi('wrench', 'violet', 'Inversión en herramientas', UI.fmtMoney(t.assets), t.assetsCount + ' compras · mant. ' + UI.fmtMoney(t.maint), '#/herramientas') +
      kpi('hard-hat', 'info', 'Estado de obras', active.length + ' activas', paused.length + ' pausadas · ' + done.length + ' finalizadas · avance prom. ' + Math.round(avg) + '%', '#/obras') +
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
        return emp ? '<a class="emp-chip" href="#/empleado/' + emp.id + '">' + UI.avatar(S.employeeName(emp), 24, emp.photo) + UI.escapeHtml(S.employeeName(emp)) + (hrs ? ' · ' + hrs + ' h' : '') + '</a>' : '';
      }).join('') || '<span class="muted">Sin jornales registrados hoy</span>') +
      '</div></div>' +
      '<div class="emp-dash-stats">' +
      '<div class="emp-stat"><b>' + UI.fmtMoney(paidMonth) + '</b><span>sueldos este mes</span></div>' +
      '<div class="emp-stat"><b class="warning-text">' + UI.fmtMoney(advMonth) + '</b><span>adelantos este mes</span></div>' +
      '<div class="emp-stat"><b class="pos">' + UI.fmtMoney(salaryAll) + '</b><span>sueldos acumulados</span></div>' +
      '<div class="emp-stat"><b class="' + (pendEmps > 0 ? 'neg' : 'pos') + '">' + UI.fmtMoney(pendEmps) + '</b><span>saldo pendiente a empleados</span></div>' +
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
        ? '<a href="#/socios" class="alert alert-danger alert-clickable" title="Ir a Socios y reparto · Liquidaciones">' + UI.icon('alert-triangle', 16) +
          '<span><strong>' + ds.overdue.length + ' liquidación' + (ds.overdue.length > 1 ? 'es' : '') + ' vencida' + (ds.overdue.length > 1 ? 's' : '') + '</strong> · ' +
          UI.fmtMoney(S.sum(ds.overdue.map(x => x.amount))) + ' sin pagar. Resolver ' + UI.icon('chevron-right', 14) + '</span></a>'
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

      (pendingTasks.length
        ? '<section class="card">' +
          '<div class="card-head">' +
          '<div><h3>📋 Tareas pendientes</h3><p class="muted">' + pendingTasks.length + ' tarea' + (pendingTasks.length !== 1 ? 's' : '') + ' sin terminar en tus obras</p></div>' +
          '<a class="link-btn" href="#/obras">Ver obras ' + UI.icon('chevron-right', 14) + '</a>' +
          '</div>' +
          '<div class="stack">' +
          pendingTasks.slice(0, 5).map(t => {
            const w = works.find(x => x.id === t.workId);
            return '<a class="split-row" href="#/obra/' + t.workId + '">' +
              '<div class="split-row-main"><strong>' + UI.escapeHtml(t.title) + '</strong>' +
              '<span class="muted small">' + UI.escapeHtml(w ? (w.name || w.nombre) : 'Obra') + '</span></div>' +
              UI.chip('Pendiente', 'warning', 'clock') +
              '</a>';
          }).join('') +
          '</div></section>'
        : '') +

      '<section class="card">' +
      '<div class="card-head">' +
      '<div><h3>🛡️ Seguros · Próximos vencimientos</h3><p class="muted">Rojo: vencido · Amarillo: 7 días o menos · Verde: al día</p></div>' +
      '<a class="link-btn" href="#/seguros">Gestionar ' + UI.icon('chevron-right', 14) + '</a>' +
      '</div>' +
      '<div class="stack">' +
      (S.data.seguros.slice().sort((a, b) => S.seguroDaysLeft(a) - S.seguroDaysLeft(b)).slice(0, 5).map(s => {
        const st = S.seguroEstado(s);
        const color = st.tone === 'danger' ? 'var(--danger)' : (st.tone === 'warning' ? 'var(--warning)' : 'var(--success)');
        return '<a class="split-row" href="#/seguros">' +
          '<div class="split-row-main"><span class="dot" style="background:' + color + '"></span>' +
          '<strong>' + UI.escapeHtml(s.tipo) + ' · ' + UI.escapeHtml(s.compania) + '</strong>' +
          '<span class="muted small">vence ' + UI.fmtDate(s.fechaVencimiento) + '</span></div>' +
          '<div class="split-row-end">' + UI.chip(st.label, st.tone) + '</div>' +
          '</a>';
      }).join('') || '<p class="form-hint">Sin seguros registrados. <a href="#/seguros">Cargá la primera póliza</a>.</p>') +
      '</div></section>' +

      (debtsVencer.length
        ? '<section class="card">' +
          '<div class="card-head">' +
          '<div><h3>⚠️ Deudas próximas a vencer</h3><p class="muted">Cuotas que vencen en 7 días o ya vencieron</p></div>' +
          '<a class="link-btn" href="#/deudas">Ir a Deudas ' + UI.icon('chevron-right', 14) + '</a>' +
          '</div>' +
          '<div class="stack">' +
          debtsVencer.map(d => {
            const dias = Math.ceil((new Date(d.fechaVencimiento + 'T00:00:00') - new Date()) / 86400000);
            const vencida = dias < 0;
            return '<a class="split-row" href="#/deudas">' +
              '<div class="split-row-main"><strong>' + UI.escapeHtml(d.concepto) + '</strong>' +
              '<span class="muted small">' + (vencida ? 'vencida el ' : 'vence el ') + UI.fmtDate(d.fechaVencimiento) + ' · cuota ' + d.cuotaActual + '/' + d.cuotasTotales + '</span></div>' +
              '<div class="split-row-end">' + UI.chip(vencida ? 'Vencida' : (dias === 0 ? 'Hoy' : dias + 'd'), vencida ? 'danger' : 'warning', vencida ? 'alert-triangle' : 'calendar') + '<b>' + UI.fmtMoney(d.montoPorCuota) + '</b></div>' +
              '</a>';
          }).join('') +
          '<a class="btn btn-soft btn-block" href="#/deudas">Ver todas las deudas</a>' +
          '</div></section>'
        : '') +

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
    const btnReport = view.querySelector('#btnReport');
    if (btnReport) btnReport.addEventListener('click', () => exportExecutiveReport(range, t));
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
