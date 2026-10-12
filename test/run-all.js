/* ============================================================
   GADU · Ejecuta TODAS las pruebas de una sola vez
   - sync-smoke levanta SU PROPIO mock (puerto 9333) y lo cierra.
   - plan-smoke necesita el mock externo (mock-supabase.js).
   Por eso: primero corren las pruebas sin mock externo, y recién
   después se arranca el mock para plan-smoke.
   Uso: node test/run-all.js
   ============================================================ */
'use strict';
const { spawn } = require('child_process');
const path = require('path');
const net = require('net');

const MOCK_PORT = 9333;

// Pruebas que NO requieren el mock externo (sync-smoke se auto-aloja)
const noMock = [
  'store-smoke.js',
  'sync-smoke.js',
  'ai-smoke.js',
  'gadux-scenario.js',
  'gadux-simulation.js',
  'licencia-smoke.js',
  'css-check.js',
];

// Pruebas que SÍ requieren el mock externo en 9333
const withMock = ['plan-smoke.js'];

function portInUse(port) {
  return new Promise(resolve => {
    const s = net.connect(port, '127.0.0.1', () => { s.destroy(); resolve(true); });
    s.on('error', () => resolve(false));
  });
}

function run(file) {
  return new Promise(resolve => {
    const p = spawn('node', [file], { stdio: 'inherit' });
    p.on('close', code => resolve(code == null ? 1 : code));
    p.on('error', err => { console.error('No se pudo lanzar ' + file + ':', err.message); resolve(1); });
  });
}

(async () => {
  const root = path.join(__dirname, '..');
  const t0 = Date.now();
  let failed = 0;
  let mock = null;

  // 1) Pruebas sin mock externo
  for (const f of noMock) {
    console.log('\n═══════════ ' + f + ' ═══════════');
    const code = await run(path.join(__dirname, f));
    if (code !== 0) { failed++; console.error('✘ ' + f + ' FALLÓ'); }
  }

  // 2) Pruebas con mock externo
  for (const f of withMock) {
    console.log('\n═══════════ ' + f + ' (mock) ═══════════');
    const busy = await portInUse(MOCK_PORT);
    if (busy) {
      console.log('⚠️  Puerto ' + MOCK_PORT + ' ya en uso: reutilizo el mock existente.');
    } else {
      mock = spawn('node', [path.join(__dirname, 'mock-supabase.js')], { stdio: 'ignore', cwd: root });
      await new Promise(r => setTimeout(r, 1200));
    }
    const code = await run(path.join(__dirname, f));
    if (code !== 0) { failed++; console.error('✘ ' + f + ' FALLÓ'); }
    if (mock) { try { mock.kill(); } catch (e) {} mock = null; }
  }

  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  console.log('\n─────────────────────────────────────────');
  if (failed === 0) console.log('✅ TODAS LAS PRUEBAS PASARON (' + secs + 's)');
  else console.log('✘ ' + failed + ' prueba(s) FALLARON');
  console.log('─────────────────────────────────────────');
  process.exit(failed === 0 ? 0 : 1);
})();
