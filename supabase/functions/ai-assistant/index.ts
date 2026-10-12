// ============================================================
// GADU · Asistente de IA (Supabase Edge Function) — Google Gemini
// Ruta: /functions/v1/ai-assistant
// Variables de entorno (secrets):
//   GEMINI_API_KEY · clave de Google AI Studio (https://aistudio.google.com/apikey)
//   GEMINI_MODEL   · (opcional) modelo principal, por defecto gemini-3.5-flash
//                    (con cadena de respaldo automática si está congestionado)
// Despliegue:
//   supabase functions deploy ai-assistant
//   supabase secrets set GEMINI_API_KEY=... --project-ref kalqvykomlfwxmsdaipf
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const USER_PROMPT = `Sos "GADU · Capataz Digital", el asistente de soporte de la app de gestión de obras y remodelaciones, pensada para contratistas, oficios y constructoras.

Tu trabajo: guiar al usuario paso a paso, con calidez y claridad, como un colega de obra que conoce la plataforma. Priorizá los patrones de uso y el historial de la sesión para anticiparte a lo que necesita.

MÓDULOS de carga y su acción rápida (usá SIEMPRE la clave exacta):
- Obras → [[accion:new-obra|Crear Nueva Obra]] · [[accion:obras|Ver Obras]]
- Empleados → [[accion:new-empleado|Crear Empleado]] · [[accion:empleados|Ver Empleados]]
- Clientes → [[accion:new-cliente|Crear Cliente]] · [[accion:clientes|Ver Clientes]]
- Gastos → [[accion:new-gasto|Cargar Gasto]] · [[accion:gastos|Ver Gastos]]
- Ingresos → [[accion:new-ingreso|Cargar Ingreso]] · [[accion:ingresos|Ver Ingresos]]
- Presupuestos → [[accion:new-presupuesto|Nuevo Presupuesto]] · [[accion:presupuestos|Ver Presupuestos]]
- Herramientas → [[accion:herramientas|Ver Herramientas]]
- Jornadas → [[accion:new-jornada|Registrar Jornada]] · [[accion:agenda|Ver Agenda]]
- Seguros → [[accion:new-seguro|Cargar Seguro]] · [[accion:seguros|Ver Seguros]]
- Panel general → [[accion:dashboard|Ver Panel]]

Reglas estrictas:
- Respondé SIEMPRE en español, con frases cortas y claras.
- Decile DÓNDE cargar cada cosa (módulo → acción) e incluí SIEMPRE el botón interactivo [[accion:CLAVE|Texto]] para abrir el formulario sin salir del chat.
- Usá el CONTEXTO de la cuenta (plan, días de prueba, cantidad de obras/clientes/empleados/presupuestos). No inventes datos.
- No uses más de 2 acciones por respuesta y no repitas la misma.
- Si el usuario quiere CREAR o REGISTRAR algo (empleado, obra, cliente, presupuesto, gasto, ingreso o jornada), usá la herramienta "abrir_formulario" con el módulo correcto y los datos que ya dio (nombre, monto, categoria, ubicacion, presupuesto, etc.).
- Si el CONTEXTO muestra UNA sola obra activa y el usuario pide cargar un gasto/ingreso/adelanto SIN especificar obra, NO preguntes: llamá "abrir_formulario" con el campo "obra" vacío (la app la asigna sola automáticamente).
- Si hay VARIAS obras y el usuario NOMBRA una obra o cliente, usá ese nombre exacto en "obra"/"cliente".
- Para crear una OBRA, extraé TODOS los datos mencionados: nombre, ubicacion (ciudad/barrio) y presupuesto (monto total).
- Si la información es ambigua o incompleta, NO adivines y NO llames la herramienta. Respondé con una pregunta aclaratoria corta que LISTE las opciones disponibles del CONTEXTO por su nombre (ej. "¿A qué obra corresponde: El arreglo del baño o Refacciones?"), para que el usuario conteste por voz. Si falta un dato obligatorio (ej. la obra en un ingreso), pedilo puntualmente.`;

const ADMIN_PROMPT = `Sos el "COO Virtual" de GADU, el copiloto de gestión de la plataforma SaaS para el Super Administrador.

Tu trabajo: ayudar al dueño/administrador a operar el negocio: métricas financieras, prevención de churn, auditoría y gestión de usuarios/planes.

Acciones rápidas disponibles (usá la clave EXACTA):
- [[accion:admin-metrics|Ver Métricas MRR/ARR]]
- [[accion:admin-users|Ver Usuarios]]
- [[accion:admin-planes|Ver Planes]]
- [[accion:admin-config|Configuración]]
- [[accion:admin-audit|Ver Auditoría]]
- [[accion:admin-register-user|Registrar Usuario]]
- [[accion:admin-export|Exportar Datos]]

Reglas estrictas:
- Respondé en español, conciso y con tono ejecutivo.
- Usá el CONTEXTO financiero (MRR, ARR, usuarios, conversión, distribución de planes) que te paso. No inventes cifras.
- Para churn, cuentas inactivas o trials por vencer: diagnosticá y proponé acciones concretas con su deep-link.
- No uses más de 2 acciones por respuesta.`;

function fallbackText() {
  return "😅 Estoy teniendo un pico de consultas y no pude responder ahora. Probá de nuevo en unos segundos.\n\nMientras tanto podés:\n- Cargar una [[accion:new-obra|Nueva Obra]]\n- Ver tu [[accion:dashboard|Panel general]]\n- O escribirnos por WhatsApp al +54 9 3547 469000.";
}

/* Herramientas disponibles para el agente (function calling) */
function tools() {
  return [{
    functionDeclarations: [{
      name: "abrir_formulario",
      description: "Abrir el formulario de creación de GADU con los datos que el usuario ya mencionó, para que él termine de completar y confirme. Usar cuando el usuario quiere crear/registrar: empleado, obra, cliente, presupuesto, gasto, ingreso o jornada.",
      parameters: {
        type: "OBJECT",
        properties: {
          modulo: { type: "STRING", enum: ["empleado", "obra", "cliente", "presupuesto", "gasto", "ingreso", "jornada"], description: "Qué formulario abrir" },
          campos: {
            type: "OBJECT",
            description: "Datos detectados por voz/texto. Claves posibles: nombre, apellido, cliente, obra, empleado, monto (número), concepto, categoria, horas (número), ubicacion (para obra), presupuesto (número, monto total de obra).",
            properties: {
              nombre: { type: "STRING" },
              apellido: { type: "STRING" },
              cliente: { type: "STRING" },
              obra: { type: "STRING" },
              empleado: { type: "STRING" },
              monto: { type: "NUMBER" },
              concepto: { type: "STRING" },
              categoria: { type: "STRING" },
              horas: { type: "NUMBER" },
              ubicacion: { type: "STRING" },
              presupuesto: { type: "NUMBER" },
            },
          },
        },
        required: ["modulo"],
      },
    }],
  }];
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const { message, context, mode } = await req.json();
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
    const user = await userRes.json();
    const userId = user.id;

    // Modo COO Virtual: enriquecer el contexto con métricas reales del SaaS
    let finalContext = context || "";
    if (mode === "admin") {
      try {
        const mRes = await fetch(`${supabaseUrl}/rest/v1/rpc/metricas`, {
          method: "POST",
          headers: { apikey: anonKey, Authorization: auth, "Content-Type": "application/json" },
          body: "{}",
        });
        if (mRes.ok) {
          const m = await mRes.json();
          finalContext += "\nMétricas del SaaS (MRR, ARR, usuarios, conversión, planes): " + JSON.stringify(m);
        } else {
          console.error(`[ai-assistant] no pude leer métricas: ${mRes.status}`);
        }
      } catch (e) { console.error("[ai-assistant] error leyendo métricas:", e); }
    }

    const key = Deno.env.get("GEMINI_API_KEY");
    if (!key) {
      return new Response(JSON.stringify({ reply: fallbackText() }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const systemPrompt = mode === "admin" ? ADMIN_PROMPT : USER_PROMPT;
    const userText = `Contexto de mi cuenta:\n${finalContext || "sin contexto"}\n\nMi consulta:\n${message}`;

    // Cadena de modelos (3 máximo): si el principal está congestionado, probamos el siguiente.
    const modelos = [...new Set([
      Deno.env.get("GEMINI_MODEL") || "gemini-3.5-flash",
      "gemini-3.5-flash",
      "gemini-3.8-flash",
      "gemini-flash-latest",
    ])];

    const callGemini = async (modelo, contents) => {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`;
      // Timeout por modelo: evita que un modelo colgado bloquee toda la cadena
      // de respaldo y deje al usuario en "Pensando…" indefinido.
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      try {
        const aiRes = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": key },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: systemPrompt }] },
            contents,
            tools: tools(),
            generationConfig: { temperature: 0.4, maxOutputTokens: 700 },
          }),
          signal: controller.signal,
        });
        if (!aiRes.ok) {
          const errBody = await aiRes.text();
          console.error(`[ai-assistant] ${modelo} falló (${aiRes.status}): ${errBody.slice(0, 400)}`);
          return null;
        }
        return await aiRes.json();
      } catch (e) {
        console.error(`[ai-assistant] ${modelo} timeout/error:`, e);
        return null;
      } finally {
        clearTimeout(timer);
      }
    };

    let reply = "";
    let ultimoError = "";
    let functionCall = null;

    // 1) Primera pasada: texto o llamada a herramienta
    for (const modelo of modelos) {
      try {
        const data = await callGemini(modelo, [{ role: "user", parts: [{ text: userText }] }]);
        if (!data) { ultimoError = "sin respuesta"; continue; }
        const part = data?.candidates?.[0]?.content?.parts?.[0];
        if (part?.functionCall) { functionCall = part.functionCall; break; }
        const t = part?.text;
        if (t) { reply = t; console.log(`[ai-assistant] respondió con ${modelo}`); break; }
      } catch (e) { ultimoError = String(e); console.error(`[ai-assistant] ${modelo} excepción:`, e); }
    }

    // 2) Si hay llamada a "abrir_formulario", devolver la acción para que el frontend
    //    abra el modal y pre-complete los campos (confirmación por voz/texto).
    let action = null;
    if (functionCall && functionCall.name === "abrir_formulario") {
      const args = functionCall.args || {};
      const modulo = args.modulo;
      const campos = args.campos || {};
      action = { modulo, campos };
      console.log("[ai-assistant] abrir_formulario →", JSON.stringify(action));
      const etiquetas = { empleado: "Empleados", obra: "Obras", cliente: "Clientes", presupuesto: "Presupuestos", gasto: "Gastos", ingreso: "Ingresos", jornada: "Jornada" };
      const resumen = Object.entries(campos).map(([k, v]) => `${k}: ${v}`).join(", ");
      reply = `¡De acuerdo! Abrí el formulario de ${etiquetas[modulo] || modulo}${resumen ? " con " + resumen : ""}. Completá lo que falta o confirmá la carga.`;
    }

    if (!reply) {
      console.error("[ai-assistant] sin respuesta final. Último error:", ultimoError);
      return new Response(JSON.stringify({ reply: fallbackText() }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ reply, action }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    // 3) Fallback ante cualquier error / congestión, con detalle en logs
    console.error("[ai-assistant] Error inesperado:", e);
    return new Response(JSON.stringify({ reply: fallbackText() }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
