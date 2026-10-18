// Ejecución temporal (Node) para actualizar la foto de perfil de WhatsApp.
// Uso: node scripts/run-profile-update.mjs  (con env vars WHATSAPP_TOKEN, WHATSAPP_PHONE_ID, META_APP_ID, IMAGE_URL)
// IMAGE_URL puede ser una URL pública o una ruta de archivo local.
import fs from "node:fs";
const TOKEN = process.env.WHATSAPP_TOKEN || "";
const PHONE_ID = process.env.WHATSAPP_PHONE_ID || "";
const APP_ID = process.env.META_APP_ID || "";
const IMAGE_URL = process.env.IMAGE_URL || "";

function fail(msg) { console.error("[GADU-WA-PROFILE] ❌ " + msg); process.exit(1); }
if (!TOKEN) fail("falta WHATSAPP_TOKEN");
if (!PHONE_ID) fail("falta WHATSAPP_PHONE_ID");
if (!APP_ID) fail("falta META_APP_ID");
if (!IMAGE_URL) fail("falta IMAGE_URL");

// 1) Cargar imagen (URL pública o archivo local)
let bytes;
if (/^https?:/.test(IMAGE_URL)) {
  console.log("[GADU-WA-PROFILE] descargando:", IMAGE_URL);
  const img = await fetch(IMAGE_URL);
  if (!img.ok) fail("descarga HTTP " + img.status);
  bytes = new Uint8Array(await img.arrayBuffer());
} else {
  console.log("[GADU-WA-PROFILE] leyendo archivo local:", IMAGE_URL);
  bytes = new Uint8Array(fs.readFileSync(IMAGE_URL));
}
console.log("[GADU-WA-PROFILE] imagen:", bytes.length, "bytes");

// 2) Resumable upload → file handle
const s = await fetch(
  `https://graph.facebook.com/v21.0/${APP_ID}/uploads?file_name=logo-wpp-gadu.png&file_length=${bytes.length}&file_type=image/png`,
  { method: "POST", headers: { Authorization: `Bearer ${TOKEN}` } },
);
if (!s.ok) fail("init upload HTTP " + s.status + " " + await s.text());
const session = await s.json();
const sessionId = String(session.id || "");
if (!sessionId) fail("sin session id: " + JSON.stringify(session));
console.log("[GADU-WA-PROFILE] session:", sessionId);

const up = await fetch(`https://graph.facebook.com/v21.0/${sessionId}`, {
  method: "POST",
  headers: {
    Authorization: `OAuth ${TOKEN}`,
    file_offset: "0",
    "Content-Type": "application/octet-stream",
  },
  body: bytes,
});
if (!up.ok) fail("upload bytes HTTP " + up.status + " " + await up.text());
const uploaded = await up.json();
const handle = String(uploaded.h || "");
if (!handle) fail("sin handle: " + JSON.stringify(uploaded));
console.log("[GADU-WA-PROFILE] handle:", handle);

// 3) Actualizar perfil
const prof = await fetch(
  `https://graph.facebook.com/v21.0/${PHONE_ID}/whatsapp_business_profile`,
  {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ messaging_product: "whatsapp", profile_picture_handle: handle }),
  },
);
const profText = await prof.text();
if (!prof.ok) fail("perfil HTTP " + prof.status + " " + profText);
console.log("[GADU-WA-PROFILE] ✅ respuesta:", profText);
console.log("[GADU-WA-PROFILE] ✅ foto de perfil actualizada con éxito");
