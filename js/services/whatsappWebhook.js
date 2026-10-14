/* ============================================================
   GADU · Servicio de integración con Webhook de WhatsApp
   ------------------------------------------------------------
   Envía notificaciones automáticas al usuario por WhatsApp:
     - Evento 1: sincronización completada en la nube.
     - Evento 2: recordatorio de respaldo los viernes.
     - Evento 3: resumen diario de saldo al cierre del día.
   Las llamadas son ASÍNCRONAS y de fallo SILENCIOSO: si no hay
   endpoint configurado o no hay conexión, la app no se bloquea
   ni muestra errores al usuario.
   Endpoint configurable en settings.whatsappWebhook (vacío = off).
   ============================================================ */
(function (root) {
  'use strict';
  const G = root.GADU || (root.GADU = {});

  function endpoint() {
    try {
      const st = (G.store && G.store.data && G.store.data.settings) || {};
      return st.whatsappWebhook || '';
    } catch (e) { return ''; }
  }
  function profilePhone() {
    try {
      const p = (G.store && G.store.data && G.store.data.settings && G.store.data.settings.profile) || {};
      return (p.whatsapp && p.whatsapp.phone) || '';
    } catch (e) { return ''; }
  }
  function isLinked() {
    try {
      const p = (G.store && G.store.data && G.store.data.settings && G.store.data.settings.profile) || {};
      return !!(p.whatsapp && p.whatsapp.linked);
    } catch (e) { return false; }
  }

  /* POST asíncrono al webhook. Nunca lanza: devuelve true/false. */
  async function sendWhatsAppNotification(payload) {
    try {
      const url = endpoint();
      if (!url || !payload || !payload.message) return false;
      const phone = payload.phone || profilePhone();
      const body = { phone, message: String(payload.message || '') };
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return !!res && res.ok;
    } catch (e) {
      /* Fallo silencioso: solo se registra, jamás bloquea la app */
      try { console.warn('[whatsapp-webhook]', (e && e.message) || e); } catch (_) {}
      return false;
    }
  }

  /* Evento 1 · Sincronización completada */
  function notifySync() {
    if (!isLinked()) return Promise.resolve(false);
    const hora = new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
    return sendWhatsAppNotification({ message: '✅ GADU: Tus datos se han sincronizado correctamente en la nube hoy a las ' + hora + '.' });
  }

  /* Evento 2 · Recordatorio de respaldo (viernes) */
  function notifyFridayReminder(nombre) {
    if (!isLinked()) return Promise.resolve(false);
    const n = nombre || 'Franco';
    return sendWhatsAppNotification({ message: '⚠️ Hola ' + n + ', ya es viernes. Recuerda exportar tu respaldo de seguridad semanal en la sección "Respaldos y datos".' });
  }

  /* Evento 3 · Resumen diario de saldo */
  function notifyDailySummary() {
    if (!isLinked()) return Promise.resolve(false);
    try {
      const t = G.store.totals();
      const fmt = v => (G.ui && G.ui.fmtMoney) ? G.ui.fmtMoney(v) : '$' + v;
      return sendWhatsAppNotification({
        message: '📊 Resumen del día en GADU: Ingresos: ' + fmt(t.incomes) + ' | Gastos: ' + fmt(t.expenses) + ' | Balance Neto: ' + fmt(t.net),
      });
    } catch (e) { return Promise.resolve(false); }
  }

  /* Recordatorio diario personalizable (por defecto 09:00) */
  function reminderTime() {
    try {
      const st = (G.store && G.store.data && G.store.data.settings) || {};
      return st.reminderTime || '09:00';
    } catch (e) { return '09:00'; }
  }
  function notifyReminder() {
    if (!isLinked()) return Promise.resolve(false);
    return sendWhatsAppNotification({
      message: '⏰ ¡Hola! Es hora de actualizar GADU: recuerda registrar tus jornadas, gastos y revisar la agenda de hoy.',
    });
  }
  /* Verifica si corresponde disparar el recordatorio en este instante.
     Se ejecuta de forma periódica y una vez por día (silencioso si falla). */
  function checkReminder() {
    try {
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, '0');
      const mm = String(now.getMinutes()).padStart(2, '0');
      const target = reminderTime();
      if (hh + ':' + mm === target) {
        const key = 'gadu_wa_reminder_' + now.toISOString().slice(0, 10);
        if (!localStorage.getItem(key)) {
          try { localStorage.setItem(key, '1'); } catch (e) {}
          notifyReminder();
        }
      }
    } catch (e) { /* silencioso */ }
  }

  /* Hook de sincronización: notifica tras cada push exitoso, sin
     interferir con el resultado original del push. */
  function hookSyncNotifications() {
    try {
      if (!G.sync || typeof G.sync.push !== 'function' || G.sync.__waHooked) return;
      const original = G.sync.push;
      G.sync.push = async function () {
        const result = await original.apply(G.sync, arguments);
        try { await notifySync(); } catch (e) { /* silencioso */ }
        return result;
      };
      G.sync.__waHooked = true;
    } catch (e) {}
  }

  /* Cierre del día / viernes: chequeos una sola vez por día. */
  function dailyChecks() {
    try {
      const hoy = new Date();
      const key = hoy.toISOString().slice(0, 10);
      const st = (G.store && G.store.data && G.store.data.settings) || {};
      if (hoy.getDay() === 5) {
        const fk = 'gadu_wa_friday_' + key;
        if (!localStorage.getItem(fk)) {
          notifyFridayReminder();
          try { localStorage.setItem(fk, '1'); } catch (e) {}
        }
      }
      if (hoy.getHours() >= 20) {
        const dk = 'gadu_wa_daily_' + key;
        if (!localStorage.getItem(dk)) {
          notifyDailySummary();
          try { localStorage.setItem(dk, '1'); } catch (e) {}
        }
      }
    } catch (e) {}
  }

  function init() {
    hookSyncNotifications();
    /* Revisión periódica del recordatorio diario (cada 30s, silenciosa).
       Sin notificaciones en segundo plano del navegador: solo corre mientras
       la app está abierta; si no está disponible, no lanza errores. */
    try { setInterval(checkReminder, 30000); } catch (e) {}
    /* Deja arrancar la app para que S.load() cargue el perfil antes de
       decidir si corresponde notificar (viernes / resumen diario). */
    try {
      window.addEventListener('load', () => { checkReminder(); setTimeout(dailyChecks, 2500); });
      document.addEventListener('DOMContentLoaded', () => setTimeout(dailyChecks, 4000));
    } catch (e) {}
  }

  G.whatsapp = { init, sendWhatsAppNotification, notifySync, notifyFridayReminder, notifyDailySummary, notifyReminder, checkReminder, reminderTime };
  try { init(); } catch (e) {}
})(typeof window !== 'undefined' ? window : globalThis);
