/* Prueba del motor de sincronización contra un PostgREST simulado */
'use strict';
const http = require('http');

/* ---------- Mock de Supabase/PostgREST ---------- */
let stored = null;
const rows = new Map();
const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'apikey, authorization, content-type, prefer, range');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  if (req.url.includes('/app_data')) {
    if (req.method === 'PATCH' || req.method === 'POST') {
      let body = '';
      req.on('data', c => { body += c; });
      req.on('end', () => {
        const row = JSON.parse(body);
        stored = row;
        rows.set(row.id, row);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify([row]));
      });
      return;
    }
    if (req.method === 'GET') {
      const idMatch = req.url.match(/id=eq\.([^&]+)/);
      const selectMatch = req.url.match(/select=([^&]+)/);
      if (idMatch) {
        const row = rows.get(decodeURIComponent(idMatch[1]));
        if (!row) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('[]'); return; }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify([{ data: row.data, updated_at: row.updated_at }]));
        return;
      }
      if (selectMatch && selectMatch[1] === 'id') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('[]');
        return;
      }
      res.writeHead(404); res.end('{}'); return;
    }
    res.writeHead(404); res.end('{}'); return;
  }
  res.writeHead(404); res.end('{}');
});

server.listen(9333, async () => {
  try {
    global.window = global;
    require('../js/sync.js');
    const S = global.GADU.sync;
    const cfg = { url: 'http://localhost:9333', anonKey: 'test-anon-key', code: 'prueba-2026' };

    const t = await S.test(cfg);
    if (!t) throw new Error('test() falló');
    console.log('test() OK (endpoint responde)');

    const datos = { settings: { company: 'GADU' }, works: [{ id: 'w1', name: 'Obra sync' }] };
    await S.push(cfg, datos);
    console.log('push() OK · fila guardada:', stored.id);

    const remoto = await S.pull(cfg);
    if (!remoto || !remoto.data || remoto.data.works[0].name !== 'Obra sync') throw new Error('pull() no devolvió lo subido');
    console.log('pull() OK · datos idénticos a los subidos');

    const vacio = await S.pull({ url: 'http://localhost:9333', anonKey: 'x', code: 'codigo-inexistente' });
    if (vacio !== null) throw new Error('pull() debería devolver null sin datos');
    console.log('pull() sin datos OK (null)');

    let err = null;
    try { await S.test({ url: 'http://localhost:9333', anonKey: 'x' }); } catch (e) { err = e; }
    if (!err) throw new Error('test() debería fallar sin código');
    console.log('validación de configuración OK');

    console.log('✔ SYNC SMOKE TEST PASADO');
  } catch (e) {
    console.error('✘ FALLO:', e.message);
    process.exit(1);
  } finally {
    server.close();
  }
});
