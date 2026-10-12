/* Auditoría: selector de voces latinoamericanas (filtrado, género, etiquetas) */
'use strict';
global.window = global;
const mem = {};
global.localStorage = { getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: k => { delete mem[k]; } };
global.speechSynthesis = {
  getVoices: () => [
    { name: 'Microsoft Sabina Online (Natural) - Spanish (Argentina)', lang: 'es-AR' },
    { name: 'Microsoft Pablo Online (Natural) - Spanish (UnitedStates)', lang: 'es-US' },
    { name: 'Microsoft Jorge Online (Natural) - Spanish (Mexico)', lang: 'es-MX' },
    { name: 'Google español de México', lang: 'es-MX' },
    { name: 'Google español de Argentina', lang: 'es-AR' },
    { name: 'Google español de Colombia', lang: 'es-CO' },
    { name: 'Microsoft Helena - Spanish (Spain)', lang: 'es-ES' },
  ],
};
require('../js/store.js');
const G = global.GADU;
G.plan = { profile: {}, currentPlan: () => ({ nombre: 'Free' }), trialDaysLeft: () => 14, checkLimit: () => true };
G.sync = { push: () => {} };
G.auth = { getSession: () => null };
G.actions = {};
require('../js/ai.js');
const AI = G.ai;

let ok = 0, ko = 0;
function okk(cond, label) { if (cond) { ok++; console.log('  ✔ ' + label); } else { ko++; console.log('  ✘ ' + label); } }

console.log('== 1) Filtrado latinoamericano (excluye España) ==');
const vs = AI.spanishVoices();
okk(vs.length === 6, '6 voces latinas (es-ES excluida), got ' + vs.length);
okk(!vs.some(v => /es[-_]es/i.test(v.lang)), 'ninguna voz de España');

console.log('== 2) Detección de género ==');
okk(AI.voiceGender(vs.find(v => /sabina/i.test(v.name))) === 'Femenina', 'Sabina → Femenina');
okk(AI.voiceGender(vs.find(v => /pablo/i.test(v.name))) === 'Masculina', 'Pablo → Masculina');
okk(AI.voiceGender(vs.find(v => /jorge/i.test(v.name))) === 'Masculina', 'Jorge → Masculina');
okk(AI.voiceGender(vs.find(v => v.name === 'Google español de México')) === '', 'genérica sin género');

console.log('== 3) Etiquetas descriptivas ==');
const sab = AI.voiceLabel(vs.find(v => /sabina/i.test(v.name)));
okk(sab.indexOf('Español latino · Femenina') === 0 && sab.indexOf('Argentina') > 0, 'Sabina → "Español latino · Femenina — Argentina…"');
const pab = AI.voiceLabel(vs.find(v => /pablo/i.test(v.name)));
okk(pab.indexOf('Español latino · Masculina') === 0, 'Pablo → "Español latino · Masculina…"');

console.log('== 4) Ranking (Argentina primero) ==');
const orden = vs.slice().sort((a, b) => AI.voiceRank(a) - AI.voiceRank(b));
okk(/es[-_]ar/i.test(orden[0].lang), 'primera voz ordenada es de Argentina');

console.log('\n──────────────────────────');
if (ko === 0) { console.log('✔ VOZ LATINA AUDIT PASADO (' + ok + ' checks)'); process.exit(0); }
else { console.log('✘ AUDIT: ' + ko + ' fallos de ' + (ok + ko)); process.exit(1); }
