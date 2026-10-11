/* ============================================================
   GADU · Panel de Administración (solo admin / super_admin)
   Usuarios · Planes · Configuración · Métricas · Auditoría
   ============================================================ */
(function (root) {
  'use strict';
  const G = root.GADU, S = G.store, UI = G.ui;

  G.router.add('admin', 'admin', 'Administración', 'Gestión de usuarios, planes, configuración y métricas del sistema', render);

  const ROL_LABEL = { super_admin: 'Super Admin', admin: 'Admin', gestor_obra: 'Gestor de obra', contador: 'Contador' };
  const STATUS_LABEL = { active: 'Activa', trialing: 'Prueba', past_due: 'En mora', canceled: 'Cancelada' };
  let tab = 'usuarios';

  function render(view) {
    if (!G.plan.isAdmin()) {
      view.innerHTML = '<div class="card">' + UI.emptyState('lock', 'Sin permisos', 'Este panel es exclusivo para administradores.') +
        '<p style="text-align:center"><a class="btn btn-primary" href="#/dashboard">Volver al panel</a></p></div>';
      return;
    }
    view.innerHTML =
      '<div class="tabs">' +
      tabBtn('usuarios', '👥 Usuarios') + tabBtn('planes', '💳 Planes') + tabBtn('config', '⚙️ Configuración') + tabBtn('metricas', '📊 Métricas') + tabBtn('auditoria', '🧾 Auditoría') +
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
      else if (tab === 'config') await tabConfig(body);
      else if (tab === 'metricas') await tabMetricas(body);
      else await tabAuditoria(body);
    } catch (err) {
      body.innerHTML = '<div class="card">' + UI.emptyState('alert-triangle', 'No se pudo cargar', ((err && err.message) || err) + '. Verificá que corriste supabase-setup-v3.sql.') + '</div>';
    }
  }

  /* ---------- Usuarios ---------- */
  async function tabUsuarios(body) {
    const rows = await G.api('GET', '/profiles?select=*&order=created_at.asc');
    let invitaciones = [];
    try { invitaciones = await G.api('GET', '/invitaciones?select=*&order=created_at.asc'); } catch (e) {}
    const planes = G.plan.planes || [];
    body.innerHTML =
      '<div class="toolbar">' +
      '<div class="search">' + UI.icon('search', 16) + '<input id="uq" class="input" placeholder="Buscar por email, empresa…"></div>' +
      '<div class="grow"></div>' +
      '<button class="btn btn-primary" id="btnInvite">' + UI.icon('plus', 16) + 'Registrar usuario</button>' +
      '</div>' +
      '<div class="table-wrap"><table class="data-table">' +
      '<thead><tr><th>Usuario</th><th>Rol</th><th>Plan</th><th>Suscripción</th><th>Estado</th><th>Última conexión</th><th></th></tr></thead>' +
      '<tbody>' + rows.map(u => userRow(u, planes)).join('') + '</tbody></table></div>' +
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

    body.querySelector('#uq').addEventListener('input', e => {
      const q = e.target.value.toLowerCase();
      body.querySelectorAll('tbody tr').forEach(tr => { tr.hidden = !tr.textContent.toLowerCase().includes(q); });
    });
    body.querySelector('#btnInvite').addEventListener('click', () => inviteModal(() => tabUsuarios(body)));
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
      const nueva = new Date(Date.now() + 7 * 86400000).toISOString();
      updateUser(uid, { trial_end: nueva });
      UI.toast('Prueba extendida 7 días');
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

  function userRow(u, planes) {
    const planOpts = planes.map(p => '<option value="' + p.id + '"' + (u.plan_id === p.id ? ' selected' : '') + '>' + p.nombre + '</option>').join('');
    const rolOpts = G.plan.ROLES.map(r => '<option value="' + r + '"' + (u.rol === r ? ' selected' : '') + '>' + (ROL_LABEL[r] || r) + '</option>').join('');
    return '<tr data-uid="' + u.user_id + '">' +
      '<td><strong>' + UI.escapeHtml(u.email || '—') + '</strong><br><span class="muted small">' + UI.escapeHtml(u.empresa || '—') + '</span></td>' +
      '<td><select class="select" data-sel="rol" data-uid="' + u.user_id + '">' + rolOpts + '</select></td>' +
      '<td><select class="select" data-sel="plan_id" data-uid="' + u.user_id + '">' + planOpts + '</select></td>' +
      '<td>' + UI.chip(STATUS_LABEL[u.subscription_status] || u.subscription_status, u.subscription_status === 'active' ? 'success' : (u.subscription_status === 'past_due' ? 'danger' : 'warning')) + '</td>' +
      '<td>' + UI.chip(u.estado_cuenta === 'activo' ? 'Activo' : 'Suspendido', u.estado_cuenta === 'activo' ? 'success' : 'danger') + '</td>' +
      '<td class="muted small">' + (u.ultima_conexion ? UI.fmtDate(u.ultima_conexion) : '—') + '</td>' +
      '<td><div class="row-actions">' +
      '<button class="icon-btn sm" data-trial="' + u.user_id + '" title="Extender prueba 7 días">' + UI.icon('calendar-plus', 14) + '</button>' +
      '<button class="icon-btn sm" data-toggle="' + u.user_id + '" data-estado="' + u.estado_cuenta + '" title="Activar/Suspender">' + UI.icon(u.estado_cuenta === 'activo' ? 'pause' : 'play', 14) + '</button>' +
      '<button class="icon-btn sm danger" data-del="' + u.user_id + '" title="Eliminar">' + UI.icon('trash', 14) + '</button>' +
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
      await G.api('PATCH', '/planes?id=eq.' + encodeURIComponent(id), patch);
      await G.plan.log('plan_editado', id);
      UI.toast('Plan guardado');
    }));
    body.querySelectorAll('[data-activo]').forEach(cb => cb.addEventListener('change', async e => {
      await G.api('PATCH', '/planes?id=eq.' + encodeURIComponent(cb.dataset.activo), { activo: cb.checked });
      await G.plan.log('plan_activado', cb.dataset.activo + '=' + cb.checked);
      UI.toast('Plan actualizado');
    }));
  }

  /* ---------- Configuración ---------- */
  async function tabConfig(body) {
    const neg = (await G.api('GET', '/negocio?id=eq.1'))[0] || {};
    body.innerHTML =
      '<div class="card" style="max-width:560px;margin:0 auto">' +
      '<div class="grid-form">' +
      '<div class="field span-2"><label>Nombre de la empresa / plataforma</label><input class="input" id="cNombre" value="' + UI.escapeHtml(neg.nombre || '') + '"></div>' +
      '<div class="field"><label>Teléfono</label><input class="input" id="cTel" value="' + UI.escapeHtml(neg.telefono || '') + '"></div>' +
      '<div class="field"><label>Moneda</label><select class="select" id="cMon"><option' + (neg.moneda === 'ARS' ? ' selected' : '') + '>ARS</option><option' + (neg.moneda === 'USD' ? ' selected' : '') + '>USD</option></select></div>' +
      '<div class="field span-2"><label>Dirección</label><input class="input" id="cDir" value="' + UI.escapeHtml(neg.direccion || '') + '"></div>' +
      '<div class="field span-2"><label>Datos fiscales</label><textarea class="textarea" id="cFis" rows="2">' + UI.escapeHtml(neg.datos_fiscales || '') + '</textarea></div>' +
      '</div>' +
      '<button class="btn btn-primary" id="cSave" style="margin-top:10px">' + UI.icon('check', 15) + 'Guardar configuración</button>' +
      '</div>';
    body.querySelector('#cSave').addEventListener('click', async () => {
      await G.api('PATCH', '/negocio?id=eq.1', {
        nombre: body.querySelector('#cNombre').value.trim(),
        telefono: body.querySelector('#cTel').value.trim(),
        moneda: body.querySelector('#cMon').value,
        direccion: body.querySelector('#cDir').value.trim(),
        datos_fiscales: body.querySelector('#cFis').value.trim(),
      });
      await G.plan.log('configuracion_editada', 'negocio');
      UI.toast('Configuración guardada');
    });
  }

  /* ---------- Métricas ---------- */
  async function tabMetricas(body) {
    const m = await G.api('POST', '/rpc/metricas');
    const porPlan = (m.por_plan && typeof m.por_plan === 'object') ? m.por_plan : {};
    body.innerHTML =
      '<section class="kpi-grid kpi-4">' +
      kpi('wallet', 'success', 'MRR (mensual)', UI.fmtMoney(m.mrr || 0), 'Ingresos recurrentes') +
      kpi('users', 'info', 'Usuarios', String(m.usuarios || 0), (m.activos || 0) + ' activos') +
      kpi('hard-hat', 'violet', 'Obras totales', String(m.obras || 0), 'En todo el sistema') +
      kpi('alert-triangle', (m.past_due || 0) ? 'danger' : 'neutral', 'En mora', String(m.past_due || 0), 'Cuentas suspendidas o vencidas') +
      '</section>' +
      '<div class="card">' +
      '<div class="card-head"><div><h3>Usuarios por plan</h3><p class="muted">Distribución actual</p></div></div>' +
      '<div class="stack">' +
      Object.keys(porPlan).map(k => '<div class="split-row"><strong>' + UI.escapeHtml(k) + '</strong><b>' + porPlan[k] + '</b></div>').join('') +
      '</div></div>';
  }

  function kpi(icon, tone, label, value, sub) {
    return '<div class="kpi-card"><span class="kpi-ico kpi-' + tone + '">' + UI.icon(icon, 20) + '</span>' +
      '<div class="kpi-body"><span class="kpi-label">' + label + '</span><strong class="kpi-value">' + value + '</strong><span class="kpi-sub">' + sub + '</span></div></div>';
  }

  /* ---------- Auditoría ---------- */
  async function tabAuditoria(body) {
    const rows = await G.api('GET', '/auditoria?select=*&order=fecha.desc&limit=100');
    body.innerHTML =
      '<div class="table-wrap"><table class="data-table">' +
      '<thead><tr><th>Fecha</th><th>Acción</th><th>Detalle</th></tr></thead>' +
      '<tbody>' + (rows.map(a => '<tr><td class="muted">' + UI.fmtDate(a.fecha) + '</td><td>' + UI.chip(UI.escapeHtml(a.accion), 'info') + '</td><td class="muted">' + UI.escapeHtml(a.detalle || '') + '</td></tr>').join('') || '<tr><td colspan="3" class="muted">Sin registros.</td></tr>') +
      '</tbody></table></div>';
  }
})(typeof window !== 'undefined' ? window : globalThis);
