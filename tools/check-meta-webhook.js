// ============================================================
// GADU · Diagnóstico de suscripción del webhook de Meta
// Verifica vía Graph API si el app está suscrita a los eventos
// `messages` de la WABA y mide la latencia del webhook.
//
// Uso (PowerShell):
//   $env:META_ACCESS_TOKEN = "EAA..."
//   $env:META_WABA_ID     = "1473..."
//   $env:META_APP_ID      = "123456789"
//   $env:WEBHOOK_URL      = "https://<ref>.functions.supabase.co/whatsapp-webhook"
//   node tools/check-meta-webhook.js
//
// (read-only: no modifica el webhook ni la lógica de negocio)
// ============================================================
const API = "https://graph.facebook.com/v21.0";

const TOKEN = process.env.META_ACCESS_TOKEN || "";
const WABA = process.env.META_WABA_ID || "";
const APP = process.env.META_APP_ID || "";
const WEBHOOK_URL = process.env.WEBHOOK_URL || "";

function log(tag, obj) {
  console.log("\n[" + tag + "]");
  if (typeof obj === "string") { console.log(obj); }
  else { console.log(JSON.stringify(obj, null, 2)); }
}

async function main() {
  if (!TOKEN) { console.error("❌ Falta META_ACCESS_TOKEN"); process.exit(1); }
  if (!WABA && !APP) { console.error("❌ Falta META_WABA_ID o META_APP_ID"); process.exit(1); }

  const headers = { Authorization: "Bearer " + TOKEN };

  /* 1) Apps suscritas a la WABA */
  if (WABA) {
    try {
      const res = await fetch(`${API}/${WABA}/subscribed_apps`, { headers });
      const j = await res.json();
      log("subscribed_apps (WABA)", { http: res.status, data: j.data || j });
    } catch (e) {
      log("subscribed_apps (WABA)", "error: " + (e && e.message));
    }
  }

  /* 2) Suscripciones del app (campos + callback_url) */
  if (APP) {
    try {
      const res = await fetch(`${API}/${APP}/subscriptions`, { headers });
      const j = await res.json();
      log("app subscriptions (APP)", { http: res.status, data: j.data || j });
      const subs = Array.isArray(j.data) ? j.data : [];
      const wa = subs.find(s => s.object === "whatsapp_business_account");
      if (wa) {
        const fields = (wa.fields || []).map(f => f.name).join(", ");
        log("RESULTADO", "✅ callback_url=" + (wa.callback_url || "(sin)") + "\n   campos suscritos: " + (fields || "(ninguno)") + "\n   active: " + (wa.active ? "sí" : "no"));
        if (!fields || !fields.includes("messages")) {
          console.log("\n⚠️  Falta el campo 'messages'. Para re-suscribir corré:");
          console.log(`   curl -X POST "${API}/${WABA}/subscribed_apps" -H "Authorization: Bearer ${TOKEN}"`);
        }
      } else {
        log("RESULTADO", "⚠️ No hay suscripción whatsapp_business_account en el app.");
      }
    } catch (e) {
      log("app subscriptions (APP)", "error: " + (e && e.message));
    }
  }

  /* 3) Latencia del webhook (GET de verificación, no dispara el bot) */
  if (WEBHOOK_URL) {
    try {
      const t0 = Date.now();
      const res = await fetch(WEBHOOK_URL + "?hub.mode=subscribe&hub.verify_token=test&hub.challenge=ping", { method: "GET" });
      const ms = Date.now() - t0;
      const ok = ms < 3000;
      log("LATENCIA", (ok ? "✅ " : "❌ ") + ms + " ms (límite Meta: <3000 ms) · HTTP " + res.status);
    } catch (e) {
      log("LATENCIA", "❌ no se pudo conectar: " + (e && e.message));
    }
  }
}

main().catch(e => { console.error("error:", e); process.exit(1); });
