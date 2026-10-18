// ============================================================
// GADU · Script administrativo (temporal): actualizar la foto de
// perfil del número de WhatsApp vía Graph API (Meta).
//
// Uso (una sola vez, local):
//   deno run --allow-env --allow-net scripts/update-whatsapp-profile.ts
//
// Variables de entorno requeridas:
//   WHATSAPP_TOKEN      → token de Meta (System User Token)
//   WHATSAPP_PHONE_ID   → Phone Number ID (el del bot)
//   META_APP_ID         → App ID de Meta (Meta for Developers → App)
//   IMAGE_URL           → URL pública de la imagen (PNG recomendado, 640x640)
// ============================================================

const TOKEN = Deno.env.get("WHATSAPP_TOKEN") || "";
const PHONE_ID = Deno.env.get("WHATSAPP_PHONE_ID") || "";
const APP_ID = Deno.env.get("META_APP_ID") || "";
const IMAGE_URL = Deno.env.get("IMAGE_URL") || "";

function fail(msg: string): never {
  console.error("[GADU-WA-PROFILE] ❌ " + msg);
  Deno.exit(1);
}

if (!TOKEN) fail("falta WHATSAPP_TOKEN");
if (!PHONE_ID) fail("falta WHATSAPP_PHONE_ID");
if (!APP_ID) fail("falta META_APP_ID (App ID de Meta)");
if (!IMAGE_URL) fail("falta IMAGE_URL (URL pública de la imagen)");

// 1) Descargar la imagen
console.log("[GADU-WA-PROFILE] descargando imagen:", IMAGE_URL);
const img = await fetch(IMAGE_URL);
if (!img.ok) fail("no se pudo descargar la imagen: HTTP " + img.status);
const bytes = new Uint8Array(await img.arrayBuffer());
console.log("[GADU-WA-PROFILE] imagen descargada:", bytes.length, "bytes");

// 2) Resumable Upload → file handle (profile_picture_handle)
const sessionRes = await fetch(
  `https://graph.facebook.com/v21.0/${APP_ID}/uploads?file_name=gadu-bot.png&file_length=${bytes.length}&file_type=image/png`,
  { method: "POST", headers: { Authorization: `Bearer ${TOKEN}` } },
);
if (!sessionRes.ok) fail("falló iniciar upload: HTTP " + sessionRes.status + " " + await sessionRes.text());
const session = await sessionRes.json();
const sessionId = String(session.id || "");
if (!sessionId) fail("sin session id en la respuesta del upload: " + JSON.stringify(session));
console.log("[GADU-WA-PROFILE] session de upload:", sessionId);

const uploadRes = await fetch(`https://graph.facebook.com/v21.0/${sessionId}`, {
  method: "POST",
  headers: {
    "Authorization": `OAuth ${TOKEN}`,
    "file_offset": "0",
    "Content-Type": "application/octet-stream",
  },
  body: bytes,
});
if (!uploadRes.ok) fail("falló subir bytes: HTTP " + uploadRes.status + " " + await uploadRes.text());
const uploaded = await uploadRes.json();
const handle = String(uploaded.h || "");
if (!handle) fail("sin file handle en la respuesta: " + JSON.stringify(uploaded));
console.log("[GADU-WA-PROFILE] file handle obtenido:", handle);

// 3) Actualizar el perfil del número con la foto
const profileRes = await fetch(
  `https://graph.facebook.com/v21.0/${PHONE_ID}/whatsapp_business_profile`,
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${TOKEN}`,
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      profile_picture_handle: handle,
    }),
  },
);
const profileText = await profileRes.text();
if (!profileRes.ok) fail("falló actualizar el perfil: HTTP " + profileRes.status + " " + profileText);
console.log("[GADU-WA-PROFILE] ✅ respuesta:", profileText);
console.log("[GADU-WA-PROFILE] ✅ foto de perfil actualizada con éxito");
