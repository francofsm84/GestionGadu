/* Regresión: botones de selección de obras del chat — nunca "undefined"
   y etiqueta "nombre - código" (ej. "casa angel camara - OB-2026-004"). */
'use strict';
global.window = global;
const mem = {};
global.localStorage = { getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: k => { delete mem[k]; } };
require('../js/store.js');
const G = global.GADU;
G.plan = { profile: {}, currentPlan: () => ({ nombre: 'Free' }), trialDaysLeft: () => 14, checkLimit: () => true };
G.sync = { push: () => {} };
G.auth = { getSession: () => null };
G.actions = {};
require('../js/ai.js');
const S = G.store;
const AI = G.ai;

let ok = 0, ko = 0;
function okk(cond, label) { if (cond) { ok++; console.log('  ✔ ' + label); } else { ko++; console.log('  ✘ ' + label); } }

S.load();
S.startEmpty();
S.data.works = [
  { id: 'w1', name: 'casa angel camara', code: 'OB-2026-004', status: 'activa' },
  { id: 'w2', nombre: 'quinta lopez', code: 'OB-2026-002', status: 'activa' },
  { id: 'w3', titulo: 'galpon norte', code: 'OB-2026-007', status: 'activa' },
  { id: 'w4', nombreObra: 'pileta roca', code: 'OB-2026-009', status: 'activa' },
  { id: 'w5', name: 'undefined', code: 'OB-2026-011', status: 'activa' },
  { id: 'w6', status: 'activa' },
];

const opts = AI.inlineOptionsFor('¿A qué obra querés cargar el gasto?');
const labels = opts.map(o => o.label);
const sends = opts.map(o => o.send);

okk(labels.some(l => l === 'casa angel camara - OB-2026-004'), 'nombre + código exacto (casa angel camara - OB-2026-004)');
okk(labels.some(l => l === 'quinta lopez - OB-2026-002'), 'fallback nombre → quinta lopez');
okk(labels.some(l => l === 'galpon norte - OB-2026-007'), 'fallback titulo → galpon norte');
okk(labels.some(l => l === 'pileta roca - OB-2026-009'), 'fallback nombreObra → pileta roca');
okk(!labels.some(l => /undefined/i.test(l)), 'ninguna etiqueta contiene "undefined"');
okk(sends.includes('obra casa angel camara'), 'el envío usa el nombre real (se resuelve al id real de la obra)');

console.log('\n──────────────────────────');
if (ko === 0) { console.log('✔ AI OBRAS LABEL PASADO (' + ok + ' checks)'); process.exit(0); }
else { console.log('✘ ' + ko + ' fallos de ' + (ok + ko)); process.exit(1); }
