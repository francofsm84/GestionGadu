/* ============================================================
   GADU · Panel de Administración (solo admin / super_admin)
   Usuarios · Planes · Configuración · Métricas · Auditoría
   ============================================================ */
(function (root) {
  'use strict';
  const G = root.GADU, S = G.store, UI = G.ui;

  G.router.add('admin', 'admin', 'Administración', 'Gestión de usuarios, planes, configuración y métricas del sistema', render);

  const ROL_LABEL = { super_admin: 'Super Admin', admin: 'Admin', gestor_obra: 'Gestor de obra', contador: 'Contador' };
  const STATUS_LABEL = { active: 'Activa', trialing: 'Prueba', past_due: 'En mora', canceled: 'Cancelada', expired: 'Vencida' };
  let tab = 'usuarios';
  let soporteFilter = { tab: 'open', q: '' };

  /* ---------- Exportación de usuarios ---------- */
  function userColumns(u, planes) {
    return [
      u.email || '',
      u.empresa_constructora || u.empresa || '',
      ROL_LABEL[u.rol] || u.rol || '',
      (planes.find(p => p.id === u.plan_id) || {}).nombre || u.plan_id || '',
      STATUS_LABEL[u.subscription_status] || u.subscription_status || '',
      u.telefono || '',
      u.direccion || '',
      u.localidad || u.nacionalidad || '',
      (u.created_at || '').slice(0, 10),
    ];
  }
  function exportCSV(rows, planes) {
    const headers = ['Email', 'Constructora', 'Rol', 'Plan', 'Suscripción', 'Teléfono', 'Dirección', 'Nacionalidad', 'Registro'];
    const esc = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const lines = [headers.join(',')];
    rows.forEach(u => lines.push(userColumns(u, planes).map(esc).join(',')));
    UI.download('usuarios-gadu.csv', '\uFEFF' + lines.join('\r\n'), 'text/csv;charset=utf-8');
    UI.toast('CSV exportado (' + rows.length + ' usuarios)');
  }
  function exportExcel(rows, planes) {
    const headers = ['Email', 'Constructora', 'Rol', 'Plan', 'Suscripción', 'Teléfono', 'Dirección', 'Nacionalidad', 'Registro'];
    const esc = v => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    let html = '<table border="1"><thead><tr>' + headers.map(h => '<th>' + h + '</th>').join('') + '</tr></thead><tbody>';
    rows.forEach(u => { html += '<tr>' + userColumns(u, planes).map(c => '<td>' + esc(c) + '</td>').join('') + '</tr>'; });
    html += '</tbody></table>';
    UI.download('usuarios-gadu.xls', '<html><head><meta charset="utf-8"></head><body>' + html + '</body></html>', 'application/vnd.ms-excel');
    UI.toast('Excel exportado (' + rows.length + ' usuarios)');
  }
  function exportPDF(rows, planes) {
    const w = window.open('', '_blank');
    if (!w) { UI.toast('Permití las ventanas emergentes para exportar PDF', 'error'); return; }
    let body = '<table><thead><tr>' +
      ['Email', 'Constructora', 'Rol', 'Plan', 'Suscripción', 'Teléfono', 'Dirección', 'Nacionalidad', 'Registro'].map(h => '<th>' + h + '</th>').join('') +
      '</tr></thead><tbody>';
    rows.forEach(u => { body += '<tr>' + userColumns(u, planes).map(c => '<td>' + String(c == null ? '' : c) + '</td>').join('') + '</tr>'; });
    body += '</tbody></table>';
    w.document.write('<html><head><title>Usuarios GADU</title><style>body{font-family:Arial;padding:20px}h1{font-size:18px}table{border-collapse:collapse;width:100%;font-size:11px}th,td{border:1px solid #ccc;padding:5px;text-align:left}th{background:#f0f0f0}</style></head><body><h1>Usuarios GADU (' + rows.length + ')</h1>' + body + '<script>window.onload=function(){window.print()}<\/script></body></html>');
    w.document.close();
  }

  function render(view) {
    if (!G.plan.isAdmin()) {
      view.innerHTML = '<div class="card">' + UI.emptyState('lock', 'Sin permisos', 'Este panel es exclusivo para administradores.') +
        '<p style="text-align:center"><a class="btn btn-primary" href="#/dashboard">Volver al panel</a></p></div>';
      return;
    }
    view.innerHTML =
      '<div class="tabs">' +
      tabBtn('usuarios', '👥 Usuarios') + tabBtn('planes', '💳 Planes') + tabBtn('licencias', '🎫 Licencias') + tabBtn('soporte', '📞 Soporte') + tabBtn('config', '⚙️ Configuración') + tabBtn('metricas', '📊 Métricas') + tabBtn('auditoria', '🧾 Auditoría') +
      '</div>' +
      '<div id="adminBody"></div>';
    view.querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => { tab = b.dataset.t; render(view); }));
    loadTab(view);
  }

  function tabBtn(t, label) { return '<button class="tab' + (tab === t ? ' active' : '') + '" data-t="' + t + '">' + label + '</button>'; }

  async function loadTab(view) {
    const body = view.querySelector('#adminBody');
    body.innerHTML = '<div class="card">' + UI.emptyState('activity', 'Cargando…', '') + '</div>';
    try {
      if (tab === 'usuarios') await tabUsuarios(body);
      else if (tab === 'planes') await tabPlanes(body);
      else if (tab === 'licencias') await tabLicencias(body);
      else if (tab === 'soporte') await tabSoporte(body);
      else if (tab === 'config') await tabConfig(body);
      else if (tab === 'metricas') await tabMetricas(body);
      else await tabAuditoria(body);
    } catch (err) {
      body.innerHTML = '<div class="card">' + UI.emptyState('alert-triangle', 'No se pudo cargar', ((err && err.message) || err) + '. Verificá que corriste supabase-setup-v3.sql.') + '</div>';
    }
  }

  /* ---------- Usuarios ---------- */
  function trialLabel(u) {
    if (u.subscription_status === 'trialing') {
      const end = u.trial_ends_at || u.trial_end;
      if (end) {
        const d = Math.max(0, Math.ceil((new Date(end).getTime() - Date.now()) / 86400000));
        return 'En prueba · Quedan ' + d + ' día' + (d !== 1 ? 's' : '');
      }
      return 'En prueba';
    }
    return STATUS_LABEL[u.subscription_status] || u.subscription_status;
  }

  /* Auditoría de soporte: ver los datos de un cliente (solo lectura) */
  async function openVerDatos(uid, email) {
    const m = UI.openModal({
      title: 'Datos de ' + email,
      subtitle: 'Auditoría de soporte · solo lectura',
      size: 'wide',
      body: '<div id="vdBody"><p class="form-hint">Cargando…</p></div>',
      footer: '<button class="btn btn-ghost" data-cancel>Cerrar</button>',
    });
    m.panel.querySelector('[data-cancel]').addEventListener('click', m.close);
    try {
      const rows = await G.api('GET', '/app_data?select=data,updated_at&user_id=eq.' + encodeURIComponent(uid) + '&limit=1');
      const d = (rows && rows[0] && rows[0].data) || {};
      const updatedAt = (rows && rows[0] && rows[0].updated_at) || '';
      const works = d.works || [], contacts = d.contacts || [], employees = d.employees || [], budgets = d.budgets || [], incomes = d.incomes || [], expenses = d.expenses || [];
      const activas = works.filter(w => w.status === 'activa').length;
      const clientes = contacts.filter(c => c.type === 'cliente').length;
      const totalIn = S.sum(incomes.map(x => x.amount));
      const totalOut = S.sum(expenses.map(x => x.amount));
      const stat = (l, v, s) => '<div class="kpi-card"><div class="kpi-body"><span class="kpi-label">' + l + '</span><strong class="kpi-value">' + v + '</strong><span class="kpi-sub">' + s + '</span></div></div>';
      const obrasList = works.slice(0, 12).map(w => '<div class="split-row"><span>' + UI.escapeHtml(w.name || '—') + '</span>' + UI.chip(w.status || '', w.status === 'activa' ? 'success' : 'neutral') + '</div>').join('');
      m.panel.querySelector('#vdBody').innerHTML =
        '<p class="muted small" style="margin-bottom:12px">Última sincronización: ' + (updatedAt ? UI.fmtDate(updatedAt) + ' · ' + new Date(updatedAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : '—') + '</p>' +
        '<div class="kpi-grid kpi-4" style="margin-bottom:14px">' +
        stat('Obras', works.length, activas + ' activas') + stat('Clientes', clientes, '') + stat('Empleados', employees.length, '') + stat('Presupuestos', budgets.length, '') +
        '</div>' +
        '<div class="card-inset">' +
        '<div class="split-row"><strong>Ingresos</strong><b class="pos">+' + UI.fmtMoney(totalIn) + '</b></div>' +
        '<div class="split-row"><strong>Gastos</strong><b class="neg">−' + UI.fmtMoney(totalOut) + '</b></div>' +
        '<div class="split-row"><strong>Balance</strong><b>' + UI.fmtMoney(totalIn - totalOut) + '</b></div>' +
        (obrasList ? '<h4 style="margin-top:10px">Obras</h4>' + obrasList : '<p class="form-hint" style="margin-top:8px">Sin obras registradas.</p>') +
        '</div>';
      await G.plan.log('ver_datos_usuario', email);
    } catch (err) {
      m.panel.querySelector('#vdBody').innerHTML = '<p class="form-hint" style="color:var(--danger)">No se pudo cargar: ' + ((err && err.message) || err) + '</p>';
    }
  }

  /* ---------- Licencias (códigos prepagos) ---------- */
  function randomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let out = 'GADU-';
    for (let i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)];
    return out;
  }

  async function tabLicencias(body) {
    const planes = G.plan.planes || [];
    let codes = [];
    try { codes = await G.api('GET', '/license_codes?select=*&order=created_at.desc'); } catch (e) {}

    body.innerHTML =
      '<div class="card" style="margin-bottom:14px">' +
      '<div class="card-head"><div><h3>Generar código de licencia</h3><p class="muted">Códigos prepagos de un solo uso para activar planes.</p></div></div>' +
      '<div class="grid-form">' +
      '<div class="field"><label>Plan</label><select class="select" id="lcPlan">' +
      planes.map(p => '<option value="' + p.id + '">' + p.nombre + '</option>').join('') +
      '</select></div>' +
      '<div class="field"><label>Días de duración</label><input class="input" type="number" id="lcDays" value="30" min="1"></div>' +
      '<div class="field"><label>&nbsp;</label><button class="btn btn-primary" id="lcGen">' + UI.icon('plus', 16) + 'Generar Código</button></div>' +
      '</div></div>' +
      '<div class="card"><div class="card-head"><div><h3>Códigos generados</h3><p class="muted">' + codes.length + ' códigos</p></div></div>' +
      '<div class="table-wrap"><table class="data-table">' +
      '<thead><tr><th>Código</th><th>Plan</th><th>Días</th><th>Estado</th><th>Usado por</th><th>Fecha de uso</th></tr></thead>' +
      '<tbody>' + (codes.map(c =>
        '<tr>' +
        '<td><code>' + UI.escapeHtml(c.code) + '</code></td>' +
        '<td>' + UI.escapeHtml((planes.find(p => p.id === c.plan_id) || {}).nombre || c.plan_id) + '</td>' +
        '<td>' + c.duration_days + '</td>' +
        '<td>' + (c.is_used ? UI.chip('Usado', 'danger') : UI.chip('Disponible', 'success')) + '</td>' +
        '<td class="muted small">' + (c.used_by_user_id ? UI.escapeHtml(String(c.used_by_user_id).slice(0, 8)) + '…' : '—') + '</td>' +
        '<td class="muted small">' + (c.used_at ? UI.fmtDate(c.used_at) : '—') + '</td>' +
        '</tr>').join('') || '<tr><td colspan="6">' + UI.emptyState('inbox', 'Sin códigos', 'Generá el primero desde el formulario de arriba.') + '</td></tr>') +
      '</tbody></table></div></div>';

    body.querySelector('#lcGen').addEventListener('click', async () => {
      const plan_id = body.querySelector('#lcPlan').value;
      const duration_days = Number(body.querySelector('#lcDays').value) || 30;
      const code = randomCode();
      try {
        await G.api('POST', '/license_codes', { code, plan_id, duration_days });
        await G.plan.log('licencia_generada', code + ' · ' + plan_id + ' · ' + duration_days + 'd');
        UI.toast('✅ Código generado: ' + code);
        tabLicencias(body);
      } catch (err) {
        UI.toast('❌ No se pudo generar: ' + ((err && err.message) || err), 'error');
      }
    });
  }

  /* ---------- Soporte (tickets "hablar con un humano") ---------- */
  async function tabSoporte(body) {
    let tickets = [];
    try { tickets = await G.api('GET', '/support_tickets?select=*&order=created_at.desc'); } catch (e) {}

    const filter = soporteFilter || (soporteFilter = { tab: 'open', q: '' });
    const hasReply = t => Array.isArray(t.messages) && t.messages.some(m => m.role === 'admin');
    const open = tickets.filter(t => t.status === 'open' && !hasReply(t));
    const progress = tickets.filter(t => t.status === 'open' && hasReply(t));
    const closed = tickets.filter(t => t.status === 'closed');
    const list = filter.tab === 'open' ? open : (filter.tab === 'progress' ? progress : closed);
    const q = filter.q.toLowerCase();
    const filtered = q ? list.filter(t =>
      String(t.phone || '').includes(q) ||
      String(t.created_at || '').includes(q) ||
      String(t.message || '').toLowerCase().includes(q)
    ) : list;

    const stabBtn = (k, label, count) =>
      '<button class="tab' + (filter.tab === k ? ' active' : '') + '" data-stab="' + k + '">' + label + ' (' + count + ')</button>';

    body.innerHTML =
      '<div class="toolbar">' +
      '<div class="tabs">' +
      stabBtn('open', 'Abiertos', open.length) + stabBtn('progress', 'En Proceso', progress.length) + stabBtn('closed', 'Resueltos', closed.length) +
      '</div>' +
      '<div class="grow"></div>' +
      '<div class="search">' + UI.icon('search', 16) + '<input id="sq" class="input" placeholder="Buscar por teléfono o fecha…" value="' + UI.escapeHtml(filter.q) + '"></div>' +
      '</div>' +
      '<div class="card" style="margin-top:10px">' +
      '<div class="card-head"><div><h3>Tickets de soporte</h3><p class="muted">' + filtered.length + ' en esta vista</p></div></div>' +
      '<div class="stack">' +
      (filtered.map(t =>
        '<div class="card-inset" style="margin-top:10px">' +
        '<div class="split-row"><div class="split-row-main"><strong>' + UI.escapeHtml(t.phone || '—') + '</strong>' +
        '<span class="muted small">' + (t.created_at ? UI.fmtDate(t.created_at) : '—') + (hasReply(t) && t.status !== 'closed' ? ' ' + UI.chip('En proceso', 'info') : '') + '</span></div>' +
        '<div class="split-row-end">' +
        '<button class="btn btn-soft btn-sm" data-ticket="' + t.id + '" data-reply="' + UI.escapeHtml(t.phone || '') + '" data-msg="' + UI.escapeHtml(t.message || '') + '" data-user="' + (t.user_id || '') + '">' + UI.icon('whatsapp', 14) + ' Responder</button>' +
        (t.status !== 'closed' ? '<button class="btn btn-soft btn-sm" data-close-ticket="' + t.id + '">' + UI.icon('check', 14) + ' Resolver</button>' : '') +
        '</div></div>' +
        '<p class="muted" style="margin:6px 0 0">' + UI.escapeHtml(t.message || '—') + '</p>' +
        '</div>').join('') || '<p class="form-hint">No hay tickets en esta vista.</p>') +
      '</div></div>';

    body.querySelectorAll('[data-stab]').forEach(b => b.addEventListener('click', () => {
      filter.tab = b.dataset.stab; tabSoporte(body);
    }));
    const sq = body.querySelector('#sq');
    if (sq) sq.addEventListener('input', () => { filter.q = sq.value; tabSoporte(body); });

    body.querySelectorAll('[data-close-ticket]').forEach(b => b.addEventListener('click', async () => {
      const id = b.dataset.closeTicket;
      try {
        await G.api('PATCH', '/support_tickets?id=eq.' + encodeURIComponent(id), { status: 'closed' });
        UI.toast('✅ Ticket marcado como resuelto');
        tabSoporte(body);
      } catch (e) {
        UI.toast('❌ No se pudo actualizar: ' + ((e && e.message) || e), 'error');
      }
    }));

    body.querySelectorAll('[data-reply]').forEach(b => b.addEventListener('click', () => {
      openSupportChat(b.dataset.ticket, b.dataset.reply, b.dataset.msg, b.dataset.user);
    }));
  }

  /* Envía un mensaje de WhatsApp usando la Edge Function (Graph API de Meta) */
  async function sendWhatsAppMessage(to, text) {
    const sess = G.auth.getSession();
    const res = await fetch(G.auth.SUPABASE_URL + '/functions/v1/send-whatsapp-message', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': G.auth.SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + (sess ? sess.accessToken : ''),
      },
      body: JSON.stringify({ to, text }),
    });
    if (!res.ok) {
      let msg = 'HTTP ' + res.status;
      try { const j = await res.json(); msg = j.error || (j.meta && j.meta.error && j.meta.error.message) || msg; } catch (e) {}
      throw new Error(msg);
    }
    return res.json();
  }

  /* Modal de chat para responder un ticket directamente por la API de Meta.
     Carga el historial guardado en support_tickets.messages y lo persiste. */
  async function openSupportChat(id, phone, message, userId) {
    /* 1) Ticket completo (messages + notes + status) */
    let ticket = {};
    try {
      const rows = await G.api('GET', '/support_tickets?select=*&id=eq.' + encodeURIComponent(id) + '&limit=1');
      ticket = (rows && rows[0]) ? rows[0] : {};
    } catch (e) {}
    const saved = Array.isArray(ticket.messages) ? ticket.messages : [];
    const hist = saved.length
      ? saved.map(ms => ({ me: ms.role === 'admin', text: ms.text }))
      : [{ me: false, text: message || '(sin mensaje)' }];

    /* 2) Ficha del cliente (perfil + métricas) e historial de tickets */
    let profile = null, metrics = null, history = [];
    if (userId) {
      try {
        const p = await G.api('GET', '/profiles?select=*&user_id=eq.' + encodeURIComponent(userId) + '&limit=1');
        profile = (p && p[0]) ? p[0] : null;
      } catch (e) {}
      try {
        const a = await G.api('GET', '/app_data?select=data,updated_at&user_id=eq.' + encodeURIComponent(userId) + '&limit=1');
        if (a && a[0]) {
          const d = a[0].data || {};
          const works = d.works || [];
          const active = works.filter(w => w.status === 'activa').length;
          const incomes = (d.incomes || []).reduce((s, x) => s + (Number(x.amount) || 0), 0);
          const expenses = (d.expenses || []).reduce((s, x) => s + (Number(x.amount) || 0), 0);
          metrics = { active, balance: incomes - expenses, lastActive: a[0].updated_at };
        }
      } catch (e) {}
    }
    try {
      history = await G.api('GET', '/support_tickets?select=id,created_at,status&phone=eq.' + encodeURIComponent(phone) + '&order=created_at.desc&limit=10');
    } catch (e) {}

    /* 3) Plantillas rápidas */
    const CANNED = [
      '¡Hola! Gracias por escribirnos. ¿En qué podemos ayudarte?',
      'Ya recibimos tu consulta y la estamos revisando.',
      'Por favor, enviame una foto del comprobante y lo cargamos.',
      '¿Podés confirmarme el número de WhatsApp vinculado a tu cuenta?',
      'El problema fue resuelto. ¿Necesitás algo más?',
    ];

    const statusLabel = ticket.status === 'closed' ? 'Resuelto' : (hist.some(h => h.me) ? 'En proceso' : 'Abierto');
    const statusTone = ticket.status === 'closed' ? 'success' : (hist.some(h => h.me) ? 'info' : 'warning');

    const m = UI.openModal({
      title: 'Chat de soporte',
      subtitle: phone,
      size: 'wide',
      body:
        '<div class="card-inset" style="margin-bottom:10px">' +
        '<div class="split-row"><div class="split-row-main"><strong>' + UI.escapeHtml(profile ? ((profile.nombre || '') + ' ' + (profile.apellido || '')).trim() || profile.email || 'Cliente' : 'Cliente') + '</strong>' +
        '<span class="muted small">' + UI.escapeHtml(profile ? (profile.email || '') : '') + '</span></div>' +
        '<div class="split-row-end">' + UI.chip(statusLabel, statusTone) + '</div></div>' +
        '<div class="muted small">' +
        (profile ? 'Plan: ' + UI.escapeHtml(profile.plan_id || 'free') + ' · Estado: ' + UI.escapeHtml(profile.subscription_status || '—') : '') +
        (metrics ? (profile ? ' · ' : '') + 'Obras activas: ' + metrics.active + ' · Balance: ' + UI.fmtMoney(metrics.balance) + (metrics.lastActive ? ' · Últ. actividad: ' + UI.fmtDate(metrics.lastActive) : '') : '') +
        '</div>' +
        (Array.isArray(history) && history.length > 1
          ? '<div class="muted small" style="margin-top:4px">Historial: ' + history.length + ' ticket(s) · ' + history.slice(0, 5).map(h => (h.status === 'closed' ? 'Resuelto' : 'Abierto') + ' (' + UI.fmtDate(h.created_at) + ')').join(' · ') + '</div>'
          : '') +
        '</div>' +
        '<div id="chatHist" class="stack" style="max-height:260px;overflow-y:auto;margin-bottom:10px"></div>' +
        '<div class="ai-actions" style="margin:0 0 10px">' + CANNED.map((c, i) => '<button class="btn btn-soft btn-sm" data-canned="' + i + '" title="' + UI.escapeHtml(c) + '">' + UI.escapeHtml(c.slice(0, 22)) + '</button>').join('') + '</div>' +
        '<textarea class="input" id="chatInput" placeholder="Escribí tu respuesta…" style="width:100%;min-height:64px"></textarea>' +
        '<div style="margin-top:8px"><label class="muted small">Nota interna (solo admin, no se envía)</label>' +
        '<textarea class="input" id="chatNote" placeholder="Nota privada…" style="width:100%;min-height:44px">' + UI.escapeHtml(ticket.notes || '') + '</textarea></div>',
      footer: '<button class="btn btn-ghost" data-cancel>Cerrar</button><button class="btn btn-soft" data-note>' + UI.icon('check', 14) + ' Guardar nota</button><button class="btn btn-primary" data-send>' + UI.icon('whatsapp', 14) + ' Enviar</button>',
    });

    const renderHist = () => {
      m.panel.querySelector('#chatHist').innerHTML = hist.map(h =>
        '<div class="card-inset" style="margin-top:6px' + (h.me ? ';background:var(--primary-soft)' : '') + '">' +
        '<strong class="muted small">' + (h.me ? 'Vos' : 'Cliente') + '</strong>' +
        '<div style="white-space:pre-wrap">' + UI.escapeHtml(h.text) + '</div></div>').join('');
    };
    renderHist();

    const persist = async () => {
      try {
        await G.api('PATCH', '/support_tickets?id=eq.' + encodeURIComponent(id), {
          messages: hist.map(h => ({ role: h.me ? 'admin' : 'user', text: h.text, at: new Date().toISOString() })),
        });
      } catch (e) {}
    };

    m.panel.querySelectorAll('[data-canned]').forEach(b => b.addEventListener('click', () => {
      m.panel.querySelector('#chatInput').value = CANNED[Number(b.dataset.canned)];
    }));

    m.panel.querySelector('[data-note]').addEventListener('click', async () => {
      try {
        await G.api('PATCH', '/support_tickets?id=eq.' + encodeURIComponent(id), { notes: m.panel.querySelector('#chatNote').value });
        UI.toast('✅ Nota guardada');
      } catch (e) {
        UI.toast('❌ No se pudo guardar la nota', 'error');
      }
    });

    m.panel.querySelector('[data-cancel]').addEventListener('click', m.close);
    m.panel.querySelector('[data-send]').addEventListener('click', async () => {
      const inp = m.panel.querySelector('#chatInput');
      const text = inp.value.trim();
      if (!text) { UI.toast('Escribí un mensaje', 'error'); return; }
      try {
        await sendWhatsAppMessage(phone, text);
        hist.push({ me: true, text });
        inp.value = '';
        renderHist();
        await persist();
        UI.toast('✅ Mensaje enviado');
      } catch (e) {
        UI.toast('❌ No se pudo enviar: ' + ((e && e.message) || e), 'error');
      }
    });
  }

  async function tabUsuarios(body) {
    const rows = await G.api('GET', '/profiles?select=*&order=created_at.asc');
    /* Telemetría: contadores de uso por usuario desde app_data (JSON) */
    const usage = {};
    try {
      const appRows = await G.api('GET', '/app_data?select=user_id,data,updated_at');
      (appRows || []).forEach(r => {
        const d = r.data || {};
        usage[r.user_id] = {
          obras: (d.works || []).length,
          gastos: (d.expenses || []).length,
          empleados: (d.employees || []).length,
          updatedAt: r.updated_at || '',
        };
      });
    } catch (e) {}
    let invitaciones = [];
    try { invitaciones = await G.api('GET', '/invitaciones?select=*&order=created_at.asc'); } catch (e) {}
    const planes = G.plan.planes || [];
    const rubros = [...new Set(rows.map(u => u.rubro_principal || u.rubro).filter(Boolean))];
    body.innerHTML =
      '<div class="toolbar">' +
      '<div class="search">' + UI.icon('search', 16) + '<input id="uq" class="input" placeholder="Buscar por email, empresa…"></div>' +
      '<select id="fPlan" class="select" style="max-width:140px"><option value="">Plan: todos</option>' + planes.map(p => '<option value="' + p.id + '">' + p.nombre + '</option>').join('') + '</select>' +
      '<select id="fStatus" class="select" style="max-width:150px"><option value="">Estado: todos</option><option value="trialing">Prueba</option><option value="active">Activa</option><option value="past_due">En mora</option><option value="canceled">Cancelada</option><option value="suspendido">Suspendida</option></select>' +
      '<select id="fRubro" class="select" style="max-width:150px"><option value="">Rubro: todos</option>' + rubros.map(r => '<option value="' + UI.escapeHtml(r) + '">' + UI.escapeHtml(r) + '</option>').join('') + '</select>' +
      '<div class="grow"></div>' +
      '<button class="btn btn-soft btn-sm" id="btnCSV" title="Exportar CSV">' + UI.icon('download', 14) + 'CSV</button>' +
      '<button class="btn btn-soft btn-sm" id="btnExcel" title="Exportar Excel">' + UI.icon('download', 14) + 'Excel</button>' +
      '<button class="btn btn-soft btn-sm" id="btnPDF" title="Exportar PDF">' + UI.icon('download', 14) + 'PDF</button>' +
      '<button class="btn btn-primary" id="btnInvite">' + UI.icon('plus', 16) + 'Registrar usuario</button>' +
      '</div>' +
      '<div class="table-wrap"><table class="data-table">' +
      '<thead><tr><th>Usuario</th><th>Rol</th><th>Plan</th><th>Suscripción</th><th>Estado</th><th class="num">Obras</th><th class="num">Gastos</th><th class="num">Empleados</th><th>Última conexión</th><th></th></tr></thead>' +
      '<tbody>' + rows.map(u => userRow(u, planes, usage[u.user_id])).join('') + '</tbody></table></div>' +
      (invitaciones.length
        ? '<div class="card" style="margin-top:14px"><div class="card-head"><div><h3>Invitaciones pendientes</h3><p class="muted">Se activan solas cuando la persona entra por primera vez con Google.</p></div></div>' +
          '<div class="stack">' + invitaciones.map(i =>
            '<div class="split-row">' +
            '<div class="split-row-main"><strong>' + UI.escapeHtml(i.email) + '</strong>' +
            '<span class="muted small">' + (ROL_LABEL[i.rol] || i.rol) + ' · ' + UI.escapeHtml(planes.find(p => p.id === i.plan_id) ? (planes.find(p => p.id === i.plan_id)).nombre : (i.plan_id || '')) + (i.empresa ? ' · ' + UI.escapeHtml(i.empresa) : '') + '</span></div>' +
            '<div class="split-row-end">' + UI.chip('Pendiente', 'warning') +
            '<button class="icon-btn sm danger" data-delinv="' + UI.escapeHtml(i.email) + '" title="Eliminar">' + UI.icon('trash', 14) + '</button></div>' +
            '</div>').join('') + '</div></div>'
        : '');

    const applyFilters = () => {
      const q = (body.querySelector('#uq').value || '').toLowerCase();
      const fPlan = body.querySelector('#fPlan').value;
      const fStatus = body.querySelector('#fStatus').value;
      const fRubro = body.querySelector('#fRubro').value;
      body.querySelectorAll('tbody tr').forEach(tr => {
        const okPlan = !fPlan || tr.dataset.plan === fPlan;
        const okStatus = !fStatus || tr.dataset.status === fStatus;
        const okRubro = !fRubro || tr.dataset.rubro === fRubro;
        const okQ = !q || tr.textContent.toLowerCase().includes(q);
        tr.hidden = !(okPlan && okStatus && okRubro && okQ);
      });
    };
    body.querySelector('#uq').addEventListener('input', applyFilters);
    body.querySelector('#fPlan').addEventListener('change', applyFilters);
    body.querySelector('#fStatus').addEventListener('change', applyFilters);
    body.querySelector('#fRubro').addEventListener('change', applyFilters);
    body.querySelector('#btnInvite').addEventListener('click', () => inviteModal(() => tabUsuarios(body)));
    body.querySelector('#btnCSV').addEventListener('click', () => exportCSV(rows, planes));
    body.querySelector('#btnExcel').addEventListener('click', () => exportExcel(rows, planes));
    body.querySelector('#btnPDF').addEventListener('click', () => exportPDF(rows, planes));
    body.querySelectorAll('[data-ver]').forEach(b => b.addEventListener('click', e => {
      const uid = b.dataset.ver;
      const u = rows.find(x => x.user_id === uid);
      openVerDatos(uid, u ? u.email : uid);
    }));
    body.querySelectorAll('[data-delinv]').forEach(b => b.addEventListener('click', async e => {
      await G.api('DELETE', '/invitaciones?email=eq.' + encodeURIComponent(b.dataset.delinv));
      await G.plan.log('invitacion_eliminada', b.dataset.delinv);
      UI.toast('Invitación eliminada');
      tabUsuarios(body);
    }));

    body.querySelectorAll('[data-sel]').forEach(sel => sel.addEventListener('change', e => {
      const uid = sel.dataset.uid;
      const campo = sel.dataset.sel;
      const valor = sel.value;
      updateUser(uid, { [campo]: valor });
    }));
    body.querySelectorAll('[data-trial]').forEach(b => b.addEventListener('click', e => {
      const uid = b.dataset.trial;
      const nueva = new Date(Date.now() + 15 * 86400000).toISOString();
      updateUser(uid, { trial_end: nueva, trial_ends_at: nueva });
      UI.toast('Prueba extendida +15 días');
    }));
    body.querySelectorAll('[data-toggle]').forEach(b => b.addEventListener('click', e => {
      const uid = b.dataset.toggle;
      const est = b.dataset.estado === 'activo' ? 'suspendido' : 'activo';
      updateUser(uid, { estado_cuenta: est });
    }));
    body.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', async e => {
      const uid = b.dataset.del;
      const ok = await UI.confirm({ title: 'Eliminar usuario', message: 'Se eliminará su acceso y todos sus datos. Esta acción no se puede deshacer.', okLabel: 'Eliminar', tone: 'danger' });
      if (!ok) return;
      await G.api('DELETE', '/profiles?user_id=eq.' + encodeURIComponent(uid));
      await G.plan.log('usuario_eliminado', uid);
      UI.toast('Usuario eliminado');
      tabUsuarios(body);
    }));
  }

  function userRow(u, planes, usage) {
    const protegido = u.rol === 'admin' || u.rol === 'super_admin';
    const uso = usage || { obras: 0, gastos: 0, empleados: 0 };
    const rubro = u.rubro_principal || u.rubro || '';
    const stTone = u.subscription_status === 'active' ? 'success' : (u.subscription_status === 'past_due' ? 'danger' : (u.subscription_status === 'trialing' ? 'info' : 'warning'));
    const planOpts = planes.map(p => '<option value="' + p.id + '"' + (u.plan_id === p.id ? ' selected' : '') + '>' + p.nombre + '</option>').join('');
    const rolOpts = G.plan.ROLES.map(r => '<option value="' + r + '"' + (u.rol === r ? ' selected' : '') + '>' + (ROL_LABEL[r] || r) + '</option>').join('');
    return '<tr data-uid="' + u.user_id + '" data-plan="' + (u.plan_id || '') + '" data-status="' + (u.estado_cuenta === 'suspendido' ? 'suspendido' : (u.subscription_status || '')) + '" data-rubro="' + UI.escapeHtml(rubro) + '">' +
      '<td><strong>' + UI.escapeHtml(u.email || '—') + '</strong>' + (protegido ? ' ' + UI.chip('🔒 Protegida', 'success') : '') + '<br><span class="muted small">' + UI.escapeHtml(u.empresa_constructora || u.empresa || '—') + (rubro ? ' · ' + UI.escapeHtml(rubro) : '') + '</span></td>' +
      '<td><select class="select" data-sel="rol" data-uid="' + u.user_id + '"' + (protegido ? ' disabled' : '') + '>' + rolOpts + '</select></td>' +
      '<td><select class="select" data-sel="plan_id" data-uid="' + u.user_id + '"' + (protegido ? ' disabled' : '') + '>' + planOpts + '</select></td>' +
      '<td>' + UI.chip(trialLabel(u), stTone) + '</td>' +
      '<td>' + UI.chip(u.estado_cuenta === 'activo' ? 'Activo' : 'Suspendido', u.estado_cuenta === 'activo' ? 'success' : 'danger') + '</td>' +
      '<td class="num">' + uso.obras + '</td>' +
      '<td class="num">' + uso.gastos + '</td>' +
      '<td class="num">' + uso.empleados + '</td>' +
      '<td class="muted small">' + (u.ultima_conexion ? UI.fmtDate(u.ultima_conexion) : '—') + '</td>' +
      '<td><div class="row-actions">' +
      '<button class="icon-btn sm" data-ver="' + u.user_id + '" title="Ver datos / auditar">' + UI.icon('eye', 14) + '</button>' +
      (protegido
        ? '<span class="muted small">Acceso total</span>'
        : '<button class="icon-btn sm" data-trial="' + u.user_id + '" title="Extender trial +15 días">' + UI.icon('calendar-plus', 14) + '</button>' +
          '<button class="icon-btn sm" data-toggle="' + u.user_id + '" data-estado="' + u.estado_cuenta + '" title="Activar/Suspender">' + UI.icon(u.estado_cuenta === 'activo' ? 'pause' : 'play', 14) + '</button>' +
          '<button class="icon-btn sm danger" data-del="' + u.user_id + '" title="Eliminar">' + UI.icon('trash', 14) + '</button>') +
      '</div></td></tr>';
  }

  async function updateUser(uid, patch) {
    await G.api('PATCH', '/profiles?user_id=eq.' + encodeURIComponent(uid), patch);
    await G.plan.log('usuario_actualizado', uid + ' · ' + JSON.stringify(patch));
    UI.toast('Guardado');
  }

  function inviteModal(onSaved) {
    const m = UI.openModal({
      title: 'Registrar usuario',
      subtitle: 'Se crea una invitación pre-asignada. Cuando la persona entre por primera vez con ese Google, recibe automáticamente este rol y plan.',
      body:
        '<div class="grid-form">' +
        '<div class="field span-2"><label>Email de Google *</label><input class="input" id="iEmail" placeholder="usuario@gmail.com"></div>' +
        '<div class="field"><label>Rol</label><select class="select" id="iRol">' + G.plan.ROLES.map(r => '<option>' + r + '</option>').join('') + '</select></div>' +
        '<div class="field"><label>Plan</label><select class="select" id="iPlan">' + (G.plan.planes || []).map(p => '<option value="' + p.id + '">' + p.nombre + '</option>').join('') + '</select></div>' +
        '<div class="field span-2"><label>Empresa / constructora</label><input class="input" id="iEmp" placeholder="Nombre de la constructora"></div>' +
        '</div>',
      footer: '<button class="btn btn-ghost" data-cancel>Cerrar</button><button class="btn btn-primary" data-save>Crear registro</button>',
    });
    m.panel.querySelector('[data-cancel]').addEventListener('click', m.close);
    m.panel.querySelector('[data-save]').addEventListener('click', async () => {
      const email = m.panel.querySelector('#iEmail').value.trim();
      if (!email) { UI.toast('Ingresá el email', 'error'); return; }
      try {
        await G.api('POST', '/invitaciones', {
          email: email.toLowerCase(),
          rol: m.panel.querySelector('#iRol').value,
          plan_id: m.panel.querySelector('#iPlan').value,
          empresa: m.panel.querySelector('#iEmp').value.trim(),
          estado: 'pendiente',
        });
        await G.plan.log('usuario_invitado', email);
        UI.toast('✅ Invitación creada. Aparecerá como "Pendiente" hasta que entre por Google.', 'success');
        m.close();
        if (onSaved) onSaved();
      } catch (err) {
        UI.toast('❌ No se pudo crear: ' + ((err && err.message) || err), 'error');
      }
    });
  }

  /* ---------- Planes ---------- */
  async function tabPlanes(body) {
    const planes = await G.api('GET', '/planes?select=*&order=orden.asc');
    body.innerHTML = '<div class="cards-grid">' + planes.map(p =>
      '<div class="card" style="padding:16px">' +
      '<div class="split-row"><strong style="font-size:16px">' + UI.escapeHtml(p.nombre) + '</strong>' +
      '<label class="form-hint"><input type="checkbox" ' + (p.activo ? 'checked' : '') + ' data-activo="' + p.id + '"> activo</label></div>' +
      '<div class="grid-form" style="margin-top:8px">' +
      '<div class="field"><label>Precio mensual ($)</label><input class="input" type="number" data-campo="precio_mensual" data-id="' + p.id + '" value="' + p.precio_mensual + '"></div>' +
      '<div class="field"><label>Precio anual ($)</label><input class="input" type="number" data-campo="precio_anual" data-id="' + p.id + '" value="' + p.precio_anual + '"></div>' +
      '<div class="field"><label>Máx. obras activas</label><input class="input" type="number" data-campo="limite_obras_activas" data-id="' + p.id + '" value="' + p.limite_obras_activas + '"></div>' +
      '<div class="field"><label>Máx. empleados</label><input class="input" type="number" data-campo="limite_empleados" data-id="' + p.id + '" value="' + p.limite_empleados + '"></div>' +
      '</div>' +
      '<button class="btn btn-soft btn-sm" data-save="' + p.id + '" style="margin-top:8px">' + UI.icon('check', 14) + 'Guardar</button>' +
      '</div>').join('') + '</div>';

    body.querySelectorAll('[data-save]').forEach(b => b.addEventListener('click', async e => {
      const id = b.dataset.save;
      const patch = {};
      body.querySelectorAll('[data-campo][data-id="' + id + '"]').forEach(inp => { patch[inp.dataset.campo] = UI.readNum(inp); });
      const btn = b;
      btn.disabled = true;
      try {
        await G.api('PATCH', '/planes?id=eq.' + encodeURIComponent(id), patch);
        await G.plan.log('plan_editado', id);
        UI.toast('✅ Plan "' + id + '" guardado', 'success');
        await tabPlanes(body);   // recarga la vista con los valores persistidos
      } catch (err) {
        UI.toast('❌ No se pudo guardar: ' + ((err && err.message) || err), 'error');
        btn.disabled = false;
      }
    }));
    body.querySelectorAll('[data-activo]').forEach(cb => cb.addEventListener('change', async e => {
      try {
        await G.api('PATCH', '/planes?id=eq.' + encodeURIComponent(cb.dataset.activo), { activo: cb.checked });
        await G.plan.log('plan_activado', cb.dataset.activo + '=' + cb.checked);
        UI.toast('✅ Plan actualizado', 'success');
        await tabPlanes(body);
      } catch (err) {
        UI.toast('❌ No se pudo actualizar: ' + ((err && err.message) || err), 'error');
        await tabPlanes(body);
      }
    }));
  }

  /* ---------- Configuración ---------- */
  async function tabConfig(body) {
    const neg = (await G.api('GET', '/negocio?id=eq.1'))[0] || {};
    let mp = {};
    try { mp = (await G.api('GET', '/credenciales_pago?id=eq.1'))[0] || {}; } catch (e) {}
    body.innerHTML =
      '<div class="card" style="max-width:620px;margin:0 auto">' +
      '<div class="grid-form">' +
      '<div class="field span-2"><label>Nombre de la empresa / plataforma</label><input class="input" id="cNombre" value="' + UI.escapeHtml(neg.nombre || '') + '"></div>' +
      '<div class="field"><label>Teléfono</label><input class="input" id="cTel" value="' + UI.escapeHtml(neg.telefono || '') + '"></div>' +
      '<div class="field"><label>Moneda</label><select class="select" id="cMon"><option' + (neg.moneda === 'ARS' ? ' selected' : '') + '>ARS</option><option' + (neg.moneda === 'USD' ? ' selected' : '') + '>USD</option></select></div>' +
      '<div class="field span-2"><label>Dirección</label><input class="input" id="cDir" value="' + UI.escapeHtml(neg.direccion || '') + '"></div>' +
      '<div class="field span-2"><label>Datos fiscales</label><textarea class="textarea" id="cFis" rows="2">' + UI.escapeHtml(neg.datos_fiscales || '') + '</textarea></div>' +
      '<div class="field"><label>Duración del trial (días)</label><input class="input" type="number" id="cTrial" min="1" max="365" value="' + (neg.trial_dias || 45) + '"></div>' +
      '<div class="field"><label>Modo mantenimiento</label><label class="form-hint" style="margin-top:7px"><input type="checkbox" id="cMant"' + (neg.modo_mantenimiento ? ' checked' : '') + ' style="accent-color:var(--primary)"> Activo (muestra banner en toda la app)</label></div>' +
      '<div class="field span-2"><label>Banner / anuncio global</label><textarea class="textarea" id="cBanner" rows="2" placeholder="Ej.: Nuevas funciones disponibles…">' + UI.escapeHtml(neg.banner_global || '') + '</textarea></div>' +
      '</div>' +
      '<button class="btn btn-primary" id="cSave" style="margin-top:10px">' + UI.icon('check', 15) + 'Guardar configuración</button>' +
      '</div>' +
      '<div class="card" style="max-width:620px;margin:14px auto 0">' +
      '<div class="card-head"><div><h3>Mercado Pago (cobro automático)</h3><p class="muted">Credenciales privadas · solo visibles para administradores</p></div></div>' +
      '<div class="grid-form">' +
      '<div class="field span-2"><label>Public Key</label><input class="input" id="mpPub" value="' + UI.escapeHtml(mp.mp_public_key || '') + '" placeholder="APP_USR-…"></div>' +
      '<div class="field span-2"><label>Access Token</label><input class="input" type="password" id="mpTok" value="' + UI.escapeHtml(mp.mp_access_token || '') + '" placeholder="APP_USR-…"></div>' +
      '</div>' +
      '<button class="btn btn-soft" id="mpSave" style="margin-top:10px">' + UI.icon('check', 15) + 'Guardar credenciales</button>' +
      '</div>';
    body.querySelector('#cSave').addEventListener('click', async () => {
      await G.api('PATCH', '/negocio?id=eq.1', {
        nombre: body.querySelector('#cNombre').value.trim(),
        telefono: body.querySelector('#cTel').value.trim(),
        moneda: body.querySelector('#cMon').value,
        direccion: body.querySelector('#cDir').value.trim(),
        datos_fiscales: body.querySelector('#cFis').value.trim(),
        trial_dias: Math.max(1, Math.min(365, UI.readNum(body.querySelector('#cTrial')))),
        modo_mantenimiento: body.querySelector('#cMant').checked,
        banner_global: body.querySelector('#cBanner').value.trim(),
      });
      await G.plan.log('configuracion_editada', 'negocio + trial/mantenimiento');
      UI.toast('✅ Configuración guardada', 'success');
    });
    body.querySelector('#mpSave').addEventListener('click', async () => {
      await G.api('PATCH', '/credenciales_pago?id=eq.1', {
        mp_public_key: body.querySelector('#mpPub').value.trim(),
        mp_access_token: body.querySelector('#mpTok').value.trim(),
      });
      await G.plan.log('credenciales_mp', 'guardadas');
      UI.toast('✅ Credenciales de Mercado Pago guardadas', 'success');
    });
  }

  /* ---------- Métricas ---------- */
  async function tabMetricas(body) {
    const m = await G.api('POST', '/rpc/metricas');
    const porPlan = (m.por_plan && typeof m.por_plan === 'object') ? m.por_plan : {};
    const ordenPlanes = ['Free', 'Pro', 'Pyme', 'Empresa'];
    body.innerHTML =
      '<section class="kpi-grid kpi-5">' +
      kpi('wallet', 'success', 'MRR (mensual)', UI.fmtMoney(m.mrr || 0), 'Ingresos recurrentes mensuales') +
      kpi('trending-up', 'violet', 'ARR (anual)', UI.fmtMoney(m.arr || 0), 'Ingresos recurrentes anuales') +
      kpi('users', 'info', 'Usuarios', String(m.usuarios || 0), (m.activos || 0) + ' activos') +
      kpi('hard-hat', 'warning', 'Obras totales', String(m.obras || 0), 'En todo el sistema') +
      kpi('check-circle', 'success', 'Conversión a pago', (m.conversion != null ? m.conversion : 0) + '%', 'De prueba a plan pago') +
      '</section>' +
      '<div class="card">' +
      '<div class="card-head"><div><h3>Distribución de planes activos</h3><p class="muted">Free · Pro · Pyme · Empresa</p></div></div>' +
      '<div class="stack">' +
      ordenPlanes.map(k => '<div class="split-row"><strong>' + k + '</strong><b>' + (porPlan[k] != null ? porPlan[k] : 0) + ' usuarios</b></div>').join('') +
      '</div></div>';
  }

  function kpi(icon, tone, label, value, sub) {
    return '<div class="kpi-card"><span class="kpi-ico kpi-' + tone + '">' + UI.icon(icon, 20) + '</span>' +
      '<div class="kpi-body"><span class="kpi-label">' + label + '</span><strong class="kpi-value">' + value + '</strong><span class="kpi-sub">' + sub + '</span></div></div>';
  }

  /* ---------- Auditoría ---------- */
  async function tabAuditoria(body) {
    const rows = await G.api('GET', '/auditoria?select=*&order=fecha.desc&limit=200');
    const acciones = [...new Set(rows.map(a => a.accion).filter(Boolean))].sort();
    body.innerHTML =
      '<div class="toolbar">' +
      '<div class="search">' + UI.icon('search', 16) + '<input id="aq" class="input" placeholder="Buscar por email / evento / detalle…"></div>' +
      '<select id="aTipo" class="select" style="max-width:220px"><option value="">Tipo de acción: todos</option>' + acciones.map(a => '<option value="' + UI.escapeHtml(a) + '">' + UI.escapeHtml(a) + '</option>').join('') + '</select>' +
      '<div class="grow"></div>' +
      '</div>' +
      '<div class="table-wrap"><table class="data-table">' +
      '<thead><tr><th>Fecha</th><th>Acción</th><th>Detalle</th></tr></thead>' +
      '<tbody>' + (rows.map(a => '<tr data-accion="' + UI.escapeHtml(a.accion) + '"><td class="muted">' + UI.fmtDate(a.fecha) + '</td><td>' + UI.chip(UI.escapeHtml(a.accion), 'info') + '</td><td class="muted">' + UI.escapeHtml(a.detalle || '') + '</td></tr>').join('') || '<tr><td colspan="3" class="muted">Sin registros.</td></tr>') +
      '</tbody></table></div>';
    const apply = () => {
      const q = (body.querySelector('#aq').value || '').toLowerCase();
      const t = body.querySelector('#aTipo').value;
      body.querySelectorAll('tbody tr').forEach(tr => {
        const okT = !t || tr.dataset.accion === t;
        const okQ = !q || tr.textContent.toLowerCase().includes(q);
        tr.hidden = !(okT && okQ);
      });
    };
    body.querySelector('#aq').addEventListener('input', apply);
    body.querySelector('#aTipo').addEventListener('change', apply);
  }

  /* Deep-links del asistente (COO Virtual): navegar a una pestaña del admin */
  G.actions.adminTab = function (name) {
    tab = name || 'usuarios';
    if (location.hash !== '#/admin') location.hash = '#/admin';
    else { const v = document.getElementById('view'); render(v); }
  };
  G.actions.adminInvite = function () {
    tab = 'usuarios';
    if (location.hash !== '#/admin') location.hash = '#/admin';
    setTimeout(() => inviteModal(() => { const v = document.getElementById('view'); render(v); }), 400);
  };
})(typeof window !== 'undefined' ? window : globalThis);
