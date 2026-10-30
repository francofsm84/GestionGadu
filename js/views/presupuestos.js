/* ============================================================
   GADU · Vista: Presupuestos
   Emisión, edición y seguimiento de presupuestos por cliente/obra
   ============================================================ */
(function (root) {
  'use strict';
  const G = root.GADU, S = G.store, UI = G.ui;
  const state = { q: '', status: 'todas' };

  G.router.add('presupuestos', 'presupuestos', 'Presupuestos', 'Emisión y seguimiento de presupuestos por cliente u obra', render);
  G.actions.budget = openBudgetModal;

  const ST = {
    borrador: ['Borrador', 'neutral'],
    enviado: ['Enviado', 'info'],
    aprobado: ['Aprobado', 'success'],
    rechazado: ['Rechazado', 'danger'],
    vencido: ['Vencido', 'warning'],
  };

  function clientOptions(sel) {
    return '<option value="__new__">➕ Agregar nuevo cliente…</option>' +
      S.data.contacts.filter(c => c.type === 'cliente').slice().sort((a, b) => a.name.localeCompare(b.name))
        .map(c => '<option value="' + c.id + '"' + (sel === c.id ? ' selected' : '') + '>' + UI.escapeHtml(c.name) + '</option>').join('');
  }
  function workOptions(sel) {
    return '<option value="__new__">➕ Crear nueva obra…</option>' +
      S.data.works.map(w => '<option value="' + w.id + '"' + (sel === w.id ? ' selected' : '') + '>' + UI.escapeHtml(w.code + ' · ' + w.name) + '</option>').join('');
  }

  function filtered() {
    const q = state.q.toLowerCase();
    return S.data.budgets.slice().sort((a, b) => b.date.localeCompare(a.date)).filter(b => {
      const client = S.contactById(b.clientId);
      const hay = (b.code + ' ' + b.name + ' ' + (client ? client.name : '')).toLowerCase();
      return (state.status === 'todas' || b.status === state.status) && (!q || hay.includes(q));
    });
  }

  function render(view) {
    view.innerHTML =
      '<div class="toolbar">' +
      '<div class="search">' + UI.icon('search', 16) + '<input id="fq" class="input" placeholder="Buscar por código, concepto o cliente…" value="' + UI.escapeHtml(state.q) + '"></div>' +
      '<select id="fs" class="select" style="max-width:200px">' +
      '<option value="todas"' + (state.status === 'todas' ? ' selected' : '') + '>Todos los estados</option>' +
      Object.keys(ST).map(k => '<option value="' + k + '"' + (state.status === k ? ' selected' : '') + '>' + ST[k][0] + '</option>').join('') +
      '</select>' +
      '<div class="grow"></div>' +
      '<button class="btn btn-primary" id="btnNew">' + UI.icon('plus', 16) + 'Nuevo presupuesto</button>' +
      '</div>' +
      '<div id="listWrap">' + listHTML(filtered()) + '</div>';

    view.querySelector('#fq').addEventListener('input', e => { state.q = e.target.value; updateList(view); });
    view.querySelector('#fs').addEventListener('change', e => { state.status = e.target.value; updateList(view); });
    view.querySelector('#btnNew').addEventListener('click', () => openBudgetModal());
    bindList(view.querySelector('#listWrap'));
  }

  function updateList(view) {
    const wrap = view.querySelector('#listWrap');
    wrap.innerHTML = listHTML(filtered());
    bindList(wrap);
  }

  function listHTML(list) {
    const total = S.sum(list.filter(b => b.status !== 'rechazado').map(b => b.total));
    return '<div class="card table-card">' +
      '<div class="table-wrap"><table class="data-table">' +
      '<thead><tr><th>Código</th><th>Fecha</th><th>Cliente</th><th>Obra</th><th>Detalle</th><th class="num">Total</th><th>Estado</th><th></th></tr></thead>' +
      '<tbody>' +
      (list.map(b => {
        const client = S.contactById(b.clientId);
        const work = b.workId ? S.data.works.find(w => w.id === b.workId) : null;
        const stl = ST[b.status] || ['', 'neutral'];
        return '<tr>' +
          '<td><span class="code">' + UI.escapeHtml(b.code) + '</span></td>' +
          '<td class="muted">' + UI.fmtDate(b.date) + '</td>' +
          '<td>' + UI.escapeHtml(client ? client.name : '—') + '</td>' +
          '<td class="muted">' + UI.escapeHtml(work ? work.name : '—') + '</td>' +
          '<td><strong>' + UI.escapeHtml(b.name) + '</strong><div class="muted small">' + (b.items ? b.items.length : 0) + ' ítems' + (b.validUntil ? ' · válido hasta ' + UI.fmtDateShort(b.validUntil) : '') + '</div></td>' +
          '<td class="num"><b>' + UI.fmtMoney(b.total) + '</b></td>' +
          '<td>' + UI.chip(stl[0], stl[1]) + '</td>' +
          '<td><div class="row-actions">' +
          '<button class="icon-btn sm" data-view="' + b.id + '" title="Ver">' + UI.icon('eye', 15) + '</button>' +
          '<button class="icon-btn sm" data-edit="' + b.id + '" title="Editar">' + UI.icon('edit', 15) + '</button>' +
          '<button class="icon-btn sm" data-copy="' + b.id + '" title="Duplicar">' + UI.icon('copy', 15) + '</button>' +
          (b.status === 'aprobado' && b.workId
            ? '<button class="icon-btn sm" data-cobrar="' + b.id + '" title="Registrar cobro">' + UI.icon('trending-up', 15) + '</button>'
            : '') +
          '<button class="icon-btn sm danger" data-del="' + b.id + '" title="Eliminar">' + UI.icon('trash', 15) + '</button>' +
          '</div></td></tr>';
      }).join('') || '<tr><td colspan="8">' + UI.emptyState('file-text', 'No hay presupuestos que coincidan', 'Probá con otra búsqueda o estado.') + '</td></tr>') +
      '</tbody></table></div>' +
      '<div class="table-foot">' +
      '<span>' + list.length + ' presupuesto' + (list.length !== 1 ? 's' : '') + '</span>' +
      '<span>Total presupuestado (sin rechazados): <b>' + UI.fmtMoney(total) + '</b></span>' +
      '</div></div>';
  }

  function bindList(wrap) {
    UI.on(wrap, '[data-view]', 'click', e => openBudgetDetail(S.data.budgets.find(b => b.id === e.target.closest('[data-view]').dataset.view)));
    UI.on(wrap, '[data-edit]', 'click', e => openBudgetModal(S.data.budgets.find(b => b.id === e.target.closest('[data-edit]').dataset.edit)));
    UI.on(wrap, '[data-copy]', 'click', e => {
      const b = S.data.budgets.find(x => x.id === e.target.closest('[data-copy]').dataset.copy);
      if (!b) return;
      const copy = {
        code: S.nextCode('PR', 'budgets'),
        clientId: b.clientId, workId: b.workId, name: b.name + ' (copia)',
        date: S.todayISO(), validUntil: S.daysAhead(30), status: 'borrador',
        items: JSON.parse(JSON.stringify(b.items)), discount: b.discount,
        subtotal: b.subtotal, total: b.total, notes: b.notes,
      };
      S.add('budgets', copy);
      UI.toast('Presupuesto duplicado como ' + copy.code);
      G.router.refresh();
    });
    UI.on(wrap, '[data-cobrar]', 'click', e => {
      const b = S.data.budgets.find(x => x.id === e.target.closest('[data-cobrar]').dataset.cobrar);
      if (!b) return;
      G.actions.income({ workId: b.workId, amount: b.total, concept: 'Cobro presupuesto ' + b.code });
    });
    UI.on(wrap, '[data-del]', 'click', async e => {
      const b = S.data.budgets.find(x => x.id === e.target.closest('[data-del]').dataset.del);
      if (!b) return;
      const ok = await UI.confirm({ title: 'Eliminar presupuesto', message: '¿Eliminar el presupuesto <strong>' + UI.escapeHtml(b.code) + '</strong>?', okLabel: 'Eliminar' });
      if (ok) { S.remove('budgets', b.id); UI.toast('Presupuesto eliminado'); G.router.refresh(); }
    });
  }

  /* HTML del presupuesto para generar el PDF en el cliente */
  function budgetPDFHTML(b) {
    const client = S.contactById(b.clientId);
    const work = b.workId ? S.data.works.find(w => w.id === b.workId) : null;
    return '<div style="font-family:Arial,Helvetica,sans-serif;color:#1e293b;padding:28px;background:#fff;max-width:760px">' +
      '<div style="display:flex;justify-content:space-between;border-bottom:3px solid #f59e0b;padding-bottom:12px;margin-bottom:16px">' +
      '<div><div style="font-size:20px;font-weight:800">GADU Construye</div><div style="font-size:12px;color:#64748b">Presupuesto</div></div>' +
      '<div style="text-align:right;font-size:12px;color:#94a3b8">' + UI.escapeHtml(b.code || '') + '</div></div>' +
      '<h1 style="font-size:18px;margin:0 0 8px">' + UI.escapeHtml(b.name) + '</h1>' +
      '<p style="font-size:13px;color:#64748b;margin:0 0 16px">Cliente: ' + UI.escapeHtml(client ? client.name : '—') + (work ? ' · Obra: ' + UI.escapeHtml(work.name) : '') + ' · ' + UI.fmtDate(b.date) + '</p>' +
      '<table style="width:100%;border-collapse:collapse;font-size:12px">' +
      '<tr style="background:#f1f5f9"><th style="text-align:left;padding:6px 8px">Ítem</th><th style="text-align:right;padding:6px 8px">Cant.</th><th style="text-align:right;padding:6px 8px">P. unit.</th><th style="text-align:right;padding:6px 8px">Subtotal</th></tr>' +
      b.items.map(it => '<tr><td style="padding:6px 8px;border-bottom:1px solid #e2e8f0">' + UI.escapeHtml(it.desc) + '</td><td style="text-align:right;padding:6px 8px;border-bottom:1px solid #e2e8f0">' + UI.fmtNum(it.qty) + '</td><td style="text-align:right;padding:6px 8px;border-bottom:1px solid #e2e8f0">' + UI.fmtMoney(it.price, 2) + '</td><td style="text-align:right;padding:6px 8px;border-bottom:1px solid #e2e8f0">' + UI.fmtMoney(Number(it.price || 0) * Number(it.qty || 0), 2) + '</td></tr>').join('') +
      '</table>' +
      '<div style="margin-top:12px;text-align:right">' +
      '<div style="font-size:12px;color:#64748b">Subtotal: ' + UI.fmtMoney(b.subtotal) + '</div>' +
      (b.discount ? '<div style="font-size:12px;color:#dc2626">Descuento (' + b.discount + '%): −' + UI.fmtMoney(b.subtotal - b.total) + '</div>' : '') +
      '<div style="font-size:16px;font-weight:800;margin-top:4px">TOTAL: ' + UI.fmtMoney(b.total) + '</div></div>' +
      '<div style="text-align:center;color:#94a3b8;font-size:11px;margin-top:24px;border-top:1px solid #e2e8f0;padding-top:12px">Generado por GADU - Tu gestión, perfecta</div>' +
      '</div>';
  }

  /* Envía el presupuesto en PDF al WhatsApp del cliente */
  async function sendBudgetPDF(b, client) {
    if (!b.clientId) { UI.toast('Asigná un cliente al presupuesto primero.', 'error'); return; }
    if (!client) { UI.toast('No se encontró el cliente.', 'error'); return; }
    const phone = client.whatsapp || client.phone || '';
    if (!phone) { UI.toast('El cliente no tiene teléfono. Agregalo antes de enviar.', 'error'); return; }
    if (typeof html2pdf === 'undefined') { UI.toast('Cargando el generador de PDF…', 'info'); return; }
    UI.toast('Generando y enviando el presupuesto…', 'info');
    try {
      const el = document.createElement('div');
      el.style.position = 'fixed'; el.style.left = '0'; el.style.top = '0';
      el.style.width = '800px'; el.style.maxWidth = '100%'; el.style.zIndex = '-9999';
      el.style.opacity = '0'; el.style.background = '#fff';
      el.innerHTML = budgetPDFHTML(b);
      document.body.appendChild(el);
      const dataUri = await html2pdf().from(el).set({
        margin: 8,
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      }).output('datauristring');
      document.body.removeChild(el);
      const pdfBase64 = String(dataUri).includes(',') ? String(dataUri).split(',')[1] : String(dataUri);
      const sess = G.auth.getSession();
      const res = await fetch(G.auth.SUPABASE_URL + '/functions/v1/send-budget-pdf', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': G.auth.SUPABASE_ANON_KEY,
          'Authorization': 'Bearer ' + (sess ? (sess.access_token || sess.accessToken) : ''),
        },
        body: JSON.stringify({ phone, budgetData: { name: b.name, total: b.total }, pdfBase64 }),
      });
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error || 'HTTP ' + res.status); }
      UI.toast('✅ Presupuesto enviado al WhatsApp de ' + client.name, 'success');
    } catch (e) {
      UI.toast('❌ No se pudo enviar: ' + ((e && e.message) || e), 'error');
    }
  }

  function openBudgetDetail(b) {
    if (!b) return;
    const client = S.contactById(b.clientId);
    const work = b.workId ? S.data.works.find(w => w.id === b.workId) : null;
    const stl = ST[b.status] || ['', 'neutral'];
    const m = UI.openModal({
      title: b.code + ' · ' + b.name,
      subtitle: (client ? client.name : '—') + (work ? ' · ' + work.name : '') + ' · emitido el ' + UI.fmtDate(b.date),
      size: 'wide',
      body:
        '<div class="toolbar" style="margin-bottom:12px">' +
        UI.chip(stl[0], stl[1]) +
        (b.validUntil ? UI.chip('Válido hasta ' + UI.fmtDateShort(b.validUntil), 'neutral', 'calendar') : '') +
        '</div>' +
        '<div class="table-wrap"><table class="data-table">' +
        '<thead><tr><th>Ítem</th><th>Unidad</th><th class="num">Cant.</th><th class="num">P. unitario</th><th class="num">Subtotal</th></tr></thead>' +
        '<tbody>' + b.items.map(it => '<tr>' +
          '<td>' + UI.escapeHtml(it.desc) + '</td>' +
          '<td class="muted">' + UI.escapeHtml(it.unit || '—') + '</td>' +
          '<td class="num">' + UI.fmtNum(it.qty) + '</td>' +
          '<td class="num">' + UI.fmtMoney(it.price, 2) + '</td>' +
          '<td class="num">' + UI.fmtMoney(Number(it.price || 0) * Number(it.qty || 0), 2) + '</td>' +
          '</tr>').join('') + '</tbody></table></div>' +
        '<div class="budget-totals">' +
        '<div class="budget-total-row"><span>Subtotal</span><span>' + UI.fmtMoney(b.subtotal) + '</span></div>' +
        (b.discount ? '<div class="budget-total-row"><span>Descuento (' + b.discount + '%)</span><span class="neg">−' + UI.fmtMoney(b.subtotal - b.total) + '</span></div>' : '') +
        '<div class="budget-total-row grand"><span>Total</span><span>' + UI.fmtMoney(b.total) + '</span></div>' +
        '</div>' +
        (b.notes ? '<p class="form-hint" style="margin-top:10px"><strong>Notas:</strong> ' + UI.escapeHtml(b.notes) + '</p>' : ''),
      footer:
        '<button class="btn btn-ghost" data-cancel>Cerrar</button>' +
        '<button class="btn btn-soft-success" data-sendwa>' + UI.icon('whatsapp', 15) + 'Enviar al Cliente</button>' +
        '<button class="btn btn-soft" data-edit>Editar</button>' +
        (b.status === 'aprobado' && b.workId ? '<button class="btn btn-soft-success" data-cobrar>' + UI.icon('trending-up', 15) + 'Registrar cobro</button>' : ''),
    });
    m.panel.querySelector('[data-cancel]').addEventListener('click', m.close);
    m.panel.querySelector('[data-sendwa]').addEventListener('click', () => sendBudgetPDF(b, client));
    m.panel.querySelector('[data-edit]').addEventListener('click', () => { m.close(); openBudgetModal(b); });
    const cobrar = m.panel.querySelector('[data-cobrar]');
    if (cobrar) cobrar.addEventListener('click', () => {
      m.close();
      G.actions.income({ workId: b.workId, amount: b.total, concept: 'Cobro presupuesto ' + b.code });
    });
  }

  function openBudgetModal(b, prefill) {
    const isEdit = !!b;
    prefill = prefill || {};
    const items = b ? b.items : [{ desc: '', unit: '', qty: 1, price: '' }];
    const m = UI.openModal({
      title: isEdit ? 'Editar presupuesto' : 'Nuevo presupuesto',
      subtitle: isEdit ? b.code : 'Se generará un código automático al guardar.',
      size: 'wide',
      body:
        '<div class="grid-form">' +
        '<div class="field span-2"><label>Concepto / nombre *</label><input class="input" id="fName" value="' + UI.escapeHtml(b ? b.name : (prefill.name || '')) + '" placeholder="Ej.: Ampliación cocina + lavadero"></div>' +
        '<div class="field"><label>Cliente *</label>' +
        '<div class="select-with-add">' +
        '<select class="select" id="fClient">' + clientOptions(b ? b.clientId : (prefill.clientId || '')) + '</select>' +
        '<button type="button" class="icon-btn sm" id="btnNewClient" title="Agregar nuevo cliente">' + UI.icon('plus', 14) + '</button>' +
        '</div></div>' +
        '<div class="field"><label>Obra *</label>' +
        '<div class="select-with-add">' +
        '<select class="select" id="fWork">' + workOptions(b ? b.workId : (prefill.workId || '')) + '</select>' +
        '<button type="button" class="icon-btn sm" id="btnNewWork" title="Nueva obra">' + UI.icon('plus', 14) + '</button>' +
        '</div></div>' +
        '<div class="field"><label>Fecha de emisión</label><input class="input" type="date" id="fDate" value="' + (b ? b.date : S.todayISO()) + '"></div>' +
        '<div class="field"><label>Válido hasta</label><input class="input" type="date" id="fValid" value="' + (b && b.validUntil ? b.validUntil : S.daysAhead(30)) + '"></div>' +
        '<div class="field"><label>Estado</label><select class="select" id="fStatus">' +
        Object.keys(ST).map(k => '<option value="' + k + '"' + (b && b.status === k ? ' selected' : '') + '>' + ST[k][0] + '</option>').join('') +
        '</select></div>' +
        '<div class="field"><label>Descuento (%)</label><input class="input" type="number" id="fDisc" min="0" max="100" value="' + (b ? b.discount : 0) + '"></div>' +
        '<div class="field span-2"><label>Ítems *</label>' +
        '<div class="items-editor">' +
        '<div class="items-head"><span>Descripción</span><span>Unidad</span><span>Cant.</span><span>P. unitario</span><span>Subtotal</span><span></span></div>' +
        '<div id="itemsWrap">' + items.map((it, i) => itemRow(it, i)).join('') + '</div>' +
        '<button class="btn btn-soft btn-sm" id="btnAddItem">' + UI.icon('plus', 14) + 'Agregar ítem</button>' +
        '</div></div>' +
        '<div class="field span-2"><label>Notas</label><textarea class="textarea" id="fNotes" rows="2" placeholder="Condiciones, formas de pago, observaciones…">' + UI.escapeHtml(b ? b.notes : '') + '</textarea></div>' +
        '</div>' +
        '<div class="budget-totals">' +
        '<div class="budget-total-row"><span>Subtotal</span><span id="totSub">$0</span></div>' +
        '<div class="budget-total-row"><span>Descuento</span><span id="totDisc" class="neg">−$0</span></div>' +
        '<div class="budget-total-row grand"><span>Total</span><span id="totTotal">$0</span></div>' +
        '</div>',
      footer: '<button class="btn btn-ghost" data-cancel>Cancelar</button><button class="btn btn-primary" data-save>' + (isEdit ? 'Guardar cambios' : 'Crear presupuesto') + '</button>',
    });

    const fClient = m.panel.querySelector('#fClient');
    const fWork = m.panel.querySelector('#fWork');
    m.panel.querySelector('#btnNewClient').addEventListener('click', () => {
      G.actions.client(null, nuevo => {
        fClient.innerHTML = clientOptions(nuevo ? nuevo.id : fClient.value);
      });
    });
    m.panel.querySelector('#btnNewWork').addEventListener('click', () => {
      G.actions.work(null, {
        clientId: fClient.value || null,
        onSaved: nw => { fWork.innerHTML = workOptions(nw.id); },
      });
    });
    /* Opción directa dentro del selector: "➕ Crear/Agregar…" */
    fClient.addEventListener('change', () => {
      if (fClient.value === '__new__') {
        const prev = (b ? b.clientId : (prefill.clientId || '')) || '';
        fClient.value = prev;
        G.actions.client(null, nuevo => {
          fClient.innerHTML = clientOptions(nuevo ? nuevo.id : prev);
        });
      }
    });
    fWork.addEventListener('change', () => {
      if (fWork.value === '__new__') {
        const prev = (b ? b.workId : (prefill.workId || '')) || '';
        fWork.value = prev;
        G.actions.work(null, {
          clientId: fClient.value || null,
          onSaved: nw => { fWork.innerHTML = workOptions(nw.id); },
        });
      }
    });

    function itemRow(it, i) {
      return '<div class="item-row" data-i="' + i + '">' +
        '<input class="input" data-k="desc" placeholder="Ítem (ej.: Mano de obra)" value="' + UI.escapeHtml(it.desc || '') + '">' +
        '<input class="input" data-k="unit" placeholder="global / m²" value="' + UI.escapeHtml(it.unit || '') + '">' +
        '<input class="input" type="number" data-k="qty" min="0" step="0.01" value="' + (it.qty != null ? it.qty : 1) + '">' +
        '<input class="input" type="number" data-k="price" min="0" step="100" placeholder="0" value="' + (it.price || '') + '">' +
        '<span class="item-sub">$0</span>' +
        '<button class="icon-btn sm danger" data-delitem title="Quitar">' + UI.icon('trash', 14) + '</button>' +
        '</div>';
    }

    function recalc() {
      const wrap = m.panel.querySelector('#itemsWrap');
      let sub = 0;
      wrap.querySelectorAll('.item-row').forEach(row => {
        const qty = UI.readNum(row.querySelector('[data-k="qty"]'));
        const price = UI.readNum(row.querySelector('[data-k="price"]'));
        const st = qty * price;
        sub += st;
        row.querySelector('.item-sub').textContent = UI.fmtMoney(st);
      });
      const disc = Math.max(0, Math.min(100, UI.readNum(m.panel.querySelector('#fDisc'))));
      const total = Math.max(0, sub * (1 - disc / 100));
      m.panel.querySelector('#totSub').textContent = UI.fmtMoney(sub);
      m.panel.querySelector('#totDisc').textContent = '−' + UI.fmtMoney(sub - total);
      m.panel.querySelector('#totTotal').textContent = UI.fmtMoney(total);
    }

    function addRow() {
      const wrap = m.panel.querySelector('#itemsWrap');
      const i = wrap.querySelectorAll('.item-row').length;
      const div = document.createElement('div');
      div.innerHTML = itemRow({ desc: '', unit: '', qty: 1, price: '' }, i);
      const row = div.firstElementChild;
      row.querySelector('[data-delitem]').addEventListener('click', () => { row.remove(); recalc(); });
      wrap.appendChild(row);
      recalc();
    }

    m.panel.querySelector('#itemsWrap').addEventListener('input', recalc);
    UI.on(m.panel, '#itemsWrap [data-delitem]', 'click', e => {
      const wrap = m.panel.querySelector('#itemsWrap');
      if (wrap.querySelectorAll('.item-row').length <= 1) { UI.toast('El presupuesto necesita al menos un ítem', 'error'); return; }
      e.target.closest('.item-row').remove();
      recalc();
    });
    m.panel.querySelector('#btnAddItem').addEventListener('click', addRow);
    m.panel.querySelector('#fDisc').addEventListener('input', recalc);
    m.panel.querySelector('[data-cancel]').addEventListener('click', m.close);
    m.panel.querySelector('[data-save]').addEventListener('click', () => {
      const name = m.panel.querySelector('#fName').value.trim();
      const collected = [];
      m.panel.querySelectorAll('#itemsWrap .item-row').forEach(row => {
        const desc = row.querySelector('[data-k="desc"]').value.trim();
        const price = UI.readNum(row.querySelector('[data-k="price"]'));
        if (desc || price > 0) {
          collected.push({
            desc: desc || 'Ítem',
            unit: row.querySelector('[data-k="unit"]').value.trim(),
            qty: UI.readNum(row.querySelector('[data-k="qty"]')),
            price,
          });
        }
      });
      if (!name) { UI.toast('Ingresá el concepto del presupuesto', 'error'); return; }
      if (!collected.length) { UI.toast('Cargá al menos un ítem con precio', 'error'); return; }
      const clientId = m.panel.querySelector('#fClient').value;
      const workId = m.panel.querySelector('#fWork').value;
      if (!clientId) { UI.toast('Seleccioná el cliente (o agregalo con el botón +)', 'error'); return; }
      if (!workId) { UI.toast('Seleccioná la obra (o creala con el botón +)', 'error'); return; }
      const subtotal = S.sum(collected.map(i => i.qty * i.price));
      const disc = Math.max(0, Math.min(100, UI.readNum(m.panel.querySelector('#fDisc'))));
      const payload = {
        name,
        clientId,
        workId,
        date: m.panel.querySelector('#fDate').value || S.todayISO(),
        validUntil: m.panel.querySelector('#fValid').value || '',
        status: m.panel.querySelector('#fStatus').value,
        items: collected,
        discount: disc,
        subtotal,
        total: Math.max(0, subtotal * (1 - disc / 100)),
        notes: m.panel.querySelector('#fNotes').value.trim(),
      };
      if (isEdit) {
        S.update('budgets', b.id, payload);
        UI.toast('Presupuesto actualizado');
      } else {
        payload.code = S.nextCode('PR', 'budgets');
        S.add('budgets', payload);
        UI.toast('Presupuesto ' + payload.code + ' creado');
      }
      m.close();
      G.router.refresh();
    });
    recalc();
  }
})(typeof window !== 'undefined' ? window : globalThis);
