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
    'new-obra': () => { if (G.actions.work) G.actions.work(); },
    'new-presupuesto': () => { if (G.actions.budget) G.actions.budget(); },
    'new-ingreso': () => { if (G.actions.income) G.actions.income(); },
    'new-gasto': () => { if (G.actions.expense) G.actions.expense(); },
  };

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

  let host = null, log = null, input = null, busy = false;

  function build() {
    if (document.getElementById('aiRoot')) return;
    host = document.createElement('div');
    host.id = 'aiRoot';
    host.innerHTML =
      '<button class="ai-fab" id="aiFab" title="Asistente GADU" aria-label="Asistente GADU">' +
      '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/></svg>' +
      '</button>' +
      '<div class="ai-panel" id="aiPanel" hidden>' +
      '<div class="ai-head"><strong>Asistente GADU</strong><span class="muted small">Te guío paso a paso</span>' +
      '<button class="icon-btn sm" id="aiClose">' + '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>' + '</button></div>' +
      '<div class="ai-log" id="aiLog"></div>' +
      '<div class="ai-foot"><input class="input" id="aiInput" placeholder="Preguntame… (ej. ¿cómo cargo una obra?)">' +
      '<button class="btn btn-primary btn-sm" id="aiSend">Enviar</button></div>' +
      '</div>';
    document.body.appendChild(host);
    log = document.getElementById('aiLog');
    input = document.getElementById('aiInput');
    document.getElementById('aiFab').addEventListener('click', toggle);
    document.getElementById('aiClose').addEventListener('click', () => setOpen(false));
    document.getElementById('aiSend').addEventListener('click', send);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') send(); });
    addGreeting();
  }

  function setOpen(v) {
    document.getElementById('aiPanel').hidden = !v;
    if (v) input.focus();
  }
  function toggle() { setOpen(document.getElementById('aiPanel').hidden); }

  function addGreeting() {
    log.appendChild(bubble(
      '¡Hola! 👋 Soy tu asistente GADU. Preguntame cómo cargar obras, gastos, presupuestos, empleados o lo que necesites.<br>' +
      '<div class="ai-actions"><button class="btn btn-soft btn-sm" data-q="¿Cómo creo una nueva obra?">Nueva obra</button>' +
      '<button class="btn btn-soft btn-sm" data-q="¿Cómo cargo un gasto?">Cargar gasto</button></div>',
      'bot'));
    log.querySelectorAll('[data-q]').forEach(b => b.addEventListener('click', () => { input.value = b.dataset.q; send(); }));
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
      body: JSON.stringify({ message: msg, context: context() }),
    })
      .then(r => r.json())
      .then(data => {
        pend.innerHTML = renderText(data.reply || data.error || 'Sin respuesta.');
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
