/* ============================================================
   GADU · Vista: Gastos (directos por obra y generales)
   Carga de comprobantes, categorías, proveedores y CSV
   ============================================================ */
(function (root) {
  'use strict';
  const G = root.GADU, S = G.store, UI = G.ui;
  const state = { tab: 'obra', q: '', cat: 'todas', work: 'todas', sel: [] };

  G.router.add('gastos', 'gastos', 'Gastos', 'Control de costos por obra y gastos generales de la empresa', render);
  G.actions.expense = openExpenseModal;

  /* Persistencia del borrado: empuja a la nube para que el registro eliminado
     NO reaparezca al recargar (el pull de arranque traería la copia vieja). */
  async function syncAfterDelete() {
    try {
      if (G.sync && G.sync.push) {
        await G.sync.push(S.data);
        try { S.data.settings.lastCloudSync = new Date().toISOString(); S.save(); } catch (e) {}
      }
    } catch (e) { /* sin conexión: el push automático programado reintenta */ }
  }

  function filtered() {
    const q = state.q.toLowerCase();
    return S.data.expenses.slice().sort((a, b) => b.date.localeCompare(a.date)).filter(x => {
      const w = S.data.works.find(wk => wk.id === x.workId);
      const prov = S.contactById(x.providerId);
      const hay = (x.description + ' ' + x.category + ' ' + (w ? w.name : '') + ' ' + (prov ? prov.name : '') + ' ' + (x.invoiceNumber || '')).toLowerCase();
      return x.type === state.tab &&
        (state.cat === 'todas' || x.category === state.cat) &&
        (state.tab !== 'obra' || state.work === 'todas' || x.workId === state.work) &&
        (!q || hay.includes(q));
    });
  }

  function cats() { return state.tab === 'obra' ? S.CATS_OBRA : S.CATS_GENERAL; }

  /* Deep link #/gastos?id=<uuid>: resalta y scrollea hasta ese gasto una sola vez */
  function handleDeepLink(view) {
    try {
      const m = String(location.hash || '').match(/[?&]id=([^&]+)/);
      if (!m) return;
      const id = decodeURIComponent(m[1]);
      /* Si el gasto está en la otra solapa, cambiarse a ella */
      const exp = S.data.expenses.find(x => x.id === id);
      if (exp && exp.type && exp.type !== state.tab) {
        state.tab = exp.type === 'obra' ? 'obra' : 'general';
        view.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === state.tab));
        view.querySelector('#contentWrap').innerHTML = contentHTML();
        bindContent(view);
      }
      setTimeout(() => {
        const row = view.querySelector('tr[data-id="' + id + '"]');
        if (!row) return;
        try { row.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) {}
        row.classList.add('highlight-row');
        setTimeout(() => { try { row.classList.remove('highlight-row'); } catch (e) {} }, 3000);
      }, 300);
      /* Limpiar la URL para que un refresh no vuelva a scrollear/resaltar */
      try { history.replaceState(null, '', '#/gastos'); } catch (e) {}
    } catch (e) {}
  }

  function render(view) {
    view.innerHTML =
      '<div class="tabs page-tabs">' +
      '<button class="tab ' + (state.tab === 'obra' ? 'active' : '') + '" data-tab="obra">Gastos por obra</button>' +
      '<button class="tab ' + (state.tab === 'general' ? 'active' : '') + '" data-tab="general">Gastos generales / estructura</button>' +
      '</div>' +
      '<div id="contentWrap">' + contentHTML() + '</div>';

    UI.on(view, '.tab', 'click', e => {
      state.tab = e.currentTarget.dataset.tab;
      state.cat = 'todas';
      state.work = 'todas';
      state.sel = [];   // la selección en lote es por solapa: limpiar al cambiar
      view.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === state.tab));
      view.querySelector('#contentWrap').innerHTML = contentHTML();
      bindContent(view);
    });
    bindContent(view);
    handleDeepLink(view);
  }

  function contentHTML() {
    return '<div class="toolbar">' +
      '<div class="search">' + UI.icon('search', 16) + '<input id="fq" class="input" placeholder="Buscar por descripción, proveedor o factura…" value="' + UI.escapeHtml(state.q) + '"></div>' +
      '<select id="fcat" class="select" style="max-width:200px">' +
      '<option value="todas"' + (state.cat === 'todas' ? ' selected' : '') + '>Todas las categorías</option>' +
      cats().map(c => '<option value="' + c + '"' + (state.cat === c ? ' selected' : '') + '>' + c + '</option>').join('') +
      '</select>' +
      (state.tab === 'obra'
        ? '<select id="fw" class="select" style="max-width:220px">' +
          '<option value="todas"' + (state.work === 'todas' ? ' selected' : '') + '>Todas las obras</option>' +
          S.data.works.map(w => '<option value="' + w.id + '"' + (state.work === w.id ? ' selected' : '') + '>' + UI.escapeHtml(w.code + ' · ' + w.name) + '</option>').join('') +
          '</select>'
        : '') +
      '<button class="btn btn-soft btn-sm" id="btnCsv">' + UI.icon('download', 15) + 'Exportar CSV</button>' +
      '<div class="grow"></div>' +
      '<button class="btn ' + (state.tab === 'obra' ? 'btn-soft-danger' : 'btn-danger') + '" id="btnNew">' + UI.icon('plus', 16) + (state.tab === 'obra' ? 'Cargar gasto de obra' : 'Cargar gasto general') + '</button>' +
      '</div>' +
      batchBarHTML() +
      '<div id="listWrap">' + listHTML(filtered()) + '</div>';
  }

  /* Barra de acciones en lote: aparece solo cuando hay selección */
  function batchBarHTML() {
    return '<div id="batchBar" class="card" hidden style="display:flex;align-items:center;gap:10px;margin-bottom:12px;padding:10px 14px;border:1px solid var(--primary);border-radius:12px;box-shadow:var(--shadow)">' +
      '<b id="batchCount" style="white-space:nowrap">0 seleccionados</b>' +
      '<div style="flex:1"></div>' +
      '<button class="btn btn-ghost btn-sm" id="batchClear">Limpiar</button>' +
      '<button class="btn btn-danger btn-sm" id="batchDel">' + UI.icon('trash', 14) + 'Eliminar seleccionados</button>' +
      '</div>';
  }

  function bindContent(view) {
    const cw = view.querySelector('#contentWrap');
    cw.querySelector('#fq').addEventListener('input', e => { state.q = e.target.value; updateList(cw); });
    cw.querySelector('#fcat').addEventListener('change', e => { state.cat = e.target.value; updateList(cw); });
    const fw = cw.querySelector('#fw');
    if (fw) fw.addEventListener('change', e => { state.work = e.target.value; updateList(cw); });
    cw.querySelector('#btnNew').addEventListener('click', () => openExpenseModal({ type: state.tab }));
    cw.querySelector('#btnCsv').addEventListener('click', exportCSV);
    /* Borrado en lote: elimina todos los seleccionados y persiste en la nube */
    cw.querySelector('#batchDel').addEventListener('click', async () => {
      const n = state.sel.length;
      if (!n) return;
      const ok = await UI.confirm({ title: 'Eliminar seleccionados', message: '¿Eliminar <strong>' + n + '</strong> comprobante' + (n !== 1 ? 's' : '') + '? Esta acción no se puede deshacer.', okLabel: 'Eliminar' });
      if (!ok) return;
      state.sel.forEach(id => S.remove('expenses', id));
      state.sel = [];
      await syncAfterDelete();
      UI.toast(n + ' gasto' + (n !== 1 ? 's' : '') + ' eliminado' + (n !== 1 ? 's' : ''));
      updateList(cw);
      G.router.refresh();
    });
    cw.querySelector('#batchClear').addEventListener('click', () => { state.sel = []; updateList(cw); });
    bindList(cw.querySelector('#listWrap'));
    bindSelection(cw);
  }

  function updateList(cw) {
    const wrap = cw.querySelector('#listWrap');
    wrap.innerHTML = listHTML(filtered());
    bindList(wrap);
    bindSelection(cw);
  }

  /* Selección múltiple: checkbox maestro (visibles) + por fila + borrado en lote */
  function bindSelection(cw) {
    const bar = cw.querySelector('#batchBar');
    if (!bar) return;
    const master = cw.querySelector('#masterSel');
    const rows = cw.querySelectorAll('.sel-row');
    const upd = () => {
      bar.hidden = !state.sel.length;
      const cnt = cw.querySelector('#batchCount');
      if (cnt) cnt.textContent = state.sel.length + ' seleccionado' + (state.sel.length !== 1 ? 's' : '');
    };
    if (master) master.addEventListener('click', () => {
      const ids = filtered().map(x => x.id);
      if (master.checked) ids.forEach(id => { if (state.sel.indexOf(id) < 0) state.sel.push(id); });
      else state.sel = state.sel.filter(id => ids.indexOf(id) < 0);
      updateList(cw);
    });
    rows.forEach(cb => cb.addEventListener('click', () => {
      const id = cb.dataset.sel;
      state.sel = cb.checked ? state.sel.concat(id) : state.sel.filter(x => x !== id);
      updateList(cw);
    }));
    upd();
  }

  function listHTML(list) {
    const total = S.sum(list.map(x => x.amount));
    const allSel = list.length > 0 && list.every(x => state.sel.indexOf(x.id) >= 0);
    return '<div class="card table-card">' +
      '<div class="table-wrap"><table class="data-table">' +
      '<thead><tr><th style="width:36px"><input type="checkbox" id="masterSel" title="Seleccionar todos los visibles"' + (allSel ? ' checked' : '') + '></th><th>Fecha</th><th>' + (state.tab === 'obra' ? 'Obra' : 'Tipo') + '</th><th>Categoría</th><th>Proveedor</th><th>Descripción</th><th>Factura</th><th>Método</th><th class="num">Monto</th><th></th></tr></thead>' +
      '<tbody>' +
      (list.map(x => {
        const w = S.data.works.find(wk => wk.id === x.workId);
        const prov = S.contactById(x.providerId);
        return '<tr data-id="' + x.id + '">' +
          '<td><input type="checkbox" class="sel-row" data-sel="' + x.id + '"' + (state.sel.indexOf(x.id) >= 0 ? ' checked' : '') + '></td>' +
          '<td class="muted">' + UI.fmtDate(x.date) + '</td>' +
          '<td>' + (state.tab === 'obra'
            ? '<strong>' + UI.escapeHtml(w ? w.name : '—') + '</strong>'
            : UI.chip('General', 'violet', 'layers')) + '</td>' +
          '<td>' + UI.chip(x.category || 'Otros', 'neutral') + '</td>' +
          '<td>' + (x.employeeId
            ? '<strong>' + UI.escapeHtml(S.employeeName(S.employeeById(x.employeeId)) || '—') + '</strong> ' +
              UI.chip('Empleado', 'info') + (x.expenseKind === 'adelanto' ? ' ' + UI.chip('Adelanto', 'warning', 'zap') : '')
            : UI.escapeHtml(prov ? prov.name : '—')) + '</td>' +
          '<td>' + UI.escapeHtml(x.description) + '</td>' +
          '<td class="muted">' + (x.invoiceNumber ? UI.escapeHtml(x.invoiceNumber) : '—') + (x.receiptUrl ? ' <button class="icon-btn sm" data-ticket="' + UI.escapeHtml(x.receiptUrl) + '" title="Ver ticket">' + UI.icon('camera', 14) + '</button>' : '') + '</td>' +
          '<td class="muted">' + UI.escapeHtml(x.paymentMethod || '—') + '</td>' +
          '<td class="num neg"><b>−' + UI.fmtMoney(x.amount) + '</b></td>' +
          '<td><div class="row-actions">' +
          '<button class="icon-btn sm" data-edit="' + x.id + '" title="Editar">' + UI.icon('edit', 15) + '</button>' +
          '<button class="icon-btn sm danger" data-del="' + x.id + '" title="Eliminar">' + UI.icon('trash', 15) + '</button>' +
          '</div></td></tr>';
      }).join('') || '<tr><td colspan="10">' + UI.emptyState('arrow-up-right', 'No hay gastos que coincidan', 'Probá con otra búsqueda o filtro.') + '</td></tr>') +
      '</tbody></table></div>' +
      '<div class="table-foot">' +
      '<span>' + list.length + ' comprobante' + (list.length !== 1 ? 's' : '') + '</span>' +
      '<span>Total filtrado: <b class="neg">' + UI.fmtMoney(total) + '</b></span>' +
      '</div></div>';
  }

  function bindList(wrap) {
    UI.on(wrap, '[data-edit]', 'click', e => {
      const id = e.target.closest('[data-edit]').dataset.edit;
      openExpenseModal({ expense: S.data.expenses.find(x => x.id === id) });
    });
    UI.on(wrap, '[data-ticket]', 'click', e => {
      const url = e.target.closest('[data-ticket]').dataset.ticket;
      openTicketModal(url);
    });
    UI.on(wrap, '[data-del]', 'click', async e => {
      const id = e.target.closest('[data-del]').dataset.del;
      const ok = await UI.confirm({ title: 'Eliminar gasto', message: '¿Eliminar este comprobante? Los totales y márgenes se actualizarán.', okLabel: 'Eliminar' });
      if (ok) {
        S.remove('expenses', id);
        await syncAfterDelete();   // persistencia: el borrado llega a la nube
        UI.toast('Gasto eliminado');
        G.router.refresh();
      }
    });
  }

  function exportCSV() {
    const rows = [['Fecha', 'Tipo', 'Obra', 'Categoría', 'Proveedor', 'Tipo de pago', 'Descripción', 'Factura', 'Método', 'Monto']];
    filtered().forEach(x => {
      const w = S.data.works.find(wk => wk.id === x.workId);
      const prov = S.contactById(x.providerId);
      const emp = x.employeeId ? S.employeeName(S.employeeById(x.employeeId)) : '';
      rows.push([x.date, x.type === 'obra' ? 'Obra' : 'General', w ? w.name : '', x.category, x.employeeId ? emp + ' (empleado)' : (prov ? prov.name : ''), x.expenseKind === 'adelanto' ? 'Adelanto' : 'Sueldo / pago', x.description, x.invoiceNumber || '', x.paymentMethod || '', String(Number(x.amount) || 0)]);
    });
    UI.csv('gadu-gastos.csv', rows);
    UI.toast('CSV de gastos exportado');
  }

  /* Compresión de imagen en cliente (canvas) antes de subir */
  /* Sube el ticket a Supabase Storage y devuelve la URL pública */
  async function uploadTicket(file) {
    const sess = G.auth && G.auth.getSession ? G.auth.getSession() : null;
    const uid = (sess && sess.userId) || 'anon';
    const blob = await UI.compressImage(file);
    const path = uid + '/' + Date.now() + '.jpg';
    const res = await fetch(G.auth.SUPABASE_URL + '/storage/v1/object/gadu_tickets/' + path, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + ((sess && sess.accessToken) || ''),
        'apikey': G.auth.SUPABASE_ANON_KEY,
        'Content-Type': 'image/jpeg',
        'x-upsert': 'false',
      },
      body: blob,
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return G.auth.SUPABASE_URL + '/storage/v1/object/public/gadu_tickets/' + path;
  }

  /* Modal con la foto del ticket en grande */
  function openTicketModal(url) {
    const m = UI.openModal({
      title: 'Ticket / comprobante',
      size: 'wide',
      body: '<div style="text-align:center"><img src="' + UI.escapeHtml(url) + '" style="max-width:100%;max-height:70vh;border-radius:10px" alt="Ticket"></div>',
      footer: '<a class="btn btn-soft" href="' + UI.escapeHtml(url) + '" target="_blank" rel="noopener">' + UI.icon('image', 14) + 'Abrir en pestaña</a><button class="btn btn-ghost" data-cancel>Cerrar</button>',
    });
    m.panel.querySelector('[data-cancel]').addEventListener('click', m.close);
  }

  function openExpenseModal(opts) {
    opts = opts || {};
    const exp = opts.expense || null;
    const isEdit = !!exp;
    const type = exp ? exp.type : (opts.type || state.tab);
    const cats = type === 'obra' ? S.CATS_OBRA : S.CATS_GENERAL;
    const curCat = exp ? exp.category : (opts.category || cats[0]);
    const catList = exp && exp.category && !cats.includes(exp.category) ? cats.concat([exp.category]) : cats;
    const catOpts = catList.map(c => '<option value="' + UI.escapeHtml(c) + '"' + (c === curCat ? ' selected' : '') + '>' + UI.escapeHtml(c) + '</option>').join('');
    const curMethod = exp && exp.paymentMethod ? exp.paymentMethod : S.METODOS[0];
    const methodList = (exp && exp.paymentMethod && !S.METODOS.includes(exp.paymentMethod) ? S.METODOS.concat([exp.paymentMethod]) : S.METODOS);
    const methodOpts = methodList.map(mt => '<option value="' + UI.escapeHtml(mt) + '"' + (mt === curMethod ? ' selected' : '') + '>' + UI.escapeHtml(mt) + '</option>').join('');
    const m = UI.openModal({
      title: isEdit ? 'Editar gasto' : (type === 'obra' ? 'Cargar gasto de obra' : 'Cargar gasto general'),
      subtitle: isEdit ? '' : (type === 'obra' ? 'Costo directo vinculado a una obra específica.' : 'Costo fijo u operativo de la empresa.'),
      body:
        '<div class="grid-form">' +
        (type === 'obra'
          ? '<div class="field span-2"><label>Obra *</label><select class="select" id="fWork">' +
            UI.selectOptions(S.data.works.map(w => ({ v: w.id, l: w.code + ' · ' + w.name })), exp ? exp.workId : (opts.workId || ''), true, '— Seleccionar obra —') +
            '</select></div>'
          : '') +
        '<div class="field"><label>Fecha</label><input class="input" type="date" id="fDate" value="' + (exp ? exp.date : S.todayISO()) + '"></div>' +
        '<div class="field"><label>Monto ($) *</label><input class="input" type="number" id="fAmount" min="0" step="100" value="' + (exp ? exp.amount : (opts.amount || '')) + '" placeholder="0"></div>' +
        '<div class="field"><label>Categoría *</label><select class="select" id="fCat">' +
        catOpts +
        '</select></div>' +
        '<div class="field"><label>Proveedor / Empleado</label><select class="select" id="fProv">' +
        '<option value="">Sin proveedor</option>' +
        '<optgroup label="Proveedores y subcontratos">' +
        S.data.contacts.filter(c => c.type === 'proveedor' || c.type === 'subcontratista')
          .map(c => '<option value="c:' + c.id + '"' + (exp && !exp.employeeId && exp.providerId === c.id ? ' selected' : '') + '>' + UI.escapeHtml(c.name) + ' (' + (c.type === 'proveedor' ? 'proveedor' : 'subcontrato') + ')</option>').join('') +
        '</optgroup>' +
        '<optgroup label="Empleados">' +
        S.data.employees.filter(e => e.active !== false).map(e => '<option value="e:' + e.id + '"' + ((exp && exp.employeeId === e.id) || (!exp && opts.employeeId === e.id) ? ' selected' : '') + '>' + UI.escapeHtml(S.employeeName(e)) + ' (empleado)</option>').join('') +
        '</optgroup>' +
        '</select></div>' +
        '<div class="field" id="kindField" hidden><label>Tipo de pago</label><select class="select" id="fKind">' +
        '<option value="sueldo"' + (!exp || exp.expenseKind !== 'adelanto' ? ' selected' : '') + '>Sueldo / pago</option>' +
        '<option value="adelanto"' + ((exp && exp.expenseKind === 'adelanto') || (opts.expenseKind === 'adelanto') ? ' selected' : '') + '>Adelanto de dinero</option>' +
        '</select><span class="form-hint">Los adelantos quedan marcados en el legajo del empleado.</span></div>' +
        '<div class="field span-2"><label>Descripción *</label><input class="input" id="fDesc" value="' + UI.escapeHtml(exp ? exp.description : (opts.description || '')) + '" placeholder="Ej.: Compra de cemento, pago de cuadrilla, combustible…"></div>' +
        '<div class="field"><label>N° de factura / comprobante</label><input class="input" id="fFact" value="' + UI.escapeHtml(exp ? exp.invoiceNumber : '') + '" placeholder="Ej.: F-00452"></div>' +
        '<div class="field"><label>Método de pago</label><select class="select" id="fMethod">' +
        methodOpts +
        '</select></div>' +
        '<div class="field span-2"><label>Foto del ticket (opcional)</label>' +
        '<input type="file" id="fTicket" accept="image/*" capture="environment" class="input">' +
        (exp && exp.receiptUrl ? '<div style="margin-top:6px"><a href="' + UI.escapeHtml(exp.receiptUrl) + '" target="_blank" class="link-btn">' + UI.icon('camera', 13) + ' Ver ticket actual</a></div>' : '') +
        '<span class="form-hint">Se sube al guardar. Podés sacarle una foto al comprobante.</span></div>' +
        '</div>',
      footer: '<button class="btn btn-ghost" data-cancel>Cancelar</button><button class="btn btn-primary" data-save>' + (isEdit ? 'Guardar cambios' : 'Cargar gasto') + '</button>',
    });

    m.panel.querySelector('[data-cancel]').addEventListener('click', m.close);
    /* Al elegir un empleado, sugerir la categoría de pago correspondiente */
    const fProvEl = m.panel.querySelector('#fProv');
    const fCatEl = m.panel.querySelector('#fCat');
    const kindField = m.panel.querySelector('#kindField');
    const syncKind = () => {
      const isEmp = fProvEl.value.startsWith('e:');
      kindField.hidden = !isEmp;
    };
    fProvEl.addEventListener('change', () => {
      if (fProvEl.value.startsWith('e:')) {
        const target = type === 'obra' ? 'Mano de obra' : 'Sueldos';
        if (cats.includes(target)) fCatEl.value = target;
      }
      syncKind();
    });
    syncKind();
    /* Al abrir desde un empleado (pagar/adelanto), dejar la categoría correcta desde el inicio */
    if (!exp && opts.employeeId) {
      const target = type === 'obra' ? 'Mano de obra' : 'Sueldos';
      if (cats.includes(target)) fCatEl.value = target;
    }
    m.panel.querySelector('[data-save]').addEventListener('click', async () => {
      const amount = UI.readNum(m.panel.querySelector('#fAmount'));
      const desc = m.panel.querySelector('#fDesc').value.trim();
      let workId = null;
      if (type === 'obra') {
        workId = m.panel.querySelector('#fWork').value;
        if (!workId) { UI.toast('Seleccioná la obra', 'error'); return; }
      }
      if (amount <= 0) { UI.toast('Ingresá un monto mayor a cero', 'error'); return; }
      if (!desc) { UI.toast('Ingresá la descripción del gasto', 'error'); return; }
      const provVal = m.panel.querySelector('#fProv').value;
      let providerId = null;
      let employeeId = null;
      if (provVal) {
        if (provVal.startsWith('e:')) employeeId = provVal.slice(2);
        else providerId = provVal;
      }
      const payload = {
        type,
        workId: type === 'obra' ? workId : null,
        date: m.panel.querySelector('#fDate').value || S.todayISO(),
        amount,
        category: m.panel.querySelector('#fCat').value,
        providerId,
        employeeId,
        expenseKind: employeeId ? m.panel.querySelector('#fKind').value : null,
        description: desc,
        invoiceNumber: m.panel.querySelector('#fFact').value.trim(),
        paymentMethod: m.panel.querySelector('#fMethod').value,
      };
      /* Foto del ticket: subir a Storage y guardar la URL pública */
      const ticketInput = m.panel.querySelector('#fTicket');
      const file = ticketInput && ticketInput.files ? ticketInput.files[0] : null;
      if (file) {
        const saveBtn = m.panel.querySelector('[data-save]');
        const original = saveBtn.textContent;
        saveBtn.disabled = true;
        saveBtn.textContent = 'Subiendo foto…';
        try {
          payload.receiptUrl = await uploadTicket(file);
        } catch (e) {
          UI.toast('No se pudo subir la foto: ' + ((e && e.message) || e), 'error');
          saveBtn.disabled = false;
          saveBtn.textContent = original;
          return;
        }
        saveBtn.disabled = false;
        saveBtn.textContent = original;
      }
      if (isEdit) {
        S.update('expenses', exp.id, payload);
        UI.toast('Gasto actualizado');
      } else {
        S.add('expenses', payload);
        UI.toast('Gasto cargado');
      }
      m.close();
      G.router.refresh();
    });
  }
})(typeof window !== 'undefined' ? window : globalThis);
