/* ============================================================
   GADU · Vista: Herramientas y equipamiento
   Registro de activos, compras, mantenimiento, ubicación
   (en obra o guardada) e historial de uso / rendimiento
   ============================================================ */
(function (root) {
  'use strict';
  const G = root.GADU, S = G.store, UI = G.ui;
  const state = { q: '', cat: 'todas' };

  G.router.add('herramientas', 'herramientas', 'Herramientas y equipos', 'Inventario, ubicación, mantenimiento y rendimiento de tus equipos', render);

  const ST_TONE = { 'operativo': ['Operativo', 'success'], 'en reparación': ['En reparación', 'warning'], 'dado de baja': ['Dado de baja', 'neutral'] };
  const CAT_ICON = {
    'Herramienta manual': 'wrench',
    'Herramienta eléctrica': 'zap',
    'Equipo mayor': 'layers',
    'Vehículo': 'truck',
    'Otros': 'box',
  };

  /* Estado unificado de la ficha: deriva de estado + ubicación actual */
  function estadoDe(a) {
    if (a.status === 'dado de baja') return ['Dado de baja', 'neutral', 'x-circle'];
    if (a.status === 'en reparación') return ['En mantenimiento', 'warning', 'wrench'];
    if (a.location) return ['Activa en uso', 'success', 'map-pin'];
    return ['En depósito', 'neutral', 'box'];
  }

  function filtered() {
    const q = state.q.toLowerCase();
    return S.data.assets.filter(a => {
      const prov = S.contactById(a.supplierId);
      const w = a.location ? S.data.works.find(x => x.id === a.location) : null;
      const hay = (a.name + ' ' + a.category + ' ' + (prov ? prov.name : '') + ' ' + (w ? w.name : '') + ' ' + (a.notes || '')).toLowerCase();
      return (state.cat === 'todas' || a.category === state.cat) && (!q || hay.includes(q));
    });
  }

  function maintOf(a) { return S.sum((a.maintenance || []).map(x => x.cost)); }

  function locHTML(a) {
    if (a.location) {
      const w = S.data.works.find(x => x.id === a.location);
      return UI.chip('En obra · ' + (w ? (w.code || '') + ' ' + w.name : '—'), 'success', 'map-pin');
    }
    return UI.chip('Guardada', 'neutral', 'box');
  }

  function render(view) {
    const t = S.totals();
    const op = S.data.assets.filter(a => a.status === 'operativo').length;
    const rep = S.data.assets.filter(a => a.status === 'en reparación').length;
    const enObra = S.data.assets.filter(a => a.location).length;
    view.innerHTML =
      '<section class="kpi-grid kpi-4">' +
      kpi('wrench', 'violet', 'Inversión total', UI.fmtMoney(t.assets), S.data.assets.length + ' activos registrados') +
      kpi('activity', 'warning', 'Mantenimiento acumulado', UI.fmtMoney(t.maint), 'Historial de reparaciones y service') +
      kpi('map-pin', 'success', 'En obra', String(enObra), S.data.assets.length - enObra + ' guardadas') +
      kpi('alert-triangle', rep ? 'danger' : 'neutral', 'En reparación', String(rep), rep ? 'Requieren atención' : 'Todo en orden') +
      '</section>' +
      '<div class="toolbar">' +
      '<div class="search">' + UI.icon('search', 16) + '<input id="fq" class="input" placeholder="Buscar herramienta, equipo u obra…" value="' + UI.escapeHtml(state.q) + '"></div>' +
      '<select id="fcat" class="select" style="max-width:210px">' +
      '<option value="todas"' + (state.cat === 'todas' ? ' selected' : '') + '>Todas las categorías</option>' +
      S.ASSET_CATS.map(c => '<option value="' + c + '"' + (state.cat === c ? ' selected' : '') + '>' + c + '</option>').join('') +
      '</select>' +
      '<div class="grow"></div>' +
      '<button class="btn btn-primary" id="btnNew">' + UI.icon('plus', 16) + 'Nuevo activo</button>' +
      '</div>' +
      '<div id="listWrap">' + listHTML(filtered()) + '</div>';

    view.querySelector('#fq').addEventListener('input', e => { state.q = e.target.value; updateList(view); });
    view.querySelector('#fcat').addEventListener('change', e => { state.cat = e.target.value; updateList(view); });
    view.querySelector('#btnNew').addEventListener('click', () => openAssetModal());
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
    if (!list.length) {
      return '<div class="card">' + UI.emptyState('wrench', 'No hay herramientas que coincidan', 'Probá con otra búsqueda o categoría.') + '</div>';
    }
    return '<div class="cards-grid">' + list.map(assetCard).join('') + '</div>';
  }

  function assetCard(a) {
    const est = estadoDe(a);
    const prov = S.contactById(a.supplierId);
    const m = (a.maintenance || []);
    const us = S.assetUsage(a);
    return '<article class="asset-card" data-id="' + a.id + '">' +
      '<div class="asset-head">' +
      '<span class="asset-ico">' + UI.icon(CAT_ICON[a.category] || 'box', 20) + '</span>' +
      '<div class="asset-info"><strong>' + UI.escapeHtml(a.name) + '</strong>' +
      '<span class="muted small">' + UI.escapeHtml(a.category) + '</span></div>' +
      UI.chip(est[0], est[1], est[2]) +
      '</div>' +
      '<div class="contact-chips">' + locHTML(a) + '</div>' +
      '<div class="muted small">' + UI.icon('calendar', 13) + ' Comprada el ' + UI.fmtDate(a.purchaseDate) +
      (prov ? ' · ' + UI.escapeHtml(prov.name) : '') + '</div>' +
      '<div class="asset-stats">' +
      '<span>Inversión<b>' + UI.fmtMoney(a.cost) + '</b></span>' +
      '<span>Mantenimiento<b>' + UI.fmtMoney(maintOf(a)) + '</b></span>' +
      '<span>Días en obra<b>' + us.totalDays + '</b></span>' +
      '<span>Intervenciones<b>' + m.length + '</b></span>' +
      '</div>' +
      '<div class="asset-foot">' +
      '<button class="btn btn-soft btn-sm" data-hist="' + a.id + '">' + UI.icon('eye', 14) + 'Historial</button>' +
      '<button class="btn btn-soft btn-sm" data-ubicar="' + a.id + '">' + UI.icon('map-pin', 14) + 'Mover / Estado</button>' +
      '<button class="btn btn-soft btn-sm" data-maint="' + a.id + '">' + UI.icon('wrench', 14) + 'Mant.</button>' +
      '<div class="spacer"></div>' +
      '<button class="icon-btn sm" data-edit="' + a.id + '" title="Editar">' + UI.icon('edit', 15) + '</button>' +
      '<button class="icon-btn sm danger" data-del="' + a.id + '" title="Eliminar">' + UI.icon('trash', 15) + '</button>' +
      '</div></article>';
  }

  function bindList(wrap) {
    UI.on(wrap, '[data-hist]', 'click', e => openHistory(S.data.assets.find(a => a.id === e.target.closest('[data-hist]').dataset.hist)));
    UI.on(wrap, '[data-ubicar]', 'click', e => openUbicarModal(S.data.assets.find(a => a.id === e.target.closest('[data-ubicar]').dataset.ubicar)));
    UI.on(wrap, '[data-maint]', 'click', e => openMaintModal(S.data.assets.find(a => a.id === e.target.closest('[data-maint]').dataset.maint)));
    UI.on(wrap, '[data-edit]', 'click', e => openAssetModal(S.data.assets.find(a => a.id === e.target.closest('[data-edit]').dataset.edit)));
    UI.on(wrap, '[data-del]', 'click', async e => {
      const a = S.data.assets.find(x => x.id === e.target.closest('[data-del]').dataset.del);
      if (!a) return;
      const ok = await UI.confirm({ title: 'Eliminar activo', message: '¿Eliminar <strong>' + UI.escapeHtml(a.name) + '</strong> del registro de activos?', okLabel: 'Eliminar' });
      if (ok) { S.remove('assets', a.id); UI.toast('Activo eliminado'); G.router.refresh(); }
    });
  }

  function openAssetModal(a) {
    const isEdit = !!a;
    const m = UI.openModal({
      title: isEdit ? 'Editar activo' : 'Nuevo activo / herramienta',
      body:
        '<div class="grid-form">' +
        '<div class="field span-2"><label>Nombre *</label><input class="input" id="fName" value="' + UI.escapeHtml(a ? a.name : '') + '" placeholder="Ej.: Hormigonera 130 L, Amoladora…"></div>' +
        '<div class="field"><label>Categoría</label><select class="select" id="fCat">' +
        S.ASSET_CATS.map(c => '<option' + (a && a.category === c ? ' selected' : '') + '>' + c + '</option>').join('') +
        '</select></div>' +
        '<div class="field"><label>Estado</label><select class="select" id="fStatus">' +
        S.ASSET_STATUS.map(s => '<option value="' + s + '"' + (a && a.status === s ? ' selected' : '') + '>' + (s === 'operativo' ? 'Operativo' : s === 'en reparación' ? 'En reparación' : 'Dado de baja') + '</option>').join('') +
        '</select></div>' +
        '<div class="field"><label>Fecha de compra</label><input class="input" type="date" id="fDate" value="' + (a ? a.purchaseDate : S.todayISO()) + '"></div>' +
        '<div class="field"><label>Costo de compra ($) *</label><input class="input" type="number" id="fCost" min="0" step="1000" value="' + (a ? a.cost : '') + '" placeholder="0"></div>' +
        '<div class="field"><label>Proveedor</label><select class="select" id="fProv">' +
        UI.selectOptions(S.data.contacts.filter(c => c.type === 'proveedor').map(c => ({ v: c.id, l: c.name })), a ? a.supplierId : '', true, 'Sin proveedor') +
        '</select></div>' +
        '<div class="field"><label>Notas</label><input class="input" id="fNotes" value="' + UI.escapeHtml(a ? a.notes : '') + '" placeholder="Opcional"></div>' +
        '</div>',
      footer: '<button class="btn btn-ghost" data-cancel>Cancelar</button><button class="btn btn-primary" data-save>' + (isEdit ? 'Guardar cambios' : 'Registrar activo') + '</button>',
    });
    m.panel.querySelector('[data-cancel]').addEventListener('click', m.close);
    m.panel.querySelector('[data-save]').addEventListener('click', () => {
      const name = m.panel.querySelector('#fName').value.trim();
      const cost = UI.readNum(m.panel.querySelector('#fCost'));
      if (!name) { UI.toast('Ingresá el nombre del activo', 'error'); return; }
      if (cost <= 0) { UI.toast('Ingresá el costo de compra', 'error'); return; }
      const payload = {
        name,
        category: m.panel.querySelector('#fCat').value,
        status: m.panel.querySelector('#fStatus').value,
        purchaseDate: m.panel.querySelector('#fDate').value || S.todayISO(),
        cost,
        supplierId: m.panel.querySelector('#fProv').value || null,
        notes: m.panel.querySelector('#fNotes').value.trim(),
      };
      if (isEdit) {
        S.update('assets', a.id, payload);
        UI.toast('Activo actualizado');
      } else {
        payload.maintenance = [];
        payload.location = null;
        payload.usages = [{ from: S.todayISO(), workId: null, notes: 'Compra' }];
        S.add('assets', payload);
        UI.toast('Activo registrado');
      }
      m.close();
      G.router.refresh();
    });
  }

  function openUbicarModal(a) {
    const cur = a.location ? S.data.works.find(w => w.id === a.location) : null;
    const est = estadoDe(a);
    const m = UI.openModal({
      title: 'Mover / cambiar estado · ' + a.name,
      subtitle: 'Hoy: ' + est[0] + (cur ? ' en ' + cur.code + ' · ' + cur.name : ' (guardada en depósito)') + '.',
      body:
        '<div class="grid-form">' +
        '<div class="field"><label>Estado</label><select class="select" id="fStatus">' +
        '<option value="">— Sin cambios —</option>' +
        '<option value="en reparación">🔧 En mantenimiento</option>' +
        '<option value="operativo">✅ Operativa (activa)</option>' +
        '<option value="dado de baja">🚫 Dar de baja</option>' +
        '</select></div>' +
        '<div class="field span-2"><label>Obra asignada actual</label><select class="select" id="fLoc">' +
        '<option value="">📦 Guardada (depósito)</option>' +
        S.data.works.map(w => '<option value="' + w.id + '"' + (a.location === w.id ? ' selected' : '') + '>' + UI.escapeHtml(w.code + ' · ' + w.name) + (w.status !== 'activa' ? ' (' + w.status + ')' : '') + '</option>').join('') +
        '</select></div>' +
        '<div class="field span-2"><label>Nota del movimiento (opcional)</label><input class="input" id="fNotes" placeholder="Ej.: La llevó Juan a la obra…"></div>' +
        '</div>',
      footer: '<button class="btn btn-ghost" data-cancel>Cancelar</button><button class="btn btn-primary" data-save>' + UI.icon('check', 15) + 'Guardar</button>',
    });
    m.panel.querySelector('[data-cancel]').addEventListener('click', m.close);
    m.panel.querySelector('[data-save]').addEventListener('click', () => {
      const status = m.panel.querySelector('#fStatus').value;
      const workId = m.panel.querySelector('#fLoc').value || null;
      const notes = m.panel.querySelector('#fNotes').value.trim();
      let cambios = 0;
      /* El estado se registra primero (con nota), luego la ubicación.
         Ambos dejan su rastro en el historial de trazabilidad. */
      if (status) {
        if (S.setAssetStatus(a.id, status, notes || ('Estado: ' + status))) cambios++;
        if (status === 'operativo' && !workId) { /* "operativa" sin obra → queda en depósito */ }
      }
      if (S.moveAsset(a.id, workId, notes || (workId ? 'Asignada a la obra' : 'Guardada en depósito'))) cambios++;
      if (!cambios) {
        UI.toast('Sin cambios: ya estaba en ese estado y lugar', 'info');
      } else {
        UI.toast('Actualizado: estado y ubicación guardados en el historial');
      }
      m.close();
      G.router.refresh();
    });
  }

  function openMaintModal(a) {
    const m = UI.openModal({
      title: 'Registrar mantenimiento',
      subtitle: a.name,
      body:
        '<div class="grid-form">' +
        '<div class="field"><label>Fecha</label><input class="input" type="date" id="fDate" value="' + S.todayISO() + '"></div>' +
        '<div class="field"><label>Costo ($) *</label><input class="input" type="number" id="fCost" min="0" step="100" placeholder="0"></div>' +
        '<div class="field span-2"><label>Descripción *</label><input class="input" id="fDesc" placeholder="Ej.: Cambio de rulemanes, service completo…"></div>' +
        '</div>',
      footer: '<button class="btn btn-ghost" data-cancel>Cancelar</button><button class="btn btn-primary" data-save>Guardar</button>',
    });
    m.panel.querySelector('[data-cancel]').addEventListener('click', m.close);
    m.panel.querySelector('[data-save]').addEventListener('click', () => {
      const cost = UI.readNum(m.panel.querySelector('#fCost'));
      const desc = m.panel.querySelector('#fDesc').value.trim();
      if (cost <= 0) { UI.toast('Ingresá el costo del mantenimiento', 'error'); return; }
      if (!desc) { UI.toast('Ingresá la descripción', 'error'); return; }
      const maint = (a.maintenance || []).slice();
      maint.push({ date: m.panel.querySelector('#fDate').value || S.todayISO(), description: desc, cost });
      S.update('assets', a.id, { maintenance: maint });
      UI.toast('Mantenimiento registrado');
      m.close();
      G.router.refresh();
    });
  }

  function openHistory(a) {
    const maint = (a.maintenance || []).slice().sort((x, y) => y.date.localeCompare(x.date));
    const us = S.assetUsage(a);
    const destName = u => {
      if (!u.workId) return '<b>📦 Depósito</b>';
      const w = S.data.works.find(x => x.id === u.workId);
      return '<b>' + UI.escapeHtml(w ? (w.code || '') + ' · ' + w.name : '—') + '</b>';
    };
    const usoRows = us.log.slice().reverse().map(u => '<tr>' +
      '<td class="muted">' + UI.fmtDate(u.from) + '</td>' +
      '<td>' + destName(u) + '</td>' +
      '<td class="muted">' + UI.escapeHtml(u.notes || '—') + '</td></tr>').join('');
    const porObra = us.byWorkList.map(b => {
      const w = S.data.works.find(x => x.id === b.workId);
      return '<div class="split-row"><span>' + UI.escapeHtml(w ? (w.code || '') + ' · ' + w.name : '—') + '</span><b>' + b.days + ' días</b></div>';
    }).join('');
    const m = UI.openModal({
      title: 'Historial · ' + a.name,
      subtitle: 'Inversión ' + UI.fmtMoney(a.cost) + ' · mantenimiento ' + UI.fmtMoney(maintOf(a)),
      size: 'wide',
      body:
        '<div class="card-inset" style="margin-top:0">' +
        '<h4>📦 Estado, ubicación e historial de uso</h4>' +
        UI.chip(estadoDe(a)[0], estadoDe(a)[1], estadoDe(a)[2]) + ' ' + locHTML(a) + ' <span class="form-hint">' + us.totalDays + ' días totales en obra · ' + us.log.length + ' movimientos</span>' +
        (usoRows
          ? '<div class="table-wrap" style="margin-top:10px"><table class="data-table compact">' +
            '<thead><tr><th>Desde</th><th>Destino</th><th>Nota</th></tr></thead><tbody>' + usoRows + '</tbody></table></div>'
          : '<p class="form-hint" style="margin-top:8px">Sin movimientos registrados. Usá el botón "Ubicar" para moverla.</p>') +
        (porObra ? '<h4 style="margin-top:12px">Rendimiento por obra</h4>' + porObra : '') +
        '</div>' +
        '<h4 style="margin-top:14px">🔧 Mantenimiento</h4>' +
        (maint.length
          ? '<div class="table-wrap"><table class="data-table">' +
            '<thead><tr><th>Fecha</th><th>Descripción</th><th class="num">Costo</th></tr></thead>' +
            '<tbody>' + maint.map(x => '<tr>' +
              '<td class="muted">' + UI.fmtDate(x.date) + '</td>' +
              '<td>' + UI.escapeHtml(x.description) + '</td>' +
              '<td class="num neg">−' + UI.fmtMoney(x.cost) + '</td></tr>').join('') +
            '</tbody></table></div>'
          : UI.emptyState('wrench', 'Sin intervenciones registradas', 'Cargá el primer mantenimiento de este activo.')) +
        (a.notes ? '<p class="form-hint" style="margin-top:10px">' + UI.escapeHtml(a.notes) + '</p>' : ''),
      footer:
        '<button class="btn btn-ghost" data-cancel>Cerrar</button>' +
        '<button class="btn btn-soft" data-ubicar>' + UI.icon('map-pin', 15) + 'Ubicar</button>' +
        '<button class="btn btn-primary" data-add>' + UI.icon('wrench', 15) + 'Agregar mantenimiento</button>',
    });
    m.panel.querySelector('[data-cancel]').addEventListener('click', m.close);
    m.panel.querySelector('[data-ubicar]').addEventListener('click', () => { m.close(); openUbicarModal(a); });
    m.panel.querySelector('[data-add]').addEventListener('click', () => { m.close(); openMaintModal(a); });
  }
})(typeof window !== 'undefined' ? window : globalThis);
