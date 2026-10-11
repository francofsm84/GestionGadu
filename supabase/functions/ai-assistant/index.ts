// ============================================================
// GADU · Asistente de IA (Supabase Edge Function)
// Ruta: /functions/v1/ai-assistant
// Variables de entorno (secrets):
//   AI_API_BASE_URL  · ej. https://api.openai.com/v1  o  https://api.freellmapi.com/v1
//   AI_API_KEY       · clave de la pasarela (se guarda SOLO en el servidor)
//   AI_MODEL         · (opcional) modelo, ej. gpt-4o-mini
// Despliegue:
//   supabase functions deploy ai-assistant --no-verify-jwt
//   supabase secrets set AI_API_BASE_URL=... AI_API_KEY=... AI_MODEL=...
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYSTEM_PROMPT = `Sos "GADU", el asistente virtual de soporte de la app de gestión de obras y remodelaciones (GADU Gestión), pensada para contratistas, oficios y constructoras.

Tu trabajo: guiar al usuario paso a paso, con calidez y claridad, como un colega de obra que conoce la plataforma.

Reglas estrictas:
- Respondé SIEMPRE en español, con frases cortas y claras.
- Decile DÓNDE cargar cada cosa usando el menú (ej. "Andá a Obras → Nueva obra" o "Finanzas → Gastos").
- Usá el CONTEXTO de la cuenta que te pasan (plan, días de prueba, cantidad de obras/clientes/empleados/presupuestos). No inventes datos que no estén en el contexto.
- Si detectás que le falta algo o que la acción corresponde a un módulo, sugerí UNA acción interactiva en una línea propia con este formato EXACTO:
  [[accion:CLAVE|Texto del botón]]
  Claves válidas: dashboard, obras, presupuestos, ingresos, gastos, empleados, herramientas, clientes, socios, seguros, new-obra, new-presupuesto, new-ingreso, new-gasto.
  Ejemplo: [[accion:new-obra|Crear Nueva Obra]]
- No uses más de 2 acciones por respuesta y no repitas la misma acción.
- Si la consulta no tiene relación con GADU o la construcción, respondé de forma breve y ofrecé ayuda con la app.`;

function fallbackText() {
  return "😅 Estoy teniendo un pico de consultas y no pude responder ahora. Probá de nuevo en unos segundos.\n\nMientras tanto podés:\n- Cargar una [[accion:new-obra|Nueva Obra]]\n- Ver tu [[accion:dashboard|Panel general]]\n- O escribirnos por WhatsApp al +54 9 3547 469000.";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const { message, context } = await req.json();
    const auth = req.headers.get("authorization") || "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // 1) Validar la sesión de Supabase (usuario autenticado)
    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: anonKey, Authorization: auth },
    });
    if (!userRes.ok) {
      return new Response(JSON.stringify({ error: "No autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const base = Deno.env.get("AI_API_BASE_URL") || "https://api.openai.com/v1";
    const key = Deno.env.get("AI_API_KEY");
    const model = Deno.env.get("AI_MODEL") || "gpt-4o-mini";
    if (!key) {
      return new Response(JSON.stringify({ reply: fallbackText() }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2) Llamada a la pasarela compatible con OpenAI
    const aiRes = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `Contexto de mi cuenta:\n${context || "sin contexto"}\n\nMi consulta:\n${message}` },
        ],
        temperature: 0.4,
        max_tokens: 700,
      }),
    });

    if (!aiRes.ok) {
      return new Response(JSON.stringify({ reply: fallbackText() }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await aiRes.json();
    const reply = data?.choices?.[0]?.message?.content || fallbackText();
    return new Response(JSON.stringify({ reply }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (_e) {
    // 3) Fallback ante cualquier error / congestión
    return new Response(JSON.stringify({ reply: fallbackText() }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
