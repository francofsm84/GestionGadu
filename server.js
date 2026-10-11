/* ============================================================
   GADU · Servidor local (solo Node, sin dependencias)
   Uso:  node server.js          → http://localhost:8000
         node server.js 8080     → http://localhost:8080
         node server.js --abrir  → además abre el navegador solo
   ============================================================ */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');

const ROOT = __dirname;
const argvPort = process.argv.find(a => /^\d+$/.test(a));
const envPort = process.env.PORT && /^\d+$/.test(process.env.PORT) ? process.env.PORT : '';
const PORT = Number(envPort || argvPort || 8000);
/* 0.0.0.0 = disponible en la PC y en el celular (misma red Wi-Fi) */
const HOST = '0.0.0.0';

function lanIP() {
  const ifs = os.networkInterfaces();
  for (const name of Object.keys(ifs)) {
    for (const i of ifs[name] || []) {
      if (i.family === 'IPv4' && !i.internal && /^(192\.168|10\.|172\.(1[6-9]|2\d|3[01]))\./.test(i.address)) return i.address;
    }
  }
  return '';
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.md': 'text/plain; charset=utf-8',
};

const server = http.createServer((req, res) => {
  let p;
  try {
    p = decodeURIComponent((req.url || '/').split('?')[0].split('#')[0]);
  } catch (e) {
    res.writeHead(400); res.end('Solicitud inválida'); return;
  }
  if (p === '/') p = '/index.html';
  const file = path.normalize(path.join(ROOT, p));
  const rel = path.relative(ROOT, file);
  /* Se sirven los archivos de la raíz (index, logos, manifest, etc.) y los árboles css/ y js/ */
  const isRootFile = rel !== '' && !rel.includes(path.sep) && !rel.startsWith('..');
  const allowed = isRootFile || rel.startsWith('css' + path.sep) || rel.startsWith('js' + path.sep);
  if (!file.startsWith(ROOT + path.sep) || rel.startsWith('..') || path.isAbsolute(rel) || !allowed) {
    res.writeHead(403); res.end('Prohibido'); return;
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('No encontrado: ' + p);
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    res.end(data);
  });
});

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.log('El puerto ' + PORT + ' ya está en uso.');
    console.log('Probá con otro:  node server.js ' + (PORT + 1));
  } else {
    console.error('Error del servidor:', err.message);
  }
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  const ip = lanIP();
  console.log('');
  console.log('  GADU Construye · Dashboard');
  console.log('  En esta PC:      http://localhost:' + PORT);
  if (ip) console.log('  En el celular:   http://' + ip + ':' + PORT + '   (misma red Wi-Fi)');
  console.log('  (Dejá esta ventana abierta mientras usás la app. Cerrar = Ctrl+C)');
  console.log('');
  if (process.argv.includes('--abrir')) {
    exec('start "" "http://localhost:' + PORT + '"');
  }
});
