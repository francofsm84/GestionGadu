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

  /* Pasos guiados por módulo (flujo conversacional 100% dentro del chat) */
  const WIZARD_STEPS = {
    empleado: [
      { key: 'nombre', ask: 'Dale, ¿cómo se llama el empleado? (ej. "Jorge Pérez")' },
      { key: 'oficio', ask: '¿Cuál es su oficio?', buttons: ['Albañil', 'Pintor', 'Plomero', 'Electricista', 'Carpintero', 'Yesero', 'Herrero'] },
      { key: 'tarifa', ask: '¿Cuánto cobra por hora? (ej. 1500, o tocá Saltear)', optional: true },
    ],
    cliente: [
      { key: 'nombre', ask: '¿Cómo se llama el cliente? (ej. "Ángel Cámara")' },
      { key: 'telefono', ask: '¿Su teléfono? (o tocá Saltear)', optional: true },
      { key: 'direccion', ask: '¿Su dirección? (o tocá Saltear)', optional: true },
    ],
    socio: [
      { key: 'nombre', ask: '¿Cómo se llama el socio?' },
    ],
    obra: [
      { key: 'nombre', ask: '¿Cómo se llama la obra? (ej. "Casa de Norma")' },
      { key: 'ubicacion', ask: '¿Dónde queda la obra? (o tocá Saltear)', optional: true },
      { key: 'presupuesto', ask: '¿Cuál es el presupuesto total? (ej. 100000, o Saltear)', optional: true },
    ],
    gasto: [
      { key: 'monto', ask: '¿De cuánto es el gasto? (ej. 5000)' },
      { key: 'categoria', ask: '¿Qué categoría es?', buttons: ['Materiales', 'Combustible', 'Mano de obra', 'Flete', 'Subcontrato', 'Otro'] },
      { key: 'obra', ask: '¿A qué obra corresponde?', worksList: true },
    ],
    ingreso: [
      { key: 'monto', ask: '¿De cuánto es el ingreso? (ej. 10000)' },
      { key: 'concepto', ask: '¿Qué concepto? (Cobro, Adelanto, Certificación… o Saltear)', optional: true },
      { key: 'obra', ask: '¿A qué obra corresponde?', worksList: true },
    ],
    presupuesto: [
      { key: 'nombre', ask: '¿Cómo se llama el presupuesto? (ej. "Reforma cocina")' },
      { key: 'monto', ask: '¿Cuál es el monto total? (ej. 80000, o Saltear)', optional: true },
      { key: 'obra', ask: '¿Para qué obra es?', worksList: true },
    ],
    herramienta: [
      { key: 'nombre', ask: '¿Qué herramienta cargamos? (ej. "Amoladora")' },
      { key: 'categoria', ask: '¿Qué tipo es?', buttons: ['Herramienta eléctrica', 'Herramienta manual', 'Maquinaria', 'Otro'] },
      { key: 'costo', ask: '¿Cuánto costó? (ej. 12000, o Saltear)', optional: true },
    ],
  };
  /* Campos mínimos para poder guardar cada módulo (validación estricta) */
  const WIZARD_REQUIRED = {
    empleado: ['nombre'], cliente: ['nombre'], socio: ['nombre'], obra: ['nombre'],
    gasto: ['monto', 'categoria', 'obra'], ingreso: ['monto', 'obra'],
    presupuesto: ['nombre', 'obra'], herramienta: ['nombre'],
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
      ['Materiales', 'Combustible', 'Mano de obra', 'Flete', 'Subcontrato'].forEach(c => opts.push({ label: c, send: 'categoría ' + c }));
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
  let voicePref = null;
  /* Memoria de sesión: última obra/cliente tratado, para que los comandos
     consecutivos se apliquen sin volver a preguntar. */
  let sessionFocus = null;   // { obra: 'Nombre', cliente: 'Nombre' }
  try { voicePref = localStorage.getItem('gadu_ai_voice') || null; } catch (e) {}

  /* Robot futurista animado (SVG inline): flota y parpadea vía CSS */
  const ROBOT_SVG = '<svg class="ai-robot" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
    '<path d="M32 14V7" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>' +
    '<circle cx="32" cy="5.5" r="3.2" fill="currentColor"/>' +
    '<rect x="7" y="26" width="5" height="10" rx="2.2" fill="currentColor"/>' +
    '<rect x="52" y="26" width="5" height="10" rx="2.2" fill="currentColor"/>' +
    '<rect x="11" y="13" width="42" height="36" rx="11" fill="currentColor"/>' +
    '<ellipse class="ai-eye ai-detail" cx="25" cy="30" rx="5" ry="6"/>' +
    '<ellipse class="ai-eye ai-detail" cx="39" cy="30" rx="5" ry="6"/>' +
    '<rect class="ai-detail" x="24" y="39" width="16" height="3.5" rx="1.75"/>' +
    '</svg>';

  function build() {
    if (document.getElementById('aiRoot')) return;
    host = document.createElement('div');
    host.id = 'aiRoot';
    host.innerHTML =
      '<button class="ai-fab" id="aiFab" title="Asistente GADU" aria-label="Asistente GADU">' +
      ROBOT_SVG +
      '</button>' +
      '<div class="ai-fab-tip" id="aiFabTip">¡Hola! Soy GADU, tu capataz digital. ¿Qué querés gestionar hoy?</div>' +
      '<div class="ai-panel" id="aiPanel" hidden>' +
      '<div class="ai-head"><span class="ai-head-logo">' + ROBOT_SVG + '</span>' +
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
      const b = e.target && e.target.closest ? e.target.closest('[data-wiz]') : null;
      if (!b) return;
      const v = b.dataset.wiz;
      if (v === '__cancel__') cancelWizard();
      else if (v === '__skip__') wizardAdvance('', true);
      else if (v === '__continue__') { if (pendingOp) wizardAskNext(); }
      else wizardAdvance(v, false);
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
      if (G.ui && G.ui.toast) G.ui.toast('Tu navegador no soporta dictado por voz. Probá con Chrome o Edge.', 'error');
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
  /* Género inferido del nombre de la voz (listas ampliadas de voces latinas) */
  function voiceGender(v) {
    const n = (v.name || '').toLowerCase();
    if (/(helena|laura|sabina|paulina|monica|soledad|esperanza|maria|marta|carmen|luciana|valentina|sara|camila|rosa|ana|gabriela|isabela|ximena|veronica|andrea|mariana|cecilia|paloma|penelope|frida|josefina|female|mujer|femenina)/.test(n)) return 'Femenina';
    if (/(pablo|jorge|diego|carlos|juan|miguel|andres|raul|javier|pedro|gonzalo|alonso|enrique|rodrigo|leonardo|matias|emiliano|sergio|ramon|guillermo|bruno|male|hombre|masculina)/.test(n)) return 'Masculina';
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
    try { localStorage.setItem('gadu_ai_voice', voicePref); } catch (er) {}
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
        if (G.plan && G.plan.checkLimit && G.plan.checkLimit('empleados') === false) return null;
        S.add('employees', { firstName: fn, lastName: ln, phone: c.telefono || '', paymentData: '', hourlyRate: Number(c.tarifa) || 0, active: true, notes: c.oficio ? 'Oficio: ' + c.oficio : '', photo: null });
        return { ok: true, label: 'empleado ' + (fn + ' ' + ln).trim() + (c.oficio ? ' (' + c.oficio + ')' : '') };
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
    } catch (e) { return null; }
    return null;
  }

  /* Ejecución 100% conversacional: guarda directo si hay datos suficientes;
     si faltan, la IA pide los datos en el chat (sin abrir ventanas emergentes). */
  function execFormAction(action) {
    const mod = (action && action.modulo) || '';
    const c = (action && action.campos) || {};
    const saved = saveViaStore(mod, c);
    if (saved && saved.ok) {
      try { if (G.sync && G.sync.push) G.sync.push(G.store.data); } catch (e) {}
      return { saved: true, label: saved.label };
    }
    return { saved: false, modulo: mod };   // sin modal: la conversación continúa
  }

  function setOpen(v) {
    document.getElementById('aiPanel').hidden = !v;
    const tip = document.getElementById('aiFabTip');
    if (tip) { try { tip.classList.remove('show'); } catch (e) {} }
    if (v) { refreshGreeting(); input.focus(); }
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
    'new-empleado': 'cargar un empleado',
    'new-cliente': 'cargar un cliente',
    'new-gasto': 'cargar un gasto',
    'new-ingreso': 'cargar un ingreso',
    'new-presupuesto': 'cargar un presupuesto',
    'herramientas': 'cargar una herramienta',
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
    let k = 'gadu_ai_onboarded';
    try { const s = G.auth.getSession(); if (s && s.userId) k += '_' + s.userId; } catch (e) {}
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

  /* Intents locales de respaldo: si la IA no responde (pico/timeout),
     interpretamos la orden con patrones simples. */
  function localIntent(text) {
    const t = String(text || '').toLowerCase();
    /* 1) Crear entidades: "crear/cargar empleado|obra|cliente|socio|presupuesto [nombre]" */
    const crear = t.match(/(?:crear|crea|agregar|alta de|nueva|nuevo|cargar|carga|cárgame|cargame|cargá)\s+(?:un |una |el |la |a )?(empleado|obra|cliente|socio|presupuesto|herramienta)\b/i);
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
      const cat = t.match(/(material|combustible|nafta|mano de obra|jornal|flete|subcontrat|sueldo)/);
      if (cat) campos.categoria = cat[1];
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
    log.scrollTop = log.scrollHeight;
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

  function wizardBubble(html) {
    const pend = bubble(html, 'bot');
    log.appendChild(pend);
    log.scrollTop = log.scrollHeight;
    return pend;
  }
  function wizardAskStep() {
    const op = pendingOp;
    if (!op) return;
    const steps = WIZARD_STEPS[op.modulo] || [];
    const s = steps[op.idx];
    if (!s) { finishWizard(); return; }

    /* Botones dinámicos con las obras activas REALES del store */
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
    }

    const pend = wizardBubble('🤖 ' + s.ask);
    const wrap = document.createElement('div');
    wrap.className = 'ai-actions';
    buttons.forEach(lb => {
      const b = document.createElement('button');
      b.className = 'btn btn-soft btn-sm'; b.textContent = lb;
      b.dataset.wiz = lb; wrap.appendChild(b);
    });
    if (s.optional) {
      const sk = document.createElement('button');
      sk.className = 'btn btn-soft btn-sm'; sk.textContent = 'Saltear';
      sk.dataset.wiz = '__skip__'; wrap.appendChild(sk);
    }
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
      if (!op.campos[cand.key]) break;
      op.idx++;
    }
    if (op.idx >= steps.length) { finishWizard(); return; }
    wizardAskStep();
  }
  function wizardAdvance(answer, skip) {
    const op = pendingOp;
    if (!op) return;
    const steps = WIZARD_STEPS[op.modulo] || [];
    const s = steps[op.idx];
    if (s && !skip && answer) op.campos[s.key] = String(answer).trim();
    op.idx++;
    wizardAskNext();
  }
  function startWizard(modulo, campos) {
    pendingOp = { modulo, campos: campos || {}, idx: 0 };
    wizardAskNext();
  }
  function finishWizard() {
    const op = pendingOp;
    pendingOp = null;
    if (!op) return;
    const res = execFormAction({ modulo: op.modulo, campos: op.campos });
    if (res && res.saved) {
      wizardBubble(successCard(res.label));
      speak('¡Listo! Guardé ' + res.label);
      if (G.ui && G.ui.toast) G.ui.toast('Guardado: ' + res.label, 'success');
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
    /* Descartar el interino: enviar solo el texto DEFINITIVO (o lo tipeado manual) */
    const msg = prepareMessage(finalText || input.value);
    if (!msg || busy) return;
    lastSendAt = Date.now();
    if (listening) stopRec();   // detener el micrófono al enviar
    busy = true;
    input.value = '';
    finalText = '';
    log.appendChild(bubble(renderText(msg), 'user'));
    log.scrollTop = log.scrollHeight;

    /* ===== 1) Operación guiada en curso (wizard): responder / cancelar / continuar ===== */
    if (pendingOp) {
      const mt = msg.toLowerCase();
      if (/^(cancelar|cancela|salir|salí|nada|me arrepentí|para|basta|olvidalo|olvídalo|chau|no quiero)\b/.test(mt)) cancelWizard();
      else if (/^(seguir|continuar|continuemos|dale|sí|si)\b/.test(mt)) wizardAskNext();
      else if (isQuery(msg)) askContinueOrCancel();
      else wizardAdvance(msg, false);
      busy = false;
      return;
    }

    const pend = bubble('Pensando…', 'bot');
    log.appendChild(pend);
    log.scrollTop = log.scrollHeight;
    const sess = G.auth.getSession();
    if (!sess) { pend.innerHTML = 'Necesitás iniciar sesión para usar el asistente.'; busy = false; return; }
    /* Búsqueda local instantánea: "buscame a X" / "¿dónde está X?" → respuesta
       inmediata desde el store con acceso directo (sin pasar por la IA) */
    const sq = searchIntent(msg);
    if (sq) {
      const found = searchStore(sq);
      if (found.length) { handleSearchResults(sq, found, pend); return; }
    }
    /* ===== 2) Creación guiada universal: la carga se resuelve 100% en el chat ===== */
    const li = localIntent(msg);
    if (li && WIZARD_STEPS[li.modulo]) {
      rememberTurn('usuario', msg);
      if (isCompleteWizard(li.modulo, li.campos)) {
        const res = execFormAction(li);
        if (res && res.saved) {
          pend.innerHTML = successCard(res.label);
          speak('¡Listo! Guardé ' + res.label);
          if (G.ui && G.ui.toast) G.ui.toast('Guardado: ' + res.label, 'success');
          rememberTurn('asistente', 'guardado ' + res.label);
          busy = false;
          log.scrollTop = log.scrollHeight;
          return;
        }
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
      log.scrollTop = log.scrollHeight;
    })
      .then(data => {
        const replyText = data.reply || streamedText || 'Sin respuesta.';
        if (data.action) setFocus(data.action.modulo, data.action.campos);
        const res = data.action ? execFormAction(data.action) : null;
        if (res && res.saved) {
          pend.innerHTML = successCard(res.label);
          speak('¡Listo! Guardé ' + res.label);
          if (G.ui && G.ui.toast) G.ui.toast('Guardado: ' + res.label, 'success');
        } else {
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
          const res = execFormAction(local);
          if (res && res.saved) {
            pend.innerHTML = successCard(res.label);
            speak('¡Listo! Guardé ' + res.label);
            if (G.ui && G.ui.toast) G.ui.toast('Guardado: ' + res.label, 'success');
          } else {
            const faltante = local.modulo === 'gasto' ? 'Decime el monto y la categoría (ej. "gasto de 5000 en nafta").'
              : local.modulo === 'ingreso' ? 'Decime el monto (ej. "ingreso de 10000").'
              : 'Decime el nombre y los datos que puedas (ej. "empleado Juan Pérez").';
            pend.innerHTML = renderText('Entendí tu pedido (' + local.modulo + '). ' + faltante);
          }
        } else {
          pend.innerHTML = (err && err.name === 'AbortError')
            ? '⏳ El asistente tardó más de lo esperado. Probá de nuevo en unos segundos.'
            : '😅 Estoy con un pico de consultas. Probá de nuevo en un segundo y lo cargamos juntos acá en el chat.';
        }
      })
      .finally(() => { busy = false; log.scrollTop = log.scrollHeight; });
  }

  function init() {
    try { build(); maybeWelcome(); } catch (e) {}
  }

  G.ai = { init, open: () => setOpen(true), cleanInput, removeRepeatedPhrases, prepareMessage, buildTranscript, localIntent, context, execFormAction, inlineOptionsFor, rememberTurn, searchIntent, searchStore, isCompleteWizard, WIZARD_STEPS, WIZARD_REQUIRED, spanishVoices, voiceRank, voiceGender, voiceLabel };
})(typeof window !== 'undefined' ? window : globalThis);
