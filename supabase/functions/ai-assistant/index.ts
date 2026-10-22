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
- Si el usuario quiere CREAR o REGISTRAR algo (empleado, obra, cliente, presupuesto, gasto, ingreso o jornada), usá la herramienta "abrir_formulario" con el módulo correcto.

EXTRACCIÓN MÚLTIPLE (crítico):
- Si el usuario da TODOS los datos en un solo mensaje, extraé TODOS los campos en UN solo llamado a "abrir_formulario". NO preguntes por datos que ya se mencionaron.
- Ejemplo: "Agrega un nuevo empleado. Jorge Salani peón de albañil" → llamá "abrir_formulario" con modulo="empleado" y campos={"nombre":"Jorge Salani","rol":"peón de albañil"}.

MAPEO DE CAMPOS POR MÓDULO:
- EMPLEADO: "nombre" = nombre y apellido completos (ej. "Jorge Salani"). "rol" = oficio/puesto (ej. "peón de albañil", "oficial", "electricista", "plomero", "ayudante"). Si no se menciona el rol, dejalo vacío.
- OBRA: "nombre" = nombre de la obra, "ubicacion" = ciudad/barrio, "presupuesto" = monto total.
- GASTO: "monto" = número, "categoria" = concepto (nafta, cemento, flete, etc.), "obra" = obra si la nombra.
- INGRESO: "monto" = número, "concepto" = adelanto/certificación/cobro, "obra" = obra si la nombra.
- INVERSIÓN: si el usuario dice "invertí", "inversión" o "invertir" + un monto + un concepto (ej. "Invertí 50000 en una máquina", "Inversión de 10000 en capital de trabajo"), la intención es modulo="inversion" (NO es un gasto común). "monto" = número, "categoria" = concepto.
- JORNADA: "empleado" = nombre del empleado, "horas" = número, "obra" = obra si la nombra.
- DIFERENCIACIÓN (CRÍTICO): Si el usuario dice "Gasté 5000 en la obra X", la acción es modulo="gasto" y la obra es SOLO una referencia (NO crees una obra nueva). Si el usuario dice "Crear obra X" / "Nueva obra X", la acción es modulo="obra". NUNCA mezcles ambas intenciones ni crees una obra a partir de un gasto.
- MONEDA / RELLENO: ignorá las palabras de moneda o relleno entre el número y el concepto ("pesos", "peso", "mangos", "lucas", "ARS", "USD", "$"). Ej: "Invertí 170000 pesos en clavos" → monto=170000, categoria="clavos". NUNCA incluyas "pesos" ni "mangos" dentro de la categoría.
- REPORTE (PRIORITARIO): si el usuario pide un CÁLCULO GERENCIAL o un número (balance, saldo, días trabajados, pagos, deuda), usá SIEMPRE modulo="reporte" (JAMÁS "consulta" ni "gasto"). Es SOLO LECTURA:
  · "¿Cuál es el balance de la obra X?" / "saldo de la obra X" → {"tipo":"balance_obra","obra":"X"}
  · "¿Cuántos días trabajó Y esta semana/mes?" → {"tipo":"dias_trabajados","empleado":"Y","periodo":"semana"|"mes"|"total"}
  · "¿Cuánto le pagué a Y este mes?" → {"tipo":"pagos_empleado","empleado":"Y","periodo":"mes"|"semana"|"total"}
  · "¿Cuánto le debo a Y?" / "cuánto cobra Y" → {"tipo":"deuda_empleado","empleado":"Y"}
  Si el tipo de cálculo no está en esta lista, NO uses "reporte".

- NUEVA DEUDA: si el usuario quiere REGISTRAR una deuda en cuotas ("Cargame una deuda de 500000 en 12 cuotas para la heladera", "anotá una deuda del cole de 100 mil en 10 cuotas"), usá modulo="nueva_deuda" con campos={"concepto":"heladera","monto":500000,"cuotas":12}. Si falta el concepto, el monto o las cuotas, preguntá lo que falte en vez de llamar la herramienta.

- GASTO SIN VERBO: si el usuario escribe un NÚMERO seguido de "de" y un concepto (ej. "45678 de nafta", "5000 de cemento"), asumí que es un GASTO. Extraé "monto" = el número y "categoria" = el concepto. No preguntes.

CONSULTAS (QUERY_DATA) — SOLO para preguntas que NO son cálculos gerenciales:
- Si el usuario hace una PREGUNTA simple (NO un reporte numérico), usá modulo="consulta" con campos={"query_type": ..., "target": ...}.
- query_type posibles:
  - "expenses_week": preguntas de gastos de la última semana (ej. "¿Cuánto gasté esta semana?").
  - "attendance_today": quién trabajó hoy (ej. "¿Quién trabajó hoy?").
- target = el nombre de la obra o empleado mencionado (vacío "" si no se nombra).
- Si la pregunta no encaja, NO llames la herramienta: respondé con un texto corto pidiendo reformular.

TOLERANCIA Y ADELANTOS (crítico):
- MONTO CON "p": si el monto trae una "p" o "pesos" pegada (ej. "12000p", "12000 pesos"), ignorá esa letra y tomá solo el número (12000).
- ADELANTO A EMPLEADO: si el usuario dice "adelanto de [Nombre]" o "anticipo de [Nombre]" y ese nombre coincide con un empleado del CONTEXTO, la intención es modulo="adelanto" con campos={"empleado": "<nombre>", "monto": <número>}. NO lo interpretes como gasto general.
- DESAMBIGUACIÓN "adelanto de [Nombre]": buscá [Nombre] en el CONTEXTO antes de decidir:
  - Si coincide con un CLIENTE (del directorio) → es un COBRO ANTICIPADO del cliente: modulo="ingreso" con campos={"concepto":"Adelanto", "cliente":"<nombre>", "monto":<número>}.
  - Si coincide con un EMPLEADO → es un adelanto de dinero: modulo="adelanto" con campos={"empleado":"<nombre>", "monto":<número>}.
  - Si no está claro si es cliente o empleado, NO adivines: preguntá "¿[Nombre] es un cliente o un empleado?".
- Si el usuario escribe SOLO "adelanto" (sin nombre ni monto), respondé con UNA pregunta corta y amigable pidiendo los datos (ej. "¿A qué empleado y de cuánto es el adelanto?"). No lo mandes a la web.
- ASK_FOR_CLARIFICATION: si falta un dato obligatorio (monto, empleado u obra), NO llames la herramienta con datos incompletos. Respondé con UNA pregunta corta pidiendo el dato que falta (ej. "¿De cuánto es el adelanto?" o "¿A qué obra corresponde?").

PRESUPUESTO PDF (CREATE_BUDGET):
- Si el usuario pide un PRESUPUESTO para un cliente (ej. "Presupuesto para Juan Perez: 20m2 de cerámica, 3 bolsas de pegamento"), llamá "abrir_formulario" con modulo="presupuesto_pdf" y campos={"cliente": "<nombre del cliente>", "items": [{"descripcion":"...","cantidad":<n>,"precio":<n>}, ...]}.
- "items" = array de ítems. Cada ítem con "descripcion" (texto), "cantidad" (número) y "precio" (precio unitario; si el usuario NO lo dice, poné 0).
- Si el usuario menciona "IVA" o "descuento", agregá los campos "tax" (monto del IVA) y "discount" (monto del descuento) al objeto "campos".
- Si falta el nombre del cliente o no hay ítems, preguntá en lugar de llamar la herramienta.

REGISTRO DE ASISTENCIA (REGISTER_ATTENDANCE):
- Si el usuario registra horas trabajadas de empleados (ej. "Hoy trabajó Juan 8 horas, Pedro 6 y Luis 4" o "Registrá jornada de ayer: Juan 8, Pedro 8"), llamá "abrir_formulario" con modulo="asistencia" y campos={"fecha": "hoy"|"ayer"|"YYYY-MM-DD", "employees": [{"nombre":"Juan","horas":8,"work":"Casa Ángel"}, ...]}.
- Para UN SOLO empleado podés usar el formato simple: "Leo trabajó 8 horas en la obra de Hugo" o "Registra 6 horas de Angel en casa de chicho" → modulo="asistencia" con campos={"empleado":"Leo","horas":8,"obra":"Hugo"}.
- "fecha": "hoy" si no se aclara, "ayer" si dice "ayer", o la fecha ISO si la da explícita.
- "employees": array de {nombre, horas, work}. "work" = nombre de la obra si el usuario la menciona (ej. "en la obra Casa Ángel"); si no la menciona, dejá "work" vacío (""). Si un empleado no tiene horas, poné horas=0.

- Si el CONTEXTO muestra UNA sola obra activa y el usuario pide cargar un gasto/ingreso/adelanto SIN especificar obra, NO preguntes: llamá "abrir_formulario" con el campo "obra" vacío (la app la asigna sola automáticamente).
- Si hay VARIAS obras y el usuario NOMBRA una obra o cliente, usá ese nombre exacto en "obra"/"cliente".
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
          modulo: { type: "STRING", enum: ["empleado", "obra", "cliente", "presupuesto", "gasto", "ingreso", "inversion", "jornada", "adelanto", "consulta", "presupuesto_pdf", "asistencia", "reporte", "nueva_deuda"], description: "Qué formulario abrir o reporte generar. 'adelanto' = adelanto de dinero a un empleado. 'consulta' = pregunta sobre sus datos. 'presupuesto_pdf' = presupuesto en PDF. 'asistencia' = registrar horas trabajadas de empleados. 'reporte' = balance de obra, días trabajados, pagos o deuda de un empleado. 'nueva_deuda' = registrar una deuda en cuotas (concepto, monto, cuotas)." },
          campos: {
            type: "OBJECT",
            description: "Datos detectados por voz/texto. Claves posibles: nombre, apellido, rol, cliente, obra, empleado, monto, concepto, categoria, horas, ubicacion, presupuesto, query_type, target, items (solo con modulo='presupuesto_pdf').",
            properties: {
              nombre: { type: "STRING" },
              apellido: { type: "STRING" },
              rol: { type: "STRING" },
              cliente: { type: "STRING" },
              obra: { type: "STRING" },
              empleado: { type: "STRING" },
              monto: { type: "NUMBER" },
              concepto: { type: "STRING" },
              categoria: { type: "STRING" },
              horas: { type: "NUMBER" },
              ubicacion: { type: "STRING" },
              presupuesto: { type: "NUMBER" },
              query_type: { type: "STRING", enum: ["expenses_week", "balance_work", "attendance_today", "pending_salaries"] },
              target: { type: "STRING" },
              items: {
                type: "ARRAY",
                description: "Ítems del presupuesto (solo con modulo='presupuesto_pdf').",
                items: {
                  type: "OBJECT",
                  properties: {
                    descripcion: { type: "STRING" },
                    cantidad: { type: "NUMBER" },
                    precio: { type: "NUMBER" },
                  },
                },
              },
              tax: { type: "NUMBER", description: "Monto de IVA (solo si se menciona)" },
              discount: { type: "NUMBER", description: "Monto de descuento (solo si se menciona)" },
              fecha: { type: "STRING", description: "Fecha de la jornada: 'hoy', 'ayer' o 'YYYY-MM-DD' (solo con modulo='asistencia')" },
              employees: {
                type: "ARRAY",
                description: "Empleados y horas (solo con modulo='asistencia').",
                items: {
                  type: "OBJECT",
                  properties: {
                    nombre: { type: "STRING" },
                    horas: { type: "NUMBER" },
                    work: { type: "STRING", description: "Nombre de la obra (vacío si no se menciona)" },
                  },
                },
              },
            },
          },
        },
        required: ["modulo"],
      },
    }],
  }];
}

/* Herramientas en formato OpenAI (para DeepSeek): mismo contrato de la
   herramienta "abrir_formulario", pero con type: "function". */
function toolsOpenAI() {
  return [{
    type: "function",
    function: {
      name: "abrir_formulario",
      description: "Abrir el formulario de creación de GADU con los datos que el usuario ya mencionó, para que él termine de completar y confirme. Usar cuando el usuario quiere crear/registrar: empleado, obra, cliente, presupuesto, gasto, ingreso o jornada.",
      parameters: {
        type: "object",
        properties: {
          modulo: { type: "string", enum: ["empleado", "obra", "cliente", "presupuesto", "gasto", "ingreso", "inversion", "jornada", "adelanto", "consulta", "presupuesto_pdf", "asistencia", "reporte", "nueva_deuda"], description: "Qué formulario abrir o reporte generar. 'adelanto' = adelanto de dinero a un empleado. 'consulta' = pregunta sobre sus datos. 'presupuesto_pdf' = presupuesto en PDF. 'asistencia' = registrar horas trabajadas de empleados. 'reporte' = balance de obra, días trabajados, pagos o deuda de un empleado. 'nueva_deuda' = registrar una deuda en cuotas (concepto, monto, cuotas)." },
          campos: {
            type: "object",
            description: "Datos detectados por voz/texto. Claves posibles: nombre, apellido, rol, cliente, obra, empleado, monto, concepto, categoria, horas, ubicacion, presupuesto, query_type, target, items (solo con modulo='presupuesto_pdf').",
            properties: {
              nombre: { type: "string" },
              apellido: { type: "string" },
              rol: { type: "string" },
              cliente: { type: "string" },
              obra: { type: "string" },
              empleado: { type: "string" },
              monto: { type: "number" },
              concepto: { type: "string" },
              categoria: { type: "string" },
              horas: { type: "number" },
              ubicacion: { type: "string" },
              presupuesto: { type: "number" },
              query_type: { type: "string", enum: ["expenses_week", "balance_work", "attendance_today", "pending_salaries"] },
              target: { type: "string" },
              items: {
                type: "array",
                description: "Ítems del presupuesto (solo con modulo='presupuesto_pdf').",
                items: {
                  type: "object",
                  properties: {
                    descripcion: { type: "string" },
                    cantidad: { type: "number" },
                    precio: { type: "number" },
                  },
                },
              },
              tax: { type: "number", description: "Monto de IVA (solo si se menciona)" },
              discount: { type: "number", description: "Monto de descuento (solo si se menciona)" },
              fecha: { type: "string", description: "Fecha de la jornada: 'hoy', 'ayer' o 'YYYY-MM-DD' (solo con modulo='asistencia')" },
              employees: {
                type: "array",
                description: "Empleados y horas (solo con modulo='asistencia').",
                items: {
                  type: "object",
                  properties: {
                    nombre: { type: "string" },
                    horas: { type: "number" },
                    work: { type: "string", description: "Nombre de la obra (vacío si no se menciona)" },
                  },
                },
              },
            },
          },
        },
        required: ["modulo"],
      },
    },
  }];
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const { message, context, mode, stream, userId: providedUserId, service } = await req.json();
    const auth = req.headers.get("authorization") || "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

    // 1) Validar la sesión de Supabase (usuario autenticado).
    //    Modo servidor (conector de WhatsApp / omnicanal): llama con la service
    //    role y el userId explícito — mismo motor, distinto canal. La web sigue
    //    usando su token de sesión y no cambia en nada.
    let userId = "";
    // Modo servidor robusto: acepta el secreto compartido (x-service-secret)
    // o el service_role exacto. Así el conector de WhatsApp no depende de que
    // el JWT de service_role coincida byte a byte entre funciones.
    const serviceSecret = Deno.env.get("SERVICE_SECRET") || "";
    const serviceAuth = req.headers.get("x-service-secret") || "";
    const serviceOk = service === true && typeof providedUserId === "string" && providedUserId && (
      (serviceSecret && serviceAuth === serviceSecret) ||
      (serviceKey && auth === `Bearer ${serviceKey}`)
    );
    if (serviceOk) {
      userId = providedUserId;
    } else {
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
      userId = user.id;
    }

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

    const systemPrompt = mode === "admin" ? ADMIN_PROMPT : USER_PROMPT;
    const userText = `Contexto de mi cuenta:\n${finalContext || "sin contexto"}\n\nMi consulta:\n${message}`;

    // Cadena de modelos (3 máximo): si el principal está congestionado, probamos el siguiente.
    const modelos = [...new Set([
      Deno.env.get("GEMINI_MODEL") || "gemini-3.5-flash",
      "gemini-3.5-flash",
      "gemini-3.8-flash",
      "gemini-flash-latest",
    ])];

    // ---- Streaming (SSE) multi-proveedor: Groq → Gemini → OpenRouter ----
    if (stream) {
      const encoder = new TextEncoder();
      const sseStream = new ReadableStream({
        async start(controller) {
          const send = (obj: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
          let functionCall = null;
          let reply = "";
          let streamed = false;

          const providers = [
            { name: "deepseek", key: Deno.env.get("DEEPSEEK_API_KEY"), model: Deno.env.get("DEEPSEEK_MODEL") || "deepseek-chat" },
            { name: "groq", key: Deno.env.get("GROQ_API_KEY"), model: Deno.env.get("GROQ_MODEL") || "llama-3.3-70b-versatile" },
            { name: "gemini", key: Deno.env.get("GEMINI_API_KEY"), model: Deno.env.get("GEMINI_MODEL") || "gemini-3.5-flash" },
            { name: "openrouter", key: Deno.env.get("OPENROUTER_API_KEY"), model: Deno.env.get("OPENROUTER_MODEL") || "meta-llama/llama-3.3-70b-instruct" },
          ];

          for (const prov of providers) {
            if (!prov.key || streamed) continue;
            try {
              if (prov.name === "gemini") {
                // Gemini: con herramientas (function calling) y cadena de modelos
                for (const modelo of modelos) {
                  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:streamGenerateContent?alt=sse`;
                  const aiRes = await fetch(url, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "x-goog-api-key": prov.key },
                    body: JSON.stringify({
                      system_instruction: { parts: [{ text: systemPrompt }] },
                      contents: [{ role: "user", parts: [{ text: userText }] }],
                      tools: tools(),
                      generationConfig: { temperature: 0.4, maxOutputTokens: 700 },
                    }),
                  });
                  if (!aiRes.ok || !aiRes.body) { console.error(`[ai-assistant] gemini ${modelo} HTTP ${aiRes.status}`); continue; }
                  const reader = aiRes.body.getReader();
                  const decoder = new TextDecoder();
                  let buf = "";
                  while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    buf += decoder.decode(value, { stream: true });
                    const lines = buf.split("\n");
                    buf = lines.pop() || "";
                    for (const line of lines) {
                      const s = line.trim();
                      if (!s.startsWith("data: ")) continue;
                      const json = s.slice(6);
                      if (json === "[DONE]") continue;
                      try {
                        const obj = JSON.parse(json);
                        const part = obj?.candidates?.[0]?.content?.parts?.[0];
                        if (!part) continue;
                        if (part.functionCall) { functionCall = part.functionCall; continue; }
                        const txt = part.text || "";
                        if (txt) { reply += txt; streamed = true; send({ text: txt }); }
                      } catch (e) { /* chunk inválido */ }
                    }
                  }
                  if (streamed) break;
                }
              } else {
                // DeepSeek / Groq / OpenRouter: API compatible con OpenAI (streaming de texto)
                const baseUrls: Record<string, string> = {
                  deepseek: "https://api.deepseek.com",
                  groq: "https://api.groq.com/openai/v1",
                  openrouter: "https://openrouter.ai/api/v1",
                };
                const baseUrl = baseUrls[prov.name] || "https://api.groq.com/openai/v1";
                const headers: Record<string, string> = { "Content-Type": "application/json", "Authorization": `Bearer ${prov.key}` };
                if (prov.name === "openrouter") {
                  headers["HTTP-Referer"] = "https://gestiongadu.vercel.app";
                  headers["X-Title"] = "GADU";
                }
                const aiRes = await fetch(`${baseUrl}/chat/completions`, {
                  method: "POST",
                  headers,
                  body: JSON.stringify({
                    model: prov.model,
                    messages: [
                      { role: "system", content: systemPrompt },
                      { role: "user", content: userText },
                    ],
                    stream: true,
                    temperature: 0.4,
                    max_tokens: 700,
                  }),
                });
                if (!aiRes.ok || !aiRes.body) { console.error(`[ai-assistant] ${prov.name} HTTP ${aiRes.status}`); continue; }
                const reader = aiRes.body.getReader();
                const decoder = new TextDecoder();
                let buf = "";
                while (true) {
                  const { done, value } = await reader.read();
                  if (done) break;
                  buf += decoder.decode(value, { stream: true });
                  const lines = buf.split("\n");
                  buf = lines.pop() || "";
                  for (const line of lines) {
                    const s = line.trim();
                    if (!s.startsWith("data: ")) continue;
                    const json = s.slice(6);
                    if (json === "[DONE]") continue;
                    try {
                      const obj = JSON.parse(json);
                      const delta = obj?.choices?.[0]?.delta?.content;
                      if (delta) { reply += delta; streamed = true; send({ text: delta }); }
                    } catch (e) { /* chunk inválido */ }
                  }
                }
              }
            } catch (e) {
              console.error(`[ai-assistant] ${prov.name} excepción:`, e);
            }
          }

          let action = null;
          if (functionCall && functionCall.name === "abrir_formulario") {
            const args = functionCall.args || {};
            action = { modulo: args.modulo, campos: args.campos || {} };
            if (!reply) {
              const etiquetas: Record<string, string> = { empleado: "Empleados", obra: "Obras", cliente: "Clientes", presupuesto: "Presupuestos", gasto: "Gastos", ingreso: "Ingresos", jornada: "Jornada" };
              reply = `¡De acuerdo! Abrí el formulario de ${etiquetas[action.modulo] || action.modulo}. Completá lo que falta o confirmá la carga.`;
              send({ text: reply });
            }
          }
          if (!reply) { reply = fallbackText(); send({ text: reply }); }

          send({ done: true, action, reply });
          controller.close();
        },
      });

      return new Response(sseStream, {
        headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
      });
    }

    // ===== DeepSeek (no-streaming, con function calling) =====
    // El motor de TEXTO es DeepSeek. Gemini queda SOLO para audio (transcribe.ts).
    const deepseekKey = Deno.env.get("DEEPSEEK_API_KEY");
    if (!deepseekKey) {
      return new Response(JSON.stringify({ reply: fallbackText() }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const deepseekModel = Deno.env.get("DEEPSEEK_MODEL") || "deepseek-chat";
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    let reply = "";
    let functionCall: { name: string; args: Record<string, unknown> } | null = null;
    try {
      const aiRes = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${deepseekKey}` },
        body: JSON.stringify({
          model: deepseekModel,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userText },
          ],
          tools: toolsOpenAI(),
          temperature: 0.3,
          max_tokens: 800,
        }),
        signal: controller.signal,
      });
      if (!aiRes.ok) {
        const errBody = await aiRes.text();
        console.error(`[ai-assistant] deepseek falló (${aiRes.status}): ${errBody.slice(0, 400)}`);
      } else {
        const data = await aiRes.json();
        const msg = data?.choices?.[0]?.message;
        const t = msg?.content;
        if (t) reply = String(t).trim();
        const toolCalls = (msg?.tool_calls || []) as Array<{ function?: { name?: string; arguments?: string } }>;
        if (toolCalls.length) {
          const tc = toolCalls[0];
          if (tc?.function?.name === "abrir_formulario") {
            let args: Record<string, unknown> = {};
            try { args = JSON.parse(tc.function.arguments || "{}"); } catch (e) { console.error("[ai-assistant] args JSON inválido:", e); }
            functionCall = { name: "abrir_formulario", args };
          }
        }
      }
    } catch (e) {
      console.error("[ai-assistant] deepseek timeout/error:", e);
    } finally {
      clearTimeout(timer);
    }

    // Si hay llamada a "abrir_formulario", devolver la acción (compatible con executeAction)
    let action: { modulo: string; campos: Record<string, unknown> } | null = null;
    if (functionCall && functionCall.name === "abrir_formulario") {
      const args = functionCall.args || {};
      const modulo = String(args.modulo || "");
      const campos = (args.campos || {}) as Record<string, unknown>;
      action = { modulo, campos };
      console.log("[ai-assistant] abrir_formulario →", JSON.stringify(action));
      const etiquetas: Record<string, string> = { empleado: "Empleados", obra: "Obras", cliente: "Clientes", presupuesto: "Presupuestos", gasto: "Gastos", ingreso: "Ingresos", jornada: "Jornada" };
      const resumen = Object.entries(campos).map(([k, v]) => `${k}: ${v}`).join(", ");
      reply = `¡De acuerdo! Abrí el formulario de ${etiquetas[modulo] || modulo}${resumen ? " con " + resumen : ""}. Completá lo que falta o confirmá la carga.`;
    }

    if (!reply) {
      console.error("[ai-assistant] sin respuesta final de DeepSeek");
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
