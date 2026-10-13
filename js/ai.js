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
      { key: 'nombre', ask: 'Dale, ¿cómo se llama el empleado? (ej. "Jorge Pérez")' },
      { key: 'oficio', ask: '¿Cuál es su oficio?', buttons: ['Albañil', 'Pintor', 'Plomero', 'Electricista', 'Carpintero', 'Yesero', 'Herrero'] },
      { key: 'tarifa', ask: '¿Cuánto cobra por hora? (ej. 1500; si no sabés, decime "no sé")' },
    ],
    cliente: [
      { key: 'nombre', ask: '¿Cómo se llama el cliente? (ej. "Ángel Cámara")' },
      { key: 'telefono', ask: '¿Su teléfono? (si no lo tenés, decime "no sé")' },
      { key: 'direccion', ask: '¿Su dirección? (si no la sabés, decime "no sé")' },
    ],
    socio: [
      { key: 'nombre', ask: '¿Cómo se llama el socio?' },
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
    ],
    ingreso: [
      { key: 'monto', ask: '¿De cuánto es el ingreso? (ej. 10000)' },
      { key: 'concepto', ask: '¿Qué concepto? (Cobro, Adelanto, Certificación…; si no sabés, decime "no sé")' },
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
    jornada: [
      { key: 'empleado', ask: '¿A qué empleado le cargamos la jornada?', empsList: true },
      { key: 'obra', ask: '¿En qué obra trabajó?', worksList: true },
      { key: 'horas', ask: '¿Cuántas horas trabajó? (ej. 8)' },
    ],
  };
  /* Campos CLAVE obligatorios: sin ellos NUNCA se guarda (ni tilde verde) */
  const WIZARD_REQUIRED = {
    empleado: ['nombre', 'oficio'], cliente: ['nombre'], socio: ['nombre'], obra: ['nombre'],
    gasto: ['monto', 'categoria', 'obra'], ingreso: ['monto', 'obra'],
    presupuesto: ['nombre', 'obra'], herramienta: ['nombre', 'categoria'],
    jornada: ['empleado', 'obra', 'horas'],
  };

  /* Modo dinámico según la vista actual: #/admin → COO Virtual · resto → Capataz Digital */
  function currentMode() { return location.hash.indexOf('#/admin') === 0 ? 'admin' : 'usuario'; }
  function isAdminMode() { return currentMode() === 'admin'; }

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
    const d = G.store.data || {};
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
        return w.name + ' (cobrado $' + cobrado + ', gastado $' + gastado + (presup ? ', pendiente por cobrar $' + pend : '') + ')';
      });
      s += ' Obras y saldos: ' + ws.join('; ') + '.';
    }

    /* Empleados con tarifa horaria: para consultas de sueldos y jornadas */
    const emps = d.employees || [];
    if (emps.length) {
      s += ' Empleados: ' + emps.slice(0, 12).map(e => {
        const full = ((e.firstName || '') + ' ' + (e.lastName || '')).trim();
        return e.hourlyRate ? full + ' ($' + e.hourlyRate + '/hora)' : full;
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
    return txt;
  }

  /* Devuelve las opciones inline para pasos guiados (puro, testeable) */
  function inlineOptionsFor(replyText) {
    const t = String(replyText || '').toLowerCase();
    const opts = [];
    if (/(oficio|profesi[oó]n|qu[eé] hace|rubro)/.test(t)) {
      ['Albañil', 'Pintor', 'Plomero', 'Electricista', 'Carpintero', 'Yesero', 'Herrero'].forEach(o => opts.push({ label: o, send: 'oficio ' + o }));
    } else if (/(categor[ií]a|tipo de gasto)/.test(t)) {
      /* Categorías REALES del store + Herramientas/Equipamiento */
      const cats = ['Herramientas / Equipamiento'].concat((G.store && G.store.CATS_OBRA) || []).concat((G.store && G.store.CATS_GENERAL) || []);
      [...new Set(cats)].forEach(c => opts.push({ label: c, send: 'categoría ' + c }));
    } else if (/(qu[eé] obra|cu[aá]l obra|a qu[eé] obra|en qu[eé] obra)/.test(t)) {
      const works = (G.store.data && G.store.data.works) || [];
      works.slice(0, 6).forEach(w => opts.push({ label: w.name, send: 'obra ' + w.name }));
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

  let host = null, log = null, input = null, busy = false, builtMode = null, rec = null, listening = false, voiceOn = true, speaking = false;
  let finalText = '', persistedFinal = '', lastSendAt = 0, silenceTimer = null, shouldListen = false;
  let chatHistory = [];   // últimas interacciones (seguimiento multi-paso en el chat)
  let pendingOp = null;   // operación guiada en curso: { modulo, campos, idx }
  let pendingAdmin = null;   // acción de admin pendiente de confirmación: { uid, patch, label }
  let adminWizard = null;    // alta express de usuarios en curso: { idx, campos }
  let pendingRole = null;    // contacto importado esperando rol: { nombre, telefono, email }
  let voicePref = null;
  let currentUid = null;  // usuario autenticado dueño de la memoria del agente
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
  /* Al cambiar de usuario, el agente borra su memoria (historial, foco, wizard,
     voz) y carga el contexto limpio del usuario entrante. */
  function syncUser() {
    const uid = getUid();
    if (uid === currentUid) return false;
    currentUid = uid;
    chatHistory = [];
    sessionFocus = null;
    pendingOp = null;
    finalText = '';
    persistedFinal = '';
    try { voicePref = localStorage.getItem(prefKey('gadu_ai_voice')) || null; } catch (e) { voicePref = null; }
    try { if (log) { log.innerHTML = ''; addGreeting(); } } catch (e) {}
    try { populateVoices(); } catch (e) {}
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
      '<select class="ai-voice-sel" id="aiVoiceSel" title="Elegir voz" hidden></select>' +
      '<button class="icon-btn sm" id="aiVoice" title="Silenciar voz">🔊</button>' +
      '<button class="icon-btn sm" id="aiStop" title="Detener voz">⏹️</button>' +
      '<button class="icon-btn sm" id="aiClose">' + '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>' + '</button></div>' +
      '<div class="ai-log" id="aiLog"></div>' +
      '<div class="ai-foot"><button class="ai-mic" id="aiMic" title="Dictar por voz" aria-label="Dictar por voz">🎙️</button>' +
      '<input class="input" id="aiInput" placeholder="Preguntame… (o tocá el micrófono y dictá)">' +
      '<button class="ai-send" id="aiSend" title="Enviar">➤</button></div>' +
      '</div>';
    document.body.appendChild(host);
    log = document.getElementById('aiLog');
    input = document.getElementById('aiInput');
    /* Botones del flujo guiado (wizard): delegación de clicks */
    log.addEventListener('click', (e) => {
      const adm = e.target && e.target.closest ? e.target.closest('[data-adm]') : null;
      if (adm) {
        const k = adm.dataset.adm;
        if (k === 'confirm') confirmAdminAction();
        else if (k === 'cancel') cancelAdminAction();
        else if (k === 'cancelwiz') { adminWizard = null; wizardBubble('✋ Alta cancelada.'); }
        else if (k === 'wiz') adminWizardAdvance(adm.dataset.arg || '');
        return;
      }
      const rb = e.target && e.target.closest ? e.target.closest('[data-role]') : null;
      if (rb) { chooseRole(rb.dataset.role); return; }
      const b = e.target && e.target.closest ? e.target.closest('[data-wiz]') : null;
      if (!b) return;
      const v = b.dataset.wiz;
      if (v === '__cancel__') cancelWizard();
      else if (v === '__continue__') { if (pendingOp) wizardAskNext(); }
      else wizardAdvance(v);
    });
    document.getElementById('aiFab').addEventListener('click', toggle);
    document.getElementById('aiClose').addEventListener('click', () => setOpen(false));
    document.getElementById('aiSend').addEventListener('click', send);
    document.getElementById('aiMic').addEventListener('click', toggleMic);
    document.getElementById('aiVoice').addEventListener('click', toggleVoice);
    document.getElementById('aiStop').addEventListener('click', stopVoice);
    document.getElementById('aiVoiceSel').addEventListener('change', onVoiceChange);
    populateVoices();
    if (window.speechSynthesis) window.speechSynthesis.onvoiceschanged = populateVoices;
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

    /* Desbloqueo de audio en iOS (Safari): el TTS queda mudo hasta el primer
       gesto del usuario. Un touch/click/keydown "destraba" el sintetizador. */
    let audioUnlocked = false;
    const unlockAudio = () => {
      if (audioUnlocked || !window.speechSynthesis) return;
      audioUnlocked = true;
      try { window.speechSynthesis.resume(); } catch (e) {}
      try {
        const u = new SpeechSynthesisUtterance(' ');
        u.volume = 0;
        u.rate = 10;
        window.speechSynthesis.speak(u);
      } catch (e) {}
    };
    ['touchstart', 'click', 'keydown'].forEach(ev => {
      try { window.addEventListener(ev, unlockAudio); } catch (e) {}
    });
  }

  /* Dictado por voz (Web Speech API) — estilo "pulsar para hablar":
     el texto se rellena en el input pero NUNCA se envía solo. */
  function stopRec() {
    shouldListen = false;   // evita que onend reinicie la escucha
    if (rec) { try { rec.stop(); } catch (e) {} }
    clearTimeout(silenceTimer);
    /* Al cancelar/dejar de escuchar, descartar el interino y dejar solo lo definitivo */
    try { input.value = finalText || ''; } catch (e) {}
  }

  /* Escucha CONTINUA: el micrófono permanece abierto hasta que el usuario
     presione el botón de envío (➤) o el propio micrófono. Sin auto-corte por
     silencio: las pausas naturales no interrumpen la captura. */

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

  function startRecognition() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const mic = document.getElementById('aiMic');
    if (!SR) return;
    rec = new SR();
    rec.lang = 'es-ES';
    rec.interimResults = true;   // muestra en vivo
    rec.continuous = true;       // no corta en pausas breves
    rec.onstart = () => { listening = true; mic.classList.add('ai-mic-on'); };
    rec.onresult = (e) => {
      const items = [];
      for (let i = 0; i < e.results.length; i++) items.push({ isFinal: e.results[i].isFinal, transcript: e.results[i][0].transcript });
      const bt = buildTranscript(items);
      /* conserva lo transcrito en sesiones previas (auto-reinicio) sin duplicar */
      finalText = (persistedFinal + (persistedFinal && bt.final ? ' ' : '') + bt.final).trim();
      input.value = (finalText + (bt.interim ? ' ' + bt.interim : '')).replace(/\s+/g, ' ').trim();
    };
    rec.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') { /* ignorar: es normal */ }
      else if (G.ui && G.ui.toast) G.ui.toast('Error de dictado: ' + (e.error || 'desconocido'), 'error');
      stopRec();
    };
    rec.onend = () => {
      clearTimeout(silenceTimer);
      if (shouldListen) {
        /* El navegador cortó la sesión (continuous no siempre funciona en móvil):
           reiniciar la escucha conservando lo ya transcrito. */
        persistedFinal = finalText;
        listening = false;
        mic.classList.remove('ai-mic-on');
        setTimeout(() => { if (shouldListen) startRecognition(); }, 150);
      } else {
        listening = false;
        mic.classList.remove('ai-mic-on');
        /* NO se envía automáticamente: el envío es manual con el botón ➤ */
      }
    };
    try { rec.start(); } catch (e) { listening = false; mic.classList.remove('ai-mic-on'); }
  }

  function toggleMic() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const mic = document.getElementById('aiMic');
    if (!SR) {
      /* Degradación elegante (Safari/iOS no soporta SpeechRecognition):
         aviso claro en el chat + toast, sin errores de consola. */
      if (G.ui && G.ui.toast) G.ui.toast('Tu navegador no soporta dictado por voz. Escribí tu mensaje y lo cargamos igual.', 'error');
      try {
        const pend = bubble('🎙️ Este navegador (Safari/iOS) no permite dictar por voz. <b>Escribí tu mensaje acá abajo</b>: el asistente responde igual de bien.', 'bot');
        log.appendChild(pend);
        scrollToEnd();
      } catch (e) {}
      return;
    }
    if (listening) { stopRec(); return; }   // 2ª pulsación = dejar de escuchar (sin enviar)
    shouldListen = true;
    finalText = '';
    persistedFinal = '';
    startRecognition();
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

  /* Limpia el dictado antes de enviar */
  function cleanInput(s) { return removeRepeatedPhrases(s); }

  /* Mensaje final listo para enviar: limpieza + tope de longitud (anti-consultas gigantes) */
  function prepareMessage(input) {
    let msg = removeRepeatedPhrases(input);
    if (msg.length > 400) msg = msg.slice(0, 400);
    return msg;
  }

  /* Texto a voz (Text-to-Speech) */
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  /* Solo voces de español LATINOAMERICANO (excluye España: es-ES) */
  function spanishVoices() {
    try {
      const vs = window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
      const latam = /^es[-_](ar|419|la|mx|us|cl|co|pe|ve|ec|cr|py|uy|bo|ni|pa|do|hn|sv|gt|pr|cu)$/i;
      return vs.filter(v => latam.test(v.lang));
    } catch (e) { return []; }
  }
  /* Ranking latino: Argentina primero, luego Latam neutro/México, luego el resto */
  function voiceRank(v) {
    const l = (v.lang || '').toLowerCase();
    if (/es[-_]ar/.test(l)) return 0;          // rioplatense (Argentina)
    if (/es[-_](419|la)/.test(l)) return 1;    // latino neutro
    if (/es[-_]mx/.test(l)) return 2;          // México
    if (/es[-_]us/.test(l)) return 3;
    return 4;                                  // resto de LATAM (cl, co, pe…)
  }
  /* Género inferido del nombre de la voz (listas ampliadas: Android/Google + iOS) */
  function voiceGender(v) {
    const n = (v.name || '').toLowerCase();
    if (/(helena|laura|sabina|paulina|monica|mónica|soledad|esperanza|maria|marta|carmen|luciana|valentina|sara|camila|rosa|ana|gabriela|isabela|ximena|veronica|andrea|mariana|cecilia|paloma|penelope|frida|josefina|sofia|sofía|marisol|fernanda|milena|florencia|female|mujer|femenina)/.test(n)) return 'Femenina';
    if (/(pablo|jorge|diego|carlos|juan|miguel|andres|raul|javier|pedro|gonzalo|alonso|enrique|rodrigo|leonardo|matias|emiliano|sergio|ramon|guillermo|bruno|facundo|felipe|martin|martín|ricardo|male|hombre|masculina)/.test(n)) return 'Masculina';
    return '';
  }
  /* Etiqueta descriptiva: "Español latino · Femenina — Argentina · Sabina" */
  function voiceLabel(v) {
    const g = voiceGender(v);
    const l = (v.lang || '').toLowerCase();
    const region = /es[-_]ar/.test(l) ? 'Argentina'
      : /es[-_]mx/.test(l) ? 'México'
      : /es[-_]us/.test(l) ? 'EE.UU.'
      : /es[-_]co/.test(l) ? 'Colombia'
      : /es[-_]cl/.test(l) ? 'Chile'
      : /es[-_]pe/.test(l) ? 'Perú'
      : /es[-_](419|la)/.test(l) ? 'Latino neutro' : '';
    const short = (v.name || '')
      .replace(/Microsoft |Google |Online|Natural|Spanish|Español|español/gi, '')
      .replace(/\s*\([^)]*\)/g, '')
      .replace(/\s+/g, ' ').trim();
    let s = 'Español latino' + (g ? ' · ' + g : '');
    if (region || short) s += ' — ' + (region || '') + (region && short ? ' · ' : '') + short;
    return s;
  }
  function populateVoices() {
    const sel = document.getElementById('aiVoiceSel');
    if (!sel) return;
    const vs = spanishVoices();
    if (!vs.length) { sel.hidden = true; return; }
    sel.hidden = false;
    const rank = (a, b) => voiceRank(a) - voiceRank(b) || (a.name || '').localeCompare(b.name || '');
    const fem = vs.filter(v => voiceGender(v) === 'Femenina').sort(rank);
    const masc = vs.filter(v => voiceGender(v) === 'Masculina').sort(rank);
    const otros = vs.filter(v => !voiceGender(v)).sort(rank);
    const opt = v => '<option value="' + esc(v.name) + '"' + (v.name === voicePref ? ' selected' : '') + '>' + esc(voiceLabel(v)) + '</option>';
    sel.innerHTML =
      (fem.length ? '<optgroup label="👩 Femeninas">' + fem.map(opt).join('') + '</optgroup>' : '') +
      (masc.length ? '<optgroup label="👨 Masculinas">' + masc.map(opt).join('') + '</optgroup>' : '') +
      (otros.length ? '<optgroup label="Otras voces latinas">' + otros.map(opt).join('') + '</optgroup>' : '');
  }
  function onVoiceChange(e) {
    voicePref = e.target.value;
    try { localStorage.setItem(prefKey('gadu_ai_voice'), voicePref); } catch (er) {}
    try { speak('Hola, soy tu asistente GADU. Esta es mi voz.'); } catch (er) {}
  }

  function updateVoiceBtn() {
    const b = document.getElementById('aiVoice');
    if (b) { b.textContent = voiceOn ? '🔊' : '🔇'; b.title = voiceOn ? 'Silenciar voz' : 'Activar voz'; }
  }
  function updateStopBtn() {
    const b = document.getElementById('aiStop');
    if (b) {
      /* Botón siempre visible: cancela de inmediato cualquier reproducción */
      b.style.opacity = speaking ? '1' : '.45';
      b.title = speaking ? 'Detener voz' : 'No hay audio reproduciéndose';
    }
  }

  function speak(text) {
    if (!voiceOn || !text) return;
    try {
      if (!window.speechSynthesis) return;
      stopRec();   // IMPORTANTE: detener el micrófono para no "escucharse a sí mismo"
      window.speechSynthesis.cancel();
      try { window.speechSynthesis.resume(); } catch (er) {}   // evita quedar en pausa (bug de Chrome)
      const clean = String(text)
        .replace(/\[\[accion:[^\]]+\]\]/g, '')
        .replace(/\*\*(.+?)\*\*/g, '$1')
        .replace(/<[^>]+>/g, '')
        .replace(/[#*_`]/g, '')
        .trim();
      if (!clean) return;
      const u = new SpeechSynthesisUtterance(clean);
      u.lang = 'es-419';   // español latinoamericano
      u.rate = 1.0;
      u.pitch = 1.0;
      u.volume = 1;
      const voices = spanishVoices().slice().sort((a, b) => voiceRank(a) - voiceRank(b));
      let es = null;
      if (voicePref) es = voices.find(v => v.name === voicePref);
      if (!es) es = voices[0] || null;   // mejor voz latina disponible
      if (es) u.voice = es;
      u.onstart = () => { speaking = true; updateStopBtn(); };
      u.onend = () => { speaking = false; updateStopBtn(); };
      u.onerror = () => { speaking = false; updateStopBtn(); };
      /* Delay breve: deja asentar el cancel() y evita audios mudos/salteados */
      setTimeout(() => {
        try { window.speechSynthesis.speak(u); } catch (er) { speaking = false; updateStopBtn(); }
      }, 80);
    } catch (e) { speaking = false; updateStopBtn(); }
  }

  function stopVoice() {
    try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch (e) {}
    stopRec();
    speaking = false;
    updateStopBtn();
  }

  function toggleVoice() {
    try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch (e) {}
    stopRec();   // al silenciar, también detenemos el micrófono
    voiceOn = !voiceOn;
    speaking = false;
    updateVoiceBtn();
    updateStopBtn();
  }

  /* Persistencia real: inserta en la capa de datos local y sincroniza a Supabase */
  function saveViaStore(mod, c) {
    try {
      const S = G.store;
      const d = S.data;
      const today = (S.todayISO && S.todayISO()) || new Date().toISOString().slice(0, 10);
      const findId = (list, name, keyFn) => {
        if (!name) return null;
        const n = String(name).toLowerCase().trim();
        const hit = (list || []).find(x => keyFn(x).toLowerCase().trim() === n);
        return hit ? hit.id : null;
      };
      /* Auto-asignación: si hay UNA sola obra activa, usarla sin preguntar */
      const autoWorkId = () => {
        const activas = (d.works || []).filter(w => w.status === 'activa');
        return activas.length === 1 ? activas[0].id : null;
      };
      const workName = (id) => {
        const w = (d.works || []).find(x => x.id === id);
        return w ? w.name : '';
      };
      if (mod === 'gasto') {
        const amount = Number(c.monto);
        if (!(amount > 0)) return null;
        const cat = c.categoria;
        if (!cat) return null;   // categoría obligatoria (validación estricta)
        const desc = c.concepto || cat;
        const autoId = autoWorkId();
        const workId = c.obra ? findId(d.works, c.obra, x => x.name) : autoId;
        /* Validación estricta: si hay obras activas y el gasto no está asignado,
           NO guardar como general en silencio → preguntar la obra en el chat */
        if (!workId && (d.works || []).some(w => w.status === 'activa')) return null;
        const esObra = !!workId;
        S.add('expenses', {
          type: esObra ? 'obra' : 'general', workId: workId || null, date: today, amount,
          category: cat, providerId: null, employeeId: null, expenseKind: null,
          description: desc, invoiceNumber: '', paymentMethod: (S.METODOS && S.METODOS[0]) || 'Efectivo',
        });
        return { ok: true, label: 'gasto de $' + amount + ' (' + desc + ')' + (esObra ? ' en ' + workName(workId) : '') };
      }
      if (mod === 'cliente' || mod === 'socio') {
        const name = c.nombre || '';
        if (!name) return null;
        const tipo = mod === 'socio' ? 'socio' : 'cliente';
        S.add('contacts', {
          type: tipo, name,
          nombre: name.split(/\s+/)[0] || name,
          apellido: name.split(/\s+/).slice(1).join(' '),
          company: '', phone: c.telefono || '', whatsapp: '', email: '',
          address: c.direccion || '', notes: '', photo: null,
        });
        setFocus(mod, { nombre: name });
        return { ok: true, label: (tipo === 'socio' ? 'socio ' : 'cliente ') + name };
      }
      if (mod === 'empleado') {
        const full = c.nombre || '';
        const fn = c.apellido ? c.nombre : (full.split(/\s+/)[0] || '');
        const ln = c.apellido || full.split(/\s+/).slice(1).join(' ');
        if (!fn) return null;
        if (!c.oficio) return null;   // oficio obligatorio (validación estricta)
        if (G.plan && G.plan.checkLimit && G.plan.checkLimit('empleados') === false) return null;
        S.add('employees', { firstName: fn, lastName: ln, phone: c.telefono || '', paymentData: '', hourlyRate: Number(c.tarifa) || 0, active: true, notes: 'Oficio: ' + c.oficio, photo: null });
        return { ok: true, label: 'empleado ' + (fn + ' ' + ln).trim() + ' (' + c.oficio + ')' };
      }
      if (mod === 'obra') {
        const name = c.nombre || '';
        if (!name) return null;
        if (G.plan && G.plan.checkLimit && G.plan.checkLimit('obras') === false) return null;
        const clientId = c.cliente ? findId((d.contacts || []).filter(x => x.type === 'cliente'), c.cliente, x => x.name) : null;
        S.add('works', { name, code: (S.nextCode ? S.nextCode('OB', 'works') : ''), clientId: clientId || null, location: c.ubicacion || c.direccion || '', status: 'activa', budgetTotal: Number(c.presupuesto) || 0, advanceFisico: 0, startDate: today, endDate: '', description: '' });
        setFocus(mod, { nombre: name });
        return { ok: true, label: 'obra ' + name };
      }
      if (mod === 'ingreso') {
        const amount = Number(c.monto);
        if (!(amount > 0)) return null;
        const autoId = autoWorkId();
        const workId = c.obra ? findId(d.works, c.obra, x => x.name) : autoId;
        if (!workId) return null;   // sin obra única ni nombre → abrir formulario
        S.add('incomes', { workId, clientId: null, date: today, amount, concept: c.concepto || 'Cobro', incomeKind: 'pago', method: (S.METODOS && S.METODOS[0]) || 'Efectivo', reference: '', notes: '' });
        return { ok: true, label: 'ingreso de $' + amount + ' en ' + (workName(workId) || c.obra) };
      }
      if (mod === 'presupuesto') {
        const name = c.nombre || c.concepto || '';
        if (!name) return null;
        const workId = c.obra ? findId(d.works, c.obra, x => x.name) : autoWorkId();
        const total = Number(c.monto) || Number(c.presupuesto) || 0;
        S.add('budgets', { code: (S.nextCode ? S.nextCode('PR', 'budgets') : ''), clientId: null, workId: workId || null, name, date: today, validUntil: '', status: 'borrador', items: [], discount: 0, subtotal: total, total, notes: '' });
        return { ok: true, label: 'presupuesto ' + name };
      }
      if (mod === 'herramienta') {
        const name = c.nombre || '';
        if (!name) return null;
        S.add('assets', { name, category: c.categoria || 'Herramienta', purchaseDate: today, cost: Number(c.monto) || Number(c.costo) || 0, status: 'operativo', supplierId: null, notes: c.ubicacion ? 'En: ' + c.ubicacion : '', maintenance: [] });
        return { ok: true, label: 'herramienta ' + name };
      }
      if (mod === 'jornada') {
        const empId = c.empleado ? findId(d.employees, c.empleado, x => ((x.firstName || '') + ' ' + (x.lastName || '')).trim()) : null;
        const workId = c.obra ? findId(d.works, c.obra, x => x.name) : null;
        const horas = Number(c.horas);
        if (!empId || !workId || !(horas > 0)) return null;   // empleado, obra y horas obligatorios
        S.add('attendance', { employeeId: empId, date: today, status: 'presente', hours: [{ workId, hours: horas }], notes: '' });
        return { ok: true, label: 'jornada de ' + c.empleado + ' (' + horas + 'h en ' + c.obra + ')' };
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
      /* Esperar la confirmación REAL de la base de datos (Supabase) */
      try {
        if (G.sync && G.sync.push) {
          await G.sync.push(G.store.data);
        } else {
          throw new Error('sincronización no disponible');
        }
        return { saved: true, label: saved.label, synced: true };
      } catch (e) {
        return { saved: true, label: saved.label, synced: false, error: String((e && e.message) || e) };
      }
    }
    return { saved: false, modulo: mod };   // sin modal: la conversación continúa
  }

  /* Renderiza el resultado del guardado: tilde verde SOLO si sync confirmó */
  function renderSaveResult(pend, res) {
    if (!res || !res.saved) return false;
    if (res.synced) {
      pend.innerHTML = successCard(res.label);
      speak('¡Listo! Guardé ' + res.label);
      if (G.ui && G.ui.toast) G.ui.toast('Guardado: ' + res.label, 'success');
    } else {
      pend.innerHTML = '⚠️ Guardé ' + res.label + ' en tu dispositivo, pero la nube no respondió y todavía no se sincronizó. Se va a reintentar solo cuando vuelva la conexión.';
      speak('Guardé ' + res.label + ' en el dispositivo, pero sin conexión con la nube.');
      if (G.ui && G.ui.toast) G.ui.toast('Guardado local (sin conexión): ' + res.label, 'warning');
    }
    return true;
  }

  function setOpen(v) {
    document.getElementById('aiPanel').hidden = !v;
    const tip = document.getElementById('aiFabTip');
    if (tip) { try { tip.classList.remove('show'); } catch (e) {} }
    if (v) { syncUser(); refreshGreeting(); input.focus(); }
    else { stopVoice(); }   // cierre limpio: cancela TTS y libera el micrófono
  }
  function toggle() { setOpen(document.getElementById('aiPanel').hidden); }

  function refreshGreeting() {
    if (builtMode === currentMode()) return;
    log.innerHTML = '';
    addGreeting();
  }

  /* Pills de bienvenida → comando conversacional (inicia el flujo guiado
     en el chat, sin redirigir a módulos externos) */
  const PILL_COMMANDS = {
    'new-obra': 'cargar una obra',
    'new-contacto': 'importar un contacto',
    'new-empleado': 'cargar un empleado',
    'new-cliente': 'cargar un cliente',
    'new-gasto': 'cargar un gasto',
    'new-ingreso': 'cargar un ingreso',
    'new-presupuesto': 'cargar un presupuesto',
    'herramientas': 'cargar una herramienta',
    'new-jornada': 'cargar una jornada',
  };
  function firePill(k) {
    const cmd = PILL_COMMANDS[k];
    if (cmd) {
      finalText = '';
      input.value = cmd;
      send();   // arranca la conversación guiada dentro del chat
      return;
    }
    /* Pills administrativos: conservan la navegación original */
    const fn = ACTION_KEYS[k];
    if (fn) { fn(); setOpen(false); }
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
      { k: 'new-contacto', e: '📇', l: 'Agregar contacto' },
      { k: 'new-empleado', e: '👷', l: 'Nuevo empleado' },
      { k: 'new-cliente', e: '👤', l: 'Nuevo cliente' },
      { k: 'new-gasto', e: '💸', l: 'Cargar gasto' },
      { k: 'new-ingreso', e: '💰', l: 'Nuevo ingreso' },
      { k: 'new-presupuesto', e: '📄', l: 'Nuevo presupuesto' },
      { k: 'herramientas', e: '🛠️', l: 'Herramientas / Jornada' },
    ];
    const admin = isAdminMode();
    builtMode = admin ? 'admin' : 'usuario';
    const sub = document.getElementById('aiSub');
    if (sub) sub.textContent = admin ? 'COO Virtual · gestión del SaaS' : 'Capataz Digital · te guío paso a paso';
    const pills = admin ? pillsAdmin : pillsUser;
    const saludo = admin
      ? '¡Hola Super Admin 👑! Soy tu COO Virtual. Consultame métricas o gestiona el SaaS.'
      : '¡Hola! 👋 Soy tu asistente GADU. Tocá una acción rápida o preguntame lo que necesites.';
    const bot = bubble(
      saludo + '<br>' +
      '<div class="ai-actions">' + pills.map(p => '<button class="btn btn-soft btn-sm" data-act="' + p.k + '">' + p.e + ' ' + p.l + '</button>').join('') + '</div>',
      'bot');
    log.appendChild(bot);
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
      '¡Hola! 👋 Bienvenido a GADU. No te preocupes por escribir, soy tu ayudante de obra.<br>' +
      'Tocá el micrófono 🎙️ y decime qué querés cargar, por ejemplo: <b>"Quiero cargar un empleado"</b>.<br>' +
      '<div class="ai-actions">' + pills.map(p => '<button class="btn btn-soft btn-sm" data-act="' + p.k + '">' + p.e + ' ' + p.l + '</button>').join('') + '</div>',
      'bot');
    log.appendChild(bot);
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
        if (!admin) {
          speak('¡Hola! Bienvenido a GADU. No te preocupes por escribir, soy tu ayudante de obra. Tocá el micrófono y decime qué querés cargar, por ejemplo: Quiero cargar un empleado.');
        }
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
  function localIntent(text) {
    const t = String(text || '').toLowerCase();
    /* 0.5) Importar un contacto desde la agenda → elegir rol (Empleado/Cliente/Socio) */
    if (/(?:importar|cargar|agregar|traer|alta de)\s+(?:un |una |el |la )?contacto\b/.test(t) ||
        /contacto\s+(?:desde\s+la\s+agenda|de\s+la\s+agenda|nuevo)/.test(t)) {
      return { modulo: 'contacto', campos: {} };
    }
    /* 0) Compra de herramienta/equipamiento → flujo de inversión (herramienta) */
    if (/(?:comprar|compré|compre|compra|compro|invertir en|inversión en)\s+(?:una |un |la |el )?/.test(t) &&
        /(herramienta|equipo|equipamiento|máquina|maquina|amoladora|taladro|sierra|compresor|andamio|mezcladora|hormigonera|moladora)/.test(t)) {
      const campos = {};
      const m = t.match(/(\d{1,3}(?:[.,]\d{3})+|\d{4,})(?:[.,]\d+)?/);
      if (m) campos.costo = Number(m[0].replace(/\./g, '').replace(',', '.'));
      return { modulo: 'herramienta', campos };
    }
    /* 1) Crear entidades: "crear/cargar empleado|obra|cliente|socio|presupuesto [nombre]" */
    const crear = t.match(/(?:crear|crea|agregar|alta de|nueva|nuevo|cargar|carga|cárgame|cargame|cargá)\s+(?:un |una |el |la |a )?(empleado|obra|cliente|socio|presupuesto|herramienta|jornada)\b/i);
    if (crear) {
      const modulo = crear[1];
      const resto = t.slice(t.indexOf(crear[0]) + crear[0].length).trim();
      const nombre = resto.replace(/^(que se llame|llamado|llamada|de nombre|de|a)\s+/i, '').trim();
      if (nombre) return { modulo, campos: { nombre } };
      return { modulo, campos: {} };
    }
    /* 2) Gastos/ingresos: con monto se ejecuta, sin monto se guía en el chat */
    const kind = /gasto|gast[ée]|pagu[ée]|compr[ée]|comprar/.test(t) ? 'gasto'
      : /ingreso|cobr[ée]|cobro|anticipo|adelanto|certificaci/.test(t) ? 'ingreso'
      : null;
    if (!kind) return null;
    const m = t.match(/(\d{1,3}(?:[.,]\d{3})+|\d{4,})(?:[.,]\d+)?/);
    if (!m) return { modulo: kind, campos: {} };   // sin monto → pedir datos en el chat
    const monto = Number(m[0].replace(/\./g, '').replace(',', '.'));
    if (!(monto > 0)) return { modulo: kind, campos: {} };
    const campos = { monto };
    if (kind === 'gasto') {
      const cat = t.match(/(material|combustible|nafta|gasoil|mano de obra|jornal|flete|subcontrat|alquiler|mantenimiento|herramienta|equipamiento|equipo|sueldo|seguro|impuesto|servicio)/);
      if (cat) campos.categoria = normCat(cat[1]);
    } else {
      campos.concepto = /anticipo|adelanto/.test(t) ? 'Adelanto' : 'Cobro';
    }
    return { modulo: kind, campos };
  }

  /* Búsqueda inteligente: "buscame a X" / "¿dónde está X?" → consulta el store */
  function searchIntent(text) {
    const t = String(text || '').toLowerCase();
    const m = t.match(/(?:buscame|buscame a|búscame|busca|buscar|dónde está|donde esta|dónde anda|donde anda|dónde quedó|donde quedo)\s+(.+)/i);
    if (!m) return null;
    const q = m[1].trim().replace(/[?.!¡¿]+$/g, '').replace(/^(la|el|a|un|una|los|las)\s+/i, '').toLowerCase();
    if (q.length < 2 || q.split(/\s+/).length > 5) return null;
    return q;
  }

  /* Busca en empleados, herramientas, contactos y obras del store */
  function searchStore(q) {
    const d = G.store.data || {};
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
        out.push({ tipo: 'Herramienta', nombre: a.name, detail: (a.status || 'operativo') + (a.notes ? ' · ' + a.notes : ''), key: 'herramientas' });
      }
    });
    (d.contacts || []).forEach(c => {
      if (has(c.name)) {
        out.push({ tipo: c.type === 'socio' ? 'Socio' : 'Cliente', nombre: c.name, detail: (c.phone ? c.phone + ' · ' : '') + (c.address || ''), key: c.type === 'socio' ? 'socios' : 'clientes' });
      }
    });
    (d.works || []).forEach(w => {
      if (has(w.name)) {
        out.push({ tipo: 'Obra', nombre: w.name, detail: (w.status || '') + (w.location ? ' · ' + w.location : '') + (w.budgetTotal ? ' · presupuesto $' + w.budgetTotal : ''), key: 'obras' });
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
    speak('Encontré ' + results.length + ' resultado' + (results.length > 1 ? 's' : '') + '.');
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
      speak('¡Listo! ' + a.label);
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
      speak('¡Listo! Creé la invitación.');
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
    return /^(cu[aá]nto|c[uó]mo|d[oó]nde|cu[aá]l|cu[aá]ndo|qu[eé] es|mostrame|mostráme|ver|muestrame)/i.test(String(text || '').trim());
  }

  /* Scroll automático al final del chat: ninguna burbuja ni la caja de texto
     deben quedar ocultas por debajo (incluye scrollIntoView del último mensaje) */
  function scrollToEnd() {
    try {
      if (!log) return;
      scrollToEnd();
      const last = log.lastElementChild || (log.children && log.children[log.children.length - 1]);
      if (last && last.scrollIntoView) last.scrollIntoView({ behavior: 'smooth', block: 'end' });
    } catch (e) {}
  }
  function wizardBubble(html) {
    const pend = bubble(html, 'bot');
    log.appendChild(pend);
    scrollToEnd();
    return pend;
  }

  /* ---------- Flujo Agenda → Rol (Empleado / Cliente / Socio) ---------- */
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
  function chooseRole(rol) {
    const p = pendingRole;
    pendingRole = null;
    if (!p) return;
    const mod = rol === 'empleado' ? 'empleado' : rol === 'socio' ? 'socio' : 'cliente';
    /* Arranca el wizard del rol elegido con los datos del contacto pre-cargados */
    startWizard(mod, { nombre: p.nombre, telefono: p.telefono, email: p.email });
  }
  function startContactFlow(pend) {
    const pickFn = (G.ui && G.ui.pickContact) ? G.ui.pickContact.bind(G.ui) : null;
    if (!pickFn) {
      pend.innerHTML = '📇 En este navegador no puedo abrir la agenda automáticamente. Decime el rol y el nombre (ej. "empleado Juan Pérez") y lo cargamos igual.';
      busy = false;
      scrollToEnd();
      return;
    }
    pend.innerHTML = '📇 Abriendo tu agenda…';
    pickFn().then(cc => {
      if (!cc) {
        pend.innerHTML = '✋ Importación cancelada. Si querés, cargá los datos a mano: decime "empleado", "cliente" o "socio" y el nombre.';
        busy = false;
        scrollToEnd();
        return;
      }
      pendingRole = { nombre: cc.name, telefono: cc.phone, email: cc.email };
      pend.innerHTML = '📇 Importé a <b>' + esc(cc.name || '') + '</b>' + (cc.phone ? ' <span class="muted small">(' + esc(cc.phone) + ')</span>' : '') + '.<br>¿Qué rol tendrá este contacto?';
      addRoleButtons(pend);
      busy = false;
      scrollToEnd();
    }).catch(err => {
      pend.innerHTML = '⚠️ No pude abrir la agenda: ' + esc(String((err && err.message) || err)) + '. Podés dictar el nombre y el rol (ej. "empleado Juan Pérez").';
      busy = false;
      scrollToEnd();
    });
  }
  function wizardAskStep() {
    const op = pendingOp;
    if (!op) return;
    const steps = WIZARD_STEPS[op.modulo] || [];
    const s = steps[op.idx];
    if (!s) { finishWizard(); return; }

    /* Botones dinámicos con entidades REALES del store (obras / empleados) */
    let buttons = s.buttons || [];
    if (s.worksList) {
      const obras = ((G.store.data && G.store.data.works) || []).filter(w => w.status === 'activa');
      if (!obras.length) {
        const pend = wizardBubble('⚠️ Todavía no tenés obras activas. Primero creá una obra: decime <b>"crear una obra"</b> y empezamos por ahí.');
        const wrap = document.createElement('div');
        wrap.className = 'ai-actions';
        const cx = document.createElement('button');
        cx.className = 'btn btn-soft btn-sm'; cx.textContent = 'Cancelar';
        cx.dataset.wiz = '__cancel__'; wrap.appendChild(cx);
        pend.appendChild(wrap);
        return;
      }
      buttons = obras.map(w => w.name);
    } else if (s.empsList) {
      const emps = ((G.store.data && G.store.data.employees) || []).filter(e => e.active !== false);
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
      buttons = emps.map(e => ((e.firstName || '') + ' ' + (e.lastName || '')).trim());
    } else if (s.catsList) {
      /* Categorías REALES del store (obra + generales) + Herramientas/Equipamiento */
      const cats = ['Herramientas / Equipamiento']
        .concat((G.store && G.store.CATS_OBRA) || [])
        .concat((G.store && G.store.CATS_GENERAL) || []);
      buttons = [...new Set(cats)];
    }

    const pend = wizardBubble('🤖 ' + s.ask);
    const wrap = document.createElement('div');
    wrap.className = 'ai-actions';
    buttons.forEach(lb => {
      const b = document.createElement('button');
      b.className = 'btn btn-soft btn-sm'; b.textContent = lb;
      b.dataset.wiz = lb; wrap.appendChild(b);
    });
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
    op.campos[s.key] = noSe ? '' : val;
    op.idx++;
    wizardAskNext();
  }
  function startWizard(modulo, campos) {
    pendingOp = { modulo, campos: campos || {}, idx: 0 };
    wizardAskNext();
  }
  async function finishWizard() {
    const op = pendingOp;
    pendingOp = null;
    if (!op) return;
    /* Esperar la confirmación REAL de persistencia antes de celebrar */
    const res = await execFormAction({ modulo: op.modulo, campos: op.campos });
    if (res && res.saved) {
      if (res.synced) {
        wizardBubble(successCard(res.label));
        speak('¡Listo! Guardé ' + res.label);
        if (G.ui && G.ui.toast) G.ui.toast('Guardado: ' + res.label, 'success');
      } else {
        wizardBubble('⚠️ Guardé ' + res.label + ' en tu dispositivo, pero la nube no respondió y todavía no se sincronizó. Se reintentará solo cuando vuelva la conexión.');
        speak('Guardé ' + res.label + ' en el dispositivo, pero sin conexión con la nube.');
      }
      rememberTurn('asistente', 'guardado ' + res.label);
    } else {
      wizardBubble('No pude guardar el/la ' + op.modulo + ' porque me faltan datos. Decime qué falta y lo completo.');
      rememberTurn('asistente', 'faltan datos para ' + op.modulo);
    }
  }
  function cancelWizard() {
    const op = pendingOp;
    pendingOp = null;
    wizardBubble('✋ Operación cancelada. Si querés retomarla, decime de nuevo qué cargar.');
    if (op) rememberTurn('asistente', 'cancelado ' + op.modulo);
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
    const msg = prepareMessage(finalText || input.value);
    if (!msg || busy) return;
    lastSendAt = Date.now();
    if (listening) stopRec();   // detener el micrófono al enviar
    busy = true;
    input.value = '';
    finalText = '';
    log.appendChild(bubble(renderText(msg), 'user'));
    scrollToEnd();

    /* ===== 1) Operación guiada en curso (wizard): responder / cancelar / continuar ===== */
    if (pendingOp) {
      const mt = msg.toLowerCase();
      if (/^(cancelar|cancela|salir|salí|nada|me arrepentí|para|basta|olvidalo|olvídalo|chau|no quiero)\b/.test(mt)) cancelWizard();
      else if (/^(seguir|continuar|continuemos|dale|sí|si)\b/.test(mt)) wizardAskNext();
      else if (isQuery(msg)) askContinueOrCancel();
      else wizardAdvance(msg);
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
    /* ===== 1c) Contacto importado esperando rol ===== */
    if (pendingRole) {
      const mt = msg.toLowerCase();
      if (/^(empleado|cliente|socio)$/.test(mt)) { chooseRole(mt); busy = false; return; }
      if (/^(cancelar|nada|no)\b/.test(mt)) { pendingRole = null; wizardBubble('✋ Operación cancelada.'); busy = false; return; }
      const pend = bubble('Tocá un botón: <b>Empleado</b>, <b>Cliente</b> o <b>Socio</b>.', 'bot');
      log.appendChild(pend);
      addRoleButtons(pend);
      scrollToEnd();
      busy = false;
      return;
    }

    const pend = bubble('Pensando…', 'bot');
    log.appendChild(pend);
    scrollToEnd();
    const sess = G.auth.getSession();
    if (!sess) { pend.innerHTML = 'Necesitás iniciar sesión para usar el asistente.'; busy = false; return; }
    /* Búsqueda local instantánea: "buscame a X" / "¿dónde está X?" → respuesta
       inmediata desde el store con acceso directo (sin pasar por la IA) */
    const sq = searchIntent(msg);
    if (sq) {
      const found = searchStore(sq);
      if (found.length) { handleSearchResults(sq, found, pend); return; }
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
          speak(replyText);
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
              if (PILL_COMMANDS[a.clave]) { firePill(a.clave); return; }
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

  G.ai = { init, open: () => setOpen(true), cleanInput, removeRepeatedPhrases, prepareMessage, buildTranscript, localIntent, context, execFormAction, inlineOptionsFor, rememberTurn, searchIntent, searchStore, isCompleteWizard, WIZARD_STEPS, WIZARD_REQUIRED, spanishVoices, voiceRank, voiceGender, voiceLabel, getUid, syncUser, voicePref: () => voicePref, adminIntent, normPlan, esSuperAdmin, ADMIN_WIZARD_STEPS, _build: () => { try { build(); } catch (e) {} }, _send: (text) => { lastSendAt = 0; input.value = text; send(); }, _log: () => log, _pending: () => pendingOp, _adminWizard: () => adminWizard };
})(typeof window !== 'undefined' ? window : globalThis);
