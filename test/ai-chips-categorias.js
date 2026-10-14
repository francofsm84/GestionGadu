/* Regresión: toda pregunta categórica del asistente despliega sus chips táctiles */
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
const labelsOf = t => AI.inlineOptionsFor(t).map(o => o.label);
const sendsOf = t => AI.inlineOptionsFor(t).map(o => o.send);

S.load();
S.startEmpty();

/* 1 · Concepto de ingreso (Cobro / Adelanto / Certificación) */
const c1 = AI.inlineOptionsFor('¿Qué concepto querés cargar? ¿Cobro, adelanto o certificación?');
okk(c1.length === 3 && ['Cobro', 'Adelanto', 'Certificación'].every(x => labelsOf('¿Qué concepto querés cargar? ¿Cobro, adelanto o certificación?').includes(x)), 'concepto de ingreso → 3 chips');
okk(sendsOf('¿Qué concepto querés cargar? ¿Cobro, adelanto o certificación?').includes('concepto Cobro'), 'envío explícito "concepto Cobro"');

/* 2 · Tipo de movimiento */
const c2 = labelsOf('¿Querés cargar un ingreso o un gasto?');
okk(c2.includes('💰 Ingreso') && c2.includes('💸 Gasto'), 'ingreso o gasto → 2 chips');

/* 3 · Tipo de gasto */
const c3 = labelsOf('¿El gasto es de obra o general?');
okk(c3.includes('🏗️ Gasto de obra') && c3.includes('📋 Gasto general'), 'gasto de obra o general → 2 chips');

/* 4 · Confirmaciones ya NO generan chips genéricos Sí/No:
   solo se muestran opciones directamente relacionadas al contexto */
const c4 = AI.inlineOptionsFor('¿Confirmás la carga del gasto?');
okk(c4.length === 0, 'confirmación → sin chips genéricos Sí/No (opciones contextuales únicamente)');

/* 5 · Preguntas numéricas NO llevan chips */
okk(AI.inlineOptionsFor('¿De cuánto es el monto?').length === 0, 'pregunta numérica → sin chips');

/* 6 · Regresiones previas intactas */
const c5 = labelsOf('¿Qué categoría es?');
okk(c5.includes('Herramientas / Equipamiento'), 'categoría → chips del store');
S.data.works = [{ id: 'w1', name: 'casa angel camara', code: 'OB-2026-004', status: 'activa' }];
const c6 = labelsOf('¿A qué obra corresponde?');
okk(c6.length > 0, 'obra → chips de obras');

console.log('\n──────────────────────────');
if (ko === 0) { console.log('✔ AI CHIPS CATEGÓRICOS PASADO (' + ok + ' checks)'); process.exit(0); }
else { console.log('✘ ' + ko + ' fallos de ' + (ok + ko)); process.exit(1); }
