// ============================================================
// GADU · Pruebas de robustez (stress) de la integración Groq
//   Audio (whisper-large-v3) + Imagen (llama vision) en transcribe.ts
// Ejecutar (requiere Deno):
//   deno test --allow-env --allow-net test/test-media.ts
// ============================================================

import { resolveIncomingText } from "../supabase/functions/whatsapp-webhook/transcribe.ts";

let ok = 0, ko = 0;
function okk(cond: boolean, label: string) {
  if (cond) { ok++; console.log("  ✔ " + label); }
  else { ko++; console.log("  ✘ " + label); }
}

type MockCfg = {
  groqMode: "fail" | "hang" | "ok";
  geminiMode: "ok" | "fail";
  mediaType: "audio" | "image";
};

/* Mock de fetch global: enruta por URL y honra `init.signal` (para el timeout). */
function installFetchMock(cfg: MockCfg) {
  (globalThis as unknown as { fetch: unknown }).fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

    // 1) Graph API → devuelve la URL firmada del media
    if (url.includes("graph.facebook.com")) {
      return json({ url: "https://media.example.com/media" });
    }

    // 2) Descarga del media (audio corrupto / imagen inválida)
    if (url.includes("media.example.com")) {
      const bytes = cfg.mediaType === "audio"
        ? new Uint8Array([0x00, 0x01, 0x02, 0x03])   // audio vacío/corrupto
        : new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);   // imagen JPEG truncada
      const ct = cfg.mediaType === "audio" ? "audio/ogg" : "image/jpeg";
      return new Response(bytes, { status: 200, headers: { "Content-Type": ct } });
    }

    // 3) Groq
    if (url.includes("api.groq.com")) {
      if (cfg.groqMode === "hang") {
        // Nunca resuelve: el AbortController de 12s debe cortarlo.
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("AbortError")));
        });
      }
      if (cfg.groqMode === "ok") {
        return cfg.mediaType === "audio"
          ? json({ text: "Gasto 2000 en nafta" })
          : json({ choices: [{ message: { content: "Gasto 2000 en nafta" } }] });
      }
      return json({ error: { message: "rate limit exceeded" } }, 429);
    }

    // 4) Gemini (fallback)
    if (url.includes("generativelanguage.googleapis.com")) {
      if (cfg.geminiMode === "ok") {
        return json({ candidates: [{ content: { parts: [{ text: "Gasto 2000 en nafta" }] } }] });
      }
      return json({ error: "internal" }, 500);
    }

    return json({}, 404);
  };
}

function audioPayload(id: string) {
  return { entry: [{ changes: [{ value: {
    contacts: [{ wa_id: "5493547469000" }],
    messages: [{ from: "5493547469000", type: "audio", audio: { id } }],
  } }] }] };
}
function imagePayload(id: string, caption: string) {
  return { entry: [{ changes: [{ value: {
    contacts: [{ wa_id: "5493547469000" }],
    messages: [{ from: "5493547469000", type: "image", image: { id, caption } }],
  } }] }] };
}

async function main() {
  // Sin SUPABASE_URL/KEY → uploadMediaToStorage se saltea (no hace fetch).
  try { Deno.env.set("GROQ_API_KEY", "test-groq"); } catch (_e) {}
  try { Deno.env.set("GEMINI_API_KEY", "test-gemini"); } catch (_e) {}

  console.log("== 1) Audio corrupto → Groq falla (429) → Gemini fallback OK ==");
  installFetchMock({ groqMode: "fail", geminiMode: "ok", mediaType: "audio" });
  const r1 = await resolveIncomingText(audioPayload("aud_1"));
  okk(r1 !== null && r1.text.includes("Gasto 2000"), "fallback a Gemini transcribió el audio");

  console.log("== 2) Audio corrupto → Groq y Gemini fallan → audioFailed ==");
  installFetchMock({ groqMode: "fail", geminiMode: "fail", mediaType: "audio" });
  const r2 = await resolveIncomingText(audioPayload("aud_2"));
  okk(r2 !== null && r2.audioFailed === true && r2.text === "", "audioFailed=true (el bot responde amable, no se cae)");

  console.log("== 3) Imagen que excede el límite → Groq falla → Gemini falla → audioFailed ==");
  installFetchMock({ groqMode: "fail", geminiMode: "fail", mediaType: "image" });
  const r3 = await resolveIncomingText(imagePayload("img_1", "Gasto 2000 en cigarros"));
  okk(r3 !== null && r3.audioFailed === true, "imagen → audioFailed=true (error amable, sin romperse)");

  console.log("== 4) Timeout 12s: Groq cuelga → aborta → fallback Gemini ==");
  installFetchMock({ groqMode: "hang", geminiMode: "ok", mediaType: "audio" });
  const t0 = Date.now();
  const r4 = await resolveIncomingText(audioPayload("aud_3"));
  const dt = Date.now() - t0;
  okk(r4 !== null && r4.text.includes("Gasto 2000"), "tras el timeout, el fallback respondió");
  console.log("  (duración: " + Math.round(dt / 1000) + "s)");
  okk(dt >= 11000 && dt < 15000, "timeout ~12s: abortó a tiempo");

  console.log("\n" + (ko === 0 ? "✅ " + ok + " pruebas de robustez pasaron" : "✘ " + ko + " fallos / " + ok + " ok"));
  if (ko > 0) Deno.exit(1);
}

main();
