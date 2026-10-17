/* ============================================================
   GADU · Vista: Directorio de contactos (Recursos Humanos)
   Clientes, proveedores, subcontratistas y contactos generales
   con accesos directos (teléfono, WhatsApp, e-mail).
   Migración limpia desde la vieja Agenda: usa la MISMA
   colección `contacts` del store (ningún registro se borra).
   ============================================================ */
(function (root) {
  'use strict';
  const G = root.GADU, S = G.store, UI = G.ui;
  const state = { q: '', type: 'todos', modo: 'cards' };

  G.router.add('directorio', 'directorio', 'Directorio de contactos', 'Clientes, proveedores, subcontratistas y contactos generales', render);

  const TYPES = {
    cliente: ['Cliente', 'info'],
    proveedor: ['Proveedor', 'primary'],
    subcontratista: ['Subcontratista', 'violet'],
    socio: ['Socio', 'success'],
  };

  function filtered() {
    const q = state.q.toLowerCase();
    return S.data.contacts.slice().sort((a, b) => a.name.localeCompare(b.name)).filter(c => {
      const hay = (c.name + ' ' + (c.company || '') + ' ' + (c.address || '') + ' ' + (c.notes || '')).toLowerCase();
      return (state.type === 'todos' || c.type === state.type) && (!q || hay.includes(q));
    });
  }

  function render(view) {
    const counts = {};
    S.CONTACT_TYPES.forEach(t => { counts[t] = S.data.contacts.filter(c => c.type === t).length; });

    view.innerHTML =
      '<div class="toolbar">' +
      '<div class="search">' + UI.icon('search', 16) + '<input id="fq" class="input" placeholder="Buscar por nombre, rubro o dirección…" value="' + UI.escapeHtml(state.q) + '"></div>' +
      '<div class="chips-row">' +
      chipBtn('todos', 'Todos (' + S.data.contacts.length + ')') +
      S.CONTACT_TYPES.map(t => chipBtn(t, TYPES[t][0] + ' (' + (counts[t] || 0) + ')')).join('') +
      '</div>' +
      '<div class="grow"></div>' +
      '<div class="seg" style="display:flex;gap:4px;background:var(--surface-2);border-radius:10px;padding:3px">' +
      '<button class="btn btn-sm ' + (state.modo === 'cards' ? 'btn-primary' : 'btn-soft') + '" id="btnCards" title="Ver tarjetas">' + UI.icon('grid', 14) + ' Tarjetas</button>' +
      '<button class="btn btn-sm ' + (state.modo === 'lista' ? 'btn-primary' : 'btn-soft') + '" id="btnList" title="Ver lista">' + UI.icon('menu', 14) + ' Lista</button>' +
      '</div>' +
      '<button class="btn btn-primary" id="btnNew">' + UI.icon('plus', 16) + 'Nuevo contacto</button>' +
      '</div>' +
      '<div id="listWrap">' + listHTML(filtered()) + '</div>';

    view.querySelector('#fq').addEventListener('input', e => { state.q = e.target.value; updateList(view); });
    view.querySelector('#btnNew').addEventListener('click', () => openContactModal());
    const syncToggle = () => {
      view.querySelector('#btnCards').className = 'btn btn-sm ' + (state.modo === 'cards' ? 'btn-primary' : 'btn-soft');
      view.querySelector('#btnList').className = 'btn btn-sm ' + (state.modo === 'lista' ? 'btn-primary' : 'btn-soft');
    };
    view.querySelector('#btnCards').addEventListener('click', () => { state.modo = 'cards'; syncToggle(); updateList(view); });
    view.querySelector('#btnList').addEventListener('click', () => { state.modo = 'lista'; syncToggle(); updateList(view); });
    UI.on(view, '[data-type]', 'click', e => {
      state.type = e.currentTarget.dataset.type;
      view.querySelectorAll('[data-type]').forEach(b => b.classList.toggle('active', b.dataset.type === state.type));
      updateList(view);
    });
    bindList(view.querySelector('#listWrap'));
  }

  function chipBtn(type, label) {
    return '<button class="chip-btn' + (state.type === type ? ' active' : '') + '" data-type="' + type + '">' + label + '</button>';
  }

  function updateList(view) {
    const wrap = view.querySelector('#listWrap');
    wrap.innerHTML = listHTML(filtered());
    bindList(wrap);
  }

  function listHTML(list) {
    if (!list.length) {
      return '<div class="card">' + UI.emptyState('book', 'No hay contactos que coincidan', 'Probá con otra búsqueda o categoría.') + '</div>';
    }
    /* Modo lista: tabla ordenada de TODOS los contactos filtrados */
    if (state.modo === 'lista') {
      return '<div class="card table-card">' +
        '<div class="table-wrap"><table class="data-table">' +
        '<thead><tr><th>Nombre</th><th>Tipo</th><th>Empresa / rubro</th><th>Teléfono</th><th>E-mail</th><th class="num"></th></tr></thead>' +
        '<tbody>' +
        list.map(c => {
          const tl = TYPES[c.type] || ['', 'neutral'];
          return '<tr>' +
            '<td><strong>' + UI.escapeHtml(c.name) + '</strong></td>' +
            '<td>' + UI.chip(tl[0], tl[1]) + '</td>' +
            '<td>' + UI.escapeHtml(c.company || '—') + '</td>' +
            '<td>' + (c.phone
              ? '<a href="' + UI.telLink(c.phone) + '">' + UI.escapeHtml(c.phone) + '</a>'
              : '<span class="muted">—</span>') + (c.whatsapp && c.whatsapp !== c.phone ? '<br><a href="' + UI.waLink(c.whatsapp) + '" target="_blank" rel="noopener" class="muted small">' + UI.escapeHtml(c.whatsapp) + ' (WA)</a>' : '') + '</td>' +
            '<td>' + (c.email ? '<a href="mailto:' + UI.escapeHtml(c.email) + '">' + UI.escapeHtml(c.email) + '</a>' : '<span class="muted">—</span>') + '</td>' +
            '<td class="num"><div class="row-actions" style="justify-content:flex-end">' +
            '<a class="icon-btn sm" href="' + UI.waLink(c.whatsapp || c.phone) + '" target="_blank" rel="noopener" title="WhatsApp">' + UI.icon('whatsapp', 15) + '</a>' +
            '<button class="icon-btn sm" data-edit="' + c.id + '" title="Editar">' + UI.icon('edit', 15) + '</button>' +
            '<button class="icon-btn sm danger" data-del="' + c.id + '" title="Eliminar">' + UI.icon('trash', 15) + '</button>' +
            '</div></td></tr>';
        }).join('') +
        '</tbody></table></div>' +
        '<div class="table-foot"><span>' + list.length + ' contacto' + (list.length !== 1 ? 's' : '') + '</span></div></div>';
    }
    /* Modo tarjetas (actual) */
    return '<div class="cards-grid">' + list.map(contactCard).join('') + '</div>';
  }

  function contactCard(c) {
    const tl = TYPES[c.type] || ['', 'neutral'];
    const chips = UI.chip(tl[0], tl[1]);
    const pct = c.type === 'socio' && c.percent ? UI.chip(c.percent + '% participación', 'primary', 'percent') : '';
    return '<article class="contact-card" data-id="' + c.id + '">' +
      '<div class="contact-head">' +
      UI.avatar(c.name, 42, c.photo) +
      '<div class="contact-info"><strong>' + UI.escapeHtml(c.name) + '</strong>' +
      '<span>' + UI.escapeHtml(c.company || '—') + '</span></div>' +
      '</div>' +
      '<div class="contact-chips">' + chips + pct + '</div>' +
      (c.address ? '<div class="contact-address">' + UI.icon('map-pin', 13) + UI.escapeHtml(c.address) + '</div>' : '') +
      '<div class="contact-actions">' +
      '<a class="icon-btn sm" href="' + UI.telLink(c.phone) + '" title="Llamar: ' + UI.escapeHtml(c.phone || '') + '">' + UI.icon('phone', 15) + '</a>' +
      '<a class="icon-btn sm" href="' + UI.waLink(c.whatsapp || c.phone) + '" target="_blank" rel="noopener" title="WhatsApp">' + UI.icon('whatsapp', 15) + '</a>' +
      (c.email ? '<a class="icon-btn sm" href="mailto:' + UI.escapeHtml(c.email) + '" title="' + UI.escapeHtml(c.email) + '">' + UI.icon('mail', 15) + '</a>' : '') +
      '<div class="spacer"></div>' +
      '<button class="icon-btn sm" data-edit="' + c.id + '" title="Editar">' + UI.icon('edit', 15) + '</button>' +
      '<button class="icon-btn sm danger" data-del="' + c.id + '" title="Eliminar">' + UI.icon('trash', 15) + '</button>' +
      '</div></article>';
  }

  function bindList(wrap) {
    UI.on(wrap, '[data-edit]', 'click', e => openContactModal(S.data.contacts.find(c => c.id === e.target.closest('[data-edit]').dataset.edit)));
    UI.on(wrap, '[data-del]', 'click', async e => {
      const c = S.data.contacts.find(x => x.id === e.target.closest('[data-del]').dataset.del);
      if (!c) return;
      const ok = await UI.confirm({ title: 'Eliminar contacto', message: '¿Eliminar a <strong>' + UI.escapeHtml(c.name) + '</strong> del directorio?', okLabel: 'Eliminar' });
      if (ok) { S.remove('contacts', c.id); UI.toast('Contacto eliminado'); G.router.refresh(); }
    });
  }

  function openContactModal(c) {
    const isEdit = !!c;
    let photo = c ? (c.photo || null) : null;
    const m = UI.openModal({
      title: isEdit ? 'Editar contacto' : 'Nuevo contacto',
      size: 'wide',
      body:
        '<div class="grid-form">' +
        '<div class="field"><label>Foto</label><div id="photoSlot"></div></div>' +
        '<div class="field"><label>Contacto</label><button type="button" class="btn btn-soft btn-sm" id="btnImportContact" style="margin-top:6px">📇 Importar desde contactos</button></div>' +
        '<div class="field"><label>Tipo *</label><select class="select" id="fType">' +
        S.CONTACT_TYPES.map(t => '<option value="' + t + '"' + (c && c.type === t ? ' selected' : '') + '>' + TYPES[t][0] + '</option>').join('') +
        '</select></div>' +
        '<div class="field"><label>Nombre / razón social *</label><input class="input" id="fName" value="' + UI.escapeHtml(c ? c.name : '') + '" placeholder="Nombre y apellido"></div>' +
        '<div class="field"><label>Empresa / rubro</label><input class="input" id="fCompany" value="' + UI.escapeHtml(c ? c.company : '') + '" placeholder="Ej.: Corralón, electricista…"></div>' +
        '<div class="field"><label>Teléfono</label><input class="input" id="fPhone" value="' + UI.escapeHtml(c ? c.phone : '') + '" placeholder="+54 9 3547 …"></div>' +
        '<div class="field"><label>WhatsApp</label><input class="input" id="fWa" value="' + UI.escapeHtml(c ? c.whatsapp : '') + '" placeholder="Si difiere del teléfono"></div>' +
        '<div class="field"><label>E-mail</label><input class="input" id="fEmail" value="' + UI.escapeHtml(c ? c.email : '') + '" placeholder="correo@ejemplo.com"></div>' +
        '<div class="field span-2"><label>Dirección</label><input class="input" id="fAddr" value="' + UI.escapeHtml(c ? c.address : '') + '" placeholder="Calle, barrio, ciudad"></div>' +
        '<div class="field span-2"><label>Notas</label><textarea class="textarea" id="fNotes" rows="2" placeholder="Condiciones de pago, referencias…">' + UI.escapeHtml(c ? c.notes : '') + '</textarea></div>' +
        '<div class="field span-2" id="socioFields" hidden>' +
        '<div class="grid-form">' +
        '<div class="field"><label>Participación (%)</label><input class="input" type="number" id="fPercent" min="0" max="100" value="' + (c && c.percent != null ? c.percent : '') + '" placeholder="0"></div>' +
        '<div class="field"><label>Estado</label><select class="select" id="fActive">' +
        '<option value="1"' + (!c || c.active !== false ? ' selected' : '') + '>Activo</option>' +
        '<option value="0"' + (c && c.active === false ? ' selected' : '') + '>Inactivo</option>' +
        '</select></div></div></div>' +
        '</div>',
      footer: '<button class="btn btn-ghost" data-cancel>Cancelar</button><button class="btn btn-primary" data-save>' + (isEdit ? 'Guardar cambios' : 'Agregar contacto') + '</button>',
    });

    const syncSocio = () => {
      m.panel.querySelector('#socioFields').hidden = m.panel.querySelector('#fType').value !== 'socio';
    };
    m.panel.querySelector('#fType').addEventListener('change', syncSocio);
    syncSocio();

    const renderPhoto = () => {
      const box = m.panel.querySelector('#photoSlot');
      box.innerHTML = '';
      box.appendChild(UI.photoField(photo, url => { photo = url; renderPhoto(); }));
    };
    renderPhoto();

    m.panel.querySelector('#btnImportContact').addEventListener('click', async () => {
      try {
        const cc = await UI.pickContact();
        if (!cc) return;
        if (cc.name) m.panel.querySelector('#fName').value = cc.name;
        if (cc.phone) m.panel.querySelector('#fPhone').value = cc.phone;
        if (cc.email) m.panel.querySelector('#fEmail').value = cc.email;
        UI.toast('Datos del contacto cargados', 'info');
      } catch (err) {
        UI.toast((err && err.message) || 'No se pudo importar el contacto', 'error');
      }
    });

    m.panel.querySelector('[data-cancel]').addEventListener('click', m.close);
    m.panel.querySelector('[data-save]').addEventListener('click', () => {
      const name = m.panel.querySelector('#fName').value.trim();
      if (!name) { UI.toast('Ingresá el nombre del contacto', 'error'); return; }
      const type = m.panel.querySelector('#fType').value;
      const payload = {
        type,
        name,
        company: m.panel.querySelector('#fCompany').value.trim(),
        phone: m.panel.querySelector('#fPhone').value.trim(),
        whatsapp: m.panel.querySelector('#fWa').value.trim(),
        email: m.panel.querySelector('#fEmail').value.trim(),
        address: m.panel.querySelector('#fAddr').value.trim(),
        notes: m.panel.querySelector('#fNotes').value.trim(),
        photo: photo || null,
      };
      if (type === 'socio') {
        payload.percent = Math.max(0, Math.min(100, UI.readNum(m.panel.querySelector('#fPercent'))));
        payload.active = m.panel.querySelector('#fActive').value === '1';
      }
      /* Validación de duplicados: por teléfono o nombre exacto */
      const normName = name.toLowerCase().replace(/\s+/g, ' ').trim();
      const phoneDigits = (payload.phone || '').replace(/\D/g, '');
      const dup = S.data.contacts.find(x => x.id !== (c && c.id) && (
        (phoneDigits && String(x.phone || '').replace(/\D/g, '') === phoneDigits) ||
        String(x.name || '').toLowerCase().replace(/\s+/g, ' ').trim() === normName
      ));
      if (dup) {
        UI.toast('Ya existe el contacto "' + dup.name + '" con ese nombre o teléfono', 'error');
        return;
      }

      if (isEdit) {
        S.update('contacts', c.id, payload);
        UI.toast('Contacto actualizado');
      } else {
        S.add('contacts', payload);
        UI.toast('Contacto agregado al directorio');
      }
      m.close();
      G.router.refresh();
    });
  }
})(typeof window !== 'undefined' ? window : globalThis);
