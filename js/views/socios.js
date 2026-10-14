/* ============================================================
   GADU · Vista: Socios y reparto
   Porcentajes de participación, cálculo automático del saldo
   disponible y cronograma de liquidaciones con alertas
   ============================================================ */
(function (root) {
  'use strict';
  const G = root.GADU, S = G.store, UI = G.ui;

  G.router.add('socios', 'socios', 'Socios y reparto', 'Participación en utilidades y cronograma de liquidaciones', render);

  const STATUS_LABEL = { activa: ['Activa', 'success'], pausada: ['Pausada', 'warning'], finalizada: ['Finalizada', 'neutral'] };

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
    const ds = S.distributionSummary();
    const socios = S.socios();
    const obras = S.data.works.map(w => ({ w, st: S.workStats(w.id) })).sort((a, b) => b.st.margin - a.st.margin);

    view.innerHTML =
      '<section class="kpi-grid kpi-5">' +
      kpi('activity', 'success', 'Utilidad bruta de obras', UI.fmtMoney(ds.gross), 'Ingresos − gastos directos') +
      kpi('arrow-up-right', 'danger', 'Gastos generales', '−' + UI.fmtMoney(ds.general), 'Estructura y costos fijos') +
      kpi('trending-up', ds.net >= 0 ? 'success' : 'danger', 'Utilidad neta', UI.fmtMoney(ds.net), 'Después de gastos generales') +
      '<div class="kpi-card">' +
      '<span class="kpi-ico kpi-warning">' + UI.icon('percent', 20) + '</span>' +
      '<div class="kpi-body">' +
      '<span class="kpi-label">Reserva de capital</span>' +
      '<strong class="kpi-value"><input class="inline-num" id="reservePct" type="number" min="0" max="100" value="' + ds.reservePercent + '"> %</strong>' +
      '<span class="kpi-sub">Se retiene antes de repartir</span>' +
      '</div></div>' +
      kpi('users', 'violet', 'Disponible a distribuir', UI.fmtMoney(ds.available), 'Utilidad neta × ' + (100 - ds.reservePercent) + '%') +
      '</section>' +

      (ds.overdue.length
        ? '<div class="alert alert-danger">' + UI.icon('alert-triangle', 18) +
          '<span><strong>Tenés ' + ds.overdue.length + ' liquidación' + (ds.overdue.length > 1 ? 'es' : '') + ' vencida' + (ds.overdue.length > 1 ? 's' : '') + '</strong> por ' +
          UI.fmtMoney(S.sum(ds.overdue.map(x => x.amount))) + '. Marcá el pago cuando lo realices.</span></div>'
        : '') +

      '<section class="grid-2">' +
      '<div class="card">' +
      '<div class="card-head"><div><h3>Participación de socios</h3><p class="muted">Reparto según porcentaje sobre el disponible</p></div></div>' +
      '<div class="stack">' +
      (socios.map(s => {
        const share = ds.available * (Number(s.percent) || 0) / 100;
        return '<div class="partner-row">' +
          UI.avatar(s.name, 40, s.photo) +
          '<div class="partner-info"><strong>' + UI.escapeHtml(s.name) + '</strong>' +
          '<span class="muted small">' + UI.escapeHtml(s.company || '') + '</span></div>' +
          '<div class="partner-pct">' + UI.chip((s.percent || 0) + '%', 'primary', 'percent') + '</div>' +
          '<div class="partner-amount"><b class="pos">' + UI.fmtMoney(share) + '</b>' +
          '<span class="muted small">asignación estimada</span></div>' +
          '<div class="partner-links">' +
          '<a class="icon-btn sm" href="' + UI.waLink(s.whatsapp || s.phone) + '" target="_blank" rel="noopener" title="WhatsApp">' + UI.icon('whatsapp', 15) + '</a>' +
          '<a class="icon-btn sm" href="' + UI.telLink(s.phone) + '" title="Llamar">' + UI.icon('phone', 15) + '</a>' +
          '</div></div>';
      }).join('') || UI.emptyState('users', 'No hay socios cargados', 'Agregalos desde el Directorio de contactos.')) +
      '</div>' +
      '<p class="form-hint" style="margin-top:10px">Los porcentajes se editan desde el <a href="#/directorio">Directorio de contactos</a>. La asignación es estimada sobre la utilidad neta disponible.</p>' +
      '</div>' +

      '<div class="card">' +
      '<div class="card-head"><div><h3>Resultado por obra</h3><p class="muted">Ganancia neta directa de cada obra</p></div></div>' +
      '<div class="table-wrap"><table class="data-table compact">' +
      '<thead><tr><th>Obra</th><th class="num">Ingresos</th><th class="num">Costos</th><th class="num">Margen</th><th class="num">%</th></tr></thead>' +
      '<tbody>' +
      obras.map(o => {
        const sl = STATUS_LABEL[o.w.status] || ['', 'neutral'];
        return '<tr class="clickable" data-obra="' + o.w.id + '">' +
          '<td><strong>' + UI.escapeHtml(o.w.name) + '</strong> ' + UI.chip(sl[0], sl[1]) + '</td>' +
          '<td class="num">' + UI.fmtMoney(o.st.incomes) + '</td>' +
          '<td class="num">' + UI.fmtMoney(o.st.costs) + '</td>' +
          '<td class="num ' + UI.signClass(o.st.margin) + '"><b>' + UI.fmtMoney(o.st.margin) + '</b></td>' +
          '<td class="num muted">' + o.st.marginPct.toFixed(0) + '%</td>' +
          '</tr>';
      }).join('') +
      '</tbody></table></div>' +
      '</div>' +
      '</section>' +

      '<section class="card">' +
      '<div class="card-head">' +
      '<div><h3>Cronograma de liquidaciones</h3><p class="muted">Agenda de pagos a socios · vencimientos y compromisos</p></div>' +
      '<button class="btn btn-primary" id="btnNewDist">' + UI.icon('plus', 16) + 'Nueva liquidación</button>' +
      '</div>' +
      '<div class="table-wrap"><table class="data-table">' +
      '<thead><tr><th>Período</th><th>Fecha</th><th class="num">Monto</th><th>Reparto</th><th>Estado</th><th></th></tr></thead>' +
      '<tbody>' +
      S.data.distributions.slice().sort((a, b) => b.date.localeCompare(a.date)).map(d => distRow(d)).join('') +
      '</tbody></table></div>' +
      '<div class="table-foot">' +
      '<span>Pagado: <b class="pos">' + UI.fmtMoney(ds.paid) + '</b></span>' +
      '<span>Pendiente: <b class="warning-text">' + UI.fmtMoney(ds.pending) + '</b></span>' +
      '<span>Saldo sin comprometer: <b>' + UI.fmtMoney(ds.remaining) + '</b></span>' +
      '</div></section>';

    view.querySelector('#reservePct').addEventListener('change', e => {
      const v = Math.max(0, Math.min(100, UI.readNum(e.target)));
      S.data.settings.reservePercent = v;
      S.save();
      UI.toast('Reserva actualizada al ' + v + '%');
      G.router.refresh();
    });
    view.querySelector('#btnNewDist').addEventListener('click', openDistModal);
    UI.on(view, 'tr[data-obra]', 'click', e => { location.hash = '#/obra/' + e.currentTarget.dataset.obra; });
    UI.on(view, '[data-pay]', 'click', e => {
      const id = e.target.closest('[data-pay]').dataset.pay;
      S.update('distributions', id, { status: 'pagada', paidDate: S.todayISO() });
      UI.toast('Liquidación marcada como pagada');
      G.router.refresh();
    });
    UI.on(view, '[data-del]', 'click', async e => {
      const id = e.target.closest('[data-del]').dataset.del;
      const ok = await UI.confirm({ title: 'Eliminar liquidación', message: '¿Eliminar esta liquidación del cronograma?', okLabel: 'Eliminar' });
      if (ok) { S.remove('distributions', id); UI.toast('Liquidación eliminada'); G.router.refresh(); }
    });
  }

  function distRow(d) {
    const isOver = d.status === 'pendiente' && d.date < S.todayISO();
    const chip = d.status === 'pagada'
      ? UI.chip('Pagada', 'success', 'check')
      : isOver ? UI.chip('Vencida', 'danger', 'alert-triangle')
      : UI.chip('Pendiente', 'warning', 'clock');
    const tip = (d.splits || []).map(s => s.name + ': ' + UI.fmtMoney(s.amount)).join(' · ');
    return '<tr class="' + (isOver ? 'row-overdue' : '') + '">' +
      '<td><strong>' + UI.escapeHtml(d.period) + '</strong>' + (d.notes ? '<div class="muted small">' + UI.escapeHtml(d.notes) + '</div>' : '') + '</td>' +
      '<td class="muted">' + UI.fmtDate(d.date) + (d.paidDate ? '<div class="muted small">Pagada el ' + UI.fmtDate(d.paidDate) + '</div>' : '') + '</td>' +
      '<td class="num"><b>' + UI.fmtMoney(d.amount) + '</b></td>' +
      '<td class="muted small" title="' + UI.escapeHtml(tip) + '">' + (d.splits || []).length + ' socios · aprox. ' + UI.fmtMoney(d.splits && d.splits[0] ? d.splits[0].amount : 0) + ' c/u</td>' +
      '<td>' + chip + '</td>' +
      '<td><div class="row-actions">' +
      (d.status === 'pendiente'
        ? '<button class="btn btn-soft-success btn-xs" data-pay="' + d.id + '">' + UI.icon('check', 14) + 'Marcar pagada</button>'
        : '') +
      '<button class="icon-btn sm danger" data-del="' + d.id + '" title="Eliminar">' + UI.icon('trash', 15) + '</button>' +
      '</div></td></tr>';
  }

  function openDistModal() {
    const ds = S.distributionSummary();
    const suggested = ds.remaining > 0 ? ds.remaining : ds.available;
    const m = UI.openModal({
      title: 'Nueva liquidación a socios',
      subtitle: 'El reparto se calcula con los porcentajes actuales de participación.',
      body:
        '<div class="grid-form">' +
        '<div class="field"><label>Período</label><input class="input" id="fPeriod" placeholder="Ej.: Septiembre 2025" value="' + S.monthLabel(S.todayISO()) + '"></div>' +
        '<div class="field"><label>Fecha de pago</label><input class="input" type="date" id="fDate" value="' + S.todayISO() + '"></div>' +
        '<div class="field"><label>Monto total ($) *</label><input class="input" type="number" id="fAmount" min="0" step="1000" value="' + Math.round(suggested) + '"></div>' +
        '<div class="field"><label>Método</label><select class="select" id="fMethod">' + S.METODOS.map(mt => '<option>' + mt + '</option>').join('') + '</select></div>' +
        '<div class="field span-2"><label>Notas</label><input class="input" id="fNotes" placeholder="Opcional"></div>' +
        '</div>' +
        '<div class="card-inset">' +
        '<h4>Vista previa del reparto</h4>' +
        '<div id="splitList"></div>' +
        '</div>',
      footer: '<button class="btn btn-ghost" data-cancel>Cancelar</button><button class="btn btn-primary" data-save>' + UI.icon('check', 15) + 'Crear liquidación</button>',
    });

    const upd = () => {
      const amount = UI.readNum(m.panel.querySelector('#fAmount'));
      const splits = S.splitsFor(amount);
      m.panel.querySelector('#splitList').innerHTML = splits.map(s =>
        '<div class="split-row"><span>' + UI.escapeHtml(s.name) + '</span><b class="pos">' + UI.fmtMoney(s.amount) + '</b></div>'
      ).join('');
    };
    m.panel.querySelector('#fAmount').addEventListener('input', upd);
    upd();

    m.panel.querySelector('[data-cancel]').addEventListener('click', m.close);
    m.panel.querySelector('[data-save]').addEventListener('click', () => {
      const amount = UI.readNum(m.panel.querySelector('#fAmount'));
      const date = m.panel.querySelector('#fDate').value || S.todayISO();
      if (amount <= 0) { UI.toast('Ingresá un monto mayor a cero', 'error'); return; }
      S.add('distributions', {
        period: m.panel.querySelector('#fPeriod').value.trim() || S.monthLabel(date),
        date,
        amount,
        status: 'pendiente',
        paidDate: null,
        method: m.panel.querySelector('#fMethod').value,
        splits: S.splitsFor(amount),
        notes: m.panel.querySelector('#fNotes').value.trim(),
      });
      UI.toast('Liquidación agregada al cronograma');
      m.close();
      G.router.refresh();
    });
  }
})(typeof window !== 'undefined' ? window : globalThis);
