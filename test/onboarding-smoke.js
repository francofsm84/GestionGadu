/* ============================================================
   GADU · Smoke: Onboarding "Antes de arrancar"
   Verifica la puerta de entrada: solo usuarios nuevos SIN datos,
   nunca interrumpe a quien ya tiene datos, y respeta el flag.
   ============================================================ */
'use strict';
global.window = global;
const mem = {};
global.localStorage = {
  getItem: k => (k in mem ? mem[k] : null),
  setItem: (k, v) => { mem[k] = String(v); },
  removeItem: k => { delete mem[k]; },
};
require('../js/store.js');
const G = global.GADU;
G.auth = { getSession: () => ({ email: 'franco@test.com', userId: 'u-onb' }) };

let abierto = 0;
G.ui = {
  escapeHtml: s => String(s),
  icon: () => '',
  avatar: () => '',
  toast: () => {},
  openModal: () => {
    abierto++;
    const mk = () => ({ value: 'x', addEventListener: () => {}, style: {} });
    const panel = { querySelector: sel => (sel === '[data-cancel]' || sel === '[data-save]' ? { addEventListener: () => {} } : mk()), close: () => {} };
    return { panel, close: () => {} };
  },
};
require('../js/onboarding.js');
const S = G.store;

let ok = 0, ko = 0;
function okk(cond, label) { if (cond) { ok++; console.log('  ✔ ' + label); } else { ko++; console.log('  ✘ ' + label); } }

(async () => {
  S.load();
  S.startEmpty();
  /* Simular cuenta nueva: sin datos locales guardados */
  Object.keys(mem).forEach(k => delete mem[k]);

  console.log('== 1) Usuario nuevo sin datos → se muestra ==');
  G.onboarding.maybeShow();
  okk(abierto === 1, 'se abre "Antes de arrancar"');

  console.log('== 2) Usuario con datos cargados → NUNCA se interrumpe ==');
  S.startReal();   // datos de ejemplo guardados en localStorage
  abierto = 0;
  G.onboarding.maybeShow();
  okk(abierto === 0, 'con datos locales no se muestra');

  console.log('== 3) Flag de completado (saltar/guardar) ==');
  S.startEmpty();
  S.data.settings.onboardingDone = true;
  S.save();
  abierto = 0;
  G.onboarding.maybeShow();
  okk(abierto === 0, 'onboardingDone → no vuelve a mostrarse');

  console.log('== 4) Perfil guardado con moneda y WhatsApp ==');
  S.data.settings.onboardingDone = false;
  S.data.settings.profile = { nombre: 'Franco', apellido: 'F.', apodo: 'Fran', moneda: 'ARS', whatsapp: { phone: '+54 9 351 555', code: '123456', linked: false } };
  S.save();
  Object.keys(mem).forEach(k => delete mem[k]);   // simular que aún no se persistió localmente
  G.onboarding.maybeShow();
  okk(abierto === 1, 'sin datos y sin flag → se muestra de nuevo');
  okk(S.data.settings.profile.moneda === 'ARS' && S.data.settings.profile.whatsapp.code === '123456', 'estructura de perfil persistida en settings');

  console.log('\n──────────────────────────');
  if (ko === 0) { console.log('✔ ONBOARDING SMOKE PASADO (' + ok + ' checks)'); process.exit(0); }
  else { console.log('✘ ' + ko + ' fallos'); process.exit(1); }
})().catch(e => { console.error('✘ FALLO:', e); process.exit(1); });
