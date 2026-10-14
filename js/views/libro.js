/* ============================================================
   GADU · Vista: Libro contable (consolidado, solo lectura)
   Historial unificado de ingresos + gastos en orden cronológico,
   balances por obra y totales generales. No altera registros.
   ============================================================ */
(function (root) {
  'use strict';
  const G = root.GADU, S = G.store, UI = G.ui;
  const state = { q: '', tipo: 'todos', work: 'todas', periodo: 'todo' };

  G.router.add('libro', 'libro', 'Libro contable', 'Todos los movimientos: ingresos y gastos en un solo lugar', render);

  function iso(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + dd;
  }
  /* Corte de período (fecha mínima incluida; null = sin filtro) */
  function since(periodo) {
    if (!periodo || periodo === 'todo') return null;
    if (periodo === 'mes') return S.todayISO().slice(0, 8) + '01';
    const n = { '3m': 3, '6m': 6, '12m': 12 }[periodo] || 0;
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - (n - 1));
    return iso(d);
  }

  /* Movimientos consolidados (ingresos + gastos), cronológicos */
  function movements() {
    const out = [];
    (S.data.incomes || []).forEach(x => out.push({
      id: x.id, date: x.date || '', tipo: 'ingreso',
      concepto: x.concept || 'Cobro', detalle: x.incomeKind === 'adelanto' ? 'Adelanto' : (x.method || ''),
      obra: x.workId || null, monto: Number(x.amount) || 0,
    }));
    (S.data.expenses || []).forEach(x => out.push({
      id: x.id, date: x.date || '', tipo: 'gasto',
      concepto: x.description || x.category || 'Gasto', detalle: x.category || '',
      obra: x.workId || null, monto: -(Number(x.amount) || 0),
    }));
    out.sort((a, b) => b.date.localeCompare(a.date));
    return out;
  }

  function filtered() {
    const q = state.q.toLowerCase();
    const desde = since(state.periodo);
    return movements().filter(m => {
      if (desde && m.date < desde) return false;
      if (state.tipo !== 'todos' && m.tipo !== state.tipo) return false;
      if (state.work !== 'todas' && (m.obra || null) !== state.work) return false;
      if (!q) return true;
      const w = m.obra ? S.data.works.find(wk => wk.id === m.obra) : null;
      return (m.concepto + ' ' + m.detalle + ' ' + (w ? w.name : '')).toLowerCase().includes(q);
    });
  }

  function render(view) {
    view.innerHTML =
      kpis() +
      '<div class="toolbar">' +
      '<div class="search">' + UI.icon('search', 16) + '<input id="fq" class="input" placeholder="Buscar concepto, obra o categoría…" value="' + UI.escapeHtml(state.q) + '"></div>' +
      '<select id="ftipo" class="select" style="max-width:150px">' +
      '<option value="todos"' + (state.tipo === 'todos' ? ' selected' : '') + '>Todo</option>' +
      '<option value="ingreso"' + (state.tipo === 'ingreso' ? ' selected' : '') + '>Solo ingresos</option>' +
      '<option value="gasto"' + (state.tipo === 'gasto' ? ' selected' : '') + '>Solo gastos</option>' +
      '</select>' +
      '<select id="fwork" class="select" style="max-width:200px">' +
      '<option value="todas"' + (state.work === 'todas' ? ' selected' : '') + '>Todas las obras</option>' +
      S.data.works.map(w => '<option value="' + w.id + '"' + (state.work === w.id ? ' selected' : '') + '>' + UI.escapeHtml(w.code + ' · ' + w.name) + '</option>').join('') +
      '</select>' +
      '<select id="fper" class="select" style="max-width:160px">' +
      '<option value="todo"' + (state.periodo === 'todo' ? ' selected' : '') + '>Todo el tiempo</option>' +
      '<option value="mes"' + (state.periodo === 'mes' ? ' selected' : '') + '>Este mes</option>' +
      '<option value="3m"' + (state.periodo === '3m' ? ' selected' : '') + '>Últimos 3 meses</option>' +
      '<option value="6m"' + (state.periodo === '6m' ? ' selected' : '') + '>Últimos 6 meses</option>' +
      '<option value="12m"' + (state.periodo === '12m' ? ' selected' : '') + '>Últimos 12 meses</option>' +
      '</select>' +
      '<button class="btn btn-soft btn-sm" id="btnCsv">' + UI.icon('download', 15) + 'Exportar CSV</button>' +
      '</div>' +
      '<div id="listWrap">' + listHTML(filtered()) + '</div>';

    view.querySelector('#fq').addEventListener('input', e => { state.q = e.target.value; updateList(view); });
    view.querySelector('#ftipo').addEventListener('change', e => { state.tipo = e.target.value; updateList(view); });
    view.querySelector('#fwork').addEventListener('change', e => { state.work = e.target.value; updateList(view); });
    view.querySelector('#fper').addEventListener('change', e => { state.periodo = e.target.value; updateList(view); });
    view.querySelector('#btnCsv').addEventListener('click', exportCSV);
  }

  function updateList(view) {
    view.querySelector('#listWrap').innerHTML = listHTML(filtered());
  }

  function kpis() {
    const movs = filtered();
    const ing = S.sum(movs.filter(m => m.tipo === 'ingreso').map(m => m.monto));
    const gas = S.sum(movs.filter(m => m.tipo === 'gasto').map(m => -m.monto));
    const neto = ing - gas;
    return '<section class="kpi-grid kpi-3">' +
      kpi('trending-up', 'success', 'Ingresos (filtrados)', UI.fmtMoney(ing), movs.filter(m => m.tipo === 'ingreso').length + ' cobros') +
      kpi('receipt', 'danger', 'Gastos (filtrados)', UI.fmtMoney(gas), movs.filter(m => m.tipo === 'gasto').length + ' egresos') +
      kpi('activity', neto >= 0 ? 'success' : 'danger', 'Balance neto', UI.fmtMoney(neto), 'Ingresos − Gastos') +
      '</section>';
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

  /* Nombre de obra compacto para pantallas chicas: los nombres largos se
     recortan con "…" (el nombre completo queda en el tooltip) para no
     saturar la vista móvil y priorizar montos y conceptos. */
  function workShort(full) {
    if (!full) return 'General';
    return full.length > 26 ? full.slice(0, 25).trimEnd() + '…' : full;
  }

  function listHTML(list) {
    const porObra = balancesPorObra(list);
    const cards = porObra.map(b =>
      '<div class="card">' +
      '<div class="split-row"><span title="' + UI.escapeHtml(b.name) + '"><b>' + UI.escapeHtml(workShort(b.name)) + '</b></span>' +
      '<b class="' + (b.neto >= 0 ? 'pos' : 'neg') + '">' + UI.fmtMoney(b.neto) + '</b></div>' +
      '<div class="split-row muted small"><span>+ ' + UI.fmtMoney(b.inc) + ' cobrado</span><span>− ' + UI.fmtMoney(b.gas) + ' gastado</span></div>' +
      '</div>').join('');
    const tabla = '<div class="card table-card">' +
      '<div class="table-wrap"><table class="data-table">' +
      '<thead><tr><th>Fecha</th><th>Tipo</th><th>Concepto</th><th>Detalle</th><th>Obra</th><th class="num">Monto</th></tr></thead>' +
      '<tbody>' +
      (list.map(m => {
        const w = m.obra ? S.data.works.find(wk => wk.id === m.obra) : null;
        const obraFull = w ? (w.code || '') + ' · ' + w.name : '';
        return '<tr>' +
          '<td class="muted">' + UI.fmtDate(m.date) + '</td>' +
          '<td>' + (m.tipo === 'ingreso'
            ? UI.chip('Ingreso', 'success', 'arrow-down-left')
            : UI.chip('Gasto', 'danger', 'arrow-up-right')) + '</td>' +
          '<td><strong>' + UI.escapeHtml(m.concepto) + '</strong></td>' +
          '<td class="muted">' + UI.escapeHtml(m.detalle || '—') + '</td>' +
          '<td><span style="max-width:170px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:inline-block;vertical-align:middle"' + (obraFull ? ' title="' + UI.escapeHtml(obraFull) + '"' : '') + '>' + UI.escapeHtml(workShort(obraFull)) + '</span></td>' +
          '<td class="num ' + (m.monto >= 0 ? 'pos' : 'neg') + '"><b>' + (m.monto >= 0 ? '+' : '−') + UI.fmtMoney(Math.abs(m.monto)) + '</b></td>' +
          '</tr>';
      }).join('') || '<tr><td colspan="6">' + UI.emptyState('book', 'Sin movimientos para este filtro', 'Probá con otro período, obra o tipo de movimiento.') + '</td></tr>') +
      '</tbody></table></div>' +
      '<div class="table-foot"><span>' + list.length + ' movimiento' + (list.length !== 1 ? 's' : '') + '</span>' +
      '<span>Balance: <b class="' + (S.sum(list.map(m => m.monto)) >= 0 ? 'pos' : 'neg') + '">' + UI.fmtMoney(S.sum(list.map(m => m.monto))) + '</b></span></div></div>';
    return (cards
      ? '<section class="cards-grid" style="grid-template-columns:repeat(auto-fill,minmax(230px,1fr))">' + cards + '</section>'
      : '') + tabla;
  }

  /* Balances actualizados por obra (movimientos filtrados) + generales */
  function balancesPorObra(list) {
    const out = [];
    S.data.works.forEach(w => {
      const mine = list.filter(m => m.obra === w.id);
      if (!mine.length) return;
      const inc = S.sum(mine.filter(m => m.tipo === 'ingreso').map(m => m.monto));
      const gas = S.sum(mine.filter(m => m.tipo === 'gasto').map(m => -m.monto));
      out.push({ name: w.code + ' · ' + w.name, inc, gas, neto: inc - gas });
    });
    const gen = list.filter(m => !m.obra && m.tipo === 'gasto');
    if (gen.length) {
      const gas = S.sum(gen.map(m => -m.monto));
      out.push({ name: 'Gastos generales (sin obra)', inc: 0, gas, neto: -gas });
    }
    out.sort((a, b) => b.neto - a.neto);
    return out;
  }

  function exportCSV() {
    const rows = [['Fecha', 'Tipo', 'Concepto', 'Detalle', 'Obra', 'Monto']];
    filtered().forEach(m => {
      const w = m.obra ? S.data.works.find(wk => wk.id === m.obra) : null;
      rows.push([m.date, m.tipo === 'ingreso' ? 'Ingreso' : 'Gasto', m.concepto, m.detalle || '', w ? w.name : 'General', String(Number(m.monto) || 0)]);
    });
    UI.csv('gadu-libro-contable.csv', rows);
    UI.toast('CSV del libro contable exportado');
  }
})(typeof window !== 'undefined' ? window : globalThis);
