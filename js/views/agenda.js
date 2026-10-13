/* ============================================================
   GADU · Vista: Agenda (calendario operativo)
   Compromisos con fecha y hora: visitas a obras/clientes,
   entregas de materiales y eventos clave, con avisos.
   ============================================================ */
(function (root) {
  'use strict';
  const G = root.GADU, S = G.store, UI = G.ui;
  const state = { q: '', tipo: 'todos', estado: 'pendientes' };

  G.router.add('agenda', 'agenda', 'Agenda', 'Calendario operativo: visitas, entregas y eventos con avisos', render);

  const TIPOS = {
    visita: ['Visita', 'info', 'map-pin'],
    entrega: ['Entrega', 'primary', 'truck'],
    evento: ['Evento', 'violet', 'calendar'],
  };

  function hoy() { return S.todayISO(); }

  function filtered() {
    const q = state.q.toLowerCase();
    return S.data.compromisos.slice().filter(c => {
      const con = c.contactoId ? S.contactById(c.contactoId) : null;
      const hay = (c.titulo + ' ' + (c.lugar || '') + ' ' + (con ? con.name : '') + ' ' + (c.notas || '')).toLowerCase();
      return (state.tipo === 'todos' || c.tipo === state.tipo) &&
        (state.estado === 'todos' || (state.estado === 'hechos') === (c.estado === 'hecho')) &&
        (!q || hay.includes(q));
    });
  }

  function vigencia(c) {
    if (c.estado === 'hecho') return 'hecho';
    if (c.fecha < hoy()) return 'vencido';
    if (c.fecha === hoy()) return 'hoy';
    return 'proximo';
  }

  function render(view) {
    const all = S.data.compromisos;
    const pendHoy = all.filter(c => vigencia(c) === 'hoy').length;
    const vencidos = all.filter(c => vigencia(c) === 'vencido').length;
    const semana = all.filter(c => vigencia(c) === 'proximo' && c.fecha <= S.daysAhead(7)).length;
    view.innerHTML =
      '<section class="kpi-grid kpi-3">' +
      kpi('clock', pendHoy ? 'info' : 'neutral', 'Compromisos hoy', String(pendHoy), 'Visitas, entregas y eventos del día') +
      kpi('alert-triangle', vencidos ? 'danger' : 'neutral', 'Vencidos sin cerrar', String(vencidos), vencidos ? 'Requieren tu atención' : 'Todo al día') +
      kpi('calendar', 'violet', 'Próximos 7 días', String(semana), 'Compromisos en la semana') +
      '</section>' +
      '<div class="toolbar">' +
      '<div class="search">' + UI.icon('search', 16) + '<input id="fq" class="input" placeholder="Buscar compromiso, lugar o contacto…" value="' + UI.escapeHtml(state.q) + '"></div>' +
      '<select id="ftipo" class="select" style="max-width:150px">' +
      '<option value="todos"' + (state.tipo === 'todos' ? ' selected' : '') + '>Todos los tipos</option>' +
      '<option value="visita"' + (state.tipo === 'visita' ? ' selected' : '') + '>Visitas</option>' +
      '<option value="entrega"' + (state.tipo === 'entrega' ? ' selected' : '') + '>Entregas</option>' +
      '<option value="evento"' + (state.tipo === 'evento' ? ' selected' : '') + '>Eventos</option>' +
      '</select>' +
      '<select id="fest" class="select" style="max-width:150px">' +
      '<option value="pendientes"' + (state.estado === 'pendientes' ? ' selected' : '') + '>Pendientes</option>' +
      '<option value="hechos"' + (state.estado === 'hechos' ? ' selected' : '') + '>Hechos</option>' +
      '<option value="todos"' + (state.estado === 'todos' ? ' selected' : '') + '>Todos</option>' +
      '</select>' +
      '<div class="grow"></div>' +
      '<button class="btn btn-primary" id="btnNew">' + UI.icon('calendar-plus', 16) + 'Nuevo compromiso</button>' +
      '</div>' +
      '<div id="listWrap">' + listHTML(filtered()) + '</div>';

    view.querySelector('#fq').addEventListener('input', e => { state.q = e.target.value; updateList(view); });
    view.querySelector('#ftipo').addEventListener('change', e => { state.tipo = e.target.value; updateList(view); });
    view.querySelector('#fest').addEventListener('change', e => { state.estado = e.target.value; updateList(view); });
    view.querySelector('#btnNew').addEventListener('click', () => openCompromisoModal());
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

  function fmtFecha(d) {
    if (d === hoy()) return '📌 Hoy';
    if (d === S.daysAhead(1)) return 'Mañana';
    const fecha = new Date(d + 'T12:00:00');
    const nm = fecha.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
    return nm.charAt(0).toUpperCase() + nm.slice(1) + (d < hoy() ? ' (vencido)' : '');
  }

  function listHTML(list) {
    if (!list.length) {
      return '<div class="card">' + UI.emptyState('calendar', 'Sin compromisos para este filtro', 'Cargá una visita, entrega o evento con el botón "Nuevo compromiso".') + '</div>';
    }
    /* Agrupar por fecha, primero los vencidos, luego hoy y próximos */
    const grupos = {};
    list.slice().sort((a, b) => (a.fecha + ' ' + (a.hora || '')).localeCompare(b.fecha + ' ' + (b.hora || ''))).forEach(c => {
      (grupos[c.fecha] = grupos[c.fecha] || []).push(c);
    });
    return Object.keys(grupos).map(f => {
      const items = grupos[f].sort((a, b) => (a.hora || '').localeCompare(b.hora || ''));
      return '<h3 class="list-date">' + fmtFecha(f) + '</h3>' +
        '<div class="cards-grid">' + items.map(compromisoCard).join('') + '</div>';
    }).join('');
  }

  function compromisoCard(c) {
    const tl = TIPOS[c.tipo] || ['Compromiso', 'neutral', 'calendar'];
    const vg = vigencia(c);
    const con = c.contactoId ? S.contactById(c.contactoId) : null;
    const aviso = vg === 'vencido'
      ? UI.chip('⚠ Vencido', 'danger', 'alert-triangle')
      : vg === 'hoy' && c.estado !== 'hecho'
        ? UI.chip('📌 Hoy', 'info', 'clock')
        : '';
    const hecho = c.estado === 'hecho';
    return '<article class="contact-card" style="' + (vg === 'vencido' ? 'border-color:var(--danger)' : '') + '" data-id="' + c.id + '">' +
      '<div class="contact-head">' +
      '<span class="asset-ico">' + UI.icon(tl[2], 20) + '</span>' +
      '<div class="contact-info"><strong>' + UI.escapeHtml(c.titulo) + '</strong>' +
      '<span>' + tl[0] + (c.hora ? ' · ' + UI.escapeHtml(c.hora) + ' hs' : '') + (con ? ' · ' + UI.escapeHtml(con.name) : '') + '</span></div>' +
      '</div>' +
      '<div class="contact-chips">' + UI.chip(tl[0], tl[1], tl[2]) + aviso + (hecho ? UI.chip('Hecho', 'success', 'check-circle') : UI.chip('Pendiente', 'warning', 'clock')) + '</div>' +
      (c.lugar ? '<div class="contact-address">' + UI.icon('map-pin', 13) + UI.escapeHtml(c.lugar) + '</div>' : '') +
      (c.notas ? '<div class="muted small">' + UI.escapeHtml(c.notas) + '</div>' : '') +
      '<div class="contact-actions">' +
      (!hecho ? '<button class="btn btn-soft-success btn-sm" data-done="' + c.id + '">' + UI.icon('check', 14) + 'Marcar hecho</button>' : '') +
      '<div class="spacer"></div>' +
      '<button class="icon-btn sm" data-edit="' + c.id + '" title="Editar">' + UI.icon('edit', 15) + '</button>' +
      '<button class="icon-btn sm danger" data-del="' + c.id + '" title="Eliminar">' + UI.icon('trash', 15) + '</button>' +
      '</div></article>';
  }

  function bindList(wrap) {
    UI.on(wrap, '[data-done]', 'click', e => {
      const id = e.target.closest('[data-done]').dataset.done;
      S.update('compromisos', id, { estado: 'hecho' });
      UI.toast('Compromiso marcado como hecho');
      G.router.refresh();
    });
    UI.on(wrap, '[data-edit]', 'click', e => openCompromisoModal(S.data.compromisos.find(c => c.id === e.target.closest('[data-edit]').dataset.edit)));
    UI.on(wrap, '[data-del]', 'click', async e => {
      const c = S.data.compromisos.find(x => x.id === e.target.closest('[data-del]').dataset.del);
      if (!c) return;
      const ok = await UI.confirm({ title: 'Eliminar compromiso', message: '¿Eliminar <strong>' + UI.escapeHtml(c.titulo) + '</strong> de la agenda?', okLabel: 'Eliminar' });
      if (ok) { S.remove('compromisos', c.id); UI.toast('Compromiso eliminado'); G.router.refresh(); }
    });
  }

  function openCompromisoModal(c) {
    const isEdit = !!c;
    const m = UI.openModal({
      title: isEdit ? 'Editar compromiso' : 'Nuevo compromiso',
      subtitle: 'Visitas a obras/clientes, entregas de materiales y eventos clave.',
      body:
        '<div class="grid-form">' +
        '<div class="field"><label>Tipo *</label><select class="select" id="fTipo">' +
        '<option value="visita"' + (!c || c.tipo === 'visita' ? ' selected' : '') + '>Visita a obra / cliente</option>' +
        '<option value="entrega"' + ((c && c.tipo === 'entrega') ? ' selected' : '') + '>Entrega de materiales</option>' +
        '<option value="evento"' + ((c && c.tipo === 'evento') ? ' selected' : '') + '>Evento clave</option>' +
        '</select></div>' +
        '<div class="field"><label>Estado</label><select class="select" id="fEstado">' +
        '<option value="pendiente"' + (!c || c.estado !== 'hecho' ? ' selected' : '') + '>Pendiente</option>' +
        '<option value="hecho"' + ((c && c.estado === 'hecho') ? ' selected' : '') + '>Hecho</option>' +
        '</select></div>' +
        '<div class="field"><label>Fecha *</label><input class="input" type="date" id="fFecha" value="' + (c ? c.fecha : hoy()) + '"></div>' +
        '<div class="field"><label>Hora</label><input class="input" type="time" id="fHora" value="' + (c ? (c.hora || '') : '09:00') + '"></div>' +
        '<div class="field span-2"><label>Compromiso *</label><input class="input" id="fTitulo" value="' + UI.escapeHtml(c ? c.titulo : '') + '" placeholder="Ej.: Visitar la obra del quincho, entregar 20 bolsas de cemento…"></div>' +
        '<div class="field span-2"><label>Lugar</label><input class="input" id="fLugar" value="' + UI.escapeHtml(c ? c.lugar : '') + '" placeholder="Dirección o referencia"></div>' +
        '<div class="field span-2"><label>Contacto relacionado</label><select class="select" id="fCon">' +
        UI.selectOptions(S.data.contacts.map(x => ({ v: x.id, l: x.name })), c ? c.contactoId : '', true, 'Sin contacto') +
        '</select></div>' +
        '<div class="field span-2"><label>Notas</label><textarea class="textarea" id="fNotas" rows="2" placeholder="Qué llevar, con quién hablar…">' + UI.escapeHtml(c ? c.notas : '') + '</textarea></div>' +
        '</div>',
      footer: '<button class="btn btn-ghost" data-cancel>Cancelar</button><button class="btn btn-primary" data-save>' + (isEdit ? 'Guardar cambios' : 'Agregar compromiso') + '</button>',
    });
    m.panel.querySelector('[data-cancel]').addEventListener('click', m.close);
    m.panel.querySelector('[data-save]').addEventListener('click', () => {
      const titulo = m.panel.querySelector('#fTitulo').value.trim();
      const fecha = m.panel.querySelector('#fFecha').value;
      if (!titulo) { UI.toast('Ingresá el compromiso', 'error'); return; }
      if (!fecha) { UI.toast('Ingresá la fecha', 'error'); return; }
      const payload = {
        tipo: m.panel.querySelector('#fTipo').value,
        estado: m.panel.querySelector('#fEstado').value,
        fecha,
        hora: m.panel.querySelector('#fHora').value,
        titulo,
        lugar: m.panel.querySelector('#fLugar').value.trim(),
        contactoId: m.panel.querySelector('#fCon').value || null,
        notas: m.panel.querySelector('#fNotas').value.trim(),
      };
      if (isEdit) {
        S.update('compromisos', c.id, payload);
        UI.toast('Compromiso actualizado');
      } else {
        S.add('compromisos', payload);
        UI.toast('Compromiso agregado a la agenda');
      }
      m.close();
      G.router.refresh();
    });
  }
})(typeof window !== 'undefined' ? window : globalThis);
