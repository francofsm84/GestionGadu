/* Prueba del módulo de planes/roles/límites/onboarding (plan.js) contra el mock local */
'use strict';
global.window = global;
const mem = {};
global.localStorage = { getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: k => { delete mem[k]; } };
require('../js/auth.js');
require('../js/sync.js');
require('../js/plan.js');
require('../js/store.js');
const A = global.GADU.auth, P = global.GADU.plan, G = global.GADU;
G.store.load();

function assert(cond, msg) { if (!cond) throw new Error(msg); }

(async () => {
  try {
    A.override('http://localhost:9333', 'test-anon');

    /* 1) Admin: roles, planes, trial de 45 días y blindaje absoluto */
    await A.login('admin@test.com', 'secreto123');
    await P.load();
    assert(P.isAdmin(), 'admin debería ser admin');
    assert(Array.isArray(P.planes) && P.planes.length === 4, 'catálogo de 4 planes');
    assert(P.profile.plan_id === 'empresa' && P.profile.subscription_status === 'active', 'admin arranca con plan máximo activo');
    console.log('roles/planes OK · admin = Empresa/activo · 4 planes');

    // intentar suspender/rebajar al admin → el blindaje lo fuerza a activo/Empresa
    await G.api('PATCH', '/profiles?user_id=eq.' + encodeURIComponent('u-admin@test.com'), {
      estado_cuenta: 'suspendido', subscription_status: 'past_due', plan_id: 'free',
      onboarding_completo: false, trial_ends_at: new Date(Date.now() - 86400000).toISOString(),
    });
    await P.load();
    assert(P.isAdmin(), 'admin sigue siendo admin');
    assert(P.profile.plan_id === 'empresa', 'blindaje: plan forzado a Empresa');
    assert(P.profile.estado_cuenta === 'activo' && P.profile.subscription_status === 'active', 'blindaje: estado forzado a activo');
    assert(!P.isLocked(), 'admin nunca bloqueado');
    assert(!P.needsOnboarding(), 'admin nunca pasa por onboarding');
    console.log('blindaje admin OK · suspendido/past_due/free → forzado a Empresa/activo/activo');

    /* 2) Límites con un usuario NORMAL (gestor_obra + Free) */
    await A.signup('gestor@test.com', 'clave123');
    await P.load();
    assert(!P.isAdmin(), 'gestor no es admin');
    assert(P.currentPlan().limite_obras_activas === 1, 'plan free limita a 1 obra');
    G.store.data.works = [{ id: 'w1', status: 'activa' }];
    assert(P.wouldExceed('obras'), '1 obra activa + free → excede');
    assert(P.checkLimit('obras') === false, 'checkLimit bloquea');
    await G.api('PATCH', '/profiles?user_id=eq.' + encodeURIComponent('u-gestor@test.com'), { plan_id: 'pro' });
    await P.load();
    assert(!P.wouldExceed('obras'), 'plan pro no excede con 1 obra');
    console.log('límites OK · free bloquea la 2ª obra, pro no');

    /* 3) Auditoría + métricas (admin) */
    await A.login('admin@test.com', 'secreto123');
    await P.load();
    await P.log('prueba', 'acción de prueba');
    const m = await G.api('POST', '/rpc/metricas');
    assert(typeof m.obras === 'number' && typeof m.usuarios === 'number', 'metricas() inválida');
    console.log('métricas + auditoría OK · usuarios=' + m.usuarios + ' · obras=' + m.obras);

    /* 4) Invitación pre-asignada + vinculación automática */
    await G.api('POST', '/invitaciones', { email: 'nuevo@test.com', rol: 'gestor_obra', plan_id: 'pyme', empresa: 'Nueva SA' });
    const invs = await G.api('GET', '/invitaciones');
    assert(invs.length, 'invitación no se guardó');
    await A.signup('nuevo@test.com', 'clave123');
    await P.load();
    assert(P.profile.plan_id === 'pyme' && P.profile.empresa === 'Nueva SA', 'invitación no se vinculó al primer login');
    console.log('invitación + vinculación OK');

    /* 5) Defaults usuario nuevo (Free + gestor + trialing + 45 días) */
    await A.signup('sininv@test.com', 'clave456');
    await P.load();
    assert(P.profile.rol === 'gestor_obra' && P.profile.plan_id === 'free' && P.profile.subscription_status === 'trialing', 'defaults de usuario nuevo incorrectos');
    const tdl = P.trialDaysLeft();
    assert(tdl >= 44 && tdl <= 45, 'trial debe ser de 45 días, got ' + tdl);
    console.log('defaults OK · free + gestor + trialing 45 días');

    /* 6) Onboarding obligatorio (usuario normal Free) */
    assert(P.needsOnboarding(), 'usuario free sin perfil debe requerir onboarding');
    await G.api('PATCH', '/profiles?user_id=eq.' + encodeURIComponent('u-sininv@test.com'), {
      telefono: '+54 3547 123456', direccion: 'Av. Belgrano 123', latitud: '-31.66', longitud: '-64.43',
      localidad: 'Argentina · Alta Gracia', empresa_constructora: 'Mi Empresa', rubro_principal: 'General',
      perfil_tipo: 'Contratista', obras_simultaneas: 2, tamano_equipo: '2 a 5 personas', onboarding_completo: true,
    });
    await P.load();
    assert(!P.needsOnboarding(), 'onboarding completado debería liberar');
    assert(P.profile.latitud === '-31.66' && P.profile.perfil_tipo === 'Contratista', 'datos enriquecidos no persistieron');
    console.log('onboarding OK · bloquea hasta completar y persiste');

    console.log('✔ PLAN SMOKE TEST PASADO');
    process.exit(0);
  } catch (e) {
    console.error('✘ FALLO:', e.message);
    process.exit(1);
  }
})();
