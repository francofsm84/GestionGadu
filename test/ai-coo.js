/* Auditoría: COO Virtual (Super Admin) — parser de comandos + guarda de rol */
'use strict';
global.window = global;
const mem = {};
global.localStorage = { getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: k => { delete mem[k]; } };
require('../js/store.js');
const G = global.GADU;
G.plan = { profile: {}, currentPlan: () => ({ nombre: 'Free' }), trialDaysLeft: () => 14, checkLimit: () => true, planes: [{ id: 'free', nombre: 'Free' }, { id: 'pro', nombre: 'Pro' }, { id: 'pyme', nombre: 'Pyme' }, { id: 'empresa', nombre: 'Empresa' }], isAdmin: () => false };
G.sync = { push: () => {} };
G.auth = { getSession: () => null };
G.actions = {};
require('../js/ai.js');
const AI = G.ai;

let ok = 0, ko = 0;
function okk(cond, label) { if (cond) { ok++; console.log('  ✔ ' + label); } else { ko++; console.log('  ✘ ' + label); } }

console.log('== 1) Parser de comandos del COO ==');
okk(JSON.stringify(AI.adminIntent('Cambiá el plan de Constructora Test SA a Pro')) === JSON.stringify({ tipo: 'plan', target: 'constructora test sa', plan: 'pro' }), 'cambio de plan');
okk(JSON.stringify(AI.adminIntent('cambiá el plan de Constructora Test SA a enterprise')) === JSON.stringify({ tipo: 'plan', target: 'constructora test sa', plan: 'empresa' }), 'enterprise → empresa');
okk(JSON.stringify(AI.adminIntent('Dale 30 días más a notif')) === JSON.stringify({ tipo: 'trial', dias: 30, target: 'notif' }), 'extensión de prueba (30 días)');
okk(JSON.stringify(AI.adminIntent('Suspendé a Constructora Test SA')) === JSON.stringify({ tipo: 'estado', estado: 'suspendido', target: 'constructora test sa' }), 'suspender cuenta');
okk(JSON.stringify(AI.adminIntent('Activá a Constructora Test SA')) === JSON.stringify({ tipo: 'estado', estado: 'activo', target: 'constructora test sa' }), 'activar cuenta');
okk(JSON.stringify(AI.adminIntent('¿Cuánto es el MRR?')) === JSON.stringify({ tipo: 'metricas' }), 'métricas (MRR)');
okk(JSON.stringify(AI.adminIntent('auditoría')) === JSON.stringify({ tipo: 'auditoria' }), 'auditoría');
okk(JSON.stringify(AI.adminIntent('cuentas por vencer')) === JSON.stringify({ tipo: 'vencer' }), 'cuentas por vencer');
okk(JSON.stringify(AI.adminIntent('Registrá un nuevo usuario')) === JSON.stringify({ tipo: 'alta' }), 'alta express');
okk(AI.adminIntent('cargar un gasto de 5000') === null, 'comando de obra NO es comando COO');

console.log('== 2) Normalización de planes ==');
okk(AI.normPlan('enterprise') === 'empresa', 'enterprise → empresa');
okk(AI.normPlan('Pro') === 'pro', 'Pro → pro');

console.log('== 3) Guarda de rol (exclusivo Super Admin) ==');
okk(AI.esSuperAdmin() === false, 'rol NO admin → comandos bloqueados');
G.plan.isAdmin = () => true;
okk(AI.esSuperAdmin() === true, 'rol admin → comandos habilitados');

console.log('== 4) Wizard de alta express ==');
okk(AI.ADMIN_WIZARD_STEPS.length === 4, '4 pasos (email, empresa, plan, período)');
okk(AI.ADMIN_WIZARD_STEPS.some(s => s.key === 'plan' && s.plansList === true), 'plan con botones de G.plan.planes');

console.log('\n──────────────────────────');
if (ko === 0) { console.log('✔ COO VIRTUAL AUDIT PASADO (' + ok + ' checks)'); process.exit(0); }
else { console.log('✘ AUDIT: ' + ko + ' fallos de ' + (ok + ko)); process.exit(1); }
