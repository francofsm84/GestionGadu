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
    if (works.length) s += ' Obras: ' + works.slice(0, 8).map(w => w.name).join(', ') + '.';
    const emps = d.employees || [];
    if (emps.length) s += ' Empleados: ' + emps.slice(0, 12).map(e => ((e.firstName || '') + ' ' + (e.lastName || '')).trim()).join(', ') + '.';
    const clis = (d.contacts || []).filter(c => c.type === 'cliente');
    if (clis.length) s += ' Clientes: ' + clis.slice(0, 12).map(c => c.name).join(', ') + '.';
    if (sessionFocus && (sessionFocus.obra || sessionFocus.cliente)) {
      s += ' Foco actual de la sesión:';
      if (sessionFocus.obra) s += ' obra "' + sessionFocus.obra + '"';
      if (sessionFocus.cliente) s += (sessionFocus.obra ? ' y' : '') + ' cliente "' + sessionFocus.cliente + '"';
      s += '. Si el próximo comando no especifica otra obra/cliente, aplicalo a esa entidad.';
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

  function bubble(html, who) {
    const div = document.createElement('div');
    div.className = 'ai-msg ai-' + who;
    div.innerHTML = html;
    return div;
  }

  let host = null, log = null, input = null, busy = false, builtMode = null, rec = null, listening = false, voiceOn = true, speaking = false;
  let finalText = '', lastSendAt = 0, silenceTimer = null;
  let voicePref = null;
  /* Memoria de sesión: última obra/cliente tratado, para que los comandos
     consecutivos se apliquen sin volver a preguntar. */
  let sessionFocus = null;   // { obra: 'Nombre', cliente: 'Nombre' }
  try { voicePref = localStorage.getItem('gadu_ai_voice') || null; } catch (e) {}

  function build() {
    if (document.getElementById('aiRoot')) return;
    host = document.createElement('div');
    host.id = 'aiRoot';
    host.innerHTML =
      '<button class="ai-fab" id="aiFab" title="Asistente GADU" aria-label="Asistente GADU">' +
      '<img src="logo%20gadu%20blanco%20asistente%20ia.png" alt="Asistente GADU">' +
      '</button>' +
      '<div class="ai-panel" id="aiPanel" hidden>' +
      '<div class="ai-head"><span class="ai-head-logo"><img src="logo%20gadu%20blanco%20asistente%20ia.png" alt=""></span>' +
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
  }

  /* Dictado por voz (Web Speech API) — estilo "pulsar para hablar":
     el texto se rellena en el input pero NUNCA se envía solo. */
  function stopRec() {
    if (rec) { try { rec.stop(); } catch (e) {} }
    clearTimeout(silenceTimer);
    /* Al cancelar/dejar de escuchar, descartar el interino y dejar solo lo definitivo */
    try { input.value = finalText || ''; } catch (e) {}
  }

  /* Debounce de silencio: si no llegan resultados durante 3,5s, se suelta el
     micrófono automáticamente (SIN enviar). Evita que quede abierto y capte
     ruido o la propia salida del altavoz. */
  function resetSilenceTimer() {
    clearTimeout(silenceTimer);
    silenceTimer = setTimeout(() => { if (listening) stopRec(); }, 3500);
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

  function toggleMic() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const mic = document.getElementById('aiMic');
    if (!SR) {
      if (G.ui && G.ui.toast) G.ui.toast('Tu navegador no soporta dictado por voz. Probá con Chrome o Edge.', 'error');
      return;
    }
    if (listening) { stopRec(); return; }   // 2ª pulsación = dejar de escuchar (sin enviar)
    rec = new SR();
    rec.lang = 'es-ES';
    rec.interimResults = true;   // muestra en vivo
    rec.continuous = true;       // no corta en pausas breves
    rec.onstart = () => { listening = true; finalText = ''; mic.classList.add('ai-mic-on'); };
    rec.onresult = (e) => {
      const items = [];
      for (let i = 0; i < e.results.length; i++) items.push({ isFinal: e.results[i].isFinal, transcript: e.results[i][0].transcript });
      const bt = buildTranscript(items);
      finalText = bt.final;
      input.value = bt.combined;
      resetSilenceTimer();
    };
    rec.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') { /* ignorar: es normal */ }
      else if (G.ui && G.ui.toast) G.ui.toast('Error de dictado: ' + (e.error || 'desconocido'), 'error');
      stopRec();
    };
    rec.onend = () => {
      listening = false;
      clearTimeout(silenceTimer);
      mic.classList.remove('ai-mic-on');
      /* NO se envía automáticamente: el envío es manual con el botón ➤ */
    };
    try { rec.start(); } catch (e) { listening = false; mic.classList.remove('ai-mic-on'); }
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
  function spanishVoices() {
    try {
      const vs = window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
      return vs.filter(v => /^es/i.test(v.lang));
    } catch (e) { return []; }
  }
  /* Puntúa la voz: nativas (Argentina/España/México/Latam) primero */
  function voiceRank(v) {
    const l = (v.lang || '').toLowerCase();
    if (/es[-_]ar/.test(l)) return 0;
    if (/es[-_]es/.test(l)) return 1;
    if (/es[-_]mx|es[-_]419/.test(l)) return 2;
    if (/es[-_]us/.test(l)) return 3;
    return 4;
  }
  /* Género inferido del nombre de la voz (para el selector) */
  function voiceGender(v) {
    const n = (v.name || '').toLowerCase();
    if (/(helena|laura|sabina|paulina|monica|soledad|esperanza|maria|marta|carmen|luciana|valentina|sara|female|mujer)/.test(n)) return 'Femenina';
    if (/(pablo|jorge|diego|carlos|juan|miguel|andres|raul|javier|pedro|male|hombre)/.test(n)) return 'Masculina';
    return '';
  }
  function voiceLabel(v) {
    const base = (v.name || '').replace(/Microsoft |Google /gi, '').replace(/\s*\(.*\)/, '').trim() || v.lang || 'Voz';
    const g = voiceGender(v);
    return base + (g ? ' · ' + g : '');
  }
  function populateVoices() {
    const sel = document.getElementById('aiVoiceSel');
    if (!sel) return;
    let vs = spanishVoices();
    if (!vs.length) { sel.hidden = true; return; }
    sel.hidden = false;
    vs = vs.slice().sort((a, b) => voiceRank(a) - voiceRank(b) || (a.name || '').localeCompare(b.name || ''));
    sel.innerHTML = vs.map(v =>
      '<option value="' + esc(v.name) + '"' + (v.name === voicePref ? ' selected' : '') + '>' + esc(voiceLabel(v)) + '</option>'
    ).join('');
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
      const clean = String(text)
        .replace(/\[\[accion:[^\]]+\]\]/g, '')
        .replace(/\*\*(.+?)\*\*/g, '$1')
        .replace(/<[^>]+>/g, '')
        .replace(/[#*_`]/g, '')
        .trim();
      if (!clean) return;
      const u = new SpeechSynthesisUtterance(clean);
      u.lang = 'es-ES';
      u.rate = 1.0;
      u.pitch = 1.0;
      const voices = spanishVoices().slice().sort((a, b) => voiceRank(a) - voiceRank(b));
      let es = null;
      if (voicePref) es = voices.find(v => v.name === voicePref);
      if (!es) es = voices[0] || null;   // mejor voz nativa disponible
      if (es) u.voice = es;
      u.onstart = () => { speaking = true; updateStopBtn(); };
      u.onend = () => { speaking = false; updateStopBtn(); };
      u.onerror = () => { speaking = false; updateStopBtn(); };
      window.speechSynthesis.speak(u);
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
        const desc = c.concepto || c.categoria || 'Gasto';
        const cat = c.categoria || 'General';
        const autoId = autoWorkId();
        const workId = c.obra ? findId(d.works, c.obra, x => x.name) : autoId;
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
        S.add('employees', { firstName: fn, lastName: ln, phone: c.telefono || '', paymentData: '', hourlyRate: 0, active: true, notes: '', photo: null });
        return { ok: true, label: 'empleado ' + (fn + ' ' + ln).trim() };
      }
      if (mod === 'obra') {
        const name = c.nombre || '';
        if (!name) return null;
        if (G.plan && G.plan.checkLimit && G.plan.checkLimit('obras') === false) return null;
        const clientId = c.cliente ? findId((d.contacts || []).filter(x => x.type === 'cliente'), c.cliente, x => x.name) : null;
        S.add('works', { name, code: (S.nextCode ? S.nextCode('OB', 'works') : ''), clientId: clientId || null, location: '', status: 'activa', budgetTotal: 0, advanceFisico: 0, startDate: today, endDate: '', description: '' });
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
    } catch (e) { return null; }
    return null;
  }

  /* Auto-apertura de modales + pre-completado de campos detectados por la IA */
  function execFormAction(action) {
    const mod = (action && action.modulo) || '';
    const c = (action && action.campos) || {};

    /* 1) Si hay datos suficientes, GUARDAR directo y sincronizar */
    const saved = saveViaStore(mod, c);
    if (saved && saved.ok) {
      try { if (G.sync && G.sync.push) G.sync.push(G.store.data); } catch (e) {}
      return { saved: true, label: saved.label };
    }

    /* 2) Sino, abrir el modal y pre-completar */
    const d = G.store.data || {};
    const setVal = (sel, val) => {
      if (val === undefined || val === null || val === '') return;
      const el = document.querySelector(sel);
      if (el) { el.value = val; try { el.dispatchEvent(new Event('input', { bubbles: true })); } catch (e) {} }
    };
    const findId = (list, name, keyFn) => {
      if (!name) return '';
      const n = String(name).toLowerCase().trim();
      const hit = (list || []).find(x => keyFn(x).toLowerCase().trim() === n);
      return hit ? hit.id : '';
    };
    const clientId = findId((d.contacts || []).filter(x => x.type === 'cliente'), c.cliente, x => x.name);
    const workId = findId(d.works, c.obra, x => x.name);
    const empId = findId(d.employees, c.empleado, x => ((x.firstName || '') + ' ' + (x.lastName || '')).trim());
    const nombre = c.nombre || '';

    try {
      switch (mod) {
        case 'empleado': {
          if (G.actions.employee) G.actions.employee();
          const fn = c.nombre ? (c.apellido ? c.nombre : String(c.nombre).split(/\s+/)[0]) : '';
          const ln = c.apellido || (c.nombre ? String(c.nombre).split(/\s+/).slice(1).join(' ') : '');
          setVal('#fFirst', fn);
          setVal('#fLast', ln);
          break;
        }
        case 'obra':
          if (G.actions.work) G.actions.work(null, { clientId });
          setVal('#fName', nombre);
          setVal('#fLoc', c.ubicacion || c.direccion);
          setVal('#fBudget', c.presupuesto);
          break;
        case 'cliente':
          if (G.actions.client) G.actions.client();
          setVal('#fName', nombre);
          break;
        case 'presupuesto':
          if (G.actions.budget) G.actions.budget(null, { name: nombre || c.concepto || '', clientId, workId });
          break;
        case 'gasto':
          if (G.actions.expense) G.actions.expense({ type: c.obra ? 'obra' : 'general', workId: workId || undefined, amount: c.monto || undefined, description: c.concepto || c.categoria || '', category: c.categoria || undefined });
          break;
        case 'ingreso':
          if (G.actions.income) G.actions.income({ amount: c.monto || undefined, concept: c.concepto || '' });
          break;
        case 'jornada':
          if (G.actions.attendance) G.actions.attendance({ employeeId: empId, workId });
          if (c.horas) setVal('[data-k="hours"]', c.horas);
          break;
      }
      setOpen(false);   // contraer el chat para dejar ver el formulario (móvil)
    } catch (e) { /* si algo falla, el modal ya quedó abierto */ }
    return { saved: false };
  }

  function setOpen(v) {
    document.getElementById('aiPanel').hidden = !v;
    if (v) { refreshGreeting(); input.focus(); }
    else { stopVoice(); }   // cierre limpio: cancela TTS y libera el micrófono
  }
  function toggle() { setOpen(document.getElementById('aiPanel').hidden); }

  function refreshGreeting() {
    if (builtMode === currentMode()) return;
    log.innerHTML = '';
    addGreeting();
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
    log.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => {
      const fn = ACTION_KEYS[b.dataset.act];
      if (fn) { fn(); setOpen(false); }
    }));
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
    log.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => {
      const fn = ACTION_KEYS[b.dataset.act];
      if (fn) { fn(); setOpen(false); }
    }));
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
     interpretamos la orden con patrones simples (monto + gasto/ingreso). */
  function localIntent(text) {
    const t = String(text || '').toLowerCase();
    const kind = /gasto|gast[ée]|pagu[ée]|compr[ée]|comprar/.test(t) ? 'gasto'
      : /ingreso|cobr[ée]|cobro|anticipo|adelanto|certificaci/.test(t) ? 'ingreso'
      : null;
    if (!kind) return null;
    const m = t.match(/(\d{1,3}(?:[.,]\d{3})+|\d{4,})(?:[.,]\d+)?/);
    if (!m) return null;
    const monto = Number(m[0].replace(/\./g, '').replace(',', '.'));
    if (!(monto > 0)) return null;
    const campos = { monto };
    if (kind === 'gasto') {
      const cat = t.match(/(material|combustible|nafta|mano de obra|jornal|flete|subcontrat|sueldo)/);
      if (cat) campos.categoria = cat[1];
    } else {
      campos.concepto = /anticipo|adelanto/.test(t) ? 'Adelanto' : 'Cobro';
    }
    return { modulo: kind, campos };
  }

  /* Llamada a la Edge Function: 2 intentos (1 reintento por fallo de red) con
     timeout de 25s y backoff de 1s. Antes hacía 3×30s y dejaba al usuario
     "pensando" casi 2 minutos. */
  async function callAI(payload) {
    const sess = G.auth.getSession();
    const url = G.auth.SUPABASE_URL + '/functions/v1/ai-assistant';
    let lastErr = null;
    for (let i = 0; i < 2; i++) {
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), 25000);
      try {
        const r = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': G.auth.SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + sess.accessToken },
          body: JSON.stringify(payload),
          signal: ctrl.signal,
        });
        clearTimeout(to);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return await r.json();
      } catch (e) {
        clearTimeout(to);
        lastErr = e;
        if (i < 1) await new Promise(res => setTimeout(res, 1000));
      }
    }
    throw lastErr || new Error('Sin respuesta');
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
    const pend = bubble('Pensando…', 'bot');
    log.appendChild(pend);
    log.scrollTop = log.scrollHeight;
    const sess = G.auth.getSession();
    if (!sess) { pend.innerHTML = 'Necesitás iniciar sesión para usar el asistente.'; busy = false; return; }
    const payload = { message: msg, context: context(), mode: isAdminMode() ? 'admin' : 'usuario' };

    callAI(payload)
      .then(data => {
        const replyText = data.reply || data.error || 'Sin respuesta.';
        if (data.action) setFocus(data.action.modulo, data.action.campos);
        const res = data.action ? execFormAction(data.action) : null;
        if (res && res.saved) {
          const txt = '✅ Listo, guardé ' + res.label;
          pend.innerHTML = renderText(txt);
          speak(txt);
          if (G.ui && G.ui.toast) G.ui.toast('Guardado: ' + res.label, 'success');
        } else {
          pend.innerHTML = renderText(replyText);
          speak(replyText);
        }
        const acts = parseActions(data.reply || '');
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
      })
      .catch((err) => {
        /* Respaldo local: si la IA falla (pico/timeout), interpretamos la orden
           y ejecutamos la acción más probable sin romper la experiencia. */
        const local = localIntent(msg);
        if (local && local.campos && local.campos.monto > 0) {
          const res = execFormAction(local);
          if (res && res.saved) {
            const txt = '✅ Listo, guardé ' + res.label;
            pend.innerHTML = renderText(txt);
            speak(txt);
            if (G.ui && G.ui.toast) G.ui.toast('Guardado: ' + res.label, 'success');
          } else {
            pend.innerHTML = renderText('Entendí tu pedido, pero necesito que confirmes unos datos en el formulario.');
          }
        } else {
          pend.innerHTML = (err && err.name === 'AbortError')
            ? '⏳ El asistente tardó más de lo esperado. Probá de nuevo en unos segundos.'
            : '😅 Estoy con un pico de consultas. Podés seguir cargando desde los botones del menú.';
        }
      })
      .finally(() => { busy = false; log.scrollTop = log.scrollHeight; });
  }

  function init() {
    try { build(); maybeWelcome(); } catch (e) {}
  }

  G.ai = { init, open: () => setOpen(true), cleanInput, removeRepeatedPhrases, prepareMessage, buildTranscript };
})(typeof window !== 'undefined' ? window : globalThis);
