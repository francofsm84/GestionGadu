/* ============================================================
   GADU · Vista: Jornadas y Asistencia
   Panel de control con TODAS las jornadas cargadas del personal
   (las que se registran por el asistente o desde Empleados).
   ============================================================ */
(function (root) {
  'use strict';
  const G = root.GADU, S = G.store, UI = G.ui;
  const state = { q: '', mes: 'todos', work: 'todas' };

  G.router.add('jornadas', 'jornadas', 'Jornadas y Asistencia', 'Todas las jornadas cargadas del personal, con horas por obra', render);

  const hoyISO = () => S.todayISO();
  const mesKey = () => S.todayISO().slice(0, 7);

  function meses() {
    const out = [];
    S.data.attendance.forEach(a => {
      const k = (a.date || '').slice(0, 7);
      if (k && out.indexOf(k) < 0) out.push(k);
    });
    return out.sort().reverse();
  }

  function filtered() {
    const q = state.q.toLowerCase();
    return S.data.attendance.slice().sort((a, b) => b.date.localeCompare(a.date)).filter(a => {
      const emp = S.employeeById(a.employeeId);
      const eName = emp ? S.employeeName(emp) : '';
      const obras = (a.hours || []).map(h => {
        const w = S.data.works.find(x => x.id === h.workId);
        return w ? w.name : '';
      }).join(' ');
      const hay = (a.date + ' ' + eName + ' ' + obras + ' ' + (a.notes || '')).toLowerCase();
      return (state.mes === 'todos' || (a.date || '').slice(0, 7) === state.mes) &&
        (!q || hay.includes(q));
    });
  }

  function render(view) {
    const hoy = hoyISO();
    const presentesHoy = S.data.attendance.filter(a => a.date === hoy && a.status === 'presente').length;
    const mes = S.data.attendance.filter(a => (a.date || '').slice(0, 7) === mesKey() && a.status === 'presente').length;
    const horasMes = S.sum(S.data.attendance.filter(a => (a.date || '').slice(0, 7) === mesKey()).flatMap(a => (a.hours || []).map(h => h.hours)));
    view.innerHTML =
      '<section class="kpi-grid kpi-3">' +
      kpi('check-circle', 'violet', 'Presentes hoy', String(presentesHoy), 'Jornadas cargadas para hoy') +
      kpi('calendar', 'info', 'Jornadas este mes', String(mes), 'Días con asistencia registrada') +
      kpi('clock', 'success', 'Horas este mes', String(horasMes), 'Suma de horas por obra') +
      '</section>' +
      '<div class="toolbar">' +
      '<div class="search">' + UI.icon('search', 16) + '<input id="fq" class="input" placeholder="Buscar por empleado, obra o fecha…" value="' + UI.escapeHtml(state.q) + '"></div>' +
      '<select id="fmes" class="select" style="max-width:180px">' +
      '<option value="todos"' + (state.mes === 'todos' ? ' selected' : '') + '>Todos los meses</option>' +
      meses().map(m => '<option value="' + m + '"' + (state.mes === m ? ' selected' : '') + '>' + m + '</option>').join('') +
      '</select>' +
      '<div class="grow"></div>' +
      '<button class="btn btn-soft-info" id="btnNew">' + UI.icon('calendar-plus', 16) + 'Registrar jornada</button>' +
      '</div>' +
      '<div id="listWrap">' + listHTML(filtered()) + '</div>';

    view.querySelector('#fq').addEventListener('input', e => { state.q = e.target.value; updateList(view); });
    view.querySelector('#fmes').addEventListener('change', e => { state.mes = e.target.value; updateList(view); });
    view.querySelector('#btnNew').addEventListener('click', () => { try { if (G.actions.attendance) G.actions.attendance(); } catch (e) {} });
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
    wrap.innerHTML = listHTML(filtered());
    bindList(wrap);
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
          '<td><strong>' + UI.escapeHtml(eName) + '</strong></td>' +
          '<td>' + (a.status === 'presente' ? UI.chip('Presente', 'success', 'check-circle') : UI.chip('Ausente', 'neutral', 'x-circle')) + '</td>' +
          '<td>' + (horas || '<span class="muted">—</span>') + '</td>' +
          '<td class="muted">' + UI.escapeHtml(a.notes || '—') + '</td>' +
          '<td class="num"><div class="row-actions" style="justify-content:flex-end">' +
          '<button class="icon-btn sm" data-edit="' + a.id + '" title="Editar">' + UI.icon('edit', 15) + '</button>' +
          '<button class="icon-btn sm danger" data-del="' + a.id + '" title="Eliminar">' + UI.icon('trash', 15) + '</button>' +
          '</div></td></tr>';
      }).join('') || '<tr><td colspan="6">' + UI.emptyState('calendar', 'Sin jornadas para este filtro', 'Registralas desde el botón "Registrar jornada" o por el asistente.') + '</td></tr>') +
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
})(typeof window !== 'undefined' ? window : globalThis);
