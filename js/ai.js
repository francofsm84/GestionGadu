/* ============================================================
   GADU · Asistente de IA (chat flotante)
   - Contexto invisible de la cuenta (plan, trial, obras, etc.)
   - Deep-links interactivos: la IA puede devolver [[accion:clave|texto]]
     que se renderizan como botones de acción dentro de la app.
   - Habla con la Supabase Edge Function /functions/v1/ai-assistant.
   ============================================================ */
(function (root) {
  'use strict';
  const G = root.GADU = root.GADU || {};

  const ACTION_KEYS = {
    dashboard: () => location.hash = '#/dashboard',
    obras: () => location.hash = '#/obras',
    presupuestos: () => location.hash = '#/presupuestos',
    ingresos: () => location.hash = '#/ingresos',
    gastos: () => location.hash = '#/gastos',
    empleados: () => location.hash = '#/empleados',
    herramientas: () => location.hash = '#/herramientas',
    clientes: () => location.hash = '#/clientes',
    socios: () => location.hash = '#/socios',
    seguros: () => location.hash = '#/seguros',
    agenda: () => location.hash = '#/agenda',
    'new-obra': () => { if (G.actions.work) G.actions.work(); },
    'new-empleado': () => { if (G.actions.employee) G.actions.employee(); },
    'new-cliente': () => { if (G.actions.client) G.actions.client(); },
    'new-gasto': () => { if (G.actions.expense) G.actions.expense(); },
    'new-ingreso': () => { if (G.actions.income) G.actions.income(); },
    'new-presupuesto': () => { if (G.actions.budget) G.actions.budget(); },
    'new-jornada': () => { if (G.actions.attendance) G.actions.attendance(); },
    'new-seguro': () => { if (G.actions.seguro) G.actions.seguro(); },
    // Deep-links del COO Virtual (super admin)
    'admin-metrics': () => { if (G.actions.adminTab) G.actions.adminTab('metricas'); },
    'admin-users': () => { if (G.actions.adminTab) G.actions.adminTab('usuarios'); },
    'admin-planes': () => { if (G.actions.adminTab) G.actions.adminTab('planes'); },
    'admin-config': () => { if (G.actions.adminTab) G.actions.adminTab('config'); },
    'admin-audit': () => { if (G.actions.adminTab) G.actions.adminTab('auditoria'); },
    'admin-register-user': () => { if (G.actions.adminInvite) G.actions.adminInvite(); },
    'admin-export': () => { if (G.actions.adminTab) G.actions.adminTab('usuarios'); },
  };

  /* Pasos guiados por módulo — TODOS obligatorios en secuencia, sin "Saltear".
     Los campos secundarios aceptan la respuesta "no sé" para continuar. */
  const WIZARD_STEPS = {
    empleado: [
      { key: 'nombre', ask: 'Dale, ¿cuál es su nombre y apellido? (ej. "Jorge Pérez")' },
      { key: 'telefono', ask: '¿Su teléfono / WhatsApp?' },
      { key: 'oficio', ask: '¿Cuál es su oficio?', buttons: ['Albañil', 'Pintor', 'Plomero', 'Electricista', 'Carpintero', 'Yesero', 'Herrero'] },
      { key: 'tarifa', ask: '¿Cuánto cobra por hora? (ej. 1500; si no sabés, decime "no sé")' },
    ],
    cliente: [
      { key: 'nombre', ask: '¿Cuál es su nombre y apellido? (ej. "Ángel Cámara")' },
      { key: 'telefono', ask: '¿Su teléfono / WhatsApp?' },
      { key: 'email', ask: '¿Su e-mail? (si no lo sabés, decime "no sé")' },
      { key: 'direccion', ask: '¿Su dirección? (si no la sabés, decime "no sé")' },
    ],
    socio: [
      { key: 'nombre', ask: '¿Cuál es su nombre y apellido?' },
      { key: 'telefono', ask: '¿Su teléfono / WhatsApp?' },
      { key: 'porcentaje', ask: '¿Qué porcentaje de participación tiene? (ej. 50)' },
    ],
    obra: [
      { key: 'nombre', ask: '¿Cómo se llama la obra? (ej. "Casa de Norma")' },
      { key: 'ubicacion', ask: '¿Dónde queda la obra? (si no sabés, decime "no sé")' },
      { key: 'presupuesto', ask: '¿Cuál es el presupuesto total? (ej. 100000; si no sabés, decime "no sé")' },
    ],
    gasto: [
      { key: 'monto', ask: '¿De cuánto es el gasto? (ej. 5000)' },
      { key: 'categoria', ask: '¿Qué categoría es?', catsList: true },
      { key: 'obra', ask: '¿A qué obra corresponde?', worksList: true },
      { key: 'comprobante', ask: '¿Número de comprobante o una nota? (si no tenés, decime "no sé")' },
    ],
    ingreso: [
      { key: 'monto', ask: '¿De cuánto es el ingreso? (ej. 10000)' },
      { key: 'concepto', ask: '¿Qué concepto?', buttons: ['Cobro', 'Adelanto', 'Certificación'] },
      { key: 'obra', ask: '¿A qué obra corresponde?', worksList: true },
    ],
    presupuesto: [
      { key: 'nombre', ask: '¿Cómo se llama el presupuesto? (ej. "Reforma cocina")' },
      { key: 'monto', ask: '¿Cuál es el monto total? (ej. 80000; si no sabés, decime "no sé")' },
      { key: 'obra', ask: '¿Para qué obra es?', worksList: true },
    ],
    herramienta: [
      { key: 'nombre', ask: '¿Qué herramienta cargamos? (ej. "Amoladora")' },
      { key: 'categoria', ask: '¿Qué tipo es?', buttons: ['Herramienta eléctrica', 'Herramienta manual', 'Maquinaria', 'Otro'] },
      { key: 'costo', ask: '¿Cuánto costó? (ej. 12000; si no sabés, decime "no sé")' },
    ],
    asignar: [
      { key: 'herramienta', ask: '¿Qué herramienta querés mover?', assetsList: true },
      { key: 'destino', ask: '¿A dónde va?', assignList: true },
      { key: 'nota', ask: '¿Alguna nota del movimiento? (si no, decime "no sé")' },
    ],
    pago: [
      { key: 'empleado', ask: '¿A qué empleado le pagamos?', empsList: true },
      { key: 'tipo', ask: '¿Qué tipo de pago es?', buttons: ['Adelanto', 'Pago de jornada / semana'] },
      { key: 'monto', ask: '¿Cuánto le pagamos? (ej. 50000 · 100mil · 100.000)' },
      { key: 'obra', ask: '¿A qué obra imputamos el gasto?', worksList: true },
    ],
    agendar: [
      { key: 'tipo', ask: '¿Qué tipo de compromiso es?', buttons: ['Reunión', 'Visita', 'Entrega', 'Tarea', 'Evento'] },
      { key: 'fecha', ask: '¿Para qué día? (ej. mañana, 15/04, 2026-04-15)' },
      { key: 'titulo', ask: '¿Qué compromiso anotamos?' },
      { key: 'hora', ask: '¿A qué hora? (si no, decime "no sé")' },
      { key: 'lugar', ask: '¿Dónde es? (si no, decime "no sé")' },
    ],
    jornada: [
      { key: 'empleado', ask: '¿A qué empleado(s) le cargamos la jornada? (podés elegir varios)', empsList: true, multiEmps: true },
      { key: 'obra', ask: '¿En qué obra trabajó?', worksList: true },
      { key: 'horas', ask: '¿Cuántas horas trabajó?', buttons: ['4 hs', '8 hs'] },
    ],
  };
  /* Campos CLAVE obligatorios: sin ellos NUNCA se guarda (ni tilde verde) */
  const WIZARD_REQUIRED = {
    empleado: ['nombre', 'telefono', 'oficio'], cliente: ['nombre', 'telefono'], socio: ['nombre', 'telefono', 'porcentaje'], obra: ['nombre'], asignar: ['herramienta', 'destino'], agendar: ['tipo', 'fecha', 'titulo'], pago: ['empleado', 'tipo', 'monto', 'obra'],
    gasto: ['monto', 'categoria', 'obra'], ingreso: ['monto', 'obra'],
    presupuesto: ['nombre', 'obra'], herramienta: ['nombre', 'categoria'],
    jornada: ['empleado', 'obra', 'horas'],
  };

  /* Modo dinámico según la vista actual: #/admin → COO Virtual · resto → Capataz Digital */
  function currentMode() { return location.hash.indexOf('#/admin') === 0 ? 'admin' : 'usuario'; }
  function isAdminMode() { return currentMode() === 'admin'; }
  /* Clave de contexto (modo + obra activa). Detecta si el usuario entró/salió de
     una vista de obra para refrescar el saludo y la botonera. */
  function contextKey() {
    const admin = isAdminMode();
    const ctx = admin ? null : currentWorkContext();
    return (admin ? 'admin' : 'usuario') + '|' + (ctx ? ctx.id : 'global');
  }

  /* Registra la última obra/cliente tratado para el contexto de sesión */
  function setFocus(mod, campos) {
    const c = campos || {};
    if (!sessionFocus) sessionFocus = {};
    if (c.obra) sessionFocus.obra = c.obra;
    if (c.cliente) sessionFocus.cliente = c.cliente;
    if (mod === 'obra' && c.nombre) sessionFocus.obra = c.nombre;
    if ((mod === 'cliente' || mod === 'socio') && c.nombre) sessionFocus.cliente = c.nombre;
  }

  function context() {
    const d = (G.store && G.store.data) || {};
    const p = G.plan.profile;
    const plan = G.plan.currentPlan();
    const days = G.plan.trialDaysLeft();
    const works = d.works || [];
    const activas = works.filter(w => w.status === 'activa').length;
    const clientes = (d.contacts || []).filter(c => c.type === 'cliente').length;
    const empleados = (d.employees || []).length;
    const presupuestos = (d.budgets || []).length;
    let s = 'Plan ' + plan.nombre;
    if (p) {
      if (p.subscription_status === 'trialing' && days !== null) s += ' en prueba (quedan ' + days + ' días)';
      else if (p.subscription_status === 'active') s += ' activo';
      else if (p.subscription_status) s += ' · ' + p.subscription_status;
    }
    s += ' · ' + works.length + ' obras (' + activas + ' activas), ' + clientes + ' clientes, ' + empleados + ' empleados, ' + presupuestos + ' presupuestos.';

    /* Números por obra: para consultas de cobros/gastos/pendientes */
    const incs = d.incomes || [];
    const exps = d.expenses || [];
    if (works.length) {
      const ws = works.slice(0, 8).map(w => {
        const cobrado = incs.filter(i => i.workId === w.id).reduce((a, b) => a + (Number(b.amount) || 0), 0);
        const gastado = exps.filter(e => e.workId === w.id).reduce((a, b) => a + (Number(b.amount) || 0), 0);
        const presup = Number(w.budgetTotal) || 0;
        const pend = Math.max(0, presup - cobrado);
        return workLabel(w) + ' (cobrado $' + cobrado + ', gastado $' + gastado + (presup ? ', pendiente por cobrar $' + pend : '') + ')';
      });
      s += ' Obras y saldos: ' + ws.join('; ') + '.';
    }

    /* Empleados con tarifa horaria: para consultas de sueldos y jornadas */
    const emps = d.employees || [];
    if (emps.length) {
      s += ' Empleados: ' + emps.slice(0, 12).map(e => {
        const full = ((e.firstName || '') + ' ' + (e.lastName || '')).trim();
        let extra = e.hourlyRate ? ' ($' + e.hourlyRate + '/hora)' : '';
        try {
          const st = G.store.employeeStats(e.id);
          if (st.hoursTotal) extra += ' · ' + st.hoursTotal + ' horas trabajadas';
          if (st.advances) extra += ' · adelantos $' + st.advances;
        } catch (e2) {}
        return full + extra;
      }).join(', ') + '.';
    }

    /* Herramientas con estado y nota (ubicación): para "¿dónde está...?" */
    const assets = d.assets || [];
    if (assets.length) {
      s += ' Herramientas: ' + assets.slice(0, 10).map(a => a.name + ' (' + (a.status || 'operativo') + (a.notes ? ', nota: ' + a.notes : '') + ')').join('; ') + '.';
    }

    /* Reparto pendiente: para consultas de socios ("¿cuánto cobra Juan?") */
    const pendDist = (d.distributions || []).filter(x => x.status === 'pendiente');
    if (pendDist.length) {
      const parts = [];
      pendDist.slice(0, 5).forEach(x => { (x.splits || []).forEach(sp => parts.push(sp.name + ' $' + sp.amount + ' (' + (x.period || '') + ')')); });
      if (parts.length) s += ' Reparto pendiente de pago: ' + parts.slice(0, 12).join(', ') + '.';
    }

    const clis = (d.contacts || []).filter(c => c.type === 'cliente');
    if (clis.length) s += ' Clientes: ' + clis.slice(0, 12).map(c => c.name).join(', ') + '.';
    if (sessionFocus && (sessionFocus.obra || sessionFocus.cliente)) {
      s += ' Foco actual de la sesión:';
      if (sessionFocus.obra) s += ' obra "' + sessionFocus.obra + '"';
      if (sessionFocus.cliente) s += (sessionFocus.obra ? ' y' : '') + ' cliente "' + sessionFocus.cliente + '"';
      s += '. Si el próximo comando no especifica otra obra/cliente, aplicalo a esa entidad.';
    }
    /* Historial reciente: permite continuar cargas/consultas en varios pasos */
    if (chatHistory.length) {
      s += ' Historial de la conversación: ' + chatHistory.slice(-6).join(' ') + '.';
    }
    return s;
  }

  function parseActions(reply) {
    const out = [];
    const re = /\[\[accion:([^\]|]+)\|([^\]]+)\]\]/g;
    let m;
    while ((m = re.exec(reply))) out.push({ clave: m[1].trim(), label: m[2].trim() });
    return out;
  }

  function renderText(reply) {
    let txt = reply.replace(/\[\[accion:[^\]]+\]\]/g, '');
    txt = txt.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
    txt = txt.replace(/\n/g, '<br>');
    /* Limpieza visual: elimina puntos sueltos (" . ", líneas con solo ".")
       que pueden colarse desde el contexto o el modelo. Los puntos finales
       de frase (pegados a una letra) se conservan. */
    txt = txt.replace(/(^|\s|\n)\.(?=\s|<br>|$)/g, '$1');
    txt = txt.replace(/<br>\s*\.\s*<br>/g, '<br>');
    txt = txt.replace(/\.{3,}/g, '..');
    return txt;
  }

  /* Devuelve las opciones inline para pasos guiados (puro, testeable).
     Solo opciones DIRECTAMENTE relacionadas al contexto: se eliminaron los
     chips genéricos Sí/No para no ensuciar las respuestas del asistente. */
  function inlineOptionsFor(replyText) {
    const t = String(replyText || '').toLowerCase();
    const opts = [];
    if (/(oficio|profesi[oó]n|qu[eé] hace|rubro)/.test(t)) {
      ['Albañil', 'Pintor', 'Plomero', 'Electricista', 'Carpintero', 'Yesero', 'Herrero'].forEach(o => opts.push({ label: o, send: 'oficio ' + o }));
    } else if (/(cobro|adelanto|certificaci[oó]n)/.test(t)) {
      /* Concepto de ingreso: chips canónicos del flujo contable */
      ['Cobro', 'Adelanto', 'Certificación'].forEach(c => opts.push({ label: c, send: 'concepto ' + c }));
    } else if (/(un? ingreso o un? gasto|un? gasto o un? ingreso|ingreso o gasto|gasto o ingreso|tipo de movimiento|qu[eé] (quer[eé]s|necesit[aá]s) (cargar|registrar|anotar))/.test(t)) {
      /* Tipo de movimiento: ingreso o gasto */
      opts.push({ label: '💰 Ingreso', send: 'ingreso' });
      opts.push({ label: '💸 Gasto', send: 'gasto' });
    } else if (/(gasto de obra|gasto general|de obra o general|obra o general)/.test(t)) {
      /* Tipo de gasto: directo de obra vs general */
      opts.push({ label: '🏗️ Gasto de obra', send: 'gasto de obra' });
      opts.push({ label: '📋 Gasto general', send: 'gasto general' });
    } else if (/(categor[ií]a|tipo de gasto)/.test(t)) {
      /* Categorías REALES del store + Herramientas/Equipamiento */
      const cats = ['Herramientas / Equipamiento'].concat((G.store && G.store.CATS_OBRA) || []).concat((G.store && G.store.CATS_GENERAL) || []);
      [...new Set(cats)].forEach(c => opts.push({ label: c, send: 'categoría ' + c }));
    } else if (/(qu[eé] obra|cu[aá]l obra|a qu[eé] obra|en qu[eé] obra)/.test(t)) {
      const works = (G.store.data && G.store.data.works) || [];
      /* Fallback seguro del nombre (nombre || name || titulo || nombreObra || nombre_obra)
         para nunca renderizar "undefined": el botón muestra "nombre - código"
         (ej. "casa angel camara - OB-2026-004") y el envío usa el nombre real,
         que el flujo contable resuelve contra el identificador real de la obra. */
      works.slice(0, 6).forEach(w => {
        if (!w) return;
        const raw = w.nombre || w.name || w.titulo || w.nombreObra || w.nombre_obra;
        const name = String(raw == null ? '' : raw).trim();
        const safeName = name && !/^(undefined|null|nan|\[object\s+object\])$/i.test(name) ? name : 'Obra sin nombre';
        const label = safeName + (w.code ? ' - ' + w.code : '');
        opts.push({ label: label, send: 'obra ' + safeName });
      });
    }
    return opts;
  }

  /* Botones de opciones inline: si la IA pregunta por oficio/obra/categoría,
     se agregan botoncitos que envían la selección sin salir del chat. */
  function addInlineOptions(hostEl, replyText) {
    const opts = inlineOptionsFor(replyText);
    if (!opts.length) return;
    const wrap = document.createElement('div');
    wrap.className = 'ai-actions';
    opts.forEach(o => {
      const b = document.createElement('button');
      b.className = 'btn btn-soft btn-sm';
      b.textContent = o.label;
      b.addEventListener('click', () => {
        input.value = o.send;
        send();
      });
      wrap.appendChild(b);
    });
    hostEl.appendChild(wrap);
  }

  /* Registra cada turno para el seguimiento multi-paso (máx. 8 entradas) */
  function rememberTurn(role, text) {
    chatHistory.push(role + ': ' + text);
    if (chatHistory.length > 8) chatHistory.shift();
  }

  /* Historial de acciones recientes (para chips de acceso rápido) */
  const RECENT_KEY = 'gadu_ai_recent';
  function recordAction(k) {
    try {
      const map = JSON.parse(localStorage.getItem(RECENT_KEY) || '{}');
      map[k] = (Number(map[k]) || 0) + 1;
      localStorage.setItem(RECENT_KEY, JSON.stringify(map));
    } catch (e) {}
  }
  function recentActions() {
    try {
      const map = JSON.parse(localStorage.getItem(RECENT_KEY) || '{}');
      return Object.keys(map).sort((a, b) => (Number(map[b]) || 0) - (Number(map[a]) || 0)).slice(0, 3);
    } catch (e) { return []; }
  }

  function bubble(html, who) {
    const div = document.createElement('div');
    div.className = 'ai-msg ai-' + who;
    div.innerHTML = html;
    return div;
  }

  /* Tarjeta de éxito con tilde verde: confirmación visual de carga completada */
  function successCard(text) {
    return '<div class="ai-success"><span class="ai-success-ico">✔</span>' +
      '<div class="ai-success-txt"><b>¡Listo! Carga completada</b><br>' + text + '</div></div>';
  }

  let host = null, log = null, input = null, busy = false, builtMode = null;
  let lastSendAt = 0;
  let chatHistory = [];   // últimas interacciones (seguimiento multi-paso en el chat)
  let pendingOp = null;   // operación guiada en curso: { modulo, campos, idx }
  let pendingAdmin = null;   // acción de admin pendiente de confirmación: { uid, patch, label }
  let adminWizard = null;    // alta express de usuarios en curso: { idx, campos }
  let contactStage = null;   // flujo de contacto: 'rol' (elegir tipo) · 'pick' (importar/dictar datos)
  let contactRole = null;    // rol elegido (empleado|cliente|socio) mientras contactStage === 'pick'
  let ledgerMenu = false;    // submenú "Contabilidad" abierto ([Ingresos] [Gastos])
  let toolsMenu = false;     // submenú "Herramientas" abierto (asignar / cargar / jornada)
  let lastSaved = null;      // último registro creado { coll, id, label } para "Deshacer"
  let currentUid = null;  // usuario autenticado dueño de la memoria del agente
  /* Intención pendiente de retomar tras un guardado (p. ej. "cuánto debo
     pagar hoy" interrumpida por una tarifa faltante). */
  let pendingGoal = null;   // null | 'pagar-hoy'
  /* Memoria de sesión: última obra/cliente tratado, para que los comandos
     consecutivos se apliquen sin volver a preguntar. */
  let sessionFocus = null;   // { obra: 'Nombre', cliente: 'Nombre' }

  /* ---------- Aislamiento por usuario ---------- */
  /* ID del usuario autenticado en la sesión actual */
  function getUid() {
    try {
      const s = G.auth && G.auth.getSession ? G.auth.getSession() : null;
      return (s && ((s.user && s.user.id) || s.userId)) || null;
    } catch (e) { return null; }
  }
  /* Clave de almacenamiento segregada por usuario */
  function prefKey(k) { return k + '_' + (currentUid || 'anon'); }
  /* Al cambiar de usuario, el agente borra su memoria (historial, foco, wizard)
     y carga el contexto limpio del usuario entrante. */
  function syncUser() {
    const uid = getUid();
    if (uid === currentUid) return false;
    currentUid = uid;
    chatHistory = [];
    sessionFocus = null;
    pendingOp = null;
    pendingGoal = null;
    try { if (log) { log.innerHTML = ''; addGreeting(); } } catch (e) {}
    return true;
  }

  /* Personaje del asistente: PNG transparente "asistente gadu" */
  const AVATAR_SRC = 'asistente%20gadu.png';

  function build() {
    if (document.getElementById('aiRoot')) return;
    host = document.createElement('div');
    host.id = 'aiRoot';
    host.innerHTML =
      '<button class="ai-fab" id="aiFab" title="Asistente GADU" aria-label="Asistente GADU">' +
      '<img src="' + AVATAR_SRC + '" alt="Asistente GADU" class="ai-avatar">' +
      '</button>' +
      '<div class="ai-fab-tip" id="aiFabTip">¡Hola! Soy GADU, tu capataz digital. ¿Qué querés gestionar hoy?</div>' +
      '<div class="ai-panel" id="aiPanel" hidden>' +
      '<div class="ai-head"><span class="ai-head-logo"><img src="' + AVATAR_SRC + '" alt="" class="ai-avatar"></span>' +
      '<div class="ai-head-txt"><strong>Asistente GADU</strong><span class="muted small" id="aiSub">Te guío paso a paso</span></div>' +
      '</div>' +
      '<div class="ai-offline" id="aiOffline" hidden>⚠️ Sin conexión — tus acciones se guardan localmente y se sincronizan al reconectar.</div>' +
      '<div class="ai-log" id="aiLog"></div>' +
      '<div class="ai-foot">' +
      '<input class="input" id="aiInput" placeholder="Escribí tu mensaje…">' +
      '<button class="ai-send" id="aiSend" title="Enviar">➤</button></div>' +
      '</div>';
    document.body.appendChild(host);
    log = document.getElementById('aiLog');
    input = document.getElementById('aiInput');
    /* Widgets interactivos: confirmar con Enter dentro del input */
    log.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const inp = e.target && e.target.classList ? e.target : null;
      if (inp && inp.classList.contains('ai-widget-input')) {
        e.preventDefault();
        const ok = inp.closest('.ai-widget');
        if (ok) { const b = ok.querySelector('[data-widget-ok]'); if (b) b.click(); }
      }
    });
    /* Indicador "Escribiendo...": muestra 3 puntos mientras `busy` está activo */
    let typingEl = null;
    const syncTyping = () => {
      try {
        if (busy && !typingEl) {
          typingEl = document.createElement('div');
          typingEl.className = 'ai-msg ai-bot ai-typing';
          typingEl.innerHTML = '<span class="dot"></span><span class="dot"></span><span class="dot"></span>';
          log.appendChild(typingEl);
          scrollToEnd();
        } else if (!busy && typingEl) {
          typingEl.remove();
          typingEl = null;
        }
      } catch (e) {}
    };
    setInterval(syncTyping, 150);

    /* Indicador de conectividad: banner si navigator.onLine es false.
       El store ya encola localmente; acá solo mostramos el aviso. */
    const syncOnline = () => {
      try {
        const off = document.getElementById('aiOffline');
        if (!off) return;
        const online = typeof navigator === 'undefined' || navigator.onLine !== false;
        off.hidden = online;
      } catch (e) {}
    };
    syncOnline();
    try {
      window.addEventListener('online', syncOnline);
      window.addEventListener('offline', syncOnline);
    } catch (e) {}
    /* Botones del flujo guiado (wizard): delegación de clicks */
    log.addEventListener('click', (e) => {
      /* Formulario dinámico: abrir ("📝 Completar formulario") */
      const fo = e.target && e.target.closest ? e.target.closest('[data-form-open]') : null;
      if (fo) {
        const msg = fo.closest('.ai-msg');
        openFormWidget(fo.dataset.formOpen, msg);
        return;
      }
      /* Formulario dinámico: confirmar → guardar en la base + tarjeta de éxito */
      const fk = e.target && e.target.closest ? e.target.closest('[data-form-ok]') : null;
      if (fk) {
        submitFormWidget(fk.closest('.ai-form'));
        return;
      }
      /* Widget interactivo: confirmar guarda el valor y retoma el flujo */
      const wk = e.target && e.target.closest ? e.target.closest('[data-widget-ok]') : null;
      if (wk) {
        const widget = wk.closest('.ai-widget');
        const inp = widget ? widget.querySelector('.ai-widget-input') : null;
        const val = inp ? UI.readNum(inp) : 0;
        if (!(val > 0)) { try { if (G.ui && G.ui.toast) G.ui.toast('Ingresá un valor válido', 'error'); } catch (e2) {} return; }
        if (widget && widget.dataset.widget === 'tarifa') {
          applyTarifaValue(widget.dataset.emp, val).then(() => {
            try { widget.outerHTML = '<div class="ai-success-txt" style="padding:6px 0">✔ Tarifa guardada</div>'; } catch (e2) {}
            resumePendingGoal();
          });
        } else {
          /* Widget genérico: envía el valor como respuesta del usuario.
             Se desactiva al instante para evitar envíos duplicados. */
          try {
            const btn = widget.querySelector('[data-widget-ok]');
            if (btn) { btn.disabled = true; btn.textContent = 'Enviado…'; }
            if (inp) inp.disabled = true;
            input.value = String(val);
            send();
          } catch (e2) {}
        }
        return;
      }
      const adm = e.target && e.target.closest ? e.target.closest('[data-adm]') : null;
      if (adm) {
        const k = adm.dataset.adm;
        if (k === 'confirm') confirmAdminAction();
        else if (k === 'cancel') cancelAdminAction();
        else if (k === 'cancelwiz') { adminWizard = null; wizardBubble('✋ Alta cancelada.'); }
        else if (k === 'wiz') adminWizardAdvance(adm.dataset.arg || '');
        return;
      }
      const lb = e.target && e.target.closest ? e.target.closest('[data-ledger]') : null;
      if (lb) { ledgerMenu = false; startWizard(lb.dataset.ledger, {}); return; }
      const tb = e.target && e.target.closest ? e.target.closest('[data-tools]') : null;
      if (tb) {
        toolsMenu = false;
        if (tb.dataset.tools === 'ver') {
          setOpen(false);
          try { if (G.router && G.router.navigate) G.router.navigate('#/herramientas'); } catch (e2) {}
          return;
        }
        startWizard(tb.dataset.tools === 'asignar' ? 'asignar' : tb.dataset.tools, {});
        return;
      }
      const ub = e.target && e.target.closest ? e.target.closest('[data-undo]') : null;
      if (ub) { undoSave(); return; }
      const gb = e.target && e.target.closest ? e.target.closest('[data-goto]') : null;
      if (gb) {
        /* "Ver registro": el <a> navega por hash; cerramos el chat para
           dejar la vista del registro recién creado a la vista */
        try { setOpen(false); } catch (e2) {}
        return;
      }
      const rb = e.target && e.target.closest ? e.target.closest('[data-role]') : null;
      if (rb) {
        const hostEl = rb.closest('.ai-msg') || rb.parentElement || rb;
        chooseRole(rb.dataset.role, hostEl);
        return;
      }
      const fb = e.target && e.target.closest ? e.target.closest('[data-focus-input]') : null;
      if (fb) {
        /* "Escribir horas": enfoca el input del chat para tipear libremente */
        try { if (input && input.focus) input.focus(); } catch (e2) {}
        return;
      }
      /* Alta rápida de empleado desde el selector: abre el alta y retoma después */
      const ne = e.target && e.target.closest ? e.target.closest('[data-new-emp]') : null;
      if (ne) {
        const moduloPrev = pendingOp ? pendingOp.modulo : null;
        cancelWizard();
        try {
          if (G.actions.employee) G.actions.employee();
          if (G.ui && G.ui.toast) G.ui.toast('Cargá el empleado y volvé a preguntarme "' + (moduloPrev === 'jornada' ? 'quién trabajó hoy' : 'lo que necesites') + '"', 'info');
        } catch (e2) {}
        return;
      }
      /* Multi-selección de empleados: captura los checkboxes y avanza */
      const mo = e.target && e.target.closest ? e.target.closest('[data-multi-ok]') : null;
      if (mo) {
        const wrap = mo.closest('.ai-multi');
        const checked = wrap ? Array.from(wrap.querySelectorAll('.ai-check-input:checked')).map(cb => cb.value) : [];
        if (!checked.length) {
          try { if (G.ui && G.ui.toast) G.ui.toast('Elegí al menos un empleado', 'error'); } catch (e2) {}
          return;
        }
        const valor = checked.join(', ');
        appendLog(bubble(renderText(valor), 'user'));
        scrollToEnd();
        wizardAdvance(valor);
        return;
      }
      const b = e.target && e.target.closest ? e.target.closest('[data-wiz]') : null;
      if (!b) return;
      const v = b.dataset.wiz;
      if (v === '__cancel__') { cancelWizard(); return; }
      if (v === '__continue__') { if (pendingOp) wizardAskNext(); return; }
      /* Opción rápida táctil: inyecta el texto elegido como respuesta visible
         del usuario y avanza automáticamente al siguiente paso del flujo */
      appendLog(bubble(renderText(v), 'user'));
      scrollToEnd();
      wizardAdvance(v);
    });
    document.getElementById('aiFab').addEventListener('click', toggle);
    document.getElementById('aiSend').addEventListener('click', send);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') send(); });
    addGreeting();
    window.addEventListener('hashchange', refreshGreeting);

    /* Burbuja de saludo del robot: aparece sola al cargar la app y se oculta
       sola o al tocar el robot / abrir el chat. */
    const tip = document.getElementById('aiFabTip');
    const hideTip = () => { try { tip.classList.remove('show'); } catch (e) {} };
    if (tip) {
      tip.addEventListener('click', hideTip);
      const fabBtn = document.getElementById('aiFab');
      if (fabBtn) fabBtn.addEventListener('click', hideTip);
      setTimeout(() => { try { tip.classList.add('show'); } catch (e) {} }, 1200);
      setTimeout(hideTip, 9000);
    }
  }

  /* Construye la transcripción desde una lista de {isFinal, transcript}.
     Reconstruye DESDE CERO: el interino se SOBRESCRIBE, nunca se concatena. */
  function buildTranscript(items) {
    let transcriptFinal = '', transcriptInterim = '';
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const t = (it.transcript || '').trim();
      if (!t) continue;
      if (it.isFinal) transcriptFinal += (transcriptFinal ? ' ' : '') + t;
      else transcriptInterim = t;   // asignar (sobrescribir)
    }
    return {
      final: transcriptFinal,
      interim: transcriptInterim,
      combined: (transcriptFinal + ' ' + transcriptInterim).replace(/\s+/g, ' ').trim(),
    };
  }

  /* Deduplicación de emergencia: elimina palabras consecutivas repetidas y
     frases repetidas ("a b a b a b c" -> "a b c"). Soporta acentos. */
  function removeRepeatedPhrases(text) {
    const words = String(text || '').replace(/\s+/g, ' ').trim().split(' ');
    if (!words.length || !words[0]) return '';
    // 1) palabras consecutivas idénticas
    const deduped = [];
    for (const w of words) if (w !== deduped[deduped.length - 1]) deduped.push(w);
    // 2) colapsar frases repetidas en bucle hasta estabilizar
    let changed = true;
    while (changed) {
      changed = false;
      const n = deduped.length;
      for (let len = Math.floor(n / 2); len >= 2; len--) {
        const first = deduped.slice(0, len).join(' ');
        const second = deduped.slice(len, len * 2).join(' ');
        if (first === second) { deduped.splice(len, len); changed = true; break; }
      }
    }
    return deduped.join(' ');
  }

  /* Limpia la entrada de texto antes de enviar (sin dictado por voz) */
  function cleanInput(s) { return removeRepeatedPhrases(s); }

  /* Mensaje final listo para enviar: limpieza + tope de longitud (anti-consultas gigantes) */
  function prepareMessage(input) {
    let msg = removeRepeatedPhrases(input);
    if (msg.length > 400) msg = msg.slice(0, 400);
    return msg;
  }

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  /* Persistencia real: inserta en la capa de datos local y sincroniza a Supabase */
  function saveViaStore(mod, c) {
    try {
      const S = G.store;
      const d = S.data;
      const today = (S.todayISO && S.todayISO()) || new Date().toISOString().slice(0, 10);
      const findId = (list, name, keyFn) => {
        if (!name) return null;
        const n = String(name).toLowerCase().trim();
        const hit = (list || []).find(x => {
          const k = keyFn(x);
          return k != null && String(k).toLowerCase().trim() === n;
        });
        return hit ? hit.id : null;
      };
      /* Auto-asignación: si hay UNA sola obra activa, usarla sin preguntar */
      const autoWorkId = () => {
        const activas = (d.works || []).filter(w => w.status === 'activa' && workLabel(w));
        return activas.length === 1 ? activas[0].id : null;
      };
      const workName = (id) => {
        const w = (d.works || []).find(x => x.id === id);
        return workLabel(w);
      };
      if (mod === 'gasto') {
        const amount = extractNumber(c.monto);
        if (!(amount > 0)) return null;
        const cat = c.categoria;
        if (!cat) return null;   // categoría obligatoria (validación estricta)
        const desc = c.concepto || cat;
        const autoId = autoWorkId();
        const workId = c.obra ? findId(d.works, c.obra, x => workLabel(x)) : autoId;
        /* Validación estricta: si hay obras activas y el gasto no está asignado,
           NO guardar como general en silencio → preguntar la obra en el chat */
        if (!workId && (d.works || []).some(w => w.status === 'activa')) return null;
        const esObra = !!workId;
        const creado = S.add('expenses', {
          type: esObra ? 'obra' : 'general', workId: workId || null, date: today, amount,
          category: cat, providerId: null, employeeId: null, expenseKind: null,
          description: desc, invoiceNumber: c.comprobante || '', paymentMethod: (S.METODOS && S.METODOS[0]) || 'Efectivo',
        });
        return { ok: true, label: 'gasto de $' + amount + ' (' + desc + ')' + (esObra ? ' en ' + workName(workId) : ''), coll: 'expenses', id: creado.id };
      }
      if (mod === 'cliente' || mod === 'socio') {
        const name = c.nombre || '';
        if (!name) return null;
        const tipo = mod === 'socio' ? 'socio' : 'cliente';
        if (tipo === 'socio' && !c.porcentaje) return null;   // porcentaje obligatorio en socios
        const extra = tipo === 'socio' ? { percent: extractNumber(c.porcentaje) || 0, active: true } : {};
        const creado = S.add('contacts', {
          type: tipo, name,
          nombre: name.split(/\s+/)[0] || name,
          apellido: name.split(/\s+/).slice(1).join(' '),
          company: '', phone: c.telefono || '', whatsapp: '', email: c.email || '',
          address: c.direccion || '', notes: '', photo: null,
          ...extra,
        });
        setFocus(mod, { nombre: name });
        return { ok: true, label: (tipo === 'socio' ? 'socio ' : 'cliente ') + name, coll: 'contacts', id: creado.id };
      }
      if (mod === 'empleado') {
        const full = c.nombre || '';
        const fn = c.apellido ? c.nombre : (full.split(/\s+/)[0] || '');
        const ln = c.apellido || full.split(/\s+/).slice(1).join(' ');
        if (!fn) return null;
        if (!c.oficio) return null;     // oficio obligatorio (validación estricta)
        if (!c.telefono) return null;   // teléfono / WhatsApp obligatorio
        if (G.plan && G.plan.checkLimit && G.plan.checkLimit('empleados') === false) return null;
        const creado = S.add('employees', { firstName: fn, lastName: ln, phone: c.telefono || '', paymentData: '', hourlyRate: extractNumber(c.tarifa) || 0, active: true, notes: 'Oficio: ' + c.oficio, photo: null });
        return { ok: true, label: 'empleado ' + (fn + ' ' + ln).trim() + ' (' + c.oficio + ')', coll: 'employees', id: creado.id };
      }
      if (mod === 'obra') {
        const name = c.nombre || '';
        if (!name) return null;
        if (G.plan && G.plan.checkLimit && G.plan.checkLimit('obras') === false) return null;
        const clientId = c.cliente ? findId((d.contacts || []).filter(x => x.type === 'cliente'), c.cliente, x => x.name) : null;
        const creado = S.add('works', { name, code: (S.nextCode ? S.nextCode('OB', 'works') : ''), clientId: clientId || null, location: c.ubicacion || c.direccion || '', status: 'activa', budgetTotal: extractNumber(c.presupuesto) || 0, advanceFisico: 0, startDate: today, endDate: '', description: '' });
        setFocus(mod, { nombre: name });
        return { ok: true, label: 'obra ' + name, coll: 'works', id: creado.id };
      }
      if (mod === 'ingreso') {
        const amount = extractNumber(c.monto);
        if (!(amount > 0)) return null;
        const autoId = autoWorkId();
        const workId = c.obra ? findId(d.works, c.obra, x => workLabel(x)) : autoId;
        if (!workId) return null;   // sin obra única ni nombre → abrir formulario
        const creado = S.add('incomes', { workId, clientId: null, date: today, amount, concept: c.concepto || 'Cobro', incomeKind: 'pago', method: (S.METODOS && S.METODOS[0]) || 'Efectivo', reference: '', notes: '' });
        return { ok: true, label: 'ingreso de $' + amount + ' en ' + (workName(workId) || c.obra), coll: 'incomes', id: creado.id };
      }
      if (mod === 'presupuesto') {
        const name = c.nombre || c.concepto || '';
        if (!name) return null;
        const workId = c.obra ? findId(d.works, c.obra, x => workLabel(x)) : autoWorkId();
        const total = extractNumber(c.monto) || extractNumber(c.presupuesto) || 0;
        const creado = S.add('budgets', { code: (S.nextCode ? S.nextCode('PR', 'budgets') : ''), clientId: null, workId: workId || null, name, date: today, validUntil: '', status: 'borrador', items: [], discount: 0, subtotal: total, total, notes: '' });
        return { ok: true, label: 'presupuesto ' + name, coll: 'budgets', id: creado.id };
      }
      if (mod === 'herramienta') {
        const name = c.nombre || '';
        if (!name) return null;
        const creado = S.add('assets', { name, category: c.categoria || 'Herramienta', purchaseDate: today, cost: extractNumber(c.monto) || extractNumber(c.costo) || 0, status: 'operativo', supplierId: null, notes: c.ubicacion ? 'En: ' + c.ubicacion : '', maintenance: [] });
        return { ok: true, label: 'herramienta ' + name, coll: 'assets', id: creado.id };
      }
      if (mod === 'jornada') {
        const workId = c.obra ? findId(d.works, c.obra, x => workLabel(x)) : null;
        const horas = extractNumber(c.horas);   // acepta "8", "8 hs", "8.5"
        /* Multi-selección: "Juan Pérez, Carlos Gómez" → una jornada por cada uno */
        const nombres = String(c.empleado || '').split(',').map(s => s.trim()).filter(Boolean);
        if (!nombres.length || !workId || !(horas > 0)) return null;   // empleado(s), obra y horas obligatorios
        const ids = [];
        for (const nm of nombres) {
          const empId = findId(d.employees, nm, x => ((x.firstName || '') + ' ' + (x.lastName || '')).trim());
          if (!empId) continue;   // nombre no resuelto: se saltea sin romper el loop
          const creado = S.add('attendance', { employeeId: empId, date: today, status: 'presente', hours: [{ workId, hours: horas }], notes: '' });
          ids.push(creado.id);
        }
        if (!ids.length) return null;
        return { ok: true, label: 'jornada de ' + nombres.join(', ') + ' (' + horas + 'h en ' + c.obra + ')', coll: 'attendance', id: ids[0] };
      }
      if (mod === 'asignar') {
        /* Mover una herramienta a una obra / depósito o cambiar su estado.
           No toca costos ni borra historial: solo agrega trazabilidad. */
        const hname = String(c.herramienta || '').replace(/\s+·\s+(en obra|depósito)$/i, '').trim();
        const aid = findId(d.assets, hname, x => x.name);
        if (!aid) return null;
        const dest = String(c.destino || '');
        const note = c.nota || '';
        let cambiado = false;
        if (/depósito|deposito/.test(dest)) {
          cambiado = S.moveAsset(aid, null, note || 'Guardada en depósito') || cambiado;
          cambiado = S.setAssetStatus(aid, 'operativo', note || 'Guardada en depósito') || cambiado;
        } else if (/mantenimiento|reparaci[oó]n/.test(dest)) {
          cambiado = S.setAssetStatus(aid, 'en reparación', note || 'A mantenimiento') || cambiado;
          cambiado = S.moveAsset(aid, null, note || 'A mantenimiento') || cambiado;
        } else {
          const wid = findId(d.works, dest, x => workLabel(x));
          if (!wid) return null;
          cambiado = S.moveAsset(aid, wid, note || 'Asignada a la obra') || cambiado;
          cambiado = S.setAssetStatus(aid, 'operativo', note || 'Asignada a la obra') || cambiado;
        }
        const a = d.assets.find(x => x.id === aid);
        return { ok: true, label: 'herramienta ' + hname + ' → ' + dest + (cambiado ? '' : ' (ya estaba así)'), coll: 'assets', id: a ? a.id : aid };
      }
      if (mod === 'agendar') {
        /* Agendar un compromiso multirubro (reunión / visita / entrega /
           tarea / evento) con fecha válida */
        const tf = flatText(String(c.tipo || ''));
        const tipo = /^reunion/.test(tf) ? 'reunion'
          : /^visita/.test(tf) ? 'visita'
          : /^entrega/.test(tf) ? 'entrega'
          : /^tarea/.test(tf) ? 'tarea'
          : /^evento/.test(tf) ? 'evento'
          : 'visita';
        const fecha = normFecha(c.fecha);
        if (!fecha) return null;   // sin fecha válida no se agenda
        const titulo = String(c.titulo || '').trim();
        if (!titulo) return null;
        const creado = S.add('compromisos', {
          fecha, hora: c.hora || '', horaFin: c.horaFin || '', tipo, titulo,
          modalidad: c.modalidad || 'presencial',
          lugar: c.lugar || '', enlace: c.enlace || '',
          contactoId: null, notas: '', estado: 'pendiente',
        });
        return { ok: true, label: 'compromiso "' + titulo.slice(0, 40) + '" para el ' + fecha, coll: 'compromisos', id: creado.id };
      }
      if (mod === 'pago') {
        /* Pago / Adelanto a empleado: impacto DOBLE.
           1) Gasto en el libro (categoría Mano de obra, obra imputada).
           2) El saldo del empleado se actualiza solo: RR.HH. lo deriva de
              los gastos con employeeId + expenseKind (adelanto o sueldo). */
        const empId = c.empleado ? findId(d.employees, c.empleado, x => ((x.firstName || '') + ' ' + (x.lastName || '')).trim()) : null;
        const workId = c.obra ? findId(d.works, c.obra, x => workLabel(x)) : null;
        const monto = extractNumber(c.monto);
        if (!empId || !workId || !(monto > 0)) return null;   // empleado, obra y monto obligatorios
        const esAdelanto = /adelanto|anticipo/i.test(String(c.tipo || ''));   // insensible a mayúsculas ("Adelanto")
        const emp = d.employees.find(x => x.id === empId);
        const full = emp ? ((emp.firstName || '') + ' ' + (emp.lastName || '')).trim() : String(c.empleado || '');
        const creado = S.add('expenses', {
          type: 'obra', workId, date: today, amount: monto,
          category: 'Mano de obra', providerId: null, employeeId: empId,
          expenseKind: esAdelanto ? 'adelanto' : 'sueldo',
          description: (esAdelanto ? 'Adelanto a ' : 'Pago a ') + full,
          invoiceNumber: '', paymentMethod: (S.METODOS && S.METODOS[0]) || 'Efectivo',
        });
        return { ok: true, label: (esAdelanto ? 'adelanto' : 'pago') + ' de $' + monto + ' a ' + full + (workName(workId) ? ' (' + workName(workId) + ')' : ''), coll: 'expenses', id: creado.id };
      }
    } catch (e) { return null; }
    return null;
  }

  /* Ejecución 100% conversacional CON confirmación real de persistencia:
     guarda en el store local, espera la respuesta de Supabase (upsert de
     app_data) y recién entonces permite mostrar el tilde verde. Si la nube
     falla, devuelve synced:false → NUNCA tilde verde con error. */
  async function execFormAction(action) {
    const mod = (action && action.modulo) || '';
    const c = (action && action.campos) || {};
    const saved = saveViaStore(mod, c);
    if (saved && saved.ok) {
      /* El dato ya está en el store local (S.add) → refrescar listas de la app */
      try { if (G.router && G.router.refresh) G.router.refresh(); } catch (e) {}
      /* Si había una consulta pendiente (p. ej. "cuánto debo pagar hoy" con
         tarifa faltante), se retoma automáticamente tras este guardado. */
      try { resumePendingGoal(); } catch (e) {}
      /* Esperar la confirmación REAL de la base de datos (Supabase) */
      try {
        if (G.sync && G.sync.push) {
          await G.sync.push(G.store.data);
        } else {
          throw new Error('sincronización no disponible');
        }
        return { saved: true, label: saved.label, coll: saved.coll, id: saved.id, synced: true };
      } catch (e) {
        return { saved: true, label: saved.label, coll: saved.coll, id: saved.id, synced: false, error: String((e && e.message) || e) };
      }
    }
    return { saved: false, modulo: mod };   // sin modal: la conversación continúa
  }

  /* Ruta directa al registro recién guardado (según su colección e id) */
  function gotoHref(coll, id) {
    switch (coll) {
      case 'employees': return '#/empleado/' + id;
      case 'works': return '#/obra/' + id;
      case 'assets': return '#/herramientas';
      case 'expenses': return '#/gastos';
      case 'incomes': return '#/ingresos';
      case 'contacts': return '#/directorio';
      case 'budgets': return '#/presupuestos';
      case 'attendance': return '#/jornadas';
      case 'compromisos': return '#/agenda';
      default: return null;
    }
  }

  /* Tarjeta de resumen "Tap-to-Confirm": tilde verde + [Ver registro] + [Deshacer] */
  function summaryCardHtml(res) {
    const href = res && res.coll ? gotoHref(res.coll, res.id) : null;
    return '<div class="ai-success"><span class="ai-success-ico">✔</span>' +
      '<div class="ai-success-txt"><b>¡Listo! Carga completada</b><br>' + esc(res.label) + '</div></div>' +
      (res.coll && res.id
        ? '<div class="ai-actions">' +
          (href ? '<a class="btn btn-soft btn-sm" href="' + href + '" data-goto="1" title="Ir al registro">👁️ Ver registro</a>' : '') +
          '<button class="btn btn-soft btn-sm" data-undo="1">↩ Deshacer</button>' +
          '</div>'
        : '');
  }
  function undoSave() {
    const r = lastSaved;
    lastSaved = null;
    if (!r || !r.coll || !r.id) return;
    try { if (G.store && G.store.remove) G.store.remove(r.coll, r.id); } catch (e) {}
    try { if (G.sync && G.sync.push) G.sync.push(G.store.data); } catch (e) {}
    try { if (G.router && G.router.refresh) G.router.refresh(); } catch (e) {}
    wizardBubble('↩ Listo, deshice la carga de ' + (r.label || '') + '. Si querés volver a cargarla, decímelo.');
  }

  /* Renderiza el resultado del guardado: tilde verde SOLO si sync confirmó */
  function renderSaveResult(pend, res) {
    if (!res || !res.saved) return false;
    if (res.synced) {
      lastSaved = (res.coll && res.id) ? { coll: res.coll, id: res.id, label: res.label } : null;
      pend.innerHTML = summaryCardHtml(res);
      if (G.ui && G.ui.toast) G.ui.toast('Guardado: ' + res.label, 'success');
    } else {
      pend.innerHTML = '⚠️ Guardé ' + res.label + ' en tu dispositivo, pero la nube no respondió y todavía no se sincronizó. Se va a reintentar solo cuando vuelva la conexión.';
      if (G.ui && G.ui.toast) G.ui.toast('Guardado local (sin conexión): ' + res.label, 'warning');
    }
    return true;
  }

  function setOpen(v) {
    document.getElementById('aiPanel').hidden = !v;
    const tip = document.getElementById('aiFabTip');
    if (tip) { try { tip.classList.remove('show'); } catch (e) {} }
    if (v) { syncUser(); refreshGreeting(); input.focus(); }
  }
  function toggle() { setOpen(document.getElementById('aiPanel').hidden); }

  function refreshGreeting() {
    if (builtMode === contextKey()) return;
    log.innerHTML = '';
    addGreeting();
  }

  /* Acciones rápidas → módulo de wizard. El click arranca el estado inicial
     DIRECTAMENTE: el texto del botón NUNCA se inyecta como dato del usuario. */
  const PILL_WIZARD = {
    'new-obra': 'obra',
    'new-gasto': 'gasto',
    'new-ingreso': 'ingreso',
    'new-presupuesto': 'presupuesto',
    'herramientas': 'herramienta',
    'new-jornada': 'jornada',
    'hoy': 'jornada',       // "¿Quién trabajó hoy?"
    'pago': 'pago',         // "Pago / Adelanto a empleado"
  };
  /* Claves que entran por "Crear agenda" (rol → carga manual) */
  const CONTACT_KEYS = ['new-contacto', 'new-empleado', 'new-cliente'];

  /* Limpia cualquier estado colgado si el usuario cancela o cambia de flujo */
  function resetFlows() {
    pendingOp = null;
    contactStage = null;
    contactRole = null;
    adminWizard = null;
    pendingAdmin = null;
    pendingGoal = null;
    ledgerMenu = false;
    toolsMenu = false;
  }

  /* Submenú "Contabilidad" → [Ingresos] [Gastos] */
  function addLedgerButtons(pend) {
    const wrap = document.createElement('div');
    wrap.className = 'ai-actions';
    ['Ingresos', 'Gastos'].forEach(lb => {
      const b = document.createElement('button');
      b.className = 'btn btn-soft btn-sm';
      b.textContent = lb;
      b.dataset.ledger = lb === 'Ingresos' ? 'ingreso' : 'gasto';
      wrap.appendChild(b);
    });
    pend.appendChild(wrap);
  }
  function startLedgerMenu(pend) {
    ledgerMenu = true;
    pend.innerHTML = '¿Qué querés cargar?';
    addLedgerButtons(pend);
    busy = false;
    scrollToEnd();
  }

  /* Submenú "Herramientas y Máquinas" → ver / cargar / asignar / jornada */
  function addToolsButtons(pend) {
    const wrap = document.createElement('div');
    wrap.className = 'ai-actions';
    [['ver', '👁️ Ver herramientas'], ['herramienta', '🛠️ Cargar nueva herramienta'], ['asignar', '📦 Asignar herramienta'], ['jornada', '👷 Cargar jornada']].forEach(t => {
      const b = document.createElement('button');
      b.className = 'btn btn-soft btn-sm';
      b.textContent = t[1];
      b.dataset.tools = t[0];
      wrap.appendChild(b);
    });
    pend.appendChild(wrap);
  }
  function startToolsMenu(pend) {
    toolsMenu = true;
    pend.innerHTML = '¿Qué querés hacer con tus herramientas?';
    addToolsButtons(pend);
    busy = false;
    scrollToEnd();
  }

  function firePill(k) {
    resetFlows();   // cambio de flujo → limpiar estados anteriores colgados
    recordAction(k);   // registrar para los chips de acceso rápido
    /* Pills de contexto de obra (URL #/obra/<id>) */
    if (k.indexOf('__adv_') === 0) {
      const wid = k.slice(6);
      const w = (G.store.data.works || []).find(x => x.id === wid);
      if (w) { try { G.actions.expense({ type: 'obra', workId: wid, expenseKind: 'adelanto' }); } catch (e) {} }
      setOpen(false);
      return;
    }
    if (k.indexOf('__exp_') === 0) {
      const wid = k.slice(6);
      const w = (G.store.data.works || []).find(x => x.id === wid);
      if (w) { try { G.actions.expense({ type: 'obra', workId: wid }); } catch (e) {} }
      setOpen(false);
      return;
    }
    if (k.indexOf('__who_') === 0) {
      const wid = k.slice(6);
      const w = (G.store.data.works || []).find(x => x.id === wid);
      const name = w ? (w.name || w.nombre) : 'la obra';
      input.value = '¿Quién trabajó en ' + name + ' hoy?';
      send();
      return;
    }
    if (k === 'contabilidad') {
      /* "Consultar saldo" → responde de inmediato con el resumen financiero */
      const pend = bubble('', 'bot');
      appendLog(pend);
      scrollToEnd();
      busy = true;
      handleFinancialSummary(pend);
      return;
    }
    if (k === 'herramientas') {
      const pend = bubble('', 'bot');
      appendLog(pend);
      scrollToEnd();
      startToolsMenu(pend);
      return;
    }
    if (CONTACT_KEYS.indexOf(k) >= 0) {
      /* Blindaje: activa el estado WAITING_CONTACT_TYPE sin pasar texto */
      const pend = bubble('', 'bot');
      appendLog(pend);
      scrollToEnd();
      startContactFlow(pend);
      return;
    }
    const mod = PILL_WIZARD[k];
    if (mod) {
      /* Blindaje: arranca el wizard del módulo DIRECTAMENTE (estado inicial) */
      const pend = bubble('', 'bot');
      appendLog(pend);
      scrollToEnd();
      startWizard(mod, {});
      return;
    }
    /* Pills administrativos: conservan la navegación original */
    const fn = ACTION_KEYS[k];
    if (fn) { fn(); setOpen(false); }
  }

  /* Detecta el contexto de obra desde la URL: #/obra/<id> */
  function currentWorkContext() {
    try {
      const m = String(location.hash || '').match(/^#\/obra\/([^/]+)/);
      if (!m) return null;
      const id = decodeURIComponent(m[1]);
      const w = (G.store.data.works || []).find(x => x.id === id);
      return w ? { id, name: w.name || w.nombre || 'Obra' } : null;
    } catch (e) { return null; }
  }

  function addGreeting() {
    const pillsAdmin = [
      { k: 'admin-metrics', e: '📊', l: 'Métricas MRR/ARR' },
      { k: 'admin-users', e: '👥', l: 'Usuarios en trial' },
      { k: 'admin-audit', e: '🔍', l: 'Auditoría' },
      { k: 'admin-register-user', e: '➕', l: 'Registrar usuario' },
    ];
    const pillsUser = [
      { k: 'new-obra', e: '🏗️', l: 'Nueva obra' },
      { k: 'new-gasto', e: '💸', l: 'Cargar gasto' },
      { k: 'new-ingreso', e: '💰', l: 'Registrar cobro' },
      { k: 'pago', e: '💳', l: 'Pago / Adelanto' },
      { k: 'new-presupuesto', e: '📄', l: 'Presupuesto' },
      { k: 'contabilidad', e: '📊', l: 'Consultar saldo' },
      { k: 'new-contacto', e: '👤', l: 'Nuevo contacto' },
      { k: 'hoy', e: '👷', l: '¿Quién trabajó hoy?' },
      { k: 'herramientas', e: '🛠️', l: 'Herramientas' },
    ];
    const admin = isAdminMode();
    builtMode = contextKey();
    const sub = document.getElementById('aiSub');
    if (sub) sub.textContent = admin ? 'COO Virtual · gestión SaaS' : 'Capataz Digital · te guío';

    /* Contexto de obra: botones dinámicos específicos de esa obra */
    const ctxWork = admin ? null : currentWorkContext();
    const pills = admin ? pillsAdmin : (ctxWork ? [
      { k: '__adv_' + ctxWork.id, e: '💸', l: 'Adelanto a empleado (' + ctxWork.name + ')' },
      { k: '__exp_' + ctxWork.id, e: '💰', l: 'Cargar gasto en ' + ctxWork.name },
      { k: '__who_' + ctxWork.id, e: '👷', l: '¿Quién trabajó en ' + ctxWork.name + ' hoy?' },
    ] : pillsUser);

    const saludo = admin
      ? '¡Hola Super Admin 👑! Soy tu COO Virtual. Consultame métricas o gestiona el SaaS.'
      : (ctxWork
        ? '¡Hola! 👋 Estás en la obra <b>' + esc(ctxWork.name) + '</b>. Tocá una acción rápida de esta obra.'
        : '¡Hola! 👋 Soy tu asistente GADU. Tocá una acción rápida o preguntame lo que necesites.');

    /* Acceso directo a WhatsApp (solo para usuarios, no para el COO admin).
       Se renderiza DENTRO de la fila deslizable, como un pill destacado. */
    const waPill = admin ? '' :
      '<a class="ai-wa-pill" href="' + waLink(G.BOT_PHONE_NUMBER || '5493547665984', 'Hola GADU, quiero cargar datos por acá') + '" target="_blank" rel="noopener">📲 Usar WhatsApp</a>';
    const waTip = admin ? '' :
      '<div class="ai-tip">💡 Tip: También podés usar nuestro bot de WhatsApp para dictar audios y sacar fotos.</div>';

    /* Chips de acciones recientes (últimas 2-3 más usadas) */
    const labelMap = {};
    pillsUser.forEach(p => { labelMap[p.k] = p; });
    pillsAdmin.forEach(p => { labelMap[p.k] = p; });
    const recents = recentActions()
      .map(k => labelMap[k])
      .filter(Boolean)
      .filter(p => p.k !== 'contabilidad' && p.k !== 'admin-metrics')
      .slice(0, 3);
    const recentsRow = (!admin && !ctxWork && recents.length)
      ? '<div class="ai-recents"><span class="ai-recents-label">Recientes</span>' +
        recents.map(p => '<button class="btn btn-soft btn-sm" data-act="' + p.k + '">' + p.e + ' ' + p.l + '</button>').join('') +
        '</div>'
      : '';

    const bot = bubble(
      saludo + '<br>' +
      recentsRow +
      '<div class="ai-grid">' + pills.map(p => '<button class="btn btn-soft btn-sm" data-act="' + p.k + '">' + p.e + ' ' + p.l + '</button>').join('') + waPill + '</div>' +
      waTip,
      'bot');
    appendLog(bot);
    log.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => firePill(b.dataset.act)));
  }

  /* Bienvenida de primera vez (Capataz Digital) */
  function addFirstWelcome() {
    const pills = [
      { k: 'new-empleado', e: '👷', l: 'Cargar empleado' },
      { k: 'new-gasto', e: '💸', l: 'Cargar gasto' },
      { k: 'new-cliente', e: '👤', l: 'Nuevo cliente' },
      { k: 'new-obra', e: '🏗️', l: 'Nueva obra' },
    ];
    const bot = bubble(
      '¡Hola! 👋 Bienvenido a GADU. Soy tu ayudante de obra.<br>' +
      'Tocá un botón o escribime qué querés cargar, por ejemplo: <b>"Quiero cargar un empleado"</b>.<br>' +
      '<div class="ai-grid">' + pills.map(p => '<button class="btn btn-soft btn-sm" data-act="' + p.k + '">' + p.e + ' ' + p.l + '</button>').join('') + '</div>',
      'bot');
    appendLog(bot);
    log.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => firePill(b.dataset.act)));
  }

  function maybeWelcome() {
    const k = prefKey('gadu_ai_onboarded');
    let first = false;
    try { if (!localStorage.getItem(k)) { localStorage.setItem(k, 'true'); first = true; } } catch (e) {}
    if (!first) return;
    const admin = isAdminMode();
    setTimeout(() => {
      try {
        log.innerHTML = '';
        if (admin) { addGreeting(); } else { addFirstWelcome(); }
        setOpen(true);
      } catch (e) {}
    }, 900);
  }

  /* Normaliza palabras sueltas a las categorías CANÓNICAS del store */
  function normCat(raw) {
    const r = String(raw || '').toLowerCase();
    if (/material/.test(r)) return 'Materiales';
    if (/combustible|nafta|gasoil|gas-oil/.test(r)) return 'Combustible';
    if (/mano de obra|jornal/.test(r)) return 'Mano de obra';
    if (/flete/.test(r)) return 'Fletes';
    if (/subcontrat/.test(r)) return 'Subcontratos';
    if (/alquiler de equip/.test(r)) return 'Alquiler de equipos';
    if (/mantenimiento/.test(r)) return 'Mantenimiento de herramientas';
    if (/herramienta|equipamiento|equipo/.test(r)) return 'Herramientas / Equipamiento';
    if (/sueldo/.test(r)) return 'Sueldos';
    if (/seguro/.test(r)) return 'Seguros';
    if (/impuesto/.test(r)) return 'Impuestos';
    if (/servicio/.test(r)) return 'Servicios';
    if (/alquiler/.test(r)) return 'Alquiler';
    return null;
  }

  /* Intents locales de respaldo: si la IA no responde (pico/timeout),
     interpretamos la orden con patrones simples. */
  /* ---------- NLP: extracción de entidades reales del store ---------- */
  /* Resuelve una mención textual a una herramienta/equipo existente.
     Reúne coincidencias por nombre completo Y por palabras y elige
     siempre el nombre más largo/específico (evita "Amoladora" vs "Amoladora angular"). */
  function findAssetMention(t) {
    const assets = (((G.store && G.store.data) || {}).assets || []).filter(a => a.status !== 'dado de baja' && a.name);
    if (!assets.length) return null;
    const ft = flatText(t);
    const excl = /^(obra|hoy|ayer|mañana|depósito|deposito|mantenimiento|taller|asignar|mover|dejé|deje|mandar|manda|mandá|ubicar|destinar|devolver|guardar|guardé|herramienta|máquina|maquina|equipo)$/;
    const words = ft.split(/\s+/).filter(w => w.length >= 4 && !excl.test(w));
    const cand = [];
    assets.forEach(a => {
      const nm = flatText(a.name);
      const parts = nm.split(/\s+/);
      const sub = ft.includes(nm);
      const word = words.some(w => parts.some(p => p.length >= 4 && (p.startsWith(w) || w.startsWith(p))));
      if (sub || word) cand.push(String(a.name).trim());
    });
    if (!cand.length) return null;
    cand.sort((a, b) => b.length - a.length);
    return cand[0];
  }
  /* Normaliza texto para comparación: minúsculas y sin acentos */
  function flatText(s) {
    try { return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
    catch (e) { return String(s || '').toLowerCase(); }
  }
  /* Normalización FUZZY para búsqueda tolerante: minúsculas, sin tildes,
     sin artículos/preposiciones ("de","la","el","casa","obra"...). */
  function normText(s) {
    return flatText(s)
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\b(?:de|del|la|el|los|las|en|a|con|y|e|al|un|una|casa|obra|obras|proyecto|the|of|para|por|mi|mis)\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  /* Nombre de obra con fallback seguro de propiedades:
     `nombre || name || titulo || nombreObra` — y rechaza los valores
     basura "undefined"/"null" que dejan los registros viejos (así
     "casa angel camara" se muestra SIEMPRE con su nombre real). */
  function workLabel(w) {
    if (!w) return '';
    const cands = [w.nombre, w.name, w.titulo, w.nombreObra, w.nombre_obra];
    for (let i = 0; i < cands.length; i++) {
      const c = cands[i];
      if (c == null) continue;
      const s = String(c).trim();
      if (s && !/^(undefined|null|nan|\[object\s+object\])$/i.test(s)) return s;
    }
    return '';   // sin nombre válido → se excluye de las listas (nunca "undefined")
  }
  /* Resuelve una mención textual a un empleado activo (nombre completo).
     Devuelve el nombre ORIGINAL (no el normalizado) para mostrar en chips. */
  function findEmployeeMention(t) {
    const emps = (((G.store && G.store.data) || {}).employees || []).filter(e => e.active !== false && e.firstName);
    if (!emps.length) return null;
    const ft = flatText(t);
    const cand = [];
    emps.forEach(e => {
      const original = ((e.firstName || '') + ' ' + (e.lastName || '')).trim();
      const nm = flatText(original);
      if (nm.length >= 3 && ft.includes(nm)) cand.push(original);
      else if (nm.split(/\s+/).some(p => p.length >= 4 && ft.includes(p))) cand.push(original);
    });
    if (!cand.length) return null;
    cand.sort((a, b) => flatText(b).length - flatText(a).length);
    return cand[0];
  }
  /* Resuelve una mención textual a una obra existente (nombre o cliente).
     Blindado: ignora obras sin nombre para nunca devolver "undefined". */
  function findWorkMention(t) {
    const d = (G.store && G.store.data) || {};
    const works = (d.works || []).filter(w => w && workLabel(w));
    if (!works.length) return null;
    const ftn = normText(t);
    const ft = flatText(t);
    const nm = w => flatText(workLabel(w));
    /* 1) Fuzzy exacto bidireccional (normalizado sin preposiciones/artículos) */
    let hit = works.find(w => {
      const n = normText(workLabel(w));
      return n.length >= 3 && (ftn.includes(n) || n.includes(ftn));
    });
    if (hit) return workLabel(hit);
    /* 2) Fallback por token significativo (≥4 chars) */
    hit = works.find(w => {
      const n = normText(workLabel(w));
      return n.split(/\s+/).some(tk => tk.length >= 4 && ftn.includes(tk));
    });
    if (hit) return workLabel(hit);
    /* "obra de Pablo Molina" → busca por el cliente de la obra */
    const cm = t.match(/obra\s+(?:de|del)\s+([a-záéíóúñ][\wáéíóúñ\s'-]*?)(?=\s*(?:hoy|ayer|mañana|para|,|\.|$))/i);
    if (cm) {
      const frag = flatText(cm[1].trim());
      const cli = (d.contacts || []).filter(c => c && c.name).find(c => {
        const n = flatText(c.name);
        return n.includes(frag) || frag.includes(n);
      });
      if (cli) {
        const w = works.find(x => x.clientId === cli.id);
        if (w) return workLabel(w);
      }
      hit = works.find(w => nm(w).includes(frag) || frag.includes(nm(w)));
      if (hit) return workLabel(hit);
    }
    const words = ft.split(/\s+/).filter(w => w.length >= 5 && !/^(obra|hoy|ayer|mañana|asignar|mover|deje|cobre|pague|gaste|compre|deposito|mantenimiento)$/.test(w));
    for (const w of words) {
      /* Solo prefijos estrictos de palabras del nombre (evita falsos positivos) */
      hit = works.find(x => nm(x).split(/\s+/).some(p => p.length >= 5 && p.startsWith(w)));
      if (hit) return workLabel(hit);
    }
    return null;
  }
  /* Destino de una orden de asignación: depósito / mantenimiento / obra */
  function detectDestino(t) {
    if (/dep[oó]sito|guardada|a\s+casa|de\s+vuelta/.test(t)) return '📦 En depósito';
    if (/mantenimiento|reparaci[oó]n|taller|service|arregl/.test(t)) return '🔧 En mantenimiento';
    return findWorkMention(t);
  }
  /* Normaliza fechas conversacionales → ISO (hoy/mañana/pasado mañana/dd/mm/iso).
     Acepta la fecha suelta o embebida dentro de una frase. */
  function normFecha(val) {
    const v = String(val || '').trim().toLowerCase().replace(/^para\s+/, '').replace(/^el\s+/, '');
    const today = (G.store && G.store.todayISO) ? G.store.todayISO() : new Date().toISOString().slice(0, 10);
    if (/^hoy$/.test(v) || /\bhoy\b/.test(v)) return today;
    if (/^mañana$|^manana$/.test(v) || /\bmañana\b|\bmanana\b/.test(v)) return (G.store && G.store.daysAhead) ? G.store.daysAhead(1) : v;
    if (/pasado\s+mañana|pasado\s+manana/.test(v)) return (G.store && G.store.daysAhead) ? G.store.daysAhead(2) : v;
    const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (iso) return iso[0];
    const ddmm = v.match(/(?:^|\D)(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?(?:\D|$)/);
    if (ddmm) {
      const y = ddmm[3] || String(new Date().getFullYear());
      return y + '-' + ddmm[2].padStart(2, '0') + '-' + ddmm[1].padStart(2, '0');
    }
    return null;
  }

  function localIntent(text) {
    const t = String(text || '').toLowerCase();
    /* 0.5) Crear un contacto → primero elegir rol (Empleado/Cliente/Socio) */
    if (/(?:importar|cargar|agregar|traer|alta de|crear)\s+(?:un |una |el |la )?contacto\b/.test(t) ||
        /contacto\s+(?:desde\s+la\s+agenda|de\s+la\s+agenda|nuevo)/.test(t)) {
      return { modulo: 'contacto', campos: {} };
    }
    /* 0.55) Asignar / mover una herramienta → NLP con entidades (function calling):
       "Asignar la Amoladora a la obra de Pablo Molina hoy" / "Dejé la amoladora en el depósito" */
    if (/(?:asignar|asigne|asigná|mover|muevo|mové|mandar|mand[aá]|mandame|ubicar|destinar|devolver|devolví|devolvi|dejé|deje|dejo|dejó|dejamos|guardar|guardé|guarde|guardamos)\s+(?:una? |la |el )?(?:herramienta|m[aá]quina|equipo|amoladora|hormigonera|andamio|camioneta|sierra|rotomartillo|taladro|mezcladora)/.test(t) ||
        /herramienta\s+(?:a|en)\s+(?:la\s+)?obra/.test(t) ||
        /(?:asignar|mover)\s+herramientas?/.test(t)) {
      const asset = findAssetMention(t);
      const destino = detectDestino(t);
      const nota = /hoy/.test(t) ? 'Por chat: ' + t : t;
      if (asset && destino) return { modulo: 'asignar', campos: { herramienta: asset, destino, nota } };
      if (asset) return { modulo: 'asignar', campos: { herramienta: asset } };
      if (destino) return { modulo: 'asignar', campos: { destino } };
      return { modulo: 'asignar', campos: {} };
    }
    /* 0.56) Agendar compromisos: "agendar una visita mañana a la obra X" */
    if (/agend[aá]|program[aá]|anot[aá]m[eé]?\s+(?:una? )?(?:visita|entrega|evento|reuni[oó]n|tarea)|visita\s+(?:hoy|mañana|pasado)|entrega\s+(?:hoy|mañana|pasado|el\s)/.test(t)) {
      const tf = flatText(t);
      const tipo = /entrega|entregar/.test(tf) ? 'entrega'
        : /reunion/.test(tf) ? 'reunion'
        : /tarea/.test(tf) ? 'tarea'
        : /evento|asado|inauguraci/.test(tf) ? 'evento'
        : 'visita';
      const fecha = normFecha(t);
      const lugar = findWorkMention(t);
      const campos = { tipo, titulo: text, hora: '' };
      if (fecha) campos.fecha = fecha;
      if (lugar) campos.lugar = lugar;
      return { modulo: 'agendar', campos };
    }
    /* 0.57) Pago / Adelanto a empleado → impacto doble (gasto + saldo) */
    if (/(?:pagarle|pagar|pagale|pagá|pago|adelanto|anticipo|sueldo|semana|quincena)/.test(t) &&
        findEmployeeMention(t) && !/gasto/.test(t)) {
      const emp = findEmployeeMention(t);
      const tipo = /adelanto|anticipo/.test(t) ? 'Adelanto' : 'Pago de jornada / semana';
      const monto = parseMoney(t);
      const obra = findWorkMention(t);
      const campos = { empleado: emp, tipo, monto: monto > 0 ? monto : '' };
      if (obra) campos.obra = obra;
      return { modulo: 'pago', campos };
    }
    /* 0) Compra de herramienta/equipamiento → flujo de inversión (herramienta) */
    if (/(?:comprar|compré|compre|compra|compro|invertir en|inversión en)\s+(?:una |un |la |el )?/.test(t) &&
        /(herramienta|equipo|equipamiento|máquina|maquina|amoladora|taladro|sierra|compresor|andamio|mezcladora|hormigonera|moladora)/.test(t)) {
      const campos = {};
      const cst = parseMoney(t);   // "100mil", "100.000" y similares
      if (cst > 0) campos.costo = cst;
      return { modulo: 'herramienta', campos };
    }
    /* Preguntas NUNCA disparan formularios de creación: "¿puedo crear una obra?",
       "¿cuánto gasté en la obra X?", "¿cuánto balance hay?" → se responden como
       consulta (búsqueda/IA), no como alta. Evita bucles y formularios erróneos. */
    if (isQuery(t)) return null;
    /* 1) Crear entidades: "crear/cargar empleado|obra|cliente|socio|presupuesto [nombre]" */
    const crear = t.match(/(?:crear|crea|agregar|alta de|nueva|nuevo|cargar|carga|cárgame|cargame|cargá)\s+(?:un |una |el |la |a )?(empleado|obra|cliente|socio|presupuesto|herramienta|jornada)\b/i);
    if (crear) {
      const modulo = crear[1];
      const resto = t.slice(t.indexOf(crear[0]) + crear[0].length).trim();
      const nombre = resto.replace(/^(que se llame|llamado|llamada|de nombre|de|a|para)\s+/i, '').trim();
      if (nombre) return { modulo, campos: { nombre } };
      return { modulo, campos: {} };
    }
    /* 2) Gastos/ingresos: NLP con entidades — con monto se ejecuta, sin monto se guía en el chat */
    const kind = /gasto|gast[ée]|pagu[ée]|compr[ée]|comprar/.test(t) ? 'gasto'
      : /ingreso|cobr[ée]|cobro|anticipo|adelanto|certificaci/.test(t) ? 'ingreso'
      : null;
    if (!kind) return null;
    /* Monto robusto: "100.000", "100mil", "100 mil", "1.500,50" */
    const monto = parseMoney(t);
    if (!(monto > 0)) return { modulo: kind, campos: {} };   // sin monto → pedir datos en el chat
    const campos = { monto };
    /* Entidad obra: "de la obra X" / "en la obra X" / mención directa */
    const obra = findWorkMention(t);
    if (obra) campos.obra = obra;
    if (kind === 'gasto') {
      const cat = t.match(/(material|combustible|nafta|gasoil|mano de obra|jornal|flete|subcontrat|alquiler|mantenimiento|herramienta|equipamiento|equipo|sueldo|seguro|impuesto|servicio)/);
      if (cat) campos.categoria = normCat(cat[1]);
      campos.comprobante = '';   // comprobante opcional → ejecución directa sin preguntar
    } else {
      campos.concepto = /anticipo|adelanto/.test(t) ? 'Adelanto' : (/certificaci/.test(t) ? 'Certificación' : 'Cobro');
    }
    return { modulo: kind, campos };
  }

  /* Consulta de sueldo/saldo de un empleado → devuelve el nombre detectado */
  function salaryIntent(text) {
    const t = flatText(text);
    const pide = /(cu[aá]nto|c[uó]mo|cu[aá]l|qu[eé])\b.*\b(cobrar|sueldo|saldo|liquidar|liquidaci[oó]n|adelantos?|debe)/.test(t) ||
      /\b(saldo|sueldo|liquidaci[oó]n|por cobrar|cobrar)\b.*\b(de|del|a)\b/.test(t);
    if (!pide) return null;
    return findEmployeeMention(text);
  }
  /* Cálculo directo: horas trabajadas × tarifa − ADELANTOS activos.
     Misma fórmula que la tarjeta/legajo del empleado (employeeAccumulated). */
  function employeeSalaryInfo(empName) {
    try {
      const emps = ((G.store && G.store.data) || {}).employees || [];
      const emp = emps.find(e => flatText(((e.firstName || '') + ' ' + (e.lastName || '')).trim()) === flatText(empName));
      if (!emp) return null;
      const st = G.store.employeeStats(emp.id);
      const rate = Number(emp.hourlyRate) || 0;
      const devengado = (st.hoursTotal || 0) * rate;
      const neto = devengado - st.advances;   // se restan los adelantos activos
      return {
        nombre: G.store.employeeName(emp),
        dias: st.daysWorked, horas: st.hoursTotal, tarifa: rate,
        devengado, sueldos: st.salary, adelantos: st.advances, pagado: st.paidTotal, neto,
      };
    } catch (e) { return null; }
  }
  /* Responde en el chat con el desglose y el neto exacto */
  function handleSalaryAnswer(empName, pend) {
    const info = employeeSalaryInfo(empName);
    if (!info) {
      pend.innerHTML = 'No encontré a un empleado llamado "<b>' + esc(empName) + '</b>". Fijate en <b>Recursos Humanos → Empleados</b> cómo está cargado.';
      busy = false;
      scrollToEnd();
      return;
    }
    const fmt = (G.ui && G.ui.fmtMoney) ? G.ui.fmtMoney : (v => '$' + v);
    pend.innerHTML =
      '💰 <b>' + esc(info.nombre) + '</b><br>' +
      '• ' + info.dias + ' día' + (info.dias !== 1 ? 's' : '') + ' · <b>' + info.horas + ' horas</b> trabajadas' + (info.tarifa ? ' × ' + fmt(info.tarifa) + ' la hora' : '') + '<br>' +
      '• Devengado: <b>' + fmt(info.devengado) + '</b><br>' +
      '• Adelantos a descontar: ' + fmt(info.adelantos) + (info.sueldos ? ' · (sueldos ya liquidados: ' + fmt(info.sueldos) + ')' : '') + '<br>' +
      (info.neto >= 0
        ? '✅ Saldo neto por cobrar: <b>' + fmt(info.neto) + '</b>'
        : '⚠️ Los adelantos superan lo ganado por <b>' + fmt(-info.neto) + '</b> (se descuentan de próximas jornadas)');
    /* Botón de WhatsApp (pestaña nueva, sin pop-ups): comparte el saldo */
    try {
      const empRec = (G.store.data.employees || []).find(e => G.store.employeeName(e) === info.nombre);
      const waHref = empRec ? waLink(empRec.phone, 'Hola ' + info.nombre + '! Te comparto tu saldo de GADU: ' + (info.neto >= 0 ? 'a cobrar ' + fmt(info.neto) : 'a favor ' + fmt(-info.neto))) : '';
      if (waHref) pend.innerHTML += '<br><a class="btn btn-soft-success btn-sm" href="' + waHref + '" target="_blank" rel="noopener" style="margin-top:8px">💬 Enviar por WhatsApp</a>';
    } catch (e) {}
    rememberTurn('usuario', 'saldo de ' + empName);
    rememberTurn('asistente', 'saldo de ' + info.nombre + ': ' + info.neto);
    busy = false;
    scrollToEnd();
  }

  /* Redirección de ruta automática: "mostrame el libro contable" → #/libro */
  const ROUTE_MAP = [
    { re: /libro contable|libro|contabilidad/, route: '#/libro' },
    { re: /(mis\s+)?gastos|egresos/, route: '#/gastos' },
    { re: /(mis\s+)?ingresos|cobros/, route: '#/ingresos' },
    { re: /empleados|personal|recursos humanos/, route: '#/empleados' },
    { re: /jornadas|asistencia/, route: '#/jornadas' },
    { re: /agenda/, route: '#/agenda' },
    { re: /dashboard|panel general|inicio/, route: '#/dashboard' },
    { re: /presupuestos/, route: '#/presupuestos' },
    { re: /herramientas|m[aá]quinas/, route: '#/herramientas' },
    { re: /directorio|contactos/, route: '#/directorio' },
    { re: /socios/, route: '#/socios' },
    { re: /obras?/, route: '#/obras' },
  ];
  function routeIntent(text) {
    const t = flatText(text);
    /* Solo frases de navegación explícita, para no pisar comandos de carga */
    if (!/(mostr[aá]me|abr[ií]me|abr[ií]|abrir|and[aá] a|ir a|llev[aá]me|llevame|quiero (ver|entrar)|ver (el|la|mis)|mostrame)/.test(t)) return null;
    for (const r of ROUTE_MAP) if (r.re.test(t)) return r.route;
    return null;
  }
  function handleRouteAnswer(route, pend) {
    const label = route.replace('#/', '');
    pend.innerHTML = '🚀 Te llevo a <b>' + esc(label) + '</b>…';
    rememberTurn('usuario', 'abrir ' + label);
    rememberTurn('asistente', 'abrí ' + label);
    busy = false;
    scrollToEnd();
    try { setOpen(false); } catch (e) {}
    setTimeout(() => { try { if (G.router && G.router.navigate) G.router.navigate(route); } catch (e2) {} }, 120);
  }

  /* Saldo por cobrar de OBRAS: presupuesto − cobros/adelantos recibidos.
     Detecta "cuánto me queda por cobrar", "cuánto me debe X", "saldo de obras".
     Devuelve el nombre de la obra/cliente mencionado, '__all__' para todas,
     o null si NO es una consulta de este tipo. */
  function workBalanceIntent(text) {
    const t = flatText(text);
    const pide = /(cu[aá]nto|c[uó]mo|qu[eé]|saldo|falta|pendiente|deuda)/.test(t) && /\b(cobrar|debe|deuda|pendiente|cobro)\b/.test(t);
    if (!pide) return null;
    /* Consultas de caja/plata/dinero o de sueldo NO son de obras */
    if (/(caja|plata|dinero|empleado|sueldo)/.test(t)) return null;
    const w = findWorkMention(text);
    if (w) return w;
    /* Menciones de CLIENTE: "cuánto me debe Ángel Cámara" */
    try {
      const cs = ((G.store && G.store.data) || {}).contacts || [];
      const hit = cs.find(c => c.type === 'cliente' && c.name && t.includes(flatText(c.name)));
      if (hit) return hit.name;
      const words = t.replace(/[¿?¡!.,]/g, ' ').split(/\s+/).filter(x => x.length >= 4);
      const part = cs.find(c => c.type === 'cliente' && c.name && words.some(x => flatText(c.name).includes(x)));
      if (part) return part.name;
    } catch (e) {}
    return '__all__';
  }
  function workBalanceInfo(mention) {
    try {
      const S = G.store;
      const works = (S.data.works || []).filter(w => w.status !== 'finalizada');
      const rows = works.map(w => {
        const cobrado = S.sum((S.data.incomes || []).filter(x => x.workId === w.id).map(x => x.amount));
        const budget = Number(w.budgetTotal) || 0;
        return { name: w.name || 'Obra', code: w.code || '', budget, cobrado, pendiente: budget - cobrado, clientId: w.clientId };
      });
      let sel = rows;
      if (mention && mention !== '__all__') {
        const m = flatText(mention);
        sel = rows.filter(r => flatText(r.name).includes(m));
        if (!sel.length) {
          const cli = (S.data.contacts || []).find(c => c.type === 'cliente' && flatText(c.name || '').includes(m));
          if (cli) sel = rows.filter(r => r.clientId === cli.id);
        }
      }
      return { rows: sel, totalPendiente: S.sum(sel.map(r => r.pendiente)) };
    } catch (e) { return null; }
  }
  function handleWorkBalanceAnswer(mention, pend) {
    const info = workBalanceInfo(mention);
    if (!info || !info.rows.length) {
      pend.innerHTML = mention && mention !== '__all__'
        ? 'No encontré obras ni clientes con "<b>' + esc(mention) + '</b>". Asegurate de cargar el <b>presupuesto</b> de la obra para calcular el saldo.'
        : 'No hay obras activas para calcular el saldo por cobrar. Cargá una obra con su presupuesto y te lo desgloso.';
      busy = false;
      scrollToEnd();
      return;
    }
    const fmt = (G.ui && G.ui.fmtMoney) ? G.ui.fmtMoney : (v => '$' + v);
    const lines = info.rows.map(r =>
      '• <b>' + esc(r.name) + '</b>: Presupuesto ' + fmt(r.budget) + ' − Cobrado ' + fmt(r.cobrado) + ' = ' +
      (r.pendiente >= 0
        ? 'Pendiente <b>' + fmt(r.pendiente) + '</b>'
        : 'cobrado de más <b>' + fmt(-r.pendiente) + '</b>')
    ).join('<br>');
    pend.innerHTML =
      '🏗️ <b>Saldo por cobrar de obras</b><br>' + lines + '<br>' +
      '📊 <b>Total pendiente por cobrar: ' + fmt(info.totalPendiente) + '</b>';
    rememberTurn('usuario', 'saldo por cobrar de obras');
    rememberTurn('asistente', 'pendiente por cobrar: ' + info.totalPendiente);
    busy = false;
    scrollToEnd();
  }

  /* Estado de caja: balance neto inmediato (ingresos − gastos) */
  function cashIntent(text) {
    const t = flatText(text);
    if (!/(cu[aá]nt[oa]|cu[aá]l|c[uó]mo|qu[eé]|estado).*\b(caja|balance|saldo|plata|dinero|me queda|tengo)\b/.test(t)) return null;
    return true;
  }
  function cashInfo() {
    try { const t = G.store.totals(); return { ingresos: t.incomes, gastos: t.expenses, neto: t.net }; } catch (e) { return null; }
  }
  /* Resumen financiero inmediato: caja + deudas (cuotas y empleados) */
  function financialSummary() {
    try {
      const S = G.store;
      const t = S.totals();
      const debts = (S.data.debts || []).filter(d => !d.finalizada);
      const cuotasPend = debts.reduce((s, d) => {
        const faltan = Math.max(0, (Number(d.cuotasTotales) || 0) - (Number(d.cuotaActual) || 0) + 1);
        return s + faltan * (Number(d.montoPorCuota) || 0);
      }, 0);
      const deudaEmp = (S.data.employees || []).reduce((s, e) => {
        const m = S.employeeMonth ? S.employeeMonth(e.id) : null;
        const devengado = (m ? (m.hours || 0) : 0) * (Number(e.hourlyRate) || 0);
        return s + Math.max(0, devengado - (m ? ((m.salary || 0) + (m.advances || 0)) : 0));
      }, 0);
      return { ingresos: t.incomes, gastos: t.expenses, neto: t.net, cuotasPend, deudaEmp };
    } catch (e) { return null; }
  }
  function handleFinancialSummary(pend) {
    const info = financialSummary();
    const fmt = (G.ui && G.ui.fmtMoney) ? G.ui.fmtMoney : (v => '$' + v);
    if (!info) { pend.innerHTML = 'No pude calcular el resumen.'; busy = false; return; }
    pend.innerHTML =
      '📊 <b>Resumen financiero</b><br>' +
      '• Ingresos: <b class="pos">' + fmt(info.ingresos) + '</b><br>' +
      '• Gastos: <b class="neg">−' + fmt(info.gastos) + '</b><br>' +
      '• Balance neto: <b class="' + (info.neto >= 0 ? 'pos' : 'neg') + '">' + fmt(info.neto) + '</b>' +
      (info.cuotasPend ? '<br>• Deudas en cuotas: <b class="neg">' + fmt(info.cuotasPend) + '</b>' : '') +
      (info.deudaEmp ? '<br>• Deuda a empleados: <b class="neg">' + fmt(info.deudaEmp) + '</b>' : '') +
      '<br><span class="muted small">Decime "libro contable" para ver todos los movimientos, o tocá una acción rápida.</span>';
    rememberTurn('usuario', 'resumen financiero');
    rememberTurn('asistente', 'resumen: neto ' + info.neto);
    busy = false;
    scrollToEnd();
  }
  function handleCashAnswer(pend) {
    const info = cashInfo();
    if (!info) { busy = false; return; }
    const fmt = (G.ui && G.ui.fmtMoney) ? G.ui.fmtMoney : (v => '$' + v);
    pend.innerHTML =
      '💰 <b>Estado de caja</b><br>' +
      '• Ingresos: <b class="pos">' + fmt(info.ingresos) + '</b><br>' +
      '• Gastos: <b class="neg">−' + fmt(info.gastos) + '</b><br>' +
      '• Balance neto: <b class="' + (info.neto >= 0 ? 'pos' : 'neg') + '">' + fmt(info.neto) + '</b>';
    rememberTurn('usuario', 'caja');
    rememberTurn('asistente', 'caja: ' + info.neto);
    busy = false;
    scrollToEnd();
  }

  /* ---------- Pagos del día: "¿cuánto debo pagar hoy?" ---------- */
  function payTodayIntent(text) {
    const t = flatText(text);
    if (!/(cu[aá]nto|c[uó]mo|qu[eé]|total).*\b(pagar|pago|debo|adeudo|liquidar)\b/.test(t)) return null;
    if (!/\b(hoy|d[ií]a de hoy|este d[ií]a|jornadas?)\b/.test(t)) return null;
    return true;
  }
  function payTodayInfo() {
    try {
      const S = G.store;
      const hoy = S.todayISO();
      const att = (S.data.attendance || []).filter(a => a.date === hoy && a.status === 'presente');
      const rows = [];
      const missing = [];
      att.forEach(a => {
        const e = S.employeeById(a.employeeId);
        if (!e) return;
        const nombre = S.employeeName(e);
        const horas = S.sum((a.hours || []).map(h => h.hours));
        const rate = Number(e.hourlyRate) || 0;
        if (!rate) { missing.push(nombre); return; }
        const acc = S.employeeAccumulated(e.id);
        rows.push({ nombre, horas, tarifa: rate, saldo: acc.acumulado });
      });
      const total = S.sum(rows.map(r => Math.max(0, r.saldo)));
      return { rows, missing, total };
    } catch (e) { return null; }
  }
  function payTodayAnswerHtml() {
    const info = payTodayInfo();
    if (!info) return '';
    const fmt = (G.ui && G.ui.fmtMoney) ? G.ui.fmtMoney : (v => '$' + v);
    if (info.missing.length) {
      const emps = S.data.employees || [];
      const cards = info.missing.map(nombre => {
        const e = emps.find(x => S.employeeName(x) === nombre);
        return tarifaWidgetHtml(e);
      }).join('');
      return 'Para calcular cuánto pagar hoy me falta la tarifa de:<br>' + cards +
        '<div class="muted small">Ingresá la tarifa, tocá <b>Guardar</b> y te doy el total automáticamente.</div>';
    }
    if (!info.rows.length) {
      return 'Hoy no hay jornadas registradas, así que no tenés nada pendiente por pagar.';
    }
    const rows = info.rows.map(r =>
      '• <b>' + esc(r.nombre) + '</b>: ' + r.horas + ' h hoy × ' + fmt(r.tarifa) +
      (r.saldo >= 0
        ? ' → saldo neto a pagar <b>' + fmt(r.saldo) + '</b>'
        : ' → a favor <b>' + fmt(-r.saldo) + '</b>'));
    return '💰 <b>A pagar hoy</b><br>' + rows.join('<br>') + '<br>' +
      '📊 <b>Total neto a pagar hoy: ' + fmt(info.total) + '</b>';
  }
  function handlePayTodayAnswer(pend) {
    const html = payTodayAnswerHtml();
    if (!html) { busy = false; return; }
    pend.innerHTML = html;
    const info = payTodayInfo();
    if (info && info.missing.length) {
      /* Intención original guardada: al completarse la tarifa faltante,
         el asistente recalcula y responde solo (sin volver a preguntar). */
      pendingGoal = 'pagar-hoy';
      rememberTurn('usuario', 'cuánto debo pagar hoy');
      rememberTurn('asistente', 'falta tarifa de: ' + info.missing.join(', '));
    } else {
      rememberTurn('usuario', 'cuánto debo pagar hoy');
      rememberTurn('asistente', 'a pagar hoy: ' + (info ? info.total : ''));
    }
    busy = false;
    scrollToEnd();
  }

  /* ---------- Tarifa de empleado: "Tarifa de Lucho = $6000" ---------- */
  function tarifaIntent(text) {
    /* lowercase SIN flatText: flatText elimina dígitos y símbolos, y acá
       necesitamos conservar el monto ($6000, 6.000, 6000,50). */
    const t = String(text || '').toLowerCase().replace(/[¿?¡!]/g, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    let m = t.match(/(?:la\s+)?tarifa\s+(?:de|del)?\s*([a-z\s]{2,24}?)\s*(?:es|=|:)?\s*\$?\s*([\d][\d.,]*)/);
    if (!m) m = t.match(/sueldo\s+(?:de|del)?\s*([a-z\s]{2,24}?)\s*(?:es|=|:)?\s*\$?\s*([\d][\d.,]*)/);
    if (!m) return null;
    const nombre = m[1].trim();
    const monto = extractNumber(m[2]);
    if (!nombre || !(monto > 0)) return null;
    return { nombre, monto };
  }
  async function handleTarifaAnswer(parsed, pend) {
    const S = G.store;
    const emps = S.data.employees || [];
    const nombre = flatText(parsed.nombre);
    const emp = emps.find(e => {
      const full = flatText(((e.firstName || '') + ' ' + (e.lastName || '')).trim());
      return full === nombre || full.includes(nombre) || (full && nombre.includes(full.split(' ')[0]));
    });
    if (!emp) {
      pend.innerHTML = 'No encontré a un empleado llamado "<b>' + esc(parsed.nombre) + '</b>". Cargalo primero desde Recursos Humanos → Empleados.';
      busy = false;
      scrollToEnd();
      return;
    }
    S.update('employees', emp.id, { hourlyRate: parsed.monto });
    S.save();
    try { if (G.sync && G.sync.push) await G.sync.push(S.data); } catch (e) {}
    try { if (G.router && G.router.refresh) G.router.refresh(); } catch (e) {}
    const fmt = (G.ui && G.ui.fmtMoney) ? G.ui.fmtMoney : (v => '$' + v);
    pend.innerHTML = '✔ <b>Tarifa de ' + esc(S.employeeName(emp)) + ' actualizada a ' + fmt(parsed.monto) + ' por hora</b>';
    rememberTurn('usuario', 'tarifa de ' + parsed.nombre + ' = ' + parsed.monto);
    rememberTurn('asistente', 'tarifa de ' + S.employeeName(emp) + ' = ' + parsed.monto);
    busy = false;
    scrollToEnd();
    /* Retomar automáticamente la consulta pendiente (sin nueva pregunta) */
    resumePendingGoal();
  }
  function resumePendingGoal() {
    const g = pendingGoal;
    pendingGoal = null;
    if (g === 'pagar-hoy') {
      try {
        const html = payTodayAnswerHtml();
        if (html) { appendLog(bubble(html, 'bot')); scrollToEnd(); }
      } catch (e) {}
    }
  }

  /* ---------- Enviar por WhatsApp (botón clickeable, pestaña nueva) ---------- */
  function waLink(phone, text) {
    const digits = String(phone || '').replace(/\D/g, '');
    if (!digits) return '';
    const num = digits.startsWith('54') ? digits : '54' + digits;
    return 'https://wa.me/' + num + '?text=' + encodeURIComponent(String(text || ''));
  }
  function waIntent(text) {
    const t = flatText(text);
    if (!/whatsapp|wa\.me|mandar (por )?whatsapp|enviar (por )?whatsapp|compartir (por )?whatsapp|mandale por whatsapp|enviale por whatsapp/.test(t)) return null;
    const emp = findEmployeeMention(text);
    if (emp) return emp;
    /* Contacto (cliente/socio) mencionado */
    try {
      const cs = ((G.store && G.store.data) || {}).contacts || [];
      const hit = cs.find(c => c.name && t.includes(flatText(c.name)));
      return hit ? hit.name : null;
    } catch (e) { return null; }
  }
  /* Resumen en texto plano para el mensaje de WhatsApp */
  function waSummaryForEmp(empId) {
    const S = G.store;
    const e = S.employeeById(empId);
    if (!e) return null;
    const st = S.employeeStats(empId);
    const acc = S.employeeAccumulated(empId);
    const fmt = v => (G.ui && G.ui.fmtMoney) ? G.ui.fmtMoney(v) : '$' + v;
    return 'Hola ' + S.employeeName(e) + '! Te comparto tu resumen de GADU: ' +
      st.daysWorked + ' día(s) · ' + st.hoursTotal + ' hs trabajadas. ' +
      'Devengado ' + fmt(acc.devengado) + ' − Adelantos ' + fmt(acc.adelantos) + ' = Saldo a cobrar ' + fmt(acc.acumulado) + '.';
  }
  function handleWaAnswer(nombre, pend) {
    const S = G.store;
    let phone = '', display = '', resumen = '';
    const emp = (S.data.employees || []).find(e => flatText(S.employeeName(e)) === flatText(nombre) ||
      flatText(S.employeeName(e)).includes(flatText(nombre)));
    if (emp) {
      phone = emp.phone || '';
      display = S.employeeName(emp);
      resumen = waSummaryForEmp(emp.id) || '';
    } else {
      const c = (S.data.contacts || []).find(x => flatText(x.name || '') === flatText(nombre));
      if (c) {
        phone = c.phone || c.whatsapp || '';
        display = c.name;
        const works = (S.data.works || []).filter(w => w.clientId === c.id && w.status !== 'finalizada');
        const fmt = v => (G.ui && G.ui.fmtMoney) ? G.ui.fmtMoney(v) : '$' + v;
        const rows = works.map(w => {
          const cobrado = S.sum((S.data.incomes || []).filter(i => i.workId === w.id).map(i => i.amount));
          return workLabel(w) + ': presupuesto ' + fmt(Number(w.budgetTotal) || 0) + ' − cobrado ' + fmt(cobrado) + ' = pendiente ' + fmt(Math.max(0, (Number(w.budgetTotal) || 0) - cobrado));
        });
        resumen = rows.length ? ('Hola ' + c.name + '! Estado de tus obras:\n' + rows.join('\n')) : ('Hola ' + c.name + '! No hay obras activas para resumir.');
      }
    }
    if (!display) {
      pend.innerHTML = 'No encontré a "<b>' + esc(nombre) + '</b>" para armar el mensaje.';
      busy = false; scrollToEnd(); return;
    }
    if (!phone) {
      pend.innerHTML = '💬 <b>' + esc(display) + '</b> no tiene teléfono cargado. Cargalo en su ficha y te armo el enlace de WhatsApp.';
      busy = false; scrollToEnd(); return;
    }
    const href = waLink(phone, resumen);
    pend.innerHTML = '💬 Te preparé el mensaje para <b>' + esc(display) + '</b>:<br>' +
      '<div class="ai-widget">' + esc(resumen).replace(/\n/g, '<br>') + '</div>' +
      '<a class="btn btn-soft-success btn-sm" href="' + href + '" target="_blank" rel="noopener" style="margin-top:8px">💬 Abrir en WhatsApp</a>';
    rememberTurn('usuario', 'whatsapp a ' + nombre);
    rememberTurn('asistente', 'enlace de WhatsApp para ' + display);
    busy = false;
    scrollToEnd();
  }

  /* ---------- Widgets interactivos dentro del chat ---------- */
  /* Tarjeta de tarifa: input numérico + botón Guardar (guarda en el legajo
     y retoma el flujo pendiente). */
  function tarifaWidgetHtml(emp) {
    if (!emp || !emp.id) return '';
    return '<div class="ai-widget" data-widget="tarifa" data-emp="' + emp.id + '">' +
      '<div class="ai-widget-head">💰 Tarifa por hora de <b>' + esc(G.store.employeeName(emp)) + '</b></div>' +
      '<div class="ai-widget-row">' +
      '<input class="input ai-widget-input" type="number" inputmode="decimal" step="any" min="0" placeholder="Ej: 6000">' +
      '<button class="btn btn-primary btn-sm" data-widget-ok="1">Guardar</button>' +
      '</div>' +
      '<div class="muted small ai-widget-hint">Se guarda en su legajo y retomo la cuenta sola.</div>' +
      '</div>';
  }
  /* Widget numérico genérico: al confirmar, envía el valor como respuesta
     del usuario (sirve para horas, porcentajes, etc.). */
  function numWidgetHtml(opts) {
    opts = opts || {};
    return '<div class="ai-widget" data-widget="send"' + (opts.empId ? ' data-emp="' + opts.empId + '"' : '') + '>' +
      '<div class="ai-widget-head">' + (opts.title || '') + '</div>' +
      '<div class="ai-widget-row">' +
      '<input class="input ai-widget-input" type="number" inputmode="decimal" step="any" min="0" placeholder="' + (opts.ph || 'Valor') + '">' +
      '<button class="btn btn-primary btn-sm" data-widget-ok="1">' + (opts.okLabel || 'Confirmar') + '</button>' +
      '</div>' +
      '</div>';
  }
  /* Guarda la tarifa en el legajo (misma capa de datos que Empleados) */
  async function applyTarifaValue(empId, value) {
    const S = G.store;
    const emp = S.employeeById(empId);
    if (!emp || !(Number(value) > 0)) return { ok: false };
    S.update('employees', empId, { hourlyRate: Number(value) });
    S.save();
    try { if (G.sync && G.sync.push) await G.sync.push(S.data); } catch (e) {}
    try { if (G.router && G.router.refresh) G.router.refresh(); } catch (e) {}
    return { ok: true, nombre: S.employeeName(emp), monto: Number(value) };
  }

  /* ============================================================
     FORMULARIOS DINÁMICOS dentro del chat
     Cualquier acción operativa (empleado, gasto, ingreso, adelanto)
     se completa íntegramente con inputs y selectores, sin salir
     del chat. Guardan en la MISMA capa de datos (G.store).
     ============================================================ */
  const FORM_DEFS = {
    empleado: {
      title: '👤 Nuevo empleado',
      fields() {
        return [
          { key: 'nombre', label: 'Nombre y apellido', type: 'text', ph: 'Ej: Lucho García', required: true },
          { key: 'tarifa', label: 'Tarifa por hora ($)', type: 'money', ph: 'Ej: 6000' },
          { key: 'telefono', label: 'Teléfono', type: 'text', ph: 'Ej: 3511234567' },
        ];
      },
      async exec(vals) {
        const full = String(vals.nombre || '').trim();
        if (!full) return { ok: false, err: 'Falta el nombre del empleado' };
        const parts = full.split(/\s+/);
        const firstName = parts.shift() || '';
        const lastName = parts.join(' ');
        const emp = G.store.add('employees', {
          firstName, lastName, phone: String(vals.telefono || '').trim(),
          paymentData: '', hourlyRate: extractNumber(vals.tarifa) || 0,
          active: true, notes: '', photo: null, createdAt: G.store.todayISO(),
        });
        await pushCloud();
        return { ok: true, label: 'empleado ' + full, coll: 'employees', id: emp.id };
      },
    },
    ingreso: {
      title: '💰 Nuevo ingreso',
      fields() {
        const obras = (G.store.data.works || []).filter(w => w.status !== 'finalizada');
        return [
          { key: 'obra', label: 'Obra', type: 'select', options: [{ v: '', l: '— General —' }].concat(obras.map(w => ({ v: w.id, l: workLabel(w) }))) },
          { key: 'concepto', label: 'Concepto', type: 'select', options: ['Cobro', 'Adelanto', 'Certificación'].map(c => ({ v: c, l: c })) },
          { key: 'monto', label: 'Monto ($)', type: 'money', ph: 'Ej: 150000', required: true },
          { key: 'metodo', label: 'Método', type: 'select', options: (G.store.METODOS || ['Efectivo']).map(m => ({ v: m, l: m })) },
        ];
      },
      async exec(vals) {
        const monto = extractNumber(vals.monto);
        if (!(monto > 0)) return { ok: false, err: 'Falta el monto' };
        const concepto = vals.concepto || 'Cobro';
        const kind = concepto === 'Adelanto' ? 'adelanto' : concepto === 'Certificación' ? 'certificacion' : 'cobro';
        const inc = G.store.add('incomes', {
          workId: vals.obra || null, date: G.store.todayISO(), amount: monto,
          concept: concepto, incomeKind: kind, method: vals.metodo || 'Efectivo',
          description: '', invoiceNumber: '',
        });
        await pushCloud();
        return { ok: true, label: 'ingreso de ' + concepto + ' por ' + fmtM(monto), coll: 'incomes', id: inc.id };
      },
    },
    gasto: {
      title: '💸 Nuevo gasto',
      fields() {
        const obras = (G.store.data.works || []).filter(w => w.status !== 'finalizada');
        const cats = [].concat(G.store.CATS_OBRA || []).concat(G.store.CATS_GENERAL || []);
        return [
          { key: 'tipo', label: 'Tipo de gasto', type: 'select', options: [{ v: 'obra', l: 'Gasto de obra' }, { v: 'general', l: 'Gasto general' }] },
          { key: 'obra', label: 'Obra', type: 'select', options: [{ v: '', l: '— Sin obra —' }].concat(obras.map(w => ({ v: w.id, l: workLabel(w) }))), when: 'tipo=obra' },
          { key: 'categoria', label: 'Categoría', type: 'select', options: [...new Set(cats)].map(c => ({ v: c, l: c })) },
          { key: 'monto', label: 'Monto ($)', type: 'money', ph: 'Ej: 45000', required: true },
          { key: 'descripcion', label: 'Descripción', type: 'text', ph: 'Ej: Materiales' },
        ];
      },
      async exec(vals) {
        const monto = extractNumber(vals.monto);
        if (!(monto > 0)) return { ok: false, err: 'Falta el monto' };
        const tipo = vals.tipo === 'general' ? 'general' : 'obra';
        const g = G.store.add('expenses', {
          type: tipo, workId: tipo === 'obra' ? (vals.obra || null) : null,
          date: G.store.todayISO(), amount: monto,
          category: vals.categoria || 'Otros', providerId: null, employeeId: null,
          expenseKind: '', description: String(vals.descripcion || '').trim() || (vals.categoria || 'Gasto'),
          invoiceNumber: '', paymentMethod: 'Efectivo',
        });
        await pushCloud();
        return { ok: true, label: 'gasto de ' + (g.description || '') + ' por ' + fmtM(monto), coll: 'expenses', id: g.id };
      },
    },
    adelanto: {
      title: '⚡ Adelanto a empleado',
      fields() {
        const emps = (G.store.data.employees || []).slice().sort((a, b) => G.store.employeeName(a).localeCompare(G.store.employeeName(b)));
        return [
          { key: 'empleado', label: 'Empleado', type: 'select', options: emps.map(e => ({ v: e.id, l: G.store.employeeName(e) })), required: true },
          { key: 'monto', label: 'Monto ($)', type: 'money', ph: 'Ej: 10000', required: true },
        ];
      },
      async exec(vals) {
        const monto = extractNumber(vals.monto);
        const emp = vals.empleado ? G.store.employeeById(vals.empleado) : null;
        if (!emp) return { ok: false, err: 'Elegí el empleado' };
        if (!(monto > 0)) return { ok: false, err: 'Falta el monto' };
        const g = G.store.add('expenses', {
          type: 'general', workId: null, date: G.store.todayISO(), amount: monto,
          category: 'Sueldos', providerId: null, employeeId: emp.id,
          expenseKind: 'adelanto', description: 'Adelanto a ' + G.store.employeeName(emp),
          invoiceNumber: '', paymentMethod: 'Efectivo',
        });
        await pushCloud();
        return { ok: true, label: 'adelanto a ' + G.store.employeeName(emp) + ' por ' + fmtM(monto), coll: 'expenses', id: g.id };
      },
    },
  };
  async function pushCloud() {
    try { if (G.sync && G.sync.push) await G.sync.push(G.store.data); } catch (e) {}
    try { if (G.router && G.router.refresh) G.router.refresh(); } catch (e) {}
  }
  const fmtM = v => (G.ui && G.ui.fmtMoney) ? G.ui.fmtMoney(v) : '$' + v;
  /* Campos del formulario (puro, testeable) */
  function formFields(action) {
    const def = FORM_DEFS[action];
    return def ? def.fields() : [];
  }
  /* HTML del formulario dinámico (puro, testeable) */
  function formWidgetHtml(action) {
    const def = FORM_DEFS[action];
    if (!def) return '';
    const fields = def.fields();
    return '<div class="ai-widget ai-form" data-form="' + esc(action) + '">' +
      '<div class="ai-widget-head">' + def.title + '</div>' +
      fields.map(f => {
        const when = f.when ? ' data-when="' + f.when + '"' : '';
        if (f.type === 'select') {
          return '<label class="ai-field"' + when + '><span class="ai-field-label">' + esc(f.label) + '</span>' +
            '<select class="select ai-widget-input" data-key="' + esc(f.key) + '">' +
            (f.options || []).map(o => '<option value="' + esc(o.v) + '">' + esc(o.l) + '</option>').join('') +
            '</select></label>';
        }
        return '<label class="ai-field"' + when + '><span class="ai-field-label">' + esc(f.label) + '</span>' +
          '<input class="input ai-widget-input" data-key="' + esc(f.key) + '" type="' + (f.type === 'money' || f.type === 'number' ? 'number' : 'text') + '"' +
          (f.type === 'money' || f.type === 'number' ? ' inputmode="decimal" step="any" min="0"' : '') +
          ' placeholder="' + esc(f.ph || '') + '"></label>';
      }).join('') +
      '<div class="ai-widget-row"><div class="spacer"></div>' +
      '<button class="btn btn-primary btn-sm" data-form-ok="1">Confirmar</button></div>' +
      '</div>';
  }
  /* Abre el formulario en un mensaje del chat (reemplaza el contenido) */
  function openFormWidget(action, hostEl) {
    const html = formWidgetHtml(action);
    if (!html || !hostEl) return;
    hostEl.innerHTML = html;
    const form = hostEl.querySelector('.ai-form');
    if (!form) return;
    /* Condicionales por selector: ej. mostrar "Obra" solo si tipo=obra */
    form.querySelectorAll('[data-when]').forEach(row => {
      const cond = row.dataset.when.split('=');
      const sel = form.querySelector('[data-key="' + cond[0] + '"]');
      const apply = () => { row.hidden = sel && sel.value !== cond[1]; };
      if (sel) { sel.addEventListener('change', apply); }
      apply();
    });
    scrollToEnd();
  }
  /* Ejecuta el formulario: guarda en la base y devuelve {ok, coll, id, label} */
  async function submitFormValues(action, vals) {
    const def = FORM_DEFS[action];
    if (!def) return { ok: false, err: 'Acción desconocida' };
    try {
      const res = await def.exec(vals || {});
      if (res && res.ok) lastSaved = { coll: res.coll, id: res.id, label: res.label };
      return res;
    } catch (e) { return { ok: false, err: String((e && e.message) || e) }; }
  }
  /* Confirmar desde el DOM: recolecta valores, guarda y muestra éxito */
  async function submitFormWidget(formEl) {
    const action = formEl.dataset.form;
    const vals = {};
    formEl.querySelectorAll('[data-key]').forEach(el => { vals[el.dataset.key] = (el.value || '').trim(); });
    const pend = formEl.closest('.ai-msg');
    if (pend) pend.innerHTML = '<span class="muted small">⏳ Guardando…</span>';
    const res = await submitFormValues(action, vals);
    if (pend) {
      if (res && res.ok) pend.innerHTML = summaryCardHtml(res);
      else pend.innerHTML = '⚠️ ' + esc((res && res.err) || 'No pude guardar: revisá los datos.');
    }
    resumePendingGoal();
    scrollToEnd();
  }

  /* Búsqueda inteligente: "buscame a X" / "¿dónde está X?" → consulta el store */
  function searchIntent(text) {
    const t = String(text || '').toLowerCase();
    const m = t.match(/(?:buscame|buscame a|búscame|busca|buscar|dónde está|donde esta|dónde anda|donde anda|dónde quedó|donde quedo|qu[eé] pas[oó] con|qui[eé]n tiene|encontr[aá]me)\s+(.+)/i);
    if (!m) return null;
    const q = m[1].trim().replace(/[?.!¡¿]+$/g, '').replace(/^(la|el|a|un|una|los|las|mi|mis|nuestra|nuestro)\s+/i, '').toLowerCase();
    if (q.length < 2 || q.split(/\s+/).length > 8) return null;
    return q;
  }

  /* Busca en empleados, herramientas, contactos y obras del store */
  function searchStore(q) {
    const d = (G.store && G.store.data) || {};
    const out = [];
    const norm = s => String(s || '').toLowerCase();
    const has = s => norm(s).includes(q);
    (d.employees || []).forEach(e => {
      const full = ((e.firstName || '') + ' ' + (e.lastName || '')).trim();
      if (has(full) || has(e.notes)) {
        out.push({ tipo: 'Empleado', nombre: full, detail: (e.hourlyRate ? '$' + e.hourlyRate + '/hora · ' : '') + (e.active ? 'activo' : 'inactivo') + (e.notes ? ' · ' + e.notes : ''), key: 'empleados' });
      }
    });
    (d.assets || []).forEach(a => {
      if (has(a.name) || has(a.notes)) {
        /* Ubicación y estado actuales, en lenguaje claro */
        const loc = a.location ? d.works.find(w => w.id === a.location) : null;
        const estado = a.status === 'dado de baja' ? 'Dado de baja'
          : a.status === 'en reparación' ? 'En mantenimiento'
          : a.location ? 'Activa en uso' : 'En depósito';
        const donde = loc ? 'en ' + ((loc.code || '') + ' ' + loc.name).trim() : 'guardada en depósito';
        out.push({ tipo: 'Herramienta', nombre: a.name, detail: estado + ' · ' + donde + (a.notes ? ' · ' + a.notes : ''), key: 'herramientas' });
      }
    });
    (d.contacts || []).forEach(c => {
      if (has(c.name)) {
        out.push({ tipo: c.type === 'socio' ? 'Socio' : 'Cliente', nombre: c.name, detail: (c.phone ? c.phone + ' · ' : '') + (c.address || ''), key: c.type === 'socio' ? 'socios' : 'clientes' });
      }
    });
    (d.works || []).forEach(w => {
      const lbl = workLabel(w);
      if (has(lbl)) {
        out.push({ tipo: 'Obra', nombre: lbl, detail: (w.status || '') + (w.location ? ' · ' + w.location : '') + (w.budgetTotal ? ' · presupuesto $' + w.budgetTotal : ''), key: 'obras' });
      }
    });
    /* Cobertura completa: ingresos, gastos, presupuestos y seguros */
    (d.incomes || []).forEach(i => {
      if (has(i.concept) || has(i.notes) || has(i.method)) {
        out.push({ tipo: 'Ingreso', nombre: i.concept || 'Ingreso', detail: '$' + (i.amount || 0) + (i.date ? ' · ' + i.date : '') + (i.method ? ' · ' + i.method : ''), key: 'ingresos' });
      }
    });
    (d.expenses || []).forEach(x => {
      if (has(x.description) || has(x.category) || has(x.paymentMethod)) {
        out.push({ tipo: 'Gasto', nombre: x.description || x.category || 'Gasto', detail: (x.category ? x.category + ' · ' : '') + '$' + (x.amount || 0) + (x.date ? ' · ' + x.date : ''), key: 'gastos' });
      }
    });
    (d.budgets || []).forEach(b => {
      if (has(b.name) || has(b.notes)) {
        out.push({ tipo: 'Presupuesto', nombre: b.name, detail: (b.status || '') + (b.total ? ' · $' + b.total : ''), key: 'presupuestos' });
      }
    });
    (d.seguros || []).forEach(s => {
      const full = ((s.tipo || '') + ' ' + (s.compania || '')).trim();
      if (has(full) || has(s.tipo)) {
        out.push({ tipo: 'Seguro', nombre: full || s.tipo, detail: (s.estado || '') + (s.fechaVencimiento ? ' · vence ' + s.fechaVencimiento : ''), key: 'seguros' });
      }
    });
    return out;
  }

  /* Renderiza los resultados de la búsqueda + botones de acceso directo */
  function handleSearchResults(q, results, pend) {
    rememberTurn('usuario', 'buscar ' + q);
    let html = '🔍 Encontré <b>' + results.length + '</b> resultado' + (results.length > 1 ? 's' : '') + ' para "' + esc(q) + '":';
    results.slice(0, 5).forEach(r => {
      html += '<br>• <b>' + esc(r.nombre) + '</b> <span class="muted">(' + r.tipo + ')</span>' +
        (r.detail ? '<br><span class="muted small">' + esc(r.detail) + '</span>' : '');
    });
    pend.innerHTML = html;
    rememberTurn('asistente', 'encontré ' + results[0].nombre);
    const wrap = document.createElement('div');
    wrap.className = 'ai-actions';
    [...new Set(results.map(r => r.key))].forEach(k => {
      const b = document.createElement('button');
      b.className = 'btn btn-soft btn-sm';
      b.textContent = 'Ver ' + (k === 'herramientas' ? 'Herramientas' : k.charAt(0).toUpperCase() + k.slice(1));
      b.addEventListener('click', () => { const fn = ACTION_KEYS[k]; if (fn) { fn(); setOpen(false); } });
      wrap.appendChild(b);
    });
    pend.appendChild(wrap);
    busy = false;
    scrollToEnd();
  }

  /* ---------- COO Virtual (Super Admin): comandos conversacionales ---------- */
  function esSuperAdmin() {
    try { return !!(G.plan && G.plan.isAdmin && G.plan.isAdmin()); } catch (e) { return false; }
  }
  function normPlan(p) {
    const v = String(p || '').toLowerCase();
    if (/free/.test(v)) return 'free';
    if (/pro/.test(v)) return 'pro';
    if (/pyme/.test(v)) return 'pyme';
    if (/empresa|enterprise/.test(v)) return 'empresa';
    return v;
  }
  function planName(id) {
    const p = ((G.plan && G.plan.planes) || []).find(x => x.id === id);
    return p ? p.nombre : (id || 'Free');
  }

  /* Parser puro de comandos del COO (métricas, auditoría, plan, trial, estado, alta) */
  function adminIntent(text) {
    const t = String(text || '').toLowerCase();
    if (!t) return null;
    if (/(m[eé]tricas|mrr|arr|churn|cu[aá]nto factur|ingresos del saas|empresas activas|usuarios en prueba)/.test(t)) return { tipo: 'metricas' };
    if (/(auditor[ií]a|errores recientes|registro de actividad|[uú]ltimos eventos)/.test(t)) return { tipo: 'auditoria' };
    if (/(por vencer|pr[oó]ximas? a vencer|trials? que vencen|pruebas que vencen|licencias? por vencer|cuentas? por vencer)/.test(t)) return { tipo: 'vencer' };
    if (/\b(registr[aá]|crear|nueva|alta de|invit[aá]|agreg[aá]|nuevo)[^.!?]*(usuario|empresa|cuenta|invitaci|cliente saas)/.test(t)) return { tipo: 'alta' };
    const planM = t.match(/(?:cambi[aá]|cambiale|pon[eé]|pas[aá]|sub[ií]|baj[aá])(?:me|le)?\s+(?:el plan de|plan de|plan|a)?\s*(.+?)\s+a\s+(free|pro|pyme|empresa|enterprise)\b/i);
    if (planM) return { tipo: 'plan', target: planM[1].trim(), plan: normPlan(planM[2]) };
    const trialM = t.match(/\b(?:dale|d[aá]le|extend[eé]|sum[aá]|agreg[aá]|prorrog[aá])\s+(\d+)\s+d[ií]as(?:\s+m[aá]s)?\s*(?:a|para)?\s*(.+)/i);
    if (trialM) return { tipo: 'trial', dias: Number(trialM[1]), target: trialM[2].trim() };
    const estM = t.match(/\b(suspend[eé]|reactiv[aá]|activ[aá])\s+(?:a\s+)?(?:la cuenta de\s+)?(?:la empresa de\s+)?(.+)/i);
    if (estM) return { tipo: 'estado', estado: /suspend/.test(estM[1]) ? 'suspendido' : 'activo', target: estM[2].trim() };
    return null;
  }

  /* Busca la cuenta por nombre de empresa o email (parcial) */
  async function findAdminUser(target) {
    const q = String(target || '').toLowerCase().trim();
    const rows = await G.api('GET', '/profiles?select=*&order=created_at.asc');
    return (rows || []).find(u =>
      String(u.email || '').toLowerCase().includes(q) ||
      String(u.empresa_constructora || u.empresa || '').toLowerCase().includes(q)
    ) || null;
  }

  function addAdminButtons(pend, pairs) {
    const wrap = document.createElement('div');
    wrap.className = 'ai-actions';
    pairs.forEach(([k, label]) => {
      const b = document.createElement('button');
      b.className = 'btn btn-soft btn-sm';
      b.textContent = label;
      b.addEventListener('click', () => { const fn = ACTION_KEYS[k]; if (fn) { fn(); setOpen(false); } });
      wrap.appendChild(b);
    });
    pend.appendChild(wrap);
  }

  /* Confirmación inline de cambios de cuenta (plan / trial / estado) */
  function askAdminConfirm(uid, patch, label) {
    pendingAdmin = { uid, patch, label };
    const pend = wizardBubble('¿Confirmás? <b>' + label + '</b>');
    const wrap = document.createElement('div');
    wrap.className = 'ai-actions';
    const okB = document.createElement('button');
    okB.className = 'btn btn-soft btn-sm'; okB.textContent = '✔ Confirmar'; okB.dataset.adm = 'confirm';
    wrap.appendChild(okB);
    const noB = document.createElement('button');
    noB.className = 'btn btn-soft btn-sm'; noB.textContent = 'Cancelar'; noB.dataset.adm = 'cancel';
    wrap.appendChild(noB);
    pend.appendChild(wrap);
  }
  async function confirmAdminAction() {
    const a = pendingAdmin;
    pendingAdmin = null;
    if (!a) return;
    try {
      await G.api('PATCH', '/profiles?user_id=eq.' + encodeURIComponent(a.uid), a.patch);
      try { if (G.plan && G.plan.log) G.plan.log('coo_' + a.label, a.uid); } catch (e) {}
      wizardBubble(successCard(a.label));
      if (G.ui && G.ui.toast) G.ui.toast('Guardado: ' + a.label, 'success');
    } catch (e) {
      wizardBubble('⚠️ No pude aplicar el cambio: ' + esc(String((e && e.message) || e)));
    }
  }
  function cancelAdminAction() {
    pendingAdmin = null;
    wizardBubble('✋ Operación cancelada.');
  }

  /* Alta express de usuarios (wizard del COO) */
  const ADMIN_WIZARD_STEPS = [
    { key: 'email', ask: '¿Cuál es el email de Google del nuevo usuario? (ej. usuario@gmail.com)' },
    { key: 'empresa', ask: '¿Cuál es el nombre de fantasía de la empresa?' },
    { key: 'plan', ask: '¿Qué plan le asignamos?', plansList: true },
    { key: 'periodo', ask: '¿Cuántos días de prueba le damos? (ej. 30)' },
  ];
  function startAdminWizard() {
    adminWizard = { idx: 0, campos: {} };
    adminWizardAsk();
  }
  function adminWizardAsk() {
    const s = ADMIN_WIZARD_STEPS[adminWizard.idx];
    if (!s) { finishAdminWizard(); return; }
    let buttons = [];
    if (s.plansList) buttons = ((G.plan && G.plan.planes) || []).map(p => p.nombre);
    const pend = wizardBubble('🤖 ' + s.ask);
    const wrap = document.createElement('div');
    wrap.className = 'ai-actions';
    buttons.forEach(lb => {
      const b = document.createElement('button');
      b.className = 'btn btn-soft btn-sm'; b.textContent = lb;
      b.dataset.adm = 'wiz'; b.dataset.arg = lb;
      wrap.appendChild(b);
    });
    const cx = document.createElement('button');
    cx.className = 'btn btn-soft btn-sm'; cx.textContent = 'Cancelar'; cx.dataset.adm = 'cancelwiz';
    wrap.appendChild(cx);
    pend.appendChild(wrap);
  }
  function adminWizardAdvance(val) {
    if (!adminWizard) return;
    const s = ADMIN_WIZARD_STEPS[adminWizard.idx];
    if (!s) { finishAdminWizard(); return; }
    const v = String(val || '').trim();
    if (!v) { wizardBubble('🤖 Necesito ese dato para continuar. ' + s.ask); return; }
    adminWizard.campos[s.key] = v;
    adminWizard.idx++;
    adminWizardAsk();
  }
  async function finishAdminWizard() {
    const c = adminWizard.campos;
    adminWizard = null;
    try {
      const plan = ((G.plan && G.plan.planes) || []).find(p => p.nombre === c.plan);
      await G.api('POST', '/invitaciones', {
        email: String(c.email || '').toLowerCase(),
        rol: 'gestor_obra',
        plan_id: plan ? plan.id : 'free',
        empresa: c.empresa || '',
        estado: 'pendiente',
      });
      try { if (G.plan && G.plan.log) G.plan.log('coo_invitacion', c.email + ' · ' + (plan ? plan.nombre : 'Free') + ' · prueba ' + c.periodo + 'd'); } catch (e) {}
      wizardBubble(successCard('invitación para ' + c.email + ' (' + (plan ? plan.nombre : 'Free') + ', prueba ' + (c.periodo || '—') + ' días)'));
      if (G.ui && G.ui.toast) G.ui.toast('Invitación creada: ' + c.email, 'success');
    } catch (e) {
      wizardBubble('⚠️ No pude crear la invitación: ' + esc(String((e && e.message) || e)));
    }
  }

  /* Ejecuta el comando del COO y renderiza tarjetas con botones en el chat */
  async function handleAdminIntent(adm, pend) {
    try {
      if (adm.tipo === 'metricas') {
        const m = await G.api('POST', '/rpc/metricas');
        const pp = (m && m.por_plan && typeof m.por_plan === 'object') ? m.por_plan : {};
        pend.innerHTML = '📊 <b>Métricas del SaaS</b><br>'
          + '• <b>MRR</b> $' + (m.mrr || 0) + ' · <b>ARR</b> $' + (m.arr || 0) + '<br>'
          + '• Usuarios: <b>' + (m.usuarios || 0) + '</b> (' + (m.activos || 0) + ' activos) · Obras: ' + (m.obras || 0) + '<br>'
          + '• Conversión a pago: ' + (m.conversion != null ? m.conversion : 0) + '%<br>'
          + '• Planes: Free ' + (pp.Free != null ? pp.Free : 0) + ' · Pro ' + (pp.Pro != null ? pp.Pro : 0) + ' · Pyme ' + (pp.Pyme != null ? pp.Pyme : 0) + ' · Empresa ' + (pp.Empresa != null ? pp.Empresa : 0);
        addAdminButtons(pend, [['admin-metrics', '📊 Ver Métricas'], ['admin-users', '👥 Ver Usuarios']]);
        return;
      }
      if (adm.tipo === 'auditoria') {
        const rows = await G.api('GET', '/auditoria?select=*&order=fecha.desc&limit=8');
        let h = '🧾 <b>Últimos eventos de auditoría</b>';
        if (!rows || !rows.length) h += '<br><span class="muted">Sin registros.</span>';
        else rows.slice(0, 8).forEach(a => {
          h += '<br>• <span class="muted small">' + esc(String(a.fecha || '').slice(0, 16)) + '</span> <b>' + esc(a.accion || '') + '</b>' + (a.detalle ? ' — ' + esc(a.detalle) : '');
        });
        pend.innerHTML = h;
        addAdminButtons(pend, [['admin-audit', '🧾 Ver Auditoría']]);
        return;
      }
      if (adm.tipo === 'vencer') {
        const rows = await G.api('GET', '/profiles?select=*&order=created_at.asc');
        const ahora = Date.now();
        const lista = (rows || [])
          .filter(u => u.subscription_status === 'trialing' && (u.trial_ends_at || u.trial_end))
          .map(u => ({ u, dias: Math.ceil((new Date(u.trial_ends_at || u.trial_end).getTime() - ahora) / 86400000) }))
          .filter(x => x.dias <= 7)
          .sort((a, b) => a.dias - b.dias);
        let h = '⏳ <b>Cuentas en prueba por vencer (≤7 días)</b>';
        if (!lista.length) h += '<br><span class="muted">Ninguna por vencer. Todo al día ✅</span>';
        else lista.slice(0, 8).forEach(x => {
          h += '<br>• <b>' + esc(x.u.empresa_constructora || x.u.empresa || x.u.email) + '</b> — quedan <b>' + x.dias + '</b> día' + (x.dias !== 1 ? 's' : '') + ' <span class="muted small">(' + esc(x.u.email || '') + ')</span>';
        });
        pend.innerHTML = h;
        addAdminButtons(pend, [['admin-users', '👥 Ver Usuarios']]);
        return;
      }
      if (adm.tipo === 'alta') { startAdminWizard(); return; }
      /* plan / trial / estado: buscar la cuenta y pedir confirmación inline */
      const u = await findAdminUser(adm.target);
      if (!u) {
        pend.innerHTML = '🔍 No encontré ninguna cuenta con "' + esc(adm.target) + '". Probá con el nombre de la empresa o parte del email.';
        addAdminButtons(pend, [['admin-users', '👥 Ver Usuarios']]);
        return;
      }
      const nom = u.empresa_constructora || u.empresa || u.email;
      if (adm.tipo === 'plan') {
        askAdminConfirm(u.user_id, { plan_id: adm.plan }, 'cambio de plan de ' + nom + ' → ' + planName(adm.plan));
      } else if (adm.tipo === 'trial') {
        const nueva = new Date(Date.now() + adm.dias * 86400000).toISOString();
        askAdminConfirm(u.user_id, { trial_end: nueva, trial_ends_at: nueva }, 'prueba de ' + nom + ' extendida +' + adm.dias + ' días');
      } else if (adm.tipo === 'estado') {
        askAdminConfirm(u.user_id, { estado_cuenta: adm.estado }, (adm.estado === 'suspendido' ? 'suspensión de ' : 'activación de ') + nom);
      }
    } catch (e) {
      pend.innerHTML = '⚠️ No pude ejecutar esa acción: ' + esc(String((e && e.message) || e));
    }
  }

  /* ---------- Flujo guiado (wizard) 100% en el chat ---------- */
  function isCompleteWizard(modulo, campos) {
    const req = WIZARD_REQUIRED[modulo];
    if (!req) return true;   // módulo sin pasos guiados → flujo normal
    const c = campos || {};
    return req.every(k => c[k] !== undefined && c[k] !== null && String(c[k]).trim() !== '');
  }
  function isQuery(text) {
    return /^[¿¡]?\s*(cu[aá]nto|c[uó]mo|d[oó]nde|cu[aá]l|cu[aá]ndo|qu[eé]|puedo|pod[eé]s|podemos|se puede|mostrame|mostráme|ver|muestrame)/i.test(String(text || '').trim());
  }

  /* Scroll automático al final del chat: ninguna burbuja ni la caja de texto
     deben quedar ocultas por debajo (incluye scrollIntoView del último mensaje).
     SIN recursión: antes se llamaba a sí misma y saturaba el stack en móviles. */
  function scrollToEnd() {
    try {
      if (!log) return;
      log.scrollTop = log.scrollHeight;
      const last = log.lastElementChild || (log.children && log.children[log.children.length - 1]);
      if (last && last.scrollIntoView) last.scrollIntoView({ behavior: 'smooth', block: 'end' });
    } catch (e) {}
  }
  function wizardBubble(html) {
    const pend = bubble(html, 'bot');
    appendLog(pend);
    scrollToEnd();
    return pend;
  }
  /* Capa de rendimiento: el chat conserva como máximo MAX_LOG burbujas.
     Las más viejas se descartan para que el DOM nunca congele el celular. */
  const MAX_LOG = 60;
  function appendLog(el) {
    log.appendChild(el);
    while (log.children.length > MAX_LOG && log.firstChild) log.removeChild(log.firstChild);
  }

  /* ---------- Flujo "Crear agenda" → Rol → carga 100% manual ---------- */
  function addRoleButtons(pend) {
    const wrap = document.createElement('div');
    wrap.className = 'ai-actions';
    ['Empleado', 'Cliente', 'Socio'].forEach(rol => {
      const b = document.createElement('button');
      b.className = 'btn btn-soft btn-sm';
      b.textContent = rol;
      b.dataset.role = rol.toLowerCase();
      wrap.appendChild(b);
    });
    pend.appendChild(wrap);
  }
  function chooseRole(rol, pend) {
    const mod = rol === 'empleado' ? 'empleado' : rol === 'socio' ? 'socio' : 'cliente';
    contactStage = null;
    contactRole = null;
    /* SIN agenda nativa ni archivos: carga 100% conversacional */
    startWizard(mod, {});
  }
  function startContactFlow(pend) {
    /* Estado WAITING_CONTACT_TYPE: primero el ROL, después la carga manual */
    contactStage = 'rol';
    contactRole = null;
    pend.innerHTML = '¿Qué tipo de contacto querés crear?';
    addRoleButtons(pend);
    busy = false;
    scrollToEnd();
  }
  /* Empleados frecuentes primero (más actividad en los últimos 30 días) */
  function frequentEmployees(emps) {
    const d = (G.store && G.store.data) || {};
    const att = d.attendance || [];
    const hace30 = Date.now() - 30 * 86400000;
    const counts = {};
    att.forEach(a => {
      const t = new Date(a.date || '').getTime();
      if (!isNaN(t) && t >= hace30) counts[a.employeeId] = (counts[a.employeeId] || 0) + 1;
    });
    return emps.slice().sort((a, b) => (counts[b.id] || 0) - (counts[a.id] || 0));
  }
  /* Obra sugerida (Smart Default): foco de sesión o la de actividad más reciente.
     Tolera todas las variantes del nombre: jamás devuelve "undefined". */
  function suggestedWork() {
    const d = (G.store && G.store.data) || {};
    const activas = (d.works || []).filter(w => w.status === 'activa' && workLabel(w));
    if (!activas.length) return null;
    if (sessionFocus && sessionFocus.obra) {
      const hit = activas.find(w => flatText(workLabel(w)) === flatText(sessionFocus.obra));
      if (hit) return workLabel(hit);
    }
    if (activas.length === 1) return workLabel(activas[0]);
    const fechas = {};
    const touch = (workId, date) => { if (workId && date && (!fechas[workId] || date > fechas[workId])) fechas[workId] = date; };
    (d.attendance || []).forEach(a => touch(a.hours && a.hours[0] && a.hours[0].workId, a.date));
    (d.expenses || []).forEach(x => touch(x.workId, x.date));
    (d.incomes || []).forEach(x => touch(x.workId, x.date));
    let best = null, bestDate = '';
    activas.forEach(w => { if (fechas[w.id] && fechas[w.id] > bestDate) { bestDate = fechas[w.id]; best = workLabel(w); } });
    return best;
  }
  /* Etiquetas de los chips de obras: sugerida PRIMERA, todas con texto válido
     (nunca vacías → jamás botones transparentes ni "undefined") */
  function workChipLabels() {
    const obras = (((G.store && G.store.data) || {}).works || []).filter(w => w.status === 'activa' && workLabel(w));
    const labels = obras.map(w => workLabel(w)).filter(l => l);
    const sug = suggestedWork();
    return sug ? [sug].concat(labels.filter(l => l !== sug)) : labels;
  }
  function wizardAskStep() {
    const op = pendingOp;
    if (!op) return;
    const steps = WIZARD_STEPS[op.modulo] || [];
    const s = steps[op.idx];
    if (!s) { finishWizard(); return; }

    /* Botones dinámicos con entidades REALES del store (obras / empleados) */
    let buttons = s.buttons || [];
    let hint = '';
    if (s.worksList) {
      /* El 100% de las obras activas con nombre válido, sugerida primero */
      const labels = workChipLabels();
      if (!labels.length) {
        const pend = wizardBubble('⚠️ Todavía no tenés obras activas. Primero creá una obra: decime <b>"crear una obra"</b> y empezamos por ahí.');
        const wrap = document.createElement('div');
        wrap.className = 'ai-actions';
        const cx = document.createElement('button');
        cx.className = 'btn btn-soft btn-sm'; cx.textContent = 'Cancelar';
        cx.dataset.wiz = '__cancel__'; wrap.appendChild(cx);
        pend.appendChild(wrap);
        return;
      }
      /* Smart Default: la obra sugerida (foco reciente) va PRIMERA en 1 clic */
      const sug = suggestedWork();
      buttons = labels;
      if (sug) hint = '💡 Obra sugerida: <b>' + esc(sug) + '</b>';
    } else if (s.empsList) {
      const emps = (((G.store && G.store.data) || {}).employees || []).filter(e => e.active !== false);
      if (!emps.length) {
        const pend = wizardBubble('⚠️ Todavía no tenés empleados cargados. Primero creá uno: decime <b>"crear un empleado"</b> y empezamos por ahí.');
        const wrap = document.createElement('div');
        wrap.className = 'ai-actions';
        const cx = document.createElement('button');
        cx.className = 'btn btn-soft btn-sm'; cx.textContent = 'Cancelar';
        cx.dataset.wiz = '__cancel__'; wrap.appendChild(cx);
        pend.appendChild(wrap);
        return;
      }
      /* Empleados frecuentes PRIMERO: los 3-4 más recurrentes aparecen arriba.
         El hint "💡 Frecuentes" destaca cuáles son sin ensuciar el valor capturado. */
      const frec = frequentEmployees(emps);
      const nombre = e => ((e.firstName || '') + ' ' + (e.lastName || '')).trim();
      buttons = frec.map(e => nombre(e));
      if (frec.length) hint = '💡 Frecuentes: ' + frec.slice(0, 4).map(e => '<b>' + esc(nombre(e)) + '</b>').join(' · ');
    } else if (s.catsList) {
      /* Categorías REALES del store (obra + generales) + Herramientas/Equipamiento */
      const cats = ['Herramientas / Equipamiento']
        .concat((G.store && G.store.CATS_OBRA) || [])
        .concat((G.store && G.store.CATS_GENERAL) || []);
      buttons = [...new Set(cats)];
    } else if (s.assetsList) {
      /* Herramientas REALES del store (excluye las dadas de baja) */
      const assets = (((G.store && G.store.data) || {}).assets || []).filter(a => a.status !== 'dado de baja');
      if (!assets.length) {
        const pend = wizardBubble('⚠️ Todavía no tenés herramientas cargadas. Decime <b>"cargar una herramienta"</b> y empezamos por ahí.');
        const wrap = document.createElement('div');
        wrap.className = 'ai-actions';
        const cx = document.createElement('button');
        cx.className = 'btn btn-soft btn-sm'; cx.textContent = 'Cancelar';
        cx.dataset.wiz = '__cancel__'; wrap.appendChild(cx);
        pend.appendChild(wrap);
        return;
      }
      buttons = assets.map(x => x.name + (x.location ? ' · en obra' : ' · depósito'));
      /* Los botones llevan el sufijo como texto, pero el valor capturado es el nombre */
    } else if (s.assignList) {
      /* Destinos: depósito, mantenimiento y TODAS las obras activas con nombre */
      const obras = (((G.store && G.store.data) || {}).works || []).filter(w => w.status === 'activa' && workLabel(w));
      buttons = ['📦 En depósito', '🔧 En mantenimiento'].concat(obras.map(w => workLabel(w)));
    }

    const pend = wizardBubble((hint ? hint + '<br>' : '') + '🤖 ' + s.ask);
    const wrap = document.createElement('div');
    wrap.className = 'ai-actions';
    if (s.multiEmps) {
      /* Multi-selección de empleados: checkboxes + botón Enviar */
      wrap.className = 'ai-actions ai-multi';
      buttons.forEach(lb => {
        const lab = document.createElement('label');
        lab.className = 'ai-check';
        const cb = document.createElement('input');
        cb.type = 'checkbox'; cb.value = lb; cb.className = 'ai-check-input';
        lab.appendChild(cb);
        lab.appendChild(document.createTextNode(' ' + lb));
        wrap.appendChild(lab);
      });
      const send = document.createElement('button');
      send.className = 'btn btn-primary btn-sm'; send.textContent = 'Enviar';
      send.dataset.multiOk = '1';
      wrap.appendChild(send);
    } else {
      buttons.forEach(lb => {
        const b = document.createElement('button');
        b.className = 'btn btn-soft btn-sm'; b.textContent = lb;
        b.dataset.wiz = lb; wrap.appendChild(b);
      });
    }
    /* Selector de empleados: alta rápida sin reiniciar el flujo */
    if (s.empsList) {
      const nb = document.createElement('button');
      nb.className = 'btn btn-soft-info btn-sm';
      nb.textContent = '➕ Agregar nuevo empleado';
      nb.dataset.newEmp = '1';
      wrap.appendChild(nb);
    }
    /* Paso de horas: widget numérico + opción "Escribir horas" que enfoca
       el input del chat (ingreso manual libre de la cantidad) */
    if (s.key === 'horas') {
      const wd = document.createElement('div');
      wd.innerHTML = numWidgetHtml({ title: 'O escribí las horas acá:', ph: 'Ej: 6.5', okLabel: 'Usar' });
      pend.appendChild(wd.firstElementChild);
      const fb = document.createElement('button');
      fb.className = 'btn btn-soft btn-sm';
      fb.textContent = '✍️ Escribir horas';
      fb.dataset.focusInput = '1';
      wrap.appendChild(fb);
    }
    /* Acciones con formulario dinámico: botón para completar todo en una
       tarjeta del chat (empleado, gasto, ingreso, adelanto) */
    if (op && op.idx === 0 && FORM_DEFS[op.modulo]) {
      const fb = document.createElement('button');
      fb.className = 'btn btn-soft-info btn-sm';
      fb.textContent = '📝 Completar formulario';
      fb.dataset.formOpen = op.modulo;
      wrap.appendChild(fb);
    }
    /* Sin botón "Saltear": todos los pasos se responden (o se cancela) */
    const cx = document.createElement('button');
    cx.className = 'btn btn-soft btn-sm'; cx.textContent = 'Cancelar';
    cx.dataset.wiz = '__cancel__'; wrap.appendChild(cx);
    pend.appendChild(wrap);
  }
  function wizardAskNext() {
    const op = pendingOp;
    if (!op) return;
    const steps = WIZARD_STEPS[op.modulo] || [];
    while (op.idx < steps.length) {
      const cand = steps[op.idx];
      if (!(cand.key in op.campos)) break;   // el paso ya fue respondido
      op.idx++;
    }
    if (op.idx >= steps.length) { finishWizard(); return; }
    wizardAskStep();
  }
  /* Validador de nombres: rechaza comandos del sistema y textos de botones
     para que NUNCA se guarden como datos de una persona. */
  function isValidName(val) {
    const t = String(val || '').toLowerCase().trim();
    if (t.length < 2) return false;
    /* Palabras sueltas reservadas (textos de botones) */
    const reservedWord = /^(crear|cargar|agregar|alta de|nueva|nuevo|empleado|cliente|socio|contacto|agenda|obra|gasto|ingreso|presupuesto|herramienta|jornada|cancelar|cancela|salir|salí|nada|no|seguir|continuar|continuemos|dale|sí|si|buscame|buscar|ver|métricas|auditoría|importar|traer|abrir|cerrar)$/i;
    if (reservedWord.test(t)) return false;
    /* Frases que empiezan con un verbo de comando o consulta ("crear una obra", "¿dónde está…?") */
    const commandPhrase = /^(crear|cargar|agregar|importar|traer|registr[aá]|alta de|nueva|nuevo|buscame|busca|ver |abrir|cerrar|suspend[eé]|activ[aá]|cambi[aá]|dale|extend[eé]|d[oó]nde|cu[aá]nto|c[uó]mo|mostrame|mostráme|muestrame|asignar|mover|agendar|cobr[eé]|gast[eé]|pagu[eé])\b/i;
    if (commandPhrase.test(t)) return false;
    return true;
  }
  /* Validadores de campos del wizard */
  /* Conversor de texto monetario/númerico:
     "100.000" → 100000 · "100mil" / "100 mil" → 100000 · "1.500,50" → 1500.5 */
  function parseMoney(text) {
    const s = flatText(text);
    if (!s) return NaN;
    /* Abreviatura: 100mil / 100 mil / 100k */
    const ab = s.match(/(\d+(?:[.,]\d+)?)\s*(?:mil|k)\b/);
    if (ab) {
      let base;
      const g = ab[1];
      if (/^\d{1,3}(\.\d{3})+$/.test(g)) base = Number(g.replace(/\./g, ''));   // 1.500 mil → 1500
      else base = Number(g.replace(',', '.'));                                    // 2,5 mil → 2.5
      return base * 1000;
    }
    /* Miles con punto y decimales con coma: 1.500,50 */
    const miles = s.match(/\d{1,3}(?:\.\d{3})+(?:,\d+)?/);
    if (miles) return Number(miles[0].replace(/\./g, '').replace(',', '.'));
    /* Número simple, con coma o punto decimal: 1500 · 4,5 · 4.5 */
    const simple = s.match(/\d+(?:[.,]\d+)?/);
    if (simple) return Number(simple[0].replace(',', '.'));
    return NaN;
  }
  function extractNumber(val) {
    const n = parseMoney(val);
    if (!isNaN(n)) return n;
    /* Respaldo histórico para cantidades simples (horas, porcentajes) */
    const m = String(val || '').replace(/\./g, '').replace(',', '.').match(/(\d+(?:\.\d+)?)/);
    return m ? Number(m[1]) : NaN;
  }
  function isValidNumber(val) {
    const n = extractNumber(val);
    return !isNaN(n) && n >= 0;
  }
  function isValidPhone(val) {
    return String(val || '').replace(/[^0-9+]/g, '').length >= 6;
  }
  function isValidEmail(val) {
    return /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(String(val || '').trim());
  }
  function wizardAdvance(answer) {
    const op = pendingOp;
    if (!op) return;
    const steps = WIZARD_STEPS[op.modulo] || [];
    const s = steps[op.idx];
    if (!s) { finishWizard(); return; }
    const val = String(answer || '').trim();
    const clave = (WIZARD_REQUIRED[op.modulo] || []).includes(s.key);
    const noSe = /^(no se|no sé|no tengo|no lo se|no lo sé|nada|paso|no)$/i.test(val);
    /* Campos CLAVE vacíos → insistir sin avanzar; secundarios aceptan "no sé" */
    if (!val || (clave && noSe)) {
      wizardBubble('🤖 Necesito ese dato para poder continuar. ' + s.ask);
      return;
    }
    /* Validación por tipo de campo (solo si no es "no sé") */
    if (!noSe) {
      if (s.key === 'nombre' && !isValidName(val)) {
        wizardBubble('🤖 Eso parece un comando, no un nombre. Escribí el nombre y apellido de la persona (ej. "Juan Pérez").');
        return;
      }
      if ((s.key === 'monto' || s.key === 'tarifa' || s.key === 'costo' || s.key === 'presupuesto' || s.key === 'horas' || s.key === 'porcentaje') && !isValidNumber(val)) {
        wizardBubble('🤖 Eso no es un número válido. ' + s.ask);
        return;
      }
      if (s.key === 'telefono' && !isValidPhone(val)) {
        wizardBubble('🤖 Ese teléfono no parece válido (mínimo 6 dígitos). ' + s.ask);
        return;
      }
      if (s.key === 'email' && !isValidEmail(val)) {
        wizardBubble('🤖 Ese e-mail no parece válido (ej. nombre@dominio.com). ' + s.ask);
        return;
      }
      if (s.key === 'fecha' && !normFecha(val)) {
        wizardBubble('🤖 No entendí esa fecha. Decime "hoy", "mañana", "pasado mañana" o una fecha (ej. 15/04 o 2026-04-15).');
        return;
      }
    }
    /* Normalización por campo antes de guardar */
    let finalVal = val;
    if (s.key === 'fecha') {
      finalVal = normFecha(val) || val;
    } else if (s.key === 'tipo' && op.modulo === 'agendar') {
      finalVal = flatText(val);   // "Reunión" → "reunion": clave canónica del multirubro
    } else if ((s.key === 'monto' || s.key === 'tarifa' || s.key === 'costo' || s.key === 'presupuesto' || s.key === 'horas' || s.key === 'porcentaje')) {
      /* "4 hs" → "4" · "5000 pesos" → "5000" */
      finalVal = String(extractNumber(val));
    }
    op.campos[s.key] = noSe ? '' : finalVal;
    op.idx++;
    wizardAskNext();
  }
  function startWizard(modulo, campos) {
    pendingOp = { modulo, campos: campos || {}, idx: 0 };
    wizardAskNext();
  }
  async function finishWizard() {
    const op = pendingOp;
    resetFlows();   // limpieza inmediata del estado conversacional al finalizar
    if (!op) return;
    /* Esperar la confirmación REAL de persistencia antes de celebrar */
    const res = await execFormAction({ modulo: op.modulo, campos: op.campos });
    if (res && res.saved) {
      if (res.synced) {
        lastSaved = (res.coll && res.id) ? { coll: res.coll, id: res.id, label: res.label } : null;
        wizardBubble(summaryCardHtml(res));
        if (G.ui && G.ui.toast) G.ui.toast('Guardado: ' + res.label, 'success');
      } else {
        wizardBubble('⚠️ Guardé ' + res.label + ' en tu dispositivo, pero la nube no respondió y todavía no se sincronizó. Se reintentará solo cuando vuelva la conexión.');
      }
      rememberTurn('asistente', 'guardado ' + res.label);
    } else {
      wizardBubble('No pude guardar el/la ' + op.modulo + ' porque me faltan datos. Decime qué falta y lo completo.');
      rememberTurn('asistente', 'faltan datos para ' + op.modulo);
    }
  }
  function cancelWizard() {
    const op = pendingOp;
    resetFlows();   // limpieza TOTAL: wizard, submenús y confirmaciones colgadas
    wizardBubble('✋ Operación cancelada. Si querés retomarla, decime de nuevo qué cargar.');
    if (op) rememberTurn('asistente', 'cancelado ' + op.modulo);
    addGreeting();   // regresar al menú principal de opciones (botonera de reposo)
  }
  function askContinueOrCancel() {
    const op = pendingOp;
    if (!op) return;
    const pend = wizardBubble('Estás a mitad de cargar <b>' + op.modulo + '</b>. ¿Querés continuar o lo cancelamos?');
    const wrap = document.createElement('div');
    wrap.className = 'ai-actions';
    const c = document.createElement('button'); c.className = 'btn btn-soft btn-sm'; c.textContent = 'Continuar'; c.dataset.wiz = '__continue__'; wrap.appendChild(c);
    const x = document.createElement('button'); x.className = 'btn btn-soft btn-sm'; x.textContent = 'Cancelar'; x.dataset.wiz = '__cancel__'; wrap.appendChild(x);
    pend.appendChild(wrap);
  }

  /* Llamada a la Edge Function en modo streaming (SSE): el texto llega por
     chunks y se renderiza palabra por palabra vía onChunk. */
  async function callAI(payload, onChunk) {
    const sess = G.auth.getSession();
    const url = G.auth.SUPABASE_URL + '/functions/v1/ai-assistant';
    payload.stream = true;
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 60000);   // streaming: margen amplio
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': G.auth.SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + sess.accessToken },
        body: JSON.stringify(payload),
        signal: ctrl.signal,
      });
      clearTimeout(to);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      if (!r.body) throw new Error('Sin respuesta');
      const reader = r.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let final = null;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() || '';
        for (const line of lines) {
          const s = line.trim();
          if (!s.startsWith('data: ')) continue;
          try {
            const obj = JSON.parse(s.slice(6));
            if (obj.done) final = obj;
            else if (obj.text && onChunk) onChunk(obj.text);
          } catch (e) { /* chunk inválido */ }
        }
      }
      return final || { reply: '', action: null };
    } catch (e) {
      clearTimeout(to);
      throw e;
    }
  }

  function send() {
    /* Anti-spam: evita reintentos inmediatos en cadena (saturación/eco) */
    if (Date.now() - lastSendAt < 1200) {
      if (G.ui && G.ui.toast) G.ui.toast('Esperá un segundo antes de enviar de nuevo.', 'info');
      return;
    }
    syncUser();   // aislamiento por usuario: si cambió la cuenta, memoria limpia
    /* Descartar el interino: enviar solo el texto DEFINITIVO (o lo tipeado manual) */
    const msg = prepareMessage(input.value);
    if (!msg || busy) return;
    lastSendAt = Date.now();
    busy = true;
    input.value = '';
    appendLog(bubble(renderText(msg), 'user'));
    scrollToEnd();

    /* ===== 1) Operación guiada en curso (wizard): responder / cancelar / continuar ===== */
    if (pendingOp) {
      const mt = msg.toLowerCase();
      if (/^(cancelar|cancela|salir|salí|nada|me arrepentí|para|basta|olvidalo|olvídalo|chau|no quiero)\b/.test(mt)) { cancelWizard(); busy = false; return; }
      if (/^(seguir|continuar|continuemos|dale|sí|si)\b/.test(mt)) { wizardAskNext(); busy = false; return; }
      /* Consulta puntual ("¿dónde está la amoladora?") NUNCA es dato del wizard:
         responde la búsqueda y vuelve a preguntar el paso actual, sin perder datos */
      const sq = searchIntent(msg);
      if (sq) {
        const found = searchStore(sq);
        const pendQ = bubble('', 'bot');
        appendLog(pendQ);
        if (found.length) handleSearchResults(sq, found, pendQ);
        else {
          pendQ.innerHTML = '🔍 No encontré nada para "' + esc(sq) + '". Seguimos con lo que estábamos:';
          busy = false;
        }
        wizardAskNext();   // re-pregunta el paso actual (sin duplicar estado)
        scrollToEnd();
        return;
      }
      /* Cambio de tarea SOLO con intención completa de otro módulo:
         "cobré $50000 de la obra X" cambia de flujo; una frase suelta
         ("crear una obra") se trata como dato inválido del paso actual */
      const li = localIntent(msg);
      if (li && li.modulo && li.modulo !== pendingOp.modulo && WIZARD_STEPS[li.modulo] && isCompleteWizard(li.modulo, li.campos)) {
        resetFlows();
        rememberTurn('usuario', msg);
        const pend2 = bubble('', 'bot');
        appendLog(pend2);
        execFormAction(li).then(res => { renderSaveResult(pend2, res); busy = false; scrollToEnd(); });
        return;
      }
      if (isQuery(msg)) { askContinueOrCancel(); busy = false; return; }
      wizardAdvance(msg);
      busy = false;
      return;
    }
    /* ===== 1b) Alta express del COO en curso ===== */
    if (adminWizard) {
      if (/^(cancelar|cancela|salir|nada|no)\b/.test(msg.toLowerCase())) { adminWizard = null; wizardBubble('✋ Alta cancelada.'); }
      else adminWizardAdvance(msg);
      busy = false;
      return;
    }
    /* ===== 1c) Flujo "Crear agenda": esperando la elección de rol ===== */
    if (contactStage === 'rol') {
      const mt = msg.toLowerCase();
      if (/^(cancelar|cancela|salir|nada|no)\b/.test(mt)) {
        contactStage = null; contactRole = null;
        wizardBubble('✋ Operación cancelada.');
        busy = false;
        return;
      }
      if (/^(empleado|cliente|socio)$/.test(mt)) {
        chooseRole(mt, null);
        busy = false;
        return;
      }
      const pend = bubble('Tocá un botón: <b>Empleado</b>, <b>Cliente</b> o <b>Socio</b>.', 'bot');
      appendLog(pend);
      addRoleButtons(pend);
      scrollToEnd();
      busy = false;
      return;
    }

    /* ===== 1d) Submenú Contabilidad abierto ===== */
    if (ledgerMenu) {
      const mt = msg.toLowerCase();
      if (/^(cancelar|cancela|salir|nada|no)\b/.test(mt)) {
        ledgerMenu = false;
        wizardBubble('✋ Operación cancelada.');
        busy = false;
        return;
      }
      /* Consulta puntual dentro del contexto: responde sin cerrar el submenú */
      const sq = searchIntent(msg);
      if (sq) {
        const found = searchStore(sq);
        const pendQ = bubble('', 'bot');
        appendLog(pendQ);
        if (found.length) handleSearchResults(sq, found, pendQ);
        else { pendQ.innerHTML = '🔍 No encontré nada para "' + esc(sq) + '".'; busy = false; }
        scrollToEnd();
        return;
      }
      /* Instrucción conversacional directa dentro del contexto ("cobré $50000 de la obra X") */
      const int = localIntent(msg);
      if (int && (int.modulo === 'ingreso' || int.modulo === 'gasto')) {
        ledgerMenu = false;
        rememberTurn('usuario', msg);
        if (isCompleteWizard(int.modulo, int.campos)) {
          const pend = bubble('', 'bot');
          appendLog(pend);
          execFormAction(int).then(res => { renderSaveResult(pend, res); busy = false; scrollToEnd(); });
          return;
        }
        startWizard(int.modulo, int.campos);
        busy = false;
        return;
      }
      if (/^ingresos?$/.test(mt)) { ledgerMenu = false; startWizard('ingreso', {}); busy = false; return; }
      if (/^gastos?$/.test(mt)) { ledgerMenu = false; startWizard('gasto', {}); busy = false; return; }
      const pend = bubble('Tocá un botón: <b>Ingresos</b> o <b>Gastos</b>.', 'bot');
      appendLog(pend);
      addLedgerButtons(pend);
      scrollToEnd();
      busy = false;
      return;
    }

    /* ===== 1e) Submenú Herramientas y Máquinas abierto ===== */
    if (toolsMenu) {
      const mt = msg.toLowerCase();
      if (/^(cancelar|cancela|salir|nada|no)\b/.test(mt)) {
        toolsMenu = false;
        wizardBubble('✋ Operación cancelada.');
        busy = false;
        return;
      }
      /* Consulta puntual ("¿dónde está la amoladora?") → ubicación y estado,
         sin caer en wizards de presupuestos ni bucles */
      const sq = searchIntent(msg);
      if (sq) {
        const found = searchStore(sq);
        const pendQ = bubble('', 'bot');
        appendLog(pendQ);
        if (found.length) handleSearchResults(sq, found, pendQ);
        else { pendQ.innerHTML = '🔍 No encontré nada para "' + esc(sq) + '".'; busy = false; }
        scrollToEnd();
        return;
      }
      /* Instrucción conversacional directa ("asignar la amoladora a la obra X") */
      const int = localIntent(msg);
      if (int && (int.modulo === 'asignar' || int.modulo === 'herramienta' || int.modulo === 'jornada')) {
        toolsMenu = false;
        rememberTurn('usuario', msg);
        if (isCompleteWizard(int.modulo, int.campos)) {
          const pend = bubble('', 'bot');
          appendLog(pend);
          execFormAction(int).then(res => { renderSaveResult(pend, res); busy = false; scrollToEnd(); });
          return;
        }
        startWizard(int.modulo, int.campos);
        busy = false;
        return;
      }
      if (/^(ver|ver herramientas)$/.test(mt)) {
        toolsMenu = false;
        setOpen(false);
        try { if (G.router && G.router.navigate) G.router.navigate('#/herramientas'); } catch (e) {}
        busy = false;
        return;
      }
      if (/^(asignar|asignar herramienta|mover herramienta)$/.test(mt)) { toolsMenu = false; startWizard('asignar', {}); busy = false; return; }
      if (/^(cargar|nueva|nuevo|alta|herramienta)$/.test(mt)) { toolsMenu = false; startWizard('herramienta', {}); busy = false; return; }
      if (/^(jornada)$/.test(mt)) { toolsMenu = false; startWizard('jornada', {}); busy = false; return; }
      const pend = bubble('Tocá un botón: <b>Ver herramientas</b>, <b>Cargar nueva herramienta</b>, <b>Asignar herramienta</b> o <b>Cargar jornada</b>.', 'bot');
      appendLog(pend);
      addToolsButtons(pend);
      scrollToEnd();
      busy = false;
      return;
    }

    const pend = bubble('Pensando…', 'bot');
    appendLog(pend);
    scrollToEnd();
    const sess = G.auth.getSession();
    if (!sess) { pend.innerHTML = 'Necesitás iniciar sesión para usar el asistente.'; busy = false; return; }
    /* Búsqueda local instantánea: "buscame a X" / "¿dónde está X?" → respuesta
       inmediata desde el store con acceso directo (sin pasar por la IA).
       SIEMPRE corta acá: aunque no haya resultados, la consulta NUNCA deriva
       a formularios de creación (obras, presupuestos, herramientas…). */
    const sq = searchIntent(msg);
    if (sq) {
      const found = searchStore(sq);
      if (found.length) {
        handleSearchResults(sq, found, pend);
      } else {
        pend.innerHTML = '🔍 Busqué "<b>' + esc(sq) + '</b>" en herramientas, obras, empleados, contactos y movimientos, y no encontré coincidencias.<br>Probá con otro nombre o pedime "<b>ver herramientas</b>" para revisar lo cargado.';
        rememberTurn('usuario', 'buscar ' + sq);
        rememberTurn('asistente', 'no encontré ' + sq);
        busy = false;
        scrollToEnd();
      }
      return;
    }
    /* Consulta de sueldo/saldo de un empleado: "¿cuánto le queda por cobrar
       a Luis?" → cálculo DIRECTO del sistema (horas × tarifa − adelantos),
       sin derivar a pantallas secundarias. */
    const salEmp = salaryIntent(msg);
    if (salEmp) {
      handleSalaryAnswer(salEmp, pend);
      return;
    }
    /* Enviar por WhatsApp: botón clickeable con el resumen precargado */
    const wa = waIntent(msg);
    if (wa) {
      handleWaAnswer(wa, pend);
      return;
    }
    /* Saldo por cobrar de OBRAS: presupuesto − cobros recibidos (por obra o cliente) */
    const wb = workBalanceIntent(msg);
    if (wb) {
      handleWorkBalanceAnswer(wb, pend);
      return;
    }
    /* Pagos del día: "¿cuánto debo pagar hoy?" (retomable si falta una tarifa) */
    if (payTodayIntent(msg)) {
      handlePayTodayAnswer(pend);
      return;
    }
    /* Estado de caja: balance neto inmediato (ingresos − gastos) */
    if (cashIntent(msg)) {
      handleCashAnswer(pend);
      return;
    }
    /* Redirección automática: "mostrame el libro contable" → #/libro */
    const ruta = routeIntent(msg);
    if (ruta) {
      handleRouteAnswer(ruta, pend);
      return;
    }
    /* Tarifa de un empleado: "Tarifa de Lucho = $6000" */
    const tar = tarifaIntent(msg);
    if (tar) {
      handleTarifaAnswer(tar, pend);
      return;
    }
    /* ===== 2) COO Virtual: comandos del Super Admin (SOLO con rol admin) ===== */
    if (esSuperAdmin()) {
      const adm = adminIntent(msg);
      if (adm) {
        rememberTurn('usuario', msg);
        handleAdminIntent(adm, pend).finally(() => { busy = false; scrollToEnd(); });
        return;
      }
    }
    /* ===== 2.5) Importar contacto desde la agenda → elegir rol ===== */
    const lc = localIntent(msg);
    if (lc && lc.modulo === 'contacto') {
      rememberTurn('usuario', msg);
      startContactFlow(pend);
      return;
    }
    /* ===== 3) Creación guiada universal: la carga se resuelve 100% en el chat ===== */
    const li = lc;
    if (li && WIZARD_STEPS[li.modulo]) {
      rememberTurn('usuario', msg);
      if (isCompleteWizard(li.modulo, li.campos)) {
        /* Guardado con confirmación real: espera a Supabase antes del tilde */
        execFormAction(li).then(res => {
          if (renderSaveResult(pend, res)) {
            rememberTurn('asistente', 'guardado ' + res.label);
          } else {
            startWizard(li.modulo, li.campos);
          }
          busy = false;
          scrollToEnd();
        });
        return;
      }
      startWizard(li.modulo, li.campos);
      busy = false;
      return;
    }
    const payload = { message: msg, context: context(), mode: isAdminMode() ? 'admin' : 'usuario' };
    rememberTurn('usuario', msg);
    let streamedText = '';

    callAI(payload, (chunk) => {
      streamedText += chunk;
      pend.innerHTML = renderText(streamedText);
      scrollToEnd();
    })
      .then(async data => {
        const replyText = data.reply || streamedText || 'Sin respuesta.';
        if (data.action) setFocus(data.action.modulo, data.action.campos);
        const res = data.action ? await execFormAction(data.action) : null;
        if (!renderSaveResult(pend, res)) {
          if (!streamedText) pend.innerHTML = renderText(replyText);
        }
        const acts = parseActions(replyText);
        if (acts.length) {
          const wrap = document.createElement('div');
          wrap.className = 'ai-actions';
          acts.forEach(a => {
            const b = document.createElement('button');
            b.className = 'btn btn-soft btn-sm';
            b.textContent = a.label;
            b.addEventListener('click', () => {
              /* PROHIBIDO abrir formularios manuales: las claves new-* arrancan
                 el flujo guiado en el chat; el resto solo navega a vistas */
              if (PILL_WIZARD[a.clave] || CONTACT_KEYS.indexOf(a.clave) >= 0) { firePill(a.clave); return; }
              const fn = ACTION_KEYS[a.clave];
              if (fn) { fn(); setOpen(false); }
            });
            wrap.appendChild(b);
          });
          pend.appendChild(wrap);
        }
        /* Historial + opciones inline para continuar la conversación en pasos */
        rememberTurn('asistente', replyText.slice(0, 140));
        addInlineOptions(pend, replyText);
      })
      .catch((err) => {
        /* Respaldo local: si la IA falla (pico/timeout), interpretamos la orden
           y ejecutamos la acción más probable sin romper la experiencia. */
        const local = localIntent(msg);
        if (local) {
          execFormAction(local).then(res => {
            if (renderSaveResult(pend, res)) {
              rememberTurn('asistente', 'guardado ' + res.label);
            } else {
              const faltante = local.modulo === 'gasto' ? 'Decime el monto y la categoría (ej. "gasto de 5000 en nafta").'
                : local.modulo === 'ingreso' ? 'Decime el monto (ej. "ingreso de 10000").'
                : 'Decime el nombre y los datos que puedas (ej. "empleado Juan Pérez").';
              pend.innerHTML = renderText('Entendí tu pedido (' + local.modulo + '). ' + faltante);
              /* Los chips táctiles se adjuntan SIEMPRE al mensaje del asistente */
              addInlineOptions(pend, faltante);
            }
          });
        } else {
          pend.innerHTML = (err && err.name === 'AbortError')
            ? '⏳ El asistente tardó más de lo esperado. Probá de nuevo en unos segundos.'
            : '😅 Estoy con un pico de consultas. Probá de nuevo en un segundo y lo cargamos juntos acá en el chat.';
        }
      })
      .finally(() => { busy = false; log.scrollTop = log.scrollHeight; });
  }

  function init() {
    try { build(); syncUser(); maybeWelcome(); } catch (e) {}
  }

  G.ai = { init, open: () => setOpen(true), cleanInput, removeRepeatedPhrases, prepareMessage, buildTranscript, localIntent, context, execFormAction, inlineOptionsFor, renderText, rememberTurn, searchIntent, searchStore, salaryIntent, employeeSalaryInfo, routeIntent, cashIntent, cashInfo, workBalanceIntent, workBalanceInfo, payTodayIntent, payTodayInfo, tarifaIntent, tarifaWidgetHtml, numWidgetHtml, applyTarifaValue, formFields, formWidgetHtml, submitFormValues, waIntent, waLink, waSummaryForEmp, isCompleteWizard, WIZARD_STEPS, WIZARD_REQUIRED, getUid, syncUser, adminIntent, normPlan, esSuperAdmin, ADMIN_WIZARD_STEPS, isValidName, isValidNumber, isValidPhone, isValidEmail, parseMoney, gotoHref, PILL_WIZARD, suggestedWork, workChipLabels, frequentEmployees, findAssetMention, findWorkMention, findEmployeeMention, detectDestino, normFecha, flatText, workLabel, _build: () => { try { build(); } catch (e) {} }, _send: (text) => { lastSendAt = 0; input.value = text; send(); }, _log: () => log, _pending: () => pendingOp, _adminWizard: () => adminWizard, _contactStage: () => contactStage, _contactRole: () => contactRole, _ledger: () => ledgerMenu, _tools: () => toolsMenu, _lastSaved: () => lastSaved, _pill: (k) => { try { firePill(k); } catch (e) {} }, _undo: () => undoSave(), _wiz: (label) => { appendLog(bubble(renderText(String(label)), 'user')); scrollToEnd(); wizardAdvance(String(label)); } };
})(typeof window !== 'undefined' ? window : globalThis);
