/* Verificador de integración: clases CSS usadas por las vistas */
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'css', 'styles.css'), 'utf8');

// Recolecta JS de todas las vistas
const jsFiles = [];
(function walk(dir) {
  fs.readdirSync(dir).forEach(f => {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) walk(p);
    else if (p.endsWith('.js')) jsFiles.push(fs.readFileSync(p, 'utf8'));
  });
})(path.join(root, 'js'));
const js = jsFiles.join('\n');

const classes = new Set();
// Clases estáticas: class="a b c" en strings literales
const re = /class="([^"+$]+)"/g;
let m;
while ((m = re.exec(js)) !== null) {
  m[1].split(/\s+/).forEach(c => { if (/^[a-z][a-z0-9-]*$/.test(c)) classes.add(c); });
}
// Clases dinámicas conocidas (concatenaciones con tonos fijos)
['success', 'danger', 'warning', 'info', 'violet', 'primary', 'neutral'].forEach(t => {
  classes.add('chip-' + t);
  classes.add('kpi-' + t);
});
['activa', 'pausada', 'finalizada'].forEach(t => classes.add('dot-' + t));
['primary', 'soft', 'soft-success', 'soft-danger', 'danger', 'ghost', 'sm', 'xs', 'block'].forEach(t => classes.add('btn-' + t));
['success', 'error', 'info'].forEach(t => classes.add('toast-' + t));
['modal', 'modal-wide'].forEach(c => classes.add(c));

const missing = [];
classes.forEach(c => {
  const esc = c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (!new RegExp('\\.' + esc + '(?![a-zA-Z0-9_-])').test(css)) missing.push(c);
});

console.log('Clases únicas verificadas:', classes.size);
if (missing.length) {
  console.log('FALTAN EN CSS:', missing.join(', '));
  process.exit(1);
}
console.log('✔ Todas las clases existen en styles.css');
