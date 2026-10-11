/* Mock de Supabase/PostgREST para pruebas locales (puerto 9333) */
'use strict';
const http = require('http');
const rows = new Map();
const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'apikey, authorization, content-type, prefer, range');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  if (req.url.includes('/app_data')) {
    if (req.method === 'PATCH') {
      let body = '';
      req.on('data', c => { body += c; });
      req.on('end', () => {
        try {
          const row = JSON.parse(body);
          rows.set(row.id, row);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify([row]));
        } catch (e) { res.writeHead(400); res.end('{}'); }
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
server.listen(9333, () => console.log('Mock Supabase escuchando en http://localhost:9333'));
