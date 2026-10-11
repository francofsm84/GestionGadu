/* ============================================================
   GADU · Utilidades de UI (iconos, modales, toasts, helpers)
   ============================================================ */
(function (root) {
  'use strict';
  const G = root.GADU = root.GADU || {};
  const UI = {};

  /* ---------- Formateo ---------- */
  const NF = new Intl.NumberFormat('es-AR');
  const MF0 = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const MF2 = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2, maximumFractionDigits: 2 });

  UI.fmtMoney = (v, dec) => (dec ? MF2 : MF0).format(Number(v) || 0);
  UI.fmtNum = v => NF.format(Number(v) || 0);
  UI.fmtCompact = v => {
    const n = Number(v) || 0;
    const a = Math.abs(n);
    const s = n < 0 ? '-' : '';
    if (a >= 1e6) return s + '$' + (a / 1e6).toFixed(1).replace('.', ',') + ' M';
    if (a >= 1e3) return s + '$' + Math.round(a / 1e3) + ' k';
    return s + '$' + NF.format(Math.round(a));
  };
  UI.parseISO = s => {
    if (!s) return null;
    const p = String(s).split('-');
    return new Date(+p[0], (+p[1] || 1) - 1, +p[2] || 1);
  };
  UI.fmtDate = s => { const d = UI.parseISO(s); return d ? d.toLocaleDateString('es-AR') : '—'; };
  UI.fmtDateShort = s => { const d = UI.parseISO(s); return d ? d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' }) : '—'; };
  UI.escapeHtml = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  UI.waLink = p => {
    const d = String(p || '').replace(/\D/g, '');
    if (!d) return '#';
    return 'https://wa.me/' + (d.startsWith('54') ? d : '54' + d) + '?text=' + encodeURIComponent('Hola, te escribo de GADU Construye.');
  };
  UI.telLink = p => 'tel:' + String(p || '').replace(/[^\d+]/g, '');
  UI.readNum = el => {
    let v = String(el.value || '').trim();
    if (/^\d{1,3}(\.\d{3})+$/.test(v)) v = v.replace(/\./g, '');
    const n = Number(v.replace(',', '.'));
    return isNaN(n) ? 0 : n;
  };
  UI.signClass = v => (Number(v) >= 0 ? 'pos' : 'neg');
  UI.download = (filename, content, mime) => {
    const blob = new Blob([content], { type: mime || 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  };
  UI.copyText = text => {
    const done = () => UI.toast('Copiado: ' + text, 'info');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(() => {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); done(); } catch (e) { UI.toast('No se pudo copiar', 'error'); }
        ta.remove();
      });
    } else {
      UI.toast('Copiá manualmente: ' + text, 'info');
    }
  };

  /* ---------- Iconos SVG (sin dependencias) ---------- */
  const ICONS = {
    'grid': '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
    'hard-hat': '<path d="M2 18a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1z"/><path d="M10 10V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5"/><path d="M4 15v-3a6 6 0 0 1 6-6"/><path d="M14 6a6 6 0 0 1 6 6v3"/>',
    'file-text': '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/>',
    'trending-up': '<path d="M23 6l-9.5 9.5-5-5L1 18"/><path d="M17 6h6v6"/>',
    'receipt': '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1z"/><path d="M14 8H8"/><path d="M14 12H8"/><path d="M10 16h4"/>',
    'users': '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    'wrench': '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
    'book': '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
    'database': '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>',
    'plus': '<path d="M12 5v14"/><path d="M5 12h14"/>',
    'search': '<circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>',
    'x': '<path d="M18 6L6 18"/><path d="M6 6l12 12"/>',
    'check': '<path d="M20 6L9 17l-5-5"/>',
    'check-circle': '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/>',
    'chevron-left': '<path d="M15 18l-6-6 6-6"/>',
    'chevron-right': '<path d="M9 18l6-6-6-6"/>',
    'chevrons-left': '<path d="M11 17l-5-5 5-5"/><path d="M18 17l-5-5 5-5"/>',
    'menu': '<path d="M3 6h18"/><path d="M3 12h18"/><path d="M3 18h18"/>',
    'sun': '<circle cx="12" cy="12" r="5"/><path d="M12 1v2"/><path d="M12 21v2"/><path d="M4.22 4.22l1.42 1.42"/><path d="M18.36 18.36l1.42 1.42"/><path d="M1 12h2"/><path d="M21 12h2"/><path d="M4.22 19.78l1.42-1.42"/><path d="M18.36 5.64l1.42-1.42"/>',
    'moon': '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>',
    'calendar': '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/>',
    'phone': '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>',
    'mail': '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 7l-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
    'edit': '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>',
    'trash': '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M10 11v6"/><path d="M14 11v6"/>',
    'download': '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/>',
    'upload': '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5"/><path d="M12 3v12"/>',
    'alert-triangle': '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    'info': '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
    'map-pin': '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
    'clock': '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    'arrow-up-right': '<path d="M7 17L17 7"/><path d="M7 7h10v10"/>',
    'arrow-down-left': '<path d="M17 7L7 17"/><path d="M17 17H7V7"/>',
    'truck': '<path d="M1 3h15v13H1z"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>',
    'eye': '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
    'copy': '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    'percent': '<path d="M19 5L5 19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>',
    'activity': '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
    'inbox': '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
    'layers': '<path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>',
    'zap': '<path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>',
    'box': '<path d="M21 8l-9-5-9 5v8l9 5 9-5V8z"/><path d="M3 8l9 5 9-5"/><path d="M12 13v8"/>',
    'user': '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    'briefcase': '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>',
    'log-out': '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>',
    'image': '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>',
    'camera': '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
    'calendar-plus': '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/><path d="M12 15v6"/><path d="M9 18h6"/>',
    'wallet': '<path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4z"/>',
  };
  const WA_PATH = 'M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413';

  UI.icon = (name, size) => {
    size = size || 18;
    if (name === 'whatsapp') {
      return '<svg class="icon" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="' + WA_PATH + '"/></svg>';
    }
    return '<svg class="icon" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[name] || '') + '</svg>';
  };

  /* ---------- Componentes ---------- */
  UI.avatar = (name, size, photo) => {
    size = size || 36;
    if (photo) {
      return '<span class="avatar" style="width:' + size + 'px;height:' + size + 'px"><img class="avatar-img" src="' + photo + '" alt=""></span>';
    }
    const initials = String(name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
    let hash = 0;
    for (const ch of initials) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
    const hue = hash % 360;
    return '<span class="avatar" style="width:' + size + 'px;height:' + size + 'px;font-size:' + Math.round(size * 0.36) + 'px;background:hsl(' + hue + ' 42% 36%)">' + UI.escapeHtml(initials) + '</span>';
  };

  /* ---------- Fotos: cámara / galería (persisten en el registro) ---------- */
  UI.downscaleImage = (file, cb) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        try {
          const max = 320;
          const s = Math.min(1, max / Math.max(img.width, img.height));
          const w = Math.max(1, Math.round(img.width * s));
          const h = Math.max(1, Math.round(img.height * s));
          const cv = document.createElement('canvas');
          cv.width = w; cv.height = h;
          cv.getContext('2d').drawImage(img, 0, 0, w, h);
          cb(cv.toDataURL('image/jpeg', 0.82));
        } catch (e) { cb(String(reader.result)); }
      };
      img.onerror = () => cb(String(reader.result));
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  };

  /* Campo de foto: preview + galería + cámara + quitar */
  UI.photoField = (photo, onUpdate) => {
    const wrap = document.createElement('div');
    wrap.className = 'photo-field';
    wrap.innerHTML =
      '<div class="photo-preview">' + (photo ? '<img src="' + photo + '" alt="Foto">' : UI.icon('user', 26)) + '</div>' +
      '<div class="photo-actions">' +
      '<button type="button" class="btn btn-soft btn-sm" data-gallery>' + UI.icon('image', 14) + ' Galería</button>' +
      '<button type="button" class="btn btn-soft btn-sm" data-camera>' + UI.icon('camera', 14) + ' Cámara</button>' +
      (photo ? '<button type="button" class="btn btn-ghost btn-sm" data-remove>' + UI.icon('trash', 13) + ' Quitar</button>' : '') +
      '</div>';
    const load = capture => {
      const inp = document.createElement('input');
      inp.type = 'file';
      inp.accept = 'image/*';
      if (capture) inp.setAttribute('capture', 'environment');
      inp.style.display = 'none';
      document.body.appendChild(inp);
      inp.addEventListener('change', () => {
        const f = inp.files && inp.files[0];
        inp.remove();
        if (f) UI.downscaleImage(f, url => onUpdate(url));
      });
      inp.click();
    };
    wrap.querySelector('[data-gallery]').addEventListener('click', () => load(false));
    wrap.querySelector('[data-camera]').addEventListener('click', () => load(true));
    const rm = wrap.querySelector('[data-remove]');
    if (rm) rm.addEventListener('click', () => onUpdate(null));
    return wrap;
  };

  /* ---------- Importar desde la agenda del móvil (Contact Picker API) ---------- */
  UI.contactsSupported = () => !!(navigator.contacts && navigator.contacts.select);
  UI.pickContact = async () => {
    if (!UI.contactsSupported()) throw new Error('Tu navegador no permite importar contactos. Funciona en Android con Chrome.');
    const props = ['name', 'tel', 'email'];
    const picked = await navigator.contacts.select(props, { multiple: false });
    const c = picked && picked[0];
    if (!c) return null;
    return {
      name: (c.name && c.name.join(' ')) || '',
      phone: (c.tel && c.tel[0]) || '',
      email: (c.email && c.email[0]) || '',
    };
  };

  UI.chip = (text, tone, iconName) => '<span class="chip chip-' + tone + '">' + (iconName ? UI.icon(iconName, 13) : '') + '<span>' + UI.escapeHtml(text) + '</span></span>';

  UI.progress = (value, color) => {
    const v = Math.max(0, Math.min(100, Number(value) || 0));
    return '<div class="progress"><div class="progress-bar" style="width:' + v + '%;' + (color ? 'background:' + color : '') + '"></div></div>';
  };

  UI.emptyState = (iconName, title, hint, actionHtml) => (
    '<div class="empty">' +
    '<span class="empty-ico">' + UI.icon(iconName || 'inbox', 30) + '</span>' +
    '<h4>' + UI.escapeHtml(title || 'Sin resultados') + '</h4>' +
    (hint ? '<p>' + UI.escapeHtml(hint) + '</p>' : '') +
    (actionHtml || '') +
    '</div>'
  );

  UI.selectOptions = (opts, selected, withEmpty, emptyLabel) => {
    let html = withEmpty ? '<option value="">' + UI.escapeHtml(emptyLabel || '— Seleccionar —') + '</option>' : '';
    html += opts.map(o => '<option value="' + UI.escapeHtml(o.v) + '"' + (selected === o.v ? ' selected' : '') + '>' + UI.escapeHtml(o.l) + '</option>').join('');
    return html;
  };

  UI.on = (container, selector, evt, fn) => {
    container.querySelectorAll(selector).forEach(el => el.addEventListener(evt, fn));
  };

  /* ---------- Alta rápida de contactos dentro de formularios ---------- */
  UI.quickAdd = opts => (
    '<div class="select-with-add">' +
    '<select class="select" id="' + opts.id + '">' + (opts.options || '') + '</select>' +
    '<button type="button" class="icon-btn sm" data-quickadd="' + opts.id + '" title="' + UI.escapeHtml(opts.newTitle || 'Agregar nuevo') + '">' + UI.icon('plus', 14) + '</button>' +
    '</div>' +
    '<div class="quick-add-form" data-qaform="' + opts.id + '" hidden>' +
    '<input class="input" data-qaname placeholder="' + UI.escapeHtml(opts.namePlaceholder || 'Nombre y apellido…') + '">' +
    '<input class="input" data-qaphone placeholder="Teléfono (opcional)">' +
    '<button type="button" class="btn btn-primary btn-sm" data-qasave>' + UI.icon('check', 14) + 'Agregar</button>' +
    '<button type="button" class="btn btn-ghost btn-sm" data-qacancel>Cancelar</button>' +
    '</div>'
  );

  UI.bindQuickAdd = (container, opts) => {
    const S = G.store;
    const sel = container.querySelector('#' + opts.id);
    const btn = container.querySelector('[data-quickadd="' + opts.id + '"]');
    const form = container.querySelector('[data-qaform="' + opts.id + '"]');
    if (!sel || !btn || !form) return;
    btn.addEventListener('click', () => {
      form.hidden = !form.hidden;
      if (!form.hidden) form.querySelector('[data-qaname]').focus();
    });
    form.querySelector('[data-qacancel]').addEventListener('click', () => { form.hidden = true; });
    form.querySelector('[data-qasave]').addEventListener('click', () => {
      const name = form.querySelector('[data-qaname]').value.trim();
      if (!name) { UI.toast('Ingresá el nombre', 'error'); return; }
      const c = S.add('contacts', {
        type: opts.type || 'cliente',
        name,
        company: '',
        phone: form.querySelector('[data-qaphone]').value.trim(),
        whatsapp: '',
        email: '',
        address: '',
        notes: '',
      });
      UI.toast('"' + c.name + '" agregado a la agenda');
      sel.innerHTML = opts.refreshOptions(c.id);
      form.hidden = true;
      form.querySelector('[data-qaname]').value = '';
      form.querySelector('[data-qaphone]').value = '';
      if (opts.onAdded) opts.onAdded(c);
    });
  };

  /* ---------- Modal ---------- */
  UI.openModal = opts => {
    const rootEl = document.getElementById('modalRoot');
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML =
      '<div class="modal' + (opts.size === 'wide' ? ' modal-wide' : '') + '">' +
      '<div class="modal-head">' +
      '<div><h3>' + UI.escapeHtml(opts.title || '') + '</h3>' + (opts.subtitle ? '<p>' + UI.escapeHtml(opts.subtitle) + '</p>' : '') + '</div>' +
      '<button class="icon-btn" data-close aria-label="Cerrar">' + UI.icon('x') + '</button>' +
      '</div>' +
      '<div class="modal-body">' + (opts.body || '') + '</div>' +
      (opts.footer ? '<div class="modal-foot">' + opts.footer + '</div>' : '') +
      '</div>';
    const close = () => {
      overlay.remove();
      document.removeEventListener('keydown', esc);
    };
    const esc = e => { if (e.key === 'Escape') close(); };
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    overlay.querySelector('[data-close]').addEventListener('click', close);
    document.addEventListener('keydown', esc);
    rootEl.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('show'));
    return { overlay, panel: overlay.querySelector('.modal'), close };
  };

  UI.confirm = opts => new Promise(resolve => {
    const m = UI.openModal({
      title: opts.title || '¿Estás seguro?',
      body: '<p class="confirm-msg">' + (opts.message || '') + '</p>',
      footer: '<button class="btn btn-ghost" data-cancel>Cancelar</button>' +
              '<button class="btn ' + (opts.tone === 'danger' ? 'btn-danger' : 'btn-primary') + '" data-ok>' + (opts.okLabel || 'Eliminar') + '</button>',
    });
    m.panel.querySelector('[data-cancel]').addEventListener('click', () => { m.close(); resolve(false); });
    m.panel.querySelector('[data-ok]').addEventListener('click', () => { m.close(); resolve(true); });
  });

  /* ---------- Toast ---------- */
  UI.toast = (msg, type) => {
    type = type || 'success';
    const rootEl = document.getElementById('toastRoot');
    const t = document.createElement('div');
    t.className = 'toast toast-' + type;
    t.innerHTML = UI.icon(type === 'success' ? 'check-circle' : type === 'error' ? 'alert-triangle' : 'info') + '<span>' + UI.escapeHtml(msg) + '</span>';
    rootEl.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => {
      t.classList.remove('show');
      setTimeout(() => t.remove(), 300);
    }, 3200);
  };

  /* ---------- CSV ---------- */
  UI.csv = (filename, rows) => {
    const esc = v => {
      v = String(v == null ? '' : v);
      return /[";\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
    };
    const csv = '\ufeff' + rows.map(r => r.map(esc).join(';')).join('\r\n');
    UI.download(filename, csv, 'text/csv;charset=utf-8');
  };

  G.ui = UI;
})(typeof window !== 'undefined' ? window : globalThis);
