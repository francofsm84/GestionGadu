/* ============================================================
   GADU · Vista: Clientes
   Administración de clientes: listar, crear, editar y eliminar
   con datos de contacto, obras vinculadas y cobros
   ============================================================ */
(function (root) {
  'use strict';
  const G = root.GADU, S = G.store, UI = G.ui;
  const state = { q: '', view: 'tarjetas', selected: {} };
  let currentView = null;

  G.router.add('clientes', 'clientes', 'Clientes', 'Directorio de clientes: crear, editar y contactar', render);
  G.actions.client = openClientModal;

  function clients() {
    return S.data.contacts.filter(c => c.type === 'cliente').slice().sort((a, b) => a.name.localeCompare(b.name));
  }

  function filtered() {
    const q = state.q.toLowerCase();
    return clients().filter(c => {
      const hay = (c.name + ' ' + (c.company || '') + ' ' + (c.phone || '') + ' ' + (c.email || '') + ' ' + (c.address || '')).toLowerCase();
      return !q || hay.includes(q);
    });
  }

  function worksOf(clientId) {
    return S.data.works.filter(w => w.clientId === clientId);
  }

  function render(view) {
    currentView = view;
    const all = clients();
    const conActivas = all.filter(c => worksOf(c.id).some(w => w.status === 'activa')).length;
    const cobrado = S.sum(all.map(c => {
      return S.sum(worksOf(c.id).map(w => S.workStats(w.id).incomes));
    }));

    view.innerHTML =
      '<section class="kpi-grid kpi-4">' +
      kpi('briefcase', 'info', 'Clientes', String(all.length), 'En tu directorio') +
      kpi('hard-hat', 'success', 'Con obras activas', String(conActivas), 'Tienen trabajo en curso') +
      kpi('trending-up', 'violet', 'Cobrado de clientes', UI.fmtMoney(cobrado), 'Histórico de cobros') +
      kpi('calendar', 'warning', 'Obras por cliente', String(S.data.works.filter(w => w.clientId).length), 'Entre todos los clientes') +
      '</section>' +
      '<div class="toolbar">' +
      '<div class="search">' + UI.icon('search', 16) + '<input id="fq" class="input" placeholder="Buscar por nombre, teléfono, email o dirección…" value="' + UI.escapeHtml(state.q) + '"></div>' +
      '<div class="seg">' +
      '<button class="' + (state.view === 'tabla' ? 'active' : '') + '" data-view="tabla">Tabla</button>' +
      '<button class="' + (state.view === 'tarjetas' ? 'active' : '') + '" data-view="tarjetas">Tarjetas</button>' +
      '</div>' +
      '<div class="grow"></div>' +
      '<button class="btn btn-primary" id="btnNew">' + UI.icon('plus', 16) + 'Nuevo cliente</button>' +
      '</div>' +
      '<div id="bulkBar" class="bulk-bar" hidden></div>' +
      '<div id="listWrap">' + listHTML(filtered()) + '</div>';

    view.querySelector('#fq').addEventListener('input', e => { state.q = e.target.value; updateList(view); });
    view.querySelector('#btnNew').addEventListener('click', () => openClientModal());
    view.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => {
      state.view = b.dataset.view;
      view.querySelectorAll('[data-view]').forEach(x => x.classList.toggle('active', x.dataset.view === state.view));
      updateList(view);
    }));
    bindList(view.querySelector('#listWrap'));
    refreshBulkBar(view);
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
    refreshBulkBar(view);
  }

  function listHTML(list) {
    if (!list.length) {
      return '<div class="card">' + UI.emptyState('briefcase', 'No hay clientes que coincidan', 'Probá con otra búsqueda o creá un cliente nuevo.') + '</div>';
    }
    return state.view === 'tabla' ? tableHTML(list) : cardsHTML(list);
  }

  function cardsHTML(list) {
    return '<div class="cards-grid">' + list.map(clientCard).join('') + '</div>';
  }

  function tableHTML(list) {
    const allSel = list.length > 0 && list.every(c => state.selected[c.id]);
    return '<div class="card table-card"><div class="table-wrap"><table class="data-table">' +
      '<thead><tr>' +
      '<th class="chk"><input type="checkbox" id="selAll"' + (allSel ? ' checked' : '') + ' title="Seleccionar todos"></th>' +
      '<th>Cliente</th><th>Contacto</th><th>Obras</th><th class="num"></th>' +
      '</tr></thead>' +
      '<tbody>' + list.map(clientRow).join('') + '</tbody></table></div></div>';
  }

  function clientRow(c) {
    const ws = worksOf(c.id);
    const activas = ws.filter(w => w.status === 'activa').length;
    const checked = state.selected[c.id] ? ' checked' : '';
    return '<tr>' +
      '<td class="chk"><input type="checkbox" class="row-check" data-id="' + c.id + '"' + checked + '></td>' +
      '<td><strong>' + UI.escapeHtml(c.name) + '</strong><div class="muted small">' + UI.escapeHtml(c.company || '') + '</div></td>' +
      '<td>' + (c.phone ? '<div>' + UI.escapeHtml(c.phone) + '</div>' : '') + (c.email ? '<div class="muted small">' + UI.escapeHtml(c.email) + '</div>' : '') + '</td>' +
      '<td>' + (activas > 0 ? UI.chip(activas + ' activa' + (activas > 1 ? 's' : ''), 'success', 'hard-hat') : UI.chip(ws.length + ' obra' + (ws.length !== 1 ? 's' : ''), 'neutral', 'hard-hat')) + '</td>' +
      '<td class="num"><button class="icon-btn sm" data-edit="' + c.id + '" title="Editar">' + UI.icon('edit', 15) + '</button>' +
      '<button class="icon-btn sm danger" data-del="' + c.id + '" title="Eliminar">' + UI.icon('trash', 15) + '</button></td>' +
      '</tr>';
  }

  function clientCard(c) {
    const ws = worksOf(c.id);
    const activas = ws.filter(w => w.status === 'activa').length;
    const checked = state.selected[c.id] ? ' checked' : '';
    return '<article class="contact-card" data-id="' + c.id + '">' +
      '<input type="checkbox" class="row-check card-check" data-id="' + c.id + '"' + checked + ' title="Seleccionar">' +
      '<div class="contact-head">' +
      UI.avatar(c.name, 42, c.photo) +
      '<div class="contact-info"><strong>' + UI.escapeHtml(c.name) + '</strong>' +
      '<span>' + UI.escapeHtml(c.company || 'Cliente') + '</span></div>' +
      (activas > 0 ? UI.chip(activas + ' obra' + (activas > 1 ? 's' : '') + ' activa' + (activas > 1 ? 's' : ''), 'success', 'hard-hat') : UI.chip(ws.length + ' obra' + (ws.length !== 1 ? 's' : ''), 'neutral', 'hard-hat')) +
      '</div>' +
      (c.address ? '<div class="contact-address">' + UI.icon('map-pin', 13) + UI.escapeHtml(c.address) + '</div>' : '') +
      (c.email ? '<div class="contact-address">' + UI.icon('mail', 13) + UI.escapeHtml(c.email) + '</div>' : '') +
      '<div class="contact-actions">' +
      '<a class="icon-btn sm" href="' + UI.telLink(c.phone) + '" title="Llamar: ' + UI.escapeHtml(c.phone || '') + '">' + UI.icon('phone', 15) + '</a>' +
      '<a class="icon-btn sm" href="' + UI.waLink(c.whatsapp || c.phone) + '" target="_blank" rel="noopener" title="WhatsApp">' + UI.icon('whatsapp', 15) + '</a>' +
      (c.email ? '<a class="icon-btn sm" href="mailto:' + UI.escapeHtml(c.email) + '" title="E-mail">' + UI.icon('mail', 15) + '</a>' : '') +
      '<div class="spacer"></div>' +
      '<button class="icon-btn sm" data-edit="' + c.id + '" title="Editar">' + UI.icon('edit', 15) + '</button>' +
      '<button class="icon-btn sm danger" data-del="' + c.id + '" title="Eliminar">' + UI.icon('trash', 15) + '</button>' +
      '</div></article>';
  }

  function refreshBulkBar(view) {
    const bar = view ? view.querySelector('#bulkBar') : null;
    if (!bar) return;
    const n = Object.keys(state.selected).filter(id => state.selected[id]).length;
    bar.hidden = n === 0;
    bar.innerHTML = n
      ? '<button class="btn btn-soft-danger" id="btnBulkDel">🗑️ Eliminar seleccionados (' + n + ')</button>'
      : '';
    if (n) bar.querySelector('#btnBulkDel').addEventListener('click', bulkDelete);
  }

  async function bulkDelete() {
    const ids = Object.keys(state.selected).filter(id => state.selected[id]);
    if (!ids.length) return;
    const withWorks = ids.filter(id => worksOf(id).length > 0);
    const msg = '¿Eliminar <strong>' + ids.length + '</strong> cliente' + (ids.length !== 1 ? 's' : '') + '?' +
      (withWorks.length ? ' ⚠️ <strong>' + withWorks.length + '</strong> tienen obras vinculadas (quedarán "Sin cliente").' : '') +
      ' Esta acción no se puede deshacer.';
    const ok = await UI.confirm({ title: 'Eliminar seleccionados', message: msg, okLabel: 'Eliminar', tone: 'danger' });
    if (!ok) return;
    ids.forEach(id => S.remove('contacts', id));
    state.selected = {};
    UI.toast('Eliminados ' + ids.length + ' cliente(s)');
    G.router.refresh();
  }

  function bindList(wrap) {
    UI.on(wrap, '[data-edit]', 'click', e => openClientModal(S.data.contacts.find(c => c.id === e.target.closest('[data-edit]').dataset.edit)));
    UI.on(wrap, '[data-del]', 'click', async e => {
      const c = S.data.contacts.find(x => x.id === e.target.closest('[data-del]').dataset.del);
      if (!c) return;
      const ws = worksOf(c.id).length;
      const ok = await UI.confirm({
        title: 'Eliminar cliente',
        message: '¿Eliminar a <strong>' + UI.escapeHtml(c.name) + '</strong> del directorio?' + (ws ? ' Quedará como "Sin cliente" en ' + ws + ' obra' + (ws !== 1 ? 's' : '') + '.' : ''),
        okLabel: 'Eliminar',
      });
      if (ok) { S.remove('contacts', c.id); UI.toast('Cliente eliminado'); G.router.refresh(); }
    });
    /* Selección múltiple (checkboxes) en tabla y tarjetas */
    UI.on(wrap, '.row-check', 'change', e => {
      const cb = e.target.closest('.row-check');
      const id = cb.dataset.id;
      if (cb.checked) state.selected[id] = true; else delete state.selected[id];
      const master = wrap.querySelector('#selAll');
      if (master) master.checked = filtered().every(c => state.selected[c.id]);
      refreshBulkBar(currentView);
    });
    UI.on(wrap, '#selAll', 'change', e => {
      const checked = e.target.checked;
      filtered().forEach(c => { if (checked) state.selected[c.id] = true; else delete state.selected[c.id]; });
      updateList(currentView);
    });
  }

  /* ---------- Modal de cliente (también se usa desde Obras y Presupuestos) ---------- */
  function openClientModal(c, onSaved) {
    const isEdit = !!c;
    let photo = c ? (c.photo || null) : null;
    const m = UI.openModal({
      title: isEdit ? 'Editar cliente' : 'Nuevo cliente',
      subtitle: isEdit ? c.name : 'Registralo al vuelo: se guarda en el directorio y queda listo para usar.',
      body:
        '<div class="grid-form">' +
        '<div class="field"><label>Foto</label><div id="photoSlot"></div></div>' +
        '<div class="field"><label>Contacto</label><button type="button" class="btn btn-soft btn-sm" id="btnImportContact" style="margin-top:6px">📇 Importar desde contactos</button></div>' +
        '<div class="field span-2"><label>Nombre / Razón social *</label><input class="input" id="fName" value="' + UI.escapeHtml(c ? c.name : '') + '" placeholder="Ej.: Familia Rossi, Estudio Piemonte…"></div>' +
        '<div class="field span-2"><label>Teléfono / WhatsApp</label><input class="input" id="fPhone" value="' + UI.escapeHtml(c ? (c.whatsapp || c.phone) : '') + '" placeholder="+54 9 3547 … (teléfono y WhatsApp)"></div>' +
        '<div class="field"><label>E-mail</label><input class="input" id="fEmail" value="' + UI.escapeHtml(c ? c.email : '') + '" placeholder="cliente@ejemplo.com"></div>' +
        '<div class="field"><label>Dirección</label><input class="input" id="fAddr" value="' + UI.escapeHtml(c ? c.address : '') + '" placeholder="Barrio, ciudad"></div>' +
        '<div class="field span-2"><label>Notas</label><textarea class="textarea" id="fNotes" rows="2" placeholder="Referencias, condiciones de pago…">' + UI.escapeHtml(c ? c.notes : '') + '</textarea></div>' +
        '</div>',
      footer: '<button class="btn btn-ghost" data-cancel>Cancelar</button><button class="btn btn-primary" data-save>' + (isEdit ? 'Guardar cambios' : 'Agregar cliente') + '</button>',
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
        if (cc.name) m.panel.querySelector('#fName').value = cc.name;
        if (cc.phone) m.panel.querySelector('#fPhone').value = cc.phone;
        if (cc.email) m.panel.querySelector('#fEmail').value = cc.email;
        UI.toast('Datos del contacto cargados', 'info');
      } catch (err) {
        UI.toast((err && err.message) || 'No se pudo importar el contacto', 'error');
      }
    });
    m.panel.querySelector('[data-cancel]').addEventListener('click', m.close);
    m.panel.querySelector('[data-save]').addEventListener('click', () => {
      const name = m.panel.querySelector('#fName').value.trim();
      if (!name) { UI.toast('Ingresá el nombre o razón social', 'error'); return; }
      const payload = {
        type: 'cliente',
        name,
        company: c ? c.company : '',
        phone: m.panel.querySelector('#fPhone').value.trim(),
        whatsapp: m.panel.querySelector('#fPhone').value.trim(),   // campo unificado Teléfono / WhatsApp
        email: m.panel.querySelector('#fEmail').value.trim(),
        address: m.panel.querySelector('#fAddr').value.trim(),
        notes: m.panel.querySelector('#fNotes').value.trim(),
        photo: photo || null,
      };
      if (isEdit) {
        S.update('contacts', c.id, payload);
        UI.toast('Cliente actualizado');
        if (onSaved) onSaved(S.contactById(c.id));
      } else {
        const creado = S.add('contacts', payload);
        UI.toast('Cliente "' + creado.name + '" agregado');
        if (onSaved) onSaved(creado);
      }
      m.close();
      G.router.refresh();
    });
  }
})(typeof window !== 'undefined' ? window : globalThis);
