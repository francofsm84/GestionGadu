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

  let host = null, log = null, input = null, busy = false, builtMode = null, rec = null, listening = false, voiceOn = true;

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
      '<button class="icon-btn sm" id="aiVoice" title="Silenciar voz">🔊</button>' +
      '<button class="icon-btn sm" id="aiClose">' + '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>' + '</button></div>' +
      '<div class="ai-log" id="aiLog"></div>' +
      '<div class="ai-foot"><button class="ai-mic" id="aiMic" title="Dictar por voz" aria-label="Dictar por voz">🎙️</button>' +
      '<input class="input" id="aiInput" placeholder="Preguntame… (o tocá el micrófono y dictá)">' +
      '<button class="btn btn-primary btn-sm" id="aiSend">Enviar</button></div>' +
      '</div>';
    document.body.appendChild(host);
    log = document.getElementById('aiLog');
    input = document.getElementById('aiInput');
    document.getElementById('aiFab').addEventListener('click', toggle);
    document.getElementById('aiClose').addEventListener('click', () => setOpen(false));
    document.getElementById('aiSend').addEventListener('click', send);
    document.getElementById('aiMic').addEventListener('click', toggleMic);
    document.getElementById('aiVoice').addEventListener('click', toggleVoice);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') send(); });
    addGreeting();
    window.addEventListener('hashchange', refreshGreeting);
  }

  /* Dictado por voz (Web Speech API) */
  function toggleMic() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const mic = document.getElementById('aiMic');
    if (!SR) {
      if (G.ui && G.ui.toast) G.ui.toast('Tu navegador no soporta dictado por voz. Probá con Chrome o Edge.', 'error');
      return;
    }
    if (listening) { if (rec) rec.stop(); return; }
    rec = new SR();
    rec.lang = 'es-ES';
    rec.interimResults = false;
    rec.continuous = false;
    rec.onstart = () => { listening = true; mic.classList.add('ai-mic-on'); };
    rec.onresult = (e) => {
      let txt = '';
      for (let i = 0; i < e.results.length; i++) txt += e.results[i][0].transcript;
      input.value = input.value ? (input.value + ' ' + txt).trim() : txt;
    };
    rec.onerror = (e) => {
      if (G.ui && G.ui.toast) G.ui.toast('Error de dictado: ' + (e.error || 'desconocido'), 'error');
    };
    rec.onend = () => {
      listening = false;
      mic.classList.remove('ai-mic-on');
      if (input.value.trim()) send();   // al terminar de hablar, envía automáticamente
    };
    try { rec.start(); } catch (e) { listening = false; mic.classList.remove('ai-mic-on'); }
  }

  /* Texto a voz (Text-to-Speech) */
  function speak(text) {
    if (!voiceOn || !text) return;
    try {
      if (!window.speechSynthesis) return;
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
      const voices = window.speechSynthesis.getVoices();
      const es = voices.find(v => /es[-_]AR/i.test(v.lang)) || voices.find(v => /es[-_]ES/i.test(v.lang)) || voices.find(v => /^es/i.test(v.lang));
      if (es) u.voice = es;
      window.speechSynthesis.speak(u);
    } catch (e) {}
  }

  function toggleVoice() {
    voiceOn = !voiceOn;
    const b = document.getElementById('aiVoice');
    b.textContent = voiceOn ? '🔊' : '🔇';
    b.title = voiceOn ? 'Silenciar voz' : 'Activar voz';
    if (!voiceOn) { try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch (e) {} }
  }

  function setOpen(v) {
    document.getElementById('aiPanel').hidden = !v;
    if (v) { refreshGreeting(); input.focus(); }
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

  function send() {
    const msg = (input.value || '').trim();
    if (!msg || busy) return;
    busy = true;
    input.value = '';
    log.appendChild(bubble(renderText(msg), 'user'));
    const pend = bubble('Pensando…', 'bot');
    log.appendChild(pend);
    log.scrollTop = log.scrollHeight;
    const sess = G.auth.getSession();
    if (!sess) { pend.innerHTML = 'Necesitás iniciar sesión para usar el asistente.'; busy = false; return; }
    fetch(G.auth.SUPABASE_URL + '/functions/v1/ai-assistant', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': G.auth.SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + sess.accessToken,
      },
      body: JSON.stringify({ message: msg, context: context(), mode: isAdminMode() ? 'admin' : 'usuario' }),
    })
      .then(r => r.json())
      .then(data => {
        pend.innerHTML = renderText(data.reply || data.error || 'Sin respuesta.');
        speak(data.reply || data.error || '');
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
      .catch(() => {
        pend.innerHTML = '😅 No pude conectar con el asistente. Verificá que la Edge Function esté desplegada (' + G.auth.SUPABASE_URL + '/functions/v1/ai-assistant).';
      })
      .finally(() => { busy = false; log.scrollTop = log.scrollHeight; });
  }

  function init() {
    try { build(); } catch (e) {}
  }

  G.ai = { init, open: () => setOpen(true) };
})(typeof window !== 'undefined' ? window : globalThis);
