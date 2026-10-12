/* Auditoría: importación de contactos (VCF/CSV) y soporte de Contact Picker */
'use strict';
global.window = global;
const mem = {};
global.localStorage = { getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: k => { delete mem[k]; } };
global.document = { createElement: () => ({}) };
Object.defineProperty(global, 'navigator', { value: {}, configurable: true, writable: true });
require('../js/ui.js');
const UI = global.GADU.ui;

let ok = 0, ko = 0;
function okk(cond, label) { if (cond) { ok++; console.log('  ✔ ' + label); } else { ko++; console.log('  ✘ ' + label); } }

console.log('== 1) Soporte de Contact Picker ==');
okk(UI.contactsSupported() === false, 'sin navigator.contacts → no soportado (fallback)');
global.navigator.contacts = { select: () => {} };
okk(UI.contactsSupported() === true, 'con navigator.contacts.select → soportado (Android)');

console.log('== 2) Parser VCF ==');
const vcf = 'BEGIN:VCARD\nVERSION:3.0\nFN:Familia Rossi\nTEL;TYPE=CELL:+54 9 3547 55-1234\nEMAIL:familiarossi@gmail.com\nEND:VCARD';
const c1 = UI.parseVCF(vcf);
okk(c1.name === 'Familia Rossi' && c1.phone === '+54 9 3547 55-1234' && c1.email === 'familiarossi@gmail.com', 'FN + TEL + EMAIL correctos');

console.log('== 3) Parser CSV (Google y formatos simples) ==');
const g = 'Name,Given Name,Phone 1 - Value,E-mail 1 - Value\nFamilia Rossi,,+54 9 3547 55-1234,fr@gmail.com';
const c2 = UI.parseCSV(g);
okk(c2.name === 'Familia Rossi' && c2.phone === '+54 9 3547 55-1234' && c2.email === 'fr@gmail.com', 'CSV formato Google Contacts');
const s = 'Nombre;Telefono;Correo\nFamilia Rossi;+5493547551234;fr@x.com';
const c3 = UI.parseCSV(s);
okk(c3.name === 'Familia Rossi' && c3.phone === '+5493547551234' && c3.email === 'fr@x.com', 'CSV simple con ; y tildes');
const vacio = UI.parseCSV('solo encabezado');
okk(vacio.name === '' && vacio.phone === '' && vacio.email === '', 'CSV sin registros → vacío');

console.log('\n──────────────────────────');
if (ko === 0) { console.log('✔ CONTACTOS AUDIT PASADO (' + ok + ' checks)'); process.exit(0); }
else { console.log('✘ AUDIT: ' + ko + ' fallos de ' + (ok + ko)); process.exit(1); }
