/* ============================================================
   GADU · Vista: Deudas y Cuotas
   Deudas varias (personales / empresa / obra) separadas de las
   obras. Progreso de cuotas, monto restante y pago por cuota.
   ============================================================ */
(function (root) {
  'use strict';
  const G = root.GADU, S = G.store, UI = G.ui;
  const state = { q: '', f: 'todas' };

  G.router.add('deudas', 'deudas', 'Deudas y Cuotas', 'Financiación personal y de la empresa: progreso y pagos en cuotas', render);
  G.actions.deuda = () => openDeudaModal();

  const TIPO_ICON = { 'Personal': 'user', 'Empresa': 'briefcase', 'Obra': 'hard-hat' };
  const TIPO_TONE = { 'Personal': 'violet', 'Empresa': 'info', 'Obra': 'success' };

  function restante(d) {
    const porCuota = Number(d.montoPorCuota) || 0;
    const faltan = Math.max(0, (Number(d.cuotasTotales) || 0) - (Number(d.cuotaActual) || 0) + 1);
    return faltan * porCuota;
  }

  /* Avanza una fecha exactamente N meses (clampa el día al fin de mes si no existe) */
  function addMonths(dateStr, n) {
    const parts = String(dateStr || '').split('-').map(Number);
    if (parts.length !== 3 || !parts[0]) return dateStr;
    const target = new Date(parts[0], parts[1] - 1 + n, 1);
    const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
    const newDay = Math.min(parts[2], lastDay);
    return target.getFullYear() + '-' + String(target.getMonth() + 1).padStart(2, '0') + '-' + String(newDay).padStart(2, '0');
  }

  function list() {
    const q = state.q.toLowerCase();
    return S.data.debts.slice().filter(d => {
      if (state.f === 'Finalizadas') return d.finalizada && (!q || d.concepto.toLowerCase().includes(q));
      if (d.finalizada) return false;
      const matchF = state.f === 'todas' || (state.f === d.tipo);
      const hay = (d.concepto + ' ' + d.tipo).toLowerCase();
      return matchF && (!q || hay.includes(q));
    }).sort((a, b) => String(a.fechaVencimiento || '').localeCompare(String(b.fechaVencimiento || '')));
  }

  function render(view) {
    const activas = S.data.debts.filter(d => !d.finalizada);
    const totalDeuda = activas.reduce((s, d) => s + restante(d), 0);
    const porVencer = activas.filter(d => {
      const days = Math.ceil((new Date(d.fechaVencimiento + 'T00:00:00') - new Date()) / 86400000);
      return days >= 0 && days <= 7;
    }).length;
    view.innerHTML =
      '<section class="kpi-grid kpi-3">' +
      kpi('wallet', 'violet', 'Deuda restante', UI.fmtMoney(totalDeuda), activas.length + ' deuda(s) activa(s)') +
      kpi('clock', 'info', 'Cuotas activas', String(activas.reduce((s, d) => s + (Math.max(0, (Number(d.cuotasTotales) || 0) - (Number(d.cuotaActual) || 0) + 1)), 0)), 'Cuotas pendientes de pago') +
      kpi('calendar', porVencer ? 'warning' : 'success', 'Vencen en 7 días', String(porVencer), porVencer ? 'Revisá los próximos vencimientos' : 'Sin vencimientos próximos') +
      '</section>' +
      '<div class="toolbar">' +
      '<div class="search">' + UI.icon('search', 16) + '<input id="fq" class="input" placeholder="Buscar por concepto o tipo…" value="' + UI.escapeHtml(state.q) + '"></div>' +
      '<select id="ff" class="select" style="max-width:200px">' +
      '<option value="todas"' + (state.f === 'todas' ? ' selected' : '') + '>Todas</option>' +
      '<option value="Personal"' + (state.f === 'Personal' ? ' selected' : '') + '>Personal</option>' +
      '<option value="Empresa"' + (state.f === 'Empresa' ? ' selected' : '') + '>Empresa</option>' +
      '<option value="Obra"' + (state.f === 'Obra' ? ' selected' : '') + '>Obra</option>' +
      '<option value="Finalizadas"' + (state.f === 'Finalizadas' ? ' selected' : '') + '>Finalizadas</option>' +
      '</select>' +
      '<div class="grow"></div>' +
      '<button class="btn btn-primary" id="btnNew">' + UI.icon('plus', 16) + 'Nueva Deuda</button>' +
      '</div>' +
      '<div id="listWrap">' + listHTML(list()) + '</div>';

    view.querySelector('#fq').addEventListener('input', e => { state.q = e.target.value; updateList(view); });
    view.querySelector('#ff').addEventListener('change', e => { state.f = e.target.value; updateList(view); });
    view.querySelector('#btnNew').addEventListener('click', () => openDeudaModal());
    bindList(view.querySelector('#listWrap'));
  }

  function kpi(icon, tone, label, value, sub) {
    return '<div class="kpi-card">' +
      '<span class="kpi-ico kpi-' + tone + '">' + UI.icon(icon, 20) + '</span>' +
      '<div class="kpi-body">' +
      '<span class="kpi-label">' + label + '</span>' +
      '<strong class="kpi-value">' + value + '</strong>' +
      '<span class="kpi-sub">' + sub + '</span>' +
      '</div></div>';
  }

  function updateList(view) {
    const wrap = view.querySelector('#listWrap');
    wrap.innerHTML = listHTML(list());
    bindList(wrap);
  }

  function listHTML(items) {
    if (!items.length) {
      return '<div class="card">' + UI.emptyState('wallet', 'No hay deudas que coincidan', 'Registrá una nueva deuda para llevar el control de sus cuotas.') + '</div>';
    }
    return '<div class="cards-grid">' + items.map(deudaCard).join('') + '</div>';
  }

  function deudaCard(d) {
    const pct = Math.min(100, Math.round(((Number(d.cuotaActual) || 0) / (Number(d.cuotasTotales) || 1)) * 100));
    const resta = restante(d);
    const dias = Math.ceil((new Date(d.fechaVencimiento + 'T00:00:00') - new Date()) / 86400000);
    const venceLabel = dias < 0 ? 'vencida' : (dias === 0 ? 'vence hoy' : 'vence en ' + dias + 'd');
    const venceTone = dias < 0 ? 'danger' : (dias <= 7 ? 'warning' : 'neutral');
    return '<article class="asset-card" data-id="' + d.id + '">' +
      '<div class="asset-head">' +
      '<span class="asset-ico">' + UI.icon(TIPO_ICON[d.tipo] || 'wallet', 20) + '</span>' +
      '<div class="asset-info"><strong>' + UI.escapeHtml(d.concepto) + '</strong>' +
      '<span class="muted small">' + UI.escapeHtml(d.tipo) + ' · ' + UI.fmtMoney(d.montoPorCuota) + '/cuota</span></div>' +
      UI.chip('Cuota ' + d.cuotaActual + '/' + d.cuotasTotales, TIPO_TONE[d.tipo] || 'info', 'clock') +
      '</div>' +
      '<div class="portal-bar-item" style="margin:8px 0 4px">' +
      '<div class="portal-bar"><div class="portal-bar-fill" style="width:' + pct + '%"></div></div>' +
      '</div>' +
      '<div class="asset-stats">' +
      '<span>Total<b>' + UI.fmtMoney(d.montoTotal) + '</b></span>' +
      '<span>Restante<b>' + UI.fmtMoney(resta) + '</b></span>' +
      '<span>Vence<b>' + venceLabel + '</b></span>' +
      '</div>' +
      '<div class="asset-foot">' +
      '<button class="btn btn-soft-success btn-sm" data-pay="' + d.id + '">' + UI.icon('arrow-up-right', 14) + 'Pagar Cuota</button>' +
      '<div class="spacer"></div>' +
      UI.chip(venceLabel, venceTone, 'calendar') +
      '<button class="icon-btn sm" data-edit="' + d.id + '" title="Editar">' + UI.icon('edit', 15) + '</button>' +
      '<button class="icon-btn sm danger" data-del="' + d.id + '" title="Eliminar">' + UI.icon('trash', 15) + '</button>' +
      '</div></article>';
  }

  function bindList(wrap) {
    UI.on(wrap, '[data-pay]', 'click', async e => {
      const d = S.data.debts.find(x => x.id === e.target.closest('[data-pay]').dataset.pay);
      if (!d || d.finalizada) return;
      const ok = await UI.confirm({
        title: 'Pagar cuota',
        message: 'Se pagará la cuota <strong>' + d.cuotaActual + '/' + d.cuotasTotales + '</strong> de ' + UI.escapeHtml(d.concepto) + ' (' + UI.fmtMoney(d.montoPorCuota) + ') y se registrará como gasto general.',
        okLabel: 'Pagar cuota',
      });
      if (!ok) return;

      /* 1) Registrar el gasto en caja general (antes de avanzar la cuota) */
      S.add('expenses', {
        type: 'general', workId: null, date: S.todayISO(), amount: Number(d.montoPorCuota) || 0,
        category: 'Deuda', providerId: null, employeeId: null,
        description: 'Pago cuota ' + d.cuotaActual + '/' + d.cuotasTotales + ' - ' + d.concepto,
        invoiceNumber: '', paymentMethod: 'Efectivo', expenseKind: null, source: 'web',
      });

      /* 2) Avanzar la cuota + un mes de vencimiento */
      const cuotaActual = (Number(d.cuotaActual) || 0) + 1;
      const finalizada = cuotaActual > (Number(d.cuotasTotales) || 0);
      S.update('debts', d.id, {
        cuotaActual,
        fechaVencimiento: addMonths(d.fechaVencimiento, 1),
        finalizada,
        updatedAt: new Date().toISOString(),
      });

      UI.toast(finalizada ? '✅ Última cuota pagada. Deuda finalizada.' : '✅ Cuota pagada. Se registró el gasto en tu caja general.', 'success');
      G.router.refresh();
    });
    UI.on(wrap, '[data-edit]', 'click', e => openDeudaModal(S.data.debts.find(x => x.id === e.target.closest('[data-edit]').dataset.edit)));
    UI.on(wrap, '[data-del]', 'click', async e => {
      const d = S.data.debts.find(x => x.id === e.target.closest('[data-del]').dataset.del);
      if (!d) return;
      const ok = await UI.confirm({
        title: 'Eliminar deuda',
        message: '¿Eliminar la deuda <strong>' + UI.escapeHtml(d.concepto) + '</strong>? Los gastos ya registrados no se tocan.',
        okLabel: 'Eliminar',
      });
      if (ok) { S.remove('debts', d.id); UI.toast('Deuda eliminada'); G.router.refresh(); }
    });
  }

  function openDeudaModal(d) {
    const isEdit = !!d;
    const m = UI.openModal({
      title: isEdit ? 'Editar deuda' : 'Nueva Deuda',
      subtitle: 'El monto por cuota se calcula solo (total ÷ cuotas).',
      body:
        '<div class="grid-form">' +
        '<div class="field"><label>Concepto *</label><input class="input" id="fConcepto" value="' + UI.escapeHtml(d ? d.concepto : '') + '" placeholder="Ej.: Heladera, Préstamo Banco, Colegio"></div>' +
        '<div class="field"><label>Tipo *</label><select class="select" id="fTipo">' +
        ['Personal', 'Empresa', 'Obra'].map(t => '<option' + (d && d.tipo === t ? ' selected' : '') + '>' + t + '</option>').join('') +
        '</select></div>' +
        '<div class="field"><label>Monto total ($) *</label><input class="input" type="number" id="fMonto" min="0" step="100" value="' + (d ? d.montoTotal : '') + '" placeholder="0"></div>' +
        '<div class="field"><label>Cantidad de cuotas *</label><input class="input" type="number" id="fCuotas" min="1" step="1" value="' + (d ? d.cuotasTotales : '') + '" placeholder="Ej.: 12"></div>' +
        '<div class="field"><label>Cuota actual</label><input class="input" type="number" id="fCuotaActual" min="1" step="1" value="' + (d ? d.cuotaActual : '1') + '"></div>' +
        '<div class="field"><label>Monto por cuota ($) <span class="muted">(auto)</span></label><input class="input" id="fPorCuota" value="' + (d ? UI.fmtMoney(d.montoPorCuota) : '') + '" readonly style="opacity:.7"></div>' +
        '<div class="field"><label>Próximo vencimiento *</label><input class="input" type="date" id="fFecha" value="' + (d ? d.fechaVencimiento : S.todayISO()) + '"></div>' +
        '</div>',
      footer: '<button class="btn btn-ghost" data-cancel>Cancelar</button><button class="btn btn-primary" data-save>' + (isEdit ? 'Guardar cambios' : 'Registrar deuda') + '</button>',
    });

    /* Auto-cálculo del monto por cuota */
    const montoEl = m.panel.querySelector('#fMonto');
    const cuotasEl = m.panel.querySelector('#fCuotas');
    const porCuotaEl = m.panel.querySelector('#fPorCuota');
    const calc = () => {
      const total = UI.readNum(montoEl);
      const cuotas = parseInt(cuotasEl.value, 10) || 0;
      const porCuota = (cuotas > 0 && total > 0) ? Math.round((total / cuotas) * 100) / 100 : 0;
      porCuotaEl.value = porCuota ? UI.fmtMoney(porCuota) : '';
    };
    montoEl.addEventListener('input', calc);
    cuotasEl.addEventListener('input', calc);

    m.panel.querySelector('[data-cancel]').addEventListener('click', m.close);
    m.panel.querySelector('[data-save]').addEventListener('click', () => {
      const concepto = m.panel.querySelector('#fConcepto').value.trim();
      const fecha = m.panel.querySelector('#fFecha').value;
      const total = UI.readNum(m.panel.querySelector('#fMonto'));
      const cuotasTotales = parseInt(m.panel.querySelector('#fCuotas').value, 10) || 1;
      const cuotaActual = Math.max(1, parseInt(m.panel.querySelector('#fCuotaActual').value, 10) || 1);
      if (!concepto) { UI.toast('Ingresá el concepto', 'error'); return; }
      if (!(total > 0)) { UI.toast('Ingresá el monto total', 'error'); return; }
      if (!fecha) { UI.toast('Ingresá la fecha de vencimiento', 'error'); return; }
      const payload = {
        concepto,
        tipo: m.panel.querySelector('#fTipo').value,
        montoTotal: total,
        cuotasTotales: Math.max(1, cuotasTotales),
        cuotaActual,
        montoPorCuota: Math.round((total / Math.max(1, cuotasTotales)) * 100) / 100,
        fechaVencimiento: fecha,
        finalizada: cuotaActual > cuotasTotales,
      };
      if (isEdit) {
        payload.updatedAt = new Date().toISOString();
        S.update('debts', d.id, payload);
        UI.toast('Deuda actualizada');
      } else {
        payload.createdAt = new Date().toISOString();
        payload.updatedAt = payload.createdAt;
        S.add('debts', payload);
        UI.toast('Deuda registrada');
      }
      m.close();
      G.router.refresh();
    });
  }
})(typeof window !== 'undefined' ? window : globalThis);
