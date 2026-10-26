/* ============================================================
   GADU · Vista: Detalle de obra
   Presupuesto, cobros, costos, margen, personal asignado por
   obra y adelantos en ambas direcciones (cliente ⇄ empleados)
   ============================================================ */
(function (root) {
  'use strict';
  const G = root.GADU, S = G.store, UI = G.ui;
  const state = { tab: 'ingresos' };

  G.router.add('obra', 'obra/:id', 'Detalle de obra', 'Todos los movimientos de la obra en un solo lugar', render);

  function kpi(icon, tone, label, value, sub, nav) {
    const inner = '<span class="kpi-ico kpi-' + tone + '">' + UI.icon(icon, 20) + '</span>' +
      '<div class="kpi-body">' +
      '<span class="kpi-label">' + label + '</span>' +
      '<strong class="kpi-value">' + value + '</strong>' +
      '<span class="kpi-sub">' + sub + '</span>' +
      '</div>';
    return nav
      ? '<a class="kpi-card kpi-link" data-nav="' + nav + '">' + inner + '</a>'
      : '<div class="kpi-card">' + inner + '</div>';
  }

  function barRow(label, pct, color, sub) {
    return '<div class="bar-row">' +
      '<div class="bar-row-head"><span>' + label + '</span><b>' + Math.round(pct) + '%</b></div>' +
      UI.progress(pct, color) +
      '<span class="muted small">' + sub + '</span></div>';
  }

  function sumRow(label, value, cls, xl) {
    return '<div class="split-row"><span class="muted">' + label + '</span><b class="' + (cls || '') + (xl ? ' xl' : '') + '">' + value + '</b></div>';
  }

  /* Compresión de imagen en cliente (canvas) */
  /* Sube una foto de obra a Supabase Storage y devuelve la URL pública */
  async function uploadWorkPhoto(file, workId) {
    const sess = G.auth && G.auth.getSession ? G.auth.getSession() : null;
    const uid = (sess && sess.userId) || 'anon';
    const blob = await UI.compressImage(file);
    const path = uid + '/works/' + workId + '/' + Date.now() + '.jpg';
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

  function openFotoModal(url) {
    const m = UI.openModal({
      title: 'Foto de avance',
      size: 'wide',
      body: '<div style="text-align:center"><img src="' + UI.escapeHtml(url) + '" style="max-width:100%;max-height:70vh;border-radius:10px" alt="Foto"></div>',
      footer: '<button class="btn btn-ghost" data-cancel>Cerrar</button>',
    });
    m.panel.querySelector('[data-cancel]').addEventListener('click', m.close);
  }

  /* Comparte la obra con el cliente mediante un enlace público (token) */
  function shareWithClient(w) {
    if (!w.publicToken) {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
      let t = '';
      for (let i = 0; i < 20; i++) t += chars[Math.floor(Math.random() * chars.length)];
      w.publicToken = t;
      S.update('works', w.id, { publicToken: t });
    }
    const link = 'https://gestiongadu.vercel.app/#/portal/' + w.publicToken;
    const m = UI.openModal({
      title: 'Compartir con el cliente',
      subtitle: 'Este enlace muestra el avance de la obra sin datos sensibles (costos, márgenes ni empleados).',
      body:
        '<div class="card-inset" style="margin:0">' +
        '<label class="muted small">Enlace público</label>' +
        '<input class="input" id="shareLink" readonly value="' + UI.escapeHtml(link) + '" style="margin-top:6px">' +
        '</div>' +
        '<p class="form-hint" style="margin-top:10px">Cualquiera con este enlace puede ver el avance; no necesita iniciar sesión.</p>',
      footer:
        '<button class="btn btn-ghost" data-cancel>Cerrar</button>' +
        '<button class="btn btn-soft" data-copy>' + UI.icon('copy', 14) + 'Copiar enlace</button>' +
        '<a class="btn btn-primary" href="https://wa.me/?text=' + encodeURIComponent('Hola! Mirá el avance de tu obra: ' + link) + '" target="_blank" rel="noopener">' + UI.icon('whatsapp', 14) + 'Enviar por WhatsApp</a>',
    });
    m.panel.querySelector('[data-cancel]').addEventListener('click', m.close);
    m.panel.querySelector('[data-copy]').addEventListener('click', async () => {
      const inp = m.panel.querySelector('#shareLink');
      try { await navigator.clipboard.writeText(inp.value); }
      catch (e) { inp.select(); try { document.execCommand('copy'); } catch (e2) {} }
      UI.toast('✅ Enlace copiado');
    });
  }

  /* Genera un reporte ejecutivo en PDF (exclusivo Plan PRO/Empresa) */
  function exportPDF(ctx) {
    const plan = (G.plan && G.plan.currentPlan) ? G.plan.currentPlan() : { id: 'free' };
    if (plan.id !== 'pro' && plan.id !== 'empresa') {
      if (G.ui && G.ui.toast) G.ui.toast('Los reportes en PDF son exclusivos del Plan PRO', 'warning');
      if (G.upgrade) G.upgrade();
      return;
    }
    if (typeof html2pdf === 'undefined') { if (G.ui && G.ui.toast) G.ui.toast('Cargando el generador de PDF…', 'info'); return; }

    const w = ctx.w, st = ctx.st;
    const client = S.contactById(w.clientId);
    const hoy = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' });
    const movs = ctx.incomes.slice(0, 10).map(i => ({ fecha: i.date, tipo: 'Ingreso', detalle: i.concept || '', monto: Number(i.amount) }))
      .concat(ctx.costs.slice(0, 10).map(c => ({ fecha: c.date, tipo: 'Gasto', detalle: c.description || c.category || '', monto: -Number(c.amount) })))
      .sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 12);

    const html =
      '<div style="font-family:Arial,Helvetica,sans-serif;color:#1e293b;padding:24px;background:#fff;max-width:760px">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;border-bottom:3px solid #f59e0b;padding-bottom:12px;margin-bottom:16px">' +
        '<div><div style="font-size:22px;font-weight:800;color:#0f172a">GADU Construye</div><div style="font-size:12px;color:#64748b">Tu gestión, perfecta</div></div>' +
        '<div style="text-align:right"><div style="font-size:14px;color:#64748b">Reporte de obra</div><div style="font-size:12px;color:#94a3b8">' + hoy + '</div></div>' +
      '</div>' +
      '<h1 style="font-size:20px;margin:0 0 4px;color:#0f172a">' + UI.escapeHtml(w.name) + '</h1>' +
      '<p style="font-size:13px;color:#64748b;margin:0 0 20px">Cliente: ' + UI.escapeHtml(client ? client.name : 'Sin cliente') + ' · ' + UI.escapeHtml(w.location || '') + '</p>' +
      '<table style="width:100%;border-collapse:collapse;margin-bottom:20px">' +
        '<tr><td style="padding:8px;color:#64748b">Presupuesto total</td><td style="padding:8px;text-align:right;font-weight:700">' + UI.fmtMoney(w.budgetTotal) + '</td></tr>' +
        '<tr><td style="padding:8px;color:#64748b">Cobrado</td><td style="padding:8px;text-align:right;color:#16a34a;font-weight:700">' + UI.fmtMoney(st.incomes) + '</td></tr>' +
        '<tr><td style="padding:8px;color:#64748b">Gastos directos</td><td style="padding:8px;text-align:right;color:#dc2626;font-weight:700">−' + UI.fmtMoney(st.costs) + '</td></tr>' +
        '<tr style="border-top:2px solid #cbd5e1"><td style="padding:10px 8px;font-weight:800">Margen de ganancia</td><td style="padding:10px 8px;text-align:right;font-weight:800;font-size:16px;color:' + (st.margin >= 0 ? '#16a34a' : '#dc2626') + '">' + UI.fmtMoney(st.margin) + '</td></tr>' +
      '</table>' +
      '<div style="margin-bottom:20px"><div style="font-weight:700;margin-bottom:6px">Avance</div>' +
        '<div style="font-size:13px;color:#64748b;margin-bottom:2px">Físico: ' + Math.round(Number(w.advanceFisico) || 0) + '%</div>' +
        '<div style="font-size:13px;color:#64748b">Cobro: ' + Math.round(st.advanceCobro) + '%</div></div>' +
      '<div style="font-weight:700;margin-bottom:6px">Últimos movimientos</div>' +
      '<table style="width:100%;border-collapse:collapse;font-size:12px">' +
        '<tr style="background:#f1f5f9"><th style="text-align:left;padding:6px 8px;color:#64748b">Fecha</th><th style="text-align:left;padding:6px 8px;color:#64748b">Tipo</th><th style="text-align:left;padding:6px 8px;color:#64748b">Concepto</th><th style="text-align:right;padding:6px 8px;color:#64748b">Monto</th></tr>' +
        (movs.map(m => '<tr><td style="padding:6px 8px;border-bottom:1px solid #e2e8f0">' + UI.fmtDate(m.fecha) + '</td><td style="padding:6px 8px;border-bottom:1px solid #e2e8f0">' + m.tipo + '</td><td style="padding:6px 8px;border-bottom:1px solid #e2e8f0">' + UI.escapeHtml(m.detalle) + '</td><td style="text-align:right;padding:6px 8px;border-bottom:1px solid #e2e8f0;color:' + (m.monto >= 0 ? '#16a34a' : '#dc2626') + '">' + (m.monto >= 0 ? '+' : '−') + UI.fmtMoney(Math.abs(m.monto)) + '</td></tr>').join('') || '<tr><td colspan="4" style="padding:8px;color:#94a3b8">Sin movimientos.</td></tr>') +
      '</table>' +
      '<div style="text-align:center;color:#94a3b8;font-size:12px;margin-top:24px">Generado por GADU - Tu gestión, perfecta</div>' +
      '</div>';

    const container = document.createElement('div');
    container.style.position = 'fixed';
    container.style.left = '-9999px';
    container.style.top = '0';
    container.innerHTML = html;
    document.body.appendChild(container);

    const filename = 'Reporte_Obra_' + String(w.name || 'obra').replace(/[^a-z0-9áéíóúñ ]/gi, '').replace(/\s+/g, '_') + '.pdf';

    html2pdf().from(container).set({
      margin: 8,
      filename: filename,
      image: { type: 'jpeg', quality: 0.95 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    }).save().then(() => { try { document.body.removeChild(container); } catch (e) {} });
  }

  function render(view, params) {
    const w = S.data.works.find(x => x.id === params.id);
    if (!w) {
      view.innerHTML = UI.emptyState('alert-triangle', 'Obra no encontrada', 'Puede haber sido eliminada.', '<a class="btn btn-soft" href="#/obras">Volver a obras</a>');
      return;
    }
    const st = S.workStats(w.id);
    const client = S.contactById(w.clientId);
    const incomes = S.data.incomes.filter(x => x.workId === w.id).slice().sort((a, b) => b.date.localeCompare(a.date));
    const costs = S.data.expenses.filter(x => x.type === 'obra' && x.workId === w.id).slice().sort((a, b) => b.date.localeCompare(a.date));
    const budget = S.data.budgets.filter(b => b.workId === w.id).slice().sort((a, b) => b.date.localeCompare(a.date))[0] || null;
    const clientAdv = S.workClientAdvances(w.id);
    const empAdv = S.workEmployeeAdvances(w.id);
    const workEmps = S.workEmployees(w.id);
    const advNet = clientAdv.total - empAdv.total;
    const ctx = { w, st, incomes, costs, budget, clientAdv, empAdv, workEmps, advNet };

    view.innerHTML =
      '<div class="detail-head card">' +
      '<a class="btn btn-ghost btn-sm" href="#/obras">' + UI.icon('chevron-left', 15) + 'Obras</a>' +
      '<div class="detail-title">' +
      '<h2>' + UI.escapeHtml(w.name) + ' <span class="code">' + UI.escapeHtml(w.code || '') + '</span></h2>' +
      '<p class="muted">' + UI.icon('map-pin', 13) + UI.escapeHtml(w.location || 'Sin ubicación') +
      ' · ' + UI.icon('users', 13) + UI.escapeHtml(client ? client.name : 'Sin cliente') +
      ' · ' + UI.fmtDate(w.startDate) + ' → ' + (w.endDate ? UI.fmtDate(w.endDate) : '—') + '</p>' +
      '</div>' +
      '<div class="detail-actions">' +
      '<select class="select" id="statusSel" style="max-width:160px">' +
      S.WORK_STATUS.map(s => '<option value="' + s + '"' + (w.status === s ? ' selected' : '') + '>' + (s === 'activa' ? 'Activa' : s === 'pausada' ? 'Pausada' : 'Finalizada') + '</option>').join('') +
      '</select>' +
      '<button class="btn btn-soft" id="btnPdf">' + UI.icon('file-text', 15) + 'Exportar PDF</button>' +
      '<button class="btn btn-soft" id="btnShare">' + UI.icon('whatsapp', 15) + 'Compartir con el Cliente</button>' +
      '<button class="btn btn-soft" id="btnEdit">' + UI.icon('edit', 15) + 'Editar</button>' +
      '<button class="btn btn-soft-danger" id="btnDel" title="Eliminar obra">' + UI.icon('trash', 15) + '</button>' +
      '</div></div>' +

      '<section class="kpi-grid kpi-4">' +
      kpi('file-text', 'neutral', 'Presupuesto', UI.fmtMoney(w.budgetTotal), budget ? 'Según ' + budget.code : 'Sin presupuesto asociado', '#/presupuestos') +
      kpi('trending-up', 'success', 'Cobrado', UI.fmtMoney(st.incomes), Math.round(st.advanceCobro) + '% del presupuesto', '#/ingresos') +
      kpi('arrow-up-right', 'danger', 'Costos directos', UI.fmtMoney(st.costs), Math.round(st.advanceCosto) + '% del presupuesto', '#/gastos') +
      kpi('activity', st.margin >= 0 ? 'success' : 'danger', 'Margen', UI.fmtMoney(st.margin), st.marginPct.toFixed(1) + '% sobre lo cobrado', 'finResumen') +
      '</section>' +

      '<section class="grid-2">' +
      '<div class="card">' +
      '<div class="card-head"><h3>Avance físico de la obra</h3></div>' +
      '<div class="range-wrap">' +
      '<div class="range-head"><span class="muted">Progreso</span><b id="advLabel">' + Math.round(Number(w.advanceFisico) || 0) + '%</b></div>' +
      '<input type="range" class="range" id="advRange" min="0" max="100" step="1" value="' + Math.round(Number(w.advanceFisico) || 0) + '">' +
      '<p class="form-hint">Movelo para actualizar el avance físico. Se guarda automáticamente.</p>' +
      '</div>' +
      '<div class="bars-block">' +
      barRow('Avance de cobro', st.advanceCobro, 'var(--info)', UI.fmtMoney(st.incomes) + ' cobrados') +
      barRow('Avance de costos', st.advanceCosto, 'var(--warning)', UI.fmtMoney(st.costs) + ' ejecutados') +
      '</div></div>' +
      '<div class="card" id="finResumen">' +
      '<div class="card-head"><h3>Resumen financiero</h3></div>' +
      '<div class="stack">' +
      sumRow('Presupuesto total', UI.fmtMoney(w.budgetTotal)) +
      sumRow('Ingresos recibidos', UI.fmtMoney(st.incomes), 'pos') +
      sumRow('Gastos directos', '−' + UI.fmtMoney(st.costs), 'neg') +
      sumRow('Margen de ganancia', UI.fmtMoney(st.margin), st.margin >= 0 ? 'pos' : 'neg', true) +
      '<div class="split-row"><span class="muted">Adelantos del cliente (' + clientAdv.list.length + ')</span><b class="pos">+' + UI.fmtMoney(clientAdv.total) + '</b></div>' +
      '<div class="split-row"><span class="muted">Adelantos a empleados (' + empAdv.list.length + ')</span><b class="warning-text">−' + UI.fmtMoney(empAdv.total) + '</b></div>' +
      '<div class="split-row"><span class="muted">Saldo neto de adelantos</span><b class="' + (advNet >= 0 ? 'pos' : 'neg') + '">' + (advNet >= 0 ? '+' : '−') + UI.fmtMoney(Math.abs(advNet)) + '</b></div>' +
      (st.costs > Number(w.budgetTotal) && Number(w.budgetTotal) > 0
        ? '<div class="alert alert-danger">' + UI.icon('alert-triangle', 16) + ' Los costos superan el presupuesto en ' + UI.fmtMoney(st.costs - Number(w.budgetTotal)) + '.</div>'
        : '') +
      (w.description ? '<p class="form-hint">' + UI.escapeHtml(w.description) + '</p>' : '') +
      '</div></div>' +
      '</section>' +

      '<section class="card">' +
      '<div class="card-head"><h3>Galería de Avance</h3></div>' +
      '<input type="file" id="fotosInput" accept="image/*" multiple hidden>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">' +
      '<button class="btn btn-soft" id="btnFotos">' + UI.icon('camera', 15) + ' Subir Fotos</button>' +
      '</div>' +
      '<div id="fotosGrid" class="portal-photos">' +
      (w.photos && w.photos.length
        ? w.photos.map(p => '<img src="' + UI.escapeHtml(p) + '" alt="Foto de avance" style="cursor:pointer" data-foto="' + UI.escapeHtml(p) + '">').join('')
        : '<p class="form-hint">Sin fotos de avance todavía.</p>') +
      '</div></section>' +

      '<section class="card">' +
      '<div class="tabs">' +
      '<button class="tab ' + (state.tab === 'ingresos' ? 'active' : '') + '" data-tab="ingresos">Ingresos (' + incomes.length + ')</button>' +
      '<button class="tab ' + (state.tab === 'gastos' ? 'active' : '') + '" data-tab="gastos">Gastos directos (' + costs.length + ')</button>' +
      '<button class="tab ' + (state.tab === 'personal' ? 'active' : '') + '" data-tab="personal">Personal (' + workEmps.length + ')</button>' +
      '<button class="tab ' + (state.tab === 'presupuesto' ? 'active' : '') + '" data-tab="presupuesto">Presupuesto</button>' +
      '</div>' +
      '<div id="tabWrap">' + tabHTML(state.tab, ctx) + '</div>' +
      '</section>';

    /* Avance físico */
    const range = view.querySelector('#advRange');
    range.addEventListener('input', () => { view.querySelector('#advLabel').textContent = range.value + '%'; });
    range.addEventListener('change', () => {
      S.update('works', w.id, { advanceFisico: Number(range.value) });
      UI.toast('Avance físico actualizado');
    });

    /* Estado */
    view.querySelector('#statusSel').addEventListener('change', e => {
      S.update('works', w.id, { status: e.target.value });
      UI.toast('Estado actualizado');
      G.router.refresh();
    });

    view.querySelector('#btnEdit').addEventListener('click', () => G.actions.work(w));
    view.querySelector('#btnPdf').addEventListener('click', () => exportPDF(ctx));
    view.querySelector('#btnShare').addEventListener('click', () => shareWithClient(w));

    /* Tarjetas KPI clickeables: hash → navegar · id → scroll al desglose */
    UI.on(view, '[data-nav]', 'click', e => {
      const nav = e.currentTarget.dataset.nav;
      if (!nav) return;
      if (nav.indexOf('#/') === 0) { location.hash = nav; return; }
      const el = document.getElementById(nav);
      if (el) { try { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e2) { el.scrollIntoView(); } }
    });

    /* Galería de fotos de avance */
    const fotosInput = view.querySelector('#fotosInput');
    const btnFotos = view.querySelector('#btnFotos');
    if (btnFotos && fotosInput) {
      btnFotos.addEventListener('click', () => fotosInput.click());
      fotosInput.addEventListener('change', async () => {
        const files = Array.from(fotosInput.files || []);
        if (!files.length) return;
        const original = btnFotos.textContent;
        btnFotos.disabled = true;
        const photos = Array.isArray(w.photos) ? w.photos.slice() : [];
        try {
          for (const f of files) {
            btnFotos.textContent = 'Subiendo…';
            const url = await uploadWorkPhoto(f, w.id);
            photos.push(url);
          }
          S.update('works', w.id, { photos });
          UI.toast('✅ ' + files.length + ' foto' + (files.length !== 1 ? 's' : '') + ' subida' + (files.length !== 1 ? 's' : ''));
          render(view, { id: w.id });
        } catch (e) {
          UI.toast('❌ No se pudo subir: ' + ((e && e.message) || e), 'error');
          btnFotos.disabled = false;
          btnFotos.textContent = original;
        }
      });
    }
    view.querySelectorAll('[data-foto]').forEach(img => img.addEventListener('click', () => openFotoModal(img.dataset.foto)));
    view.querySelector('#btnDel').addEventListener('click', async () => {
      const ok = await UI.confirm({
        title: 'Eliminar obra',
        message: 'Se eliminará <strong>' + UI.escapeHtml(w.name) + '</strong> junto con sus ingresos y gastos. Esta acción no se puede deshacer.',
        okLabel: 'Eliminar obra',
      });
      if (ok) {
        S.removeWork(w.id);
        UI.toast('Obra eliminada');
        location.hash = '#/obras';
      }
    });

    /* Pestañas */
    UI.on(view, '.tab', 'click', e => {
      state.tab = e.currentTarget.dataset.tab;
      view.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === state.tab));
      const wrap = view.querySelector('#tabWrap');
      wrap.innerHTML = tabHTML(state.tab, ctx);
      bindTabContent(view, ctx);
    });
    bindTabContent(view, ctx);
  }

  function tabHTML(tab, ctx) {
    const { w, incomes, costs, budget, workEmps } = ctx;
    if (tab === 'ingresos') {
      return '<div class="toolbar" style="margin-bottom:12px">' +
        '<button class="btn btn-soft-success btn-sm" id="btnAddInc">' + UI.icon('plus', 15) + 'Registrar cobro</button>' +
        '<button class="btn btn-soft-warning btn-sm" id="btnAddAdvCli">' + UI.icon('zap', 15) + 'Adelanto del cliente</button>' +
        '<span class="form-hint">Cobros y adelantos recibidos de esta obra.</span></div>' +
        '<div class="table-wrap"><table class="data-table">' +
        '<thead><tr><th>Fecha</th><th>Tipo</th><th>Concepto</th><th>Método</th><th>Referencia</th><th class="num">Monto</th><th></th></tr></thead>' +
        '<tbody>' +
        (incomes.map(i => '<tr>' +
          '<td class="muted">' + UI.fmtDate(i.date) + '</td>' +
          '<td>' + (i.incomeKind === 'adelanto' ? UI.chip('Adelanto', 'warning', 'zap') : UI.chip('Cobro', 'success', 'check')) + '</td>' +
          '<td><strong>' + UI.escapeHtml(i.concept) + '</strong></td>' +
          '<td>' + UI.chip(i.method || 'Otro', methodTone(i.method)) + '</td>' +
          '<td class="muted">' + UI.escapeHtml(i.reference || '—') + '</td>' +
          '<td class="num pos">+' + UI.fmtMoney(i.amount) + '</td>' +
          '<td><div class="row-actions">' +
          '<button class="icon-btn sm" data-einc="' + i.id + '" title="Editar">' + UI.icon('edit', 15) + '</button>' +
          '<button class="icon-btn sm danger" data-dinc="' + i.id + '" title="Eliminar">' + UI.icon('trash', 15) + '</button>' +
          '</div></td></tr>').join('') ||
          '<tr><td colspan="7">' + UI.emptyState('trending-up', 'Sin ingresos registrados', 'Registrá el primer cobro de esta obra.') + '</td></tr>') +
        '</tbody></table></div>';
    }
    if (tab === 'gastos') {
      return '<div class="toolbar" style="margin-bottom:12px">' +
        '<button class="btn btn-soft-danger btn-sm" id="btnAddExp">' + UI.icon('plus', 15) + 'Cargar gasto</button>' +
        '<button class="btn btn-soft-warning btn-sm" id="btnAdvEmp">' + UI.icon('zap', 15) + 'Adelanto a empleado</button>' +
        '<span class="form-hint">Costos directos y adelantos de dinero al personal de esta obra.</span></div>' +
        '<div class="table-wrap"><table class="data-table">' +
        '<thead><tr><th>Fecha</th><th>Categoría</th><th>Proveedor / Empleado</th><th>Descripción</th><th>Factura</th><th class="num">Monto</th><th></th></tr></thead>' +
        '<tbody>' +
        (costs.map(x => '<tr>' +
          '<td class="muted">' + UI.fmtDate(x.date) + '</td>' +
          '<td>' + UI.chip(x.category || 'Otros', 'neutral') + (x.expenseKind === 'adelanto' ? ' ' + UI.chip('Adelanto', 'warning', 'zap') : '') + '</td>' +
          '<td>' + (x.employeeId
            ? '<strong>' + UI.escapeHtml(S.employeeName(S.employeeById(x.employeeId)) || '—') + '</strong> ' + UI.chip('Empleado', 'info')
            : UI.escapeHtml((S.contactById(x.providerId) || {}).name || '—')) + '</td>' +
          '<td>' + UI.escapeHtml(x.description) + '</td>' +
          '<td class="muted">' + UI.escapeHtml(x.invoiceNumber || '—') + '</td>' +
          '<td class="num neg">−' + UI.fmtMoney(x.amount) + '</td>' +
          '<td><div class="row-actions">' +
          '<button class="icon-btn sm" data-eexp="' + x.id + '" title="Editar">' + UI.icon('edit', 15) + '</button>' +
          '<button class="icon-btn sm danger" data-dexp="' + x.id + '" title="Eliminar">' + UI.icon('trash', 15) + '</button>' +
          '</div></td></tr>').join('') ||
          '<tr><td colspan="7">' + UI.emptyState('arrow-up-right', 'Sin gastos directos', 'Cargá los costos de esta obra.') + '</td></tr>') +
        '</tbody></table></div>';
    }
    if (tab === 'personal') {
      return '<div class="toolbar" style="margin-bottom:12px">' +
        '<button class="btn btn-soft-info btn-sm" id="btnAssign">' + UI.icon('calendar-plus', 15) + 'Asignar jornada en esta obra</button>' +
        '<span class="form-hint">El personal que trabajó en esta obra según las jornadas cargadas.</span></div>' +
        '<div class="table-wrap"><table class="data-table">' +
        '<thead><tr><th>Empleado</th><th class="num">Días en obra</th><th class="num">Horas</th><th class="num">Costo estimado</th><th>Última jornada</th><th></th></tr></thead>' +
        '<tbody>' +
        (workEmps.map(we => '<tr class="clickable" data-emp="' + (we.employee ? we.employee.id : '') + '">' +
          '<td>' + UI.avatar(we.name, 30, we.employee ? we.employee.photo : null) + ' <strong>' + UI.escapeHtml(we.name || '—') + '</strong></td>' +
          '<td class="num">' + we.days + '</td>' +
          '<td class="num"><b>' + UI.fmtNum(we.hours) + '</b></td>' +
          '<td class="num">' + (we.cost ? UI.fmtMoney(we.cost) : '—') + '</td>' +
          '<td class="muted">' + UI.fmtDateShort(we.last) + '</td>' +
          '<td><div class="row-actions">' +
          '<a class="icon-btn sm" href="#/empleado/' + (we.employee ? we.employee.id : '') + '" title="Ver legajo">' + UI.icon('eye', 15) + '</a>' +
          '<button class="icon-btn sm" data-att="' + (we.employee ? we.employee.id : '') + '" title="Registrar jornada">' + UI.icon('calendar-plus', 15) + '</button>' +
          '</div></td></tr>').join('') ||
          '<tr><td colspan="6">' + UI.emptyState('user', 'Sin personal asignado', 'Registrá jornadas con horas en esta obra para ver quién trabaja acá.') + '</td></tr>') +
        '</tbody></table></div>';
    }
    if (budget) {
      return '<div class="toolbar" style="margin-bottom:12px">' +
        '<span class="code">' + UI.escapeHtml(budget.code) + '</span>' +
        '<strong>' + UI.escapeHtml(budget.name) + '</strong>' +
        UI.chip(budget.status === 'aprobado' ? 'Aprobado' : budget.status, budget.status === 'aprobado' ? 'success' : 'neutral') +
        '<div class="grow"></div>' +
        '<button class="btn btn-soft btn-sm" id="btnEditBudget">' + UI.icon('edit', 15) + 'Editar presupuesto</button>' +
        '</div>' +
        '<div class="table-wrap"><table class="data-table">' +
        '<thead><tr><th>Ítem</th><th>Unidad</th><th class="num">Cant.</th><th class="num">P. unitario</th><th class="num">Subtotal</th></tr></thead>' +
        '<tbody>' +
        budget.items.map(it => '<tr>' +
          '<td>' + UI.escapeHtml(it.desc) + '</td>' +
          '<td class="muted">' + UI.escapeHtml(it.unit || '—') + '</td>' +
          '<td class="num">' + UI.fmtNum(it.qty) + '</td>' +
          '<td class="num">' + UI.fmtMoney(it.price, 2) + '</td>' +
          '<td class="num">' + UI.fmtMoney(Number(it.price || 0) * Number(it.qty || 0), 2) + '</td>' +
          '</tr>').join('') +
        '</tbody></table></div>' +
        '<div class="budget-totals">' +
        '<div class="budget-total-row"><span>Subtotal</span><span>' + UI.fmtMoney(budget.subtotal) + '</span></div>' +
        (budget.discount ? '<div class="budget-total-row"><span>Descuento (' + budget.discount + '%)</span><span class="neg">−' + UI.fmtMoney(budget.subtotal - budget.total) + '</span></div>' : '') +
        '<div class="budget-total-row grand"><span>Total</span><span>' + UI.fmtMoney(budget.total) + '</span></div>' +
        '</div>' +
        (budget.notes ? '<p class="form-hint" style="margin-top:10px">' + UI.escapeHtml(budget.notes) + '</p>' : '');
    }
    return UI.emptyState('file-text', 'Sin presupuesto asociado', 'Creá un presupuesto para esta obra.', '<button class="btn btn-primary" id="btnNewBudget">' + UI.icon('plus', 15) + 'Crear presupuesto</button>');
  }

  function methodTone(m) {
    return ({ 'Efectivo': 'success', 'Transferencia': 'info', 'Cheque': 'violet', 'Mercado Pago': 'primary' })[m] || 'neutral';
  }

  function bindTabContent(view, ctx) {
    const wrap = view.querySelector('#tabWrap');
    const addInc = wrap.querySelector('#btnAddInc');
    if (addInc) addInc.addEventListener('click', () => G.actions.income({ workId: ctx.w.id }));
    const addAdvCli = wrap.querySelector('#btnAddAdvCli');
    if (addAdvCli) addAdvCli.addEventListener('click', () => G.actions.income({ workId: ctx.w.id, incomeKind: 'adelanto', concept: 'Adelanto de cliente' }));
    const addExp = wrap.querySelector('#btnAddExp');
    if (addExp) addExp.addEventListener('click', () => G.actions.expense({ type: 'obra', workId: ctx.w.id }));
    const advEmp = wrap.querySelector('#btnAdvEmp');
    if (advEmp) advEmp.addEventListener('click', () => G.actions.expense({ type: 'obra', workId: ctx.w.id, expenseKind: 'adelanto' }));
    const assign = wrap.querySelector('#btnAssign');
    if (assign) assign.addEventListener('click', () => G.actions.attendance({ workId: ctx.w.id }));
    const editBudget = wrap.querySelector('#btnEditBudget');
    if (editBudget) editBudget.addEventListener('click', () => G.actions.budget(ctx.budget));
    const newBudget = wrap.querySelector('#btnNewBudget');
    if (newBudget) newBudget.addEventListener('click', () => G.actions.budget(null, { workId: ctx.w.id, clientId: ctx.w.clientId }));

    UI.on(wrap, '[data-emp]', 'click', e => {
      if (e.target.closest('button') || e.target.closest('a')) return;
      location.hash = '#/empleado/' + e.currentTarget.dataset.emp;
    });
    UI.on(wrap, '[data-att]', 'click', e => {
      const empId = e.target.closest('[data-att]').dataset.att;
      if (empId) G.actions.attendance({ employeeId: empId, workId: ctx.w.id });
    });
    UI.on(wrap, '[data-einc]', 'click', e => {
      const id = e.target.closest('[data-einc]').dataset.einc;
      G.actions.income({ income: S.data.incomes.find(x => x.id === id) });
    });
    UI.on(wrap, '[data-dinc]', 'click', async e => {
      const id = e.target.closest('[data-dinc]').dataset.dinc;
      const ok = await UI.confirm({ title: 'Eliminar ingreso', message: '¿Eliminar este cobro? El cálculo del margen se actualizará.', okLabel: 'Eliminar' });
      if (ok) { S.remove('incomes', id); UI.toast('Ingreso eliminado'); G.router.refresh(); }
    });
    UI.on(wrap, '[data-eexp]', 'click', e => {
      const id = e.target.closest('[data-eexp]').dataset.eexp;
      G.actions.expense({ expense: S.data.expenses.find(x => x.id === id) });
    });
    UI.on(wrap, '[data-dexp]', 'click', async e => {
      const id = e.target.closest('[data-dexp]').dataset.dexp;
      const ok = await UI.confirm({ title: 'Eliminar gasto', message: '¿Eliminar este gasto? El cálculo del margen se actualizará.', okLabel: 'Eliminar' });
      if (ok) { S.remove('expenses', id); UI.toast('Gasto eliminado'); G.router.refresh(); }
    });
  }
})(typeof window !== 'undefined' ? window : globalThis);
