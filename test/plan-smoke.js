/* Prueba del módulo de planes/roles/límites (plan.js) contra el mock local */
'use strict';
global.window = global;
const mem = {};
global.localStorage = { getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: k => { delete mem[k]; } };
require('../js/auth.js');
require('../js/sync.js');
require('../js/plan.js');
require('../js/store.js');
const A = global.GADU.auth, P = global.GADU.plan, G = global.GADU;
const UID = 'u-admin@test.com';
G.store.load();

(async () => {
  try {
    A.override('http://localhost:9333', 'test-anon');
    await A.login('admin@test.com', 'secreto123');
    await P.load();
    if (!P.isAdmin()) throw new Error('admin@test.com debería ser admin');
    if (!Array.isArray(P.planes) || P.planes.length !== 3) throw new Error('catálogo de planes no cargó (3 planes)');
    console.log('roles/planes OK · isAdmin=true · 3 planes');

    // Límite con plan free (1 obra activa)
    await G.api('PATCH', '/profiles?user_id=eq.' + encodeURIComponent(UID), { plan_id: 'free' });
    await P.load();
    if (P.currentPlan().limite_obras_activas !== 1) throw new Error('plan free debe limitar a 1 obra');
    G.store.data.works = [{ id: 'w1', status: 'activa' }];
    if (!P.wouldExceed('obras')) throw new Error('con 1 obra activa y plan free debería exceder');
    if (P.checkLimit('obras') !== false) throw new Error('checkLimit debería bloquear y devolver false');
    console.log('límite free OK · bloquea la 2ª obra activa');

    // Sin límite con plan pro
    await G.api('PATCH', '/profiles?user_id=eq.' + encodeURIComponent(UID), { plan_id: 'pro' });
    await P.load();
    if (P.wouldExceed('obras')) throw new Error('plan pro no debería exceder con 1 obra');
    console.log('límite pro OK · no bloquea');

    // Auditoría
    await P.log('prueba', 'acción de prueba');
    console.log('auditoría OK');

    // Métricas vía RPC
    const m = await G.api('POST', '/rpc/metricas');
    if (typeof m.obras !== 'number' || typeof m.usuarios !== 'number') throw new Error('metricas() inválida');
    console.log('métricas OK · usuarios=' + m.usuarios + ' · obras=' + m.obras);

    console.log('✔ PLAN SMOKE TEST PASADO');
    process.exit(0);
  } catch (e) {
    console.error('✘ FALLO:', e.message);
    process.exit(1);
  }
})();
