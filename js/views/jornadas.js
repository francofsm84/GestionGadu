/* ============================================================
   GADU · Vista: Jornadas y Asistencia
   Panel de control independiente (primer nivel del menú):
   filtros por obra y mes, métricas rápidas y carga rápida.
   ============================================================ */
(function (root) {
  'use strict';
  const G = root.GADU, S = G.store, UI = G.ui;
  const state = { q: '', mes: 'todos', work: 'todas' };

  G.router.add('jornadas', 'jornadas', 'Jornadas y Asistencia', 'Panel de control de jornadas del personal', render);

  const hoyISO = () => S.todayISO();

  function activas() { return S.data.works.filter(w => w.status === 'activa'); }

  function meses() {
    const out = [];
    S.data.attendance.forEach(a => {
      const k = (a.date || '').slice(0, 7);
      if (k && out.indexOf(k) < 0) out.push(k);
    });
    return out.sort().reverse();
  }

  /* Jornadas filtradas por obra + mes + búsqueda */
  function filtered() {
    const q = state.q.toLowerCase();
    return S.data.attendance.slice().sort((a, b) => b.date.localeCompare(a.date)).filter(a => {
      const okWork = state.work === 'todas' || (a.hours || []).some(h => h.workId === state.work);
      const okMes = state.mes === 'todos' || (a.date || '').slice(0, 7) === state.mes;
      const emp = S.employeeById(a.employeeId);
      const eName = emp ? S.employeeName(emp) : '';
      const obras = (a.hours || []).map(h => { const w = S.data.works.find(x => x.id === h.workId); return w ? w.name : ''; }).join(' ');
      const hay = (a.date + ' ' + eName + ' ' + obras + ' ' + (a.notes || '')).toLowerCase();
      return okWork && okMes && (!q || hay.includes(q));
    });
  }

  /* Métricas del período filtrado: horas, costo de mano de obra y personal activo */
  function metrics() {
    let horas = 0, costo = 0;
    const empIds = {};
    filtered().forEach(a => {
      if (a.status !== 'presente') return;
      empIds[a.employeeId] = true;
      (a.hours || []).forEach(h => {
        const hs = Number(h.hours) || 0;
        horas += hs;
        const emp = S.employeeById(a.employeeId);
        costo += hs * (emp ? (Number(emp.hourlyRate) || 0) : 0);
      });
    });
    return { horas, costo, personal: Object.keys(empIds).length };
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

  function kpisHTML() {
    const m = metrics();
    return '<section class="kpi-grid kpi-3">' +
      kpi('clock', 'info', 'Horas trabajadas', m.horas + ' hs', 'en el período filtrado') +
      kpi('wallet', 'success', 'Costo mano de obra', UI.fmtMoney(m.costo), 'estimado (tarifa × horas)') +
      kpi('users', 'warning', 'Personal activo', String(m.personal), 'empleados con jornadas') +
      '</section>';
  }

  function listHTML(list) {
    return '<div class="card table-card">' +
      '<div class="table-wrap"><table class="data-table">' +
      '<thead><tr><th>Fecha</th><th>Empleado</th><th>Estado</th><th>Obra · Horas</th><th>Notas</th><th class="num"></th></tr></thead>' +
      '<tbody>' +
      (list.map(a => {
        const emp = S.employeeById(a.employeeId);
        const eName = emp ? S.employeeName(emp) : '—';
        const horas = (a.hours || []).map(h => {
          const w = S.data.works.find(x => x.id === h.workId);
          return '<div class="split-row" style="gap:8px"><span>' + UI.escapeHtml(w ? w.name : 'General') + '</span><b>' + (Number(h.hours) || 0) + ' hs</b></div>';
        }).join('');
        return '<tr>' +
          '<td class="muted">' + UI.fmtDate(a.date) + '</td>' +
          '<td>' + (emp
            ? '<a class="emp-link" href="#/empleado/' + emp.id + '" title="Ver legajo de ' + UI.escapeHtml(eName) + '">' + UI.escapeHtml(eName) + '</a>'
            : '<strong>' + UI.escapeHtml(eName) + '</strong>') + '</td>' +
          '<td>' + (a.status === 'presente' ? UI.chip('Presente', 'success', 'check-circle') : UI.chip('Ausente', 'neutral', 'x-circle')) + '</td>' +
          '<td>' + (horas || '<span class="muted">—</span>') + '</td>' +
          '<td class="muted">' + UI.escapeHtml(a.notes || '—') + '</td>' +
          '<td class="num"><div class="row-actions" style="justify-content:flex-end">' +
          '<button class="icon-btn sm" data-edit="' + a.id + '" title="Editar">' + UI.icon('edit', 15) + '</button>' +
          '<button class="icon-btn sm danger" data-del="' + a.id + '" title="Eliminar">' + UI.icon('trash', 15) + '</button>' +
          '</div></td></tr>';
      }).join('') || '<tr><td colspan="6">' + UI.emptyState('calendar', 'Sin jornadas para este filtro', 'Registralas con "Registrar jornada" o por el asistente.') + '</td></tr>') +
      '</tbody></table></div>' +
      '<div class="table-foot"><span>' + list.length + ' jornada' + (list.length !== 1 ? 's' : '') + '</span></div></div>';
  }

  function bindList(wrap) {
    UI.on(wrap, '[data-edit]', 'click', e => {
      const a = S.data.attendance.find(x => x.id === e.target.closest('[data-edit]').dataset.edit);
      try { if (a && G.actions.attendance) G.actions.attendance({ attendance: a }); } catch (e2) {}
    });
    UI.on(wrap, '[data-del]', 'click', async e => {
      const a = S.data.attendance.find(x => x.id === e.target.closest('[data-del]').dataset.del);
      if (!a) return;
      const emp = S.employeeById(a.employeeId);
      const ok = await UI.confirm({
        title: 'Eliminar jornada',
        message: '¿Eliminar la jornada del ' + UI.fmtDate(a.date) + (emp ? ' de <strong>' + UI.escapeHtml(S.employeeName(emp)) + '</strong>' : '') + '?',
        okLabel: 'Eliminar',
      });
      if (ok) { S.remove('attendance', a.id); UI.toast('Jornada eliminada'); G.router.refresh(); }
    });
  }

  /* Actualiza solo KPIs + tabla (sin perder el foco del buscador) */
  function refresh(view) {
    const kw = view.querySelector('#kpiWrap');
    if (kw) kw.innerHTML = kpisHTML();
    const wrap = view.querySelector('#listWrap');
    if (wrap) { wrap.innerHTML = listHTML(filtered()); bindList(wrap); }
  }

  function render(view) {
    const acts = activas();
    const mesOpts = meses();
    view.innerHTML =
      '<div class="toolbar">' +
      '<div class="search">' + UI.icon('search', 16) + '<input id="jq" class="input" placeholder="Buscar empleado, obra, nota…" value="' + UI.escapeHtml(state.q) + '"></div>' +
      '<select id="jWork" class="select" style="max-width:190px"><option value="todas">Obra: todas</option>' + acts.map(w => '<option value="' + w.id + '"' + (state.work === w.id ? ' selected' : '') + '>' + UI.escapeHtml(w.name || w.nombre) + '</option>').join('') + '</select>' +
      '<select id="jMes" class="select" style="max-width:140px"><option value="todos">Mes: todos</option>' + mesOpts.map(m => '<option value="' + m + '"' + (state.mes === m ? ' selected' : '') + '>' + m + '</option>').join('') + '</select>' +
      '<div class="grow"></div>' +
      '<button class="btn btn-soft" id="btnQuick">' + UI.icon('zap', 15) + ' Carga rápida por obra</button>' +
      '<button class="btn btn-primary" id="btnAtt">' + UI.icon('calendar-plus', 15) + ' Registrar jornada</button>' +
      '</div>' +
      '<div id="kpiWrap">' + kpisHTML() + '</div>' +
      '<div id="listWrap">' + listHTML(filtered()) + '</div>';

    view.querySelector('#jq').addEventListener('input', e => { state.q = e.target.value; refresh(view); });
    view.querySelector('#jWork').addEventListener('change', e => { state.work = e.target.value; refresh(view); });
    view.querySelector('#jMes').addEventListener('change', e => { state.mes = e.target.value; refresh(view); });
    view.querySelector('#btnAtt').addEventListener('click', () => { try { if (G.actions.attendance) G.actions.attendance(); } catch (e) {} });
    view.querySelector('#btnQuick').addEventListener('click', () => {
      const w = state.work !== 'todas' ? S.data.works.find(x => x.id === state.work) : null;
      try { if (G.actions.attendance) G.actions.attendance(w ? { workId: w.id } : {}); } catch (e) {}
    });
    bindList(view.querySelector('#listWrap'));
  }
})(typeof window !== 'undefined' ? window : globalThis);
