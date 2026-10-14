/* Auditoría: aislamiento de memoria del agente por usuario autenticado */
'use strict';
global.window = global;
const mem = {};
global.localStorage = { getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: k => { delete mem[k]; } };
require('../js/store.js');
const G = global.GADU;
G.plan = { profile: {}, currentPlan: () => ({ nombre: 'Free' }), trialDaysLeft: () => 14, checkLimit: () => true };
G.sync = { push: () => {} };
G.actions = {};
G.auth = { getSession: () => ({ user: { id: 'u1' } }) };
require('../js/ai.js');
const AI = G.ai;

let ok = 0, ko = 0;
function okk(cond, label) { if (cond) { ok++; console.log('  ✔ ' + label); } else { ko++; console.log('  ✘ ' + label); } }

console.log('== 1) Identificación del usuario en sesión ==');
okk(AI.getUid() === 'u1', 'detecta el id del usuario (s.user.id)');
G.auth.getSession = () => ({ userId: 'u2' });
okk(AI.getUid() === 'u2', 'detecta el id (formato s.userId)');
G.auth.getSession = () => null;
okk(AI.getUid() === null, 'sin sesión → null');

console.log('== 2) Memoria del agente segregada por usuario ==');
G.auth.getSession = () => ({ user: { id: 'u1' } });
AI.syncUser();
AI.rememberTurn('usuario', 'cárgame un empleado');
AI.rememberTurn('asistente', '¿Cómo se llama?');
const ctx1 = AI.context();
okk(ctx1.indexOf('cárgame un empleado') > -1, 'usuario 1 tiene su historial');

console.log('== 3) Cambio de cuenta → contexto limpio ==');
G.auth.getSession = () => ({ user: { id: 'u2' } });
AI.syncUser();
const ctx2 = AI.context();
okk(ctx2.indexOf('cárgame un empleado') === -1, 'el historial de u1 NO viaja a u2');

console.log('== 4) Bienvenida por usuario (onboarding segregado) ==');
okk(!mem['gadu_ai_onboarded_u2'] && !mem['gadu_ai_onboarded_u1'], 'claves de onboarding separadas por uid');

console.log('\n──────────────────────────');
if (ko === 0) { console.log('✔ AI AISLAMIENTO AUDIT PASADO (' + ok + ' checks)'); process.exit(0); }
else { console.log('✘ AUDIT: ' + ko + ' fallos de ' + (ok + ko)); process.exit(1); }
