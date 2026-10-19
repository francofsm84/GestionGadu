/* ============================================================
   GADU · Núcleo del conector de WhatsApp (lógica pura, testeable)
   Sin imports de Deno: lo consumen index.ts (Edge Function) y
   los tests de Node.
   ============================================================ */

export interface Incoming {
  from: string;   // teléfono normalizado (solo dígitos)
  text: string;   // texto o transcripción de la nota de voz
}

/* Acepta tanto el payload simple de un puente ({from, text}) como el
   formato webhook de Meta Cloud API (entry[].changes[].value). */
export function parseIncoming(payload: unknown): Incoming | null {
  try {
    const p = (payload || {}) as Record<string, unknown>;
    if (typeof p.from === "string" && typeof p.text === "string" && String(p.text).trim()) {
      return { from: rawDigits(p.from), text: String(p.text).trim() };
    }
    const entry = (p.entry as Array<Record<string, unknown>>)?.[0];
    const value = entry?.changes?.[0]?.value as Record<string, unknown>;
    const msg = (value?.messages as Array<Record<string, unknown>>)?.[0];
    if (!msg) return null;
    /* Emisor: contacts[0].wa_id → messages[0].from → metadata.display_phone_number.
       El payload de prueba de Meta trae el número en messages[0].from (y a veces
       contacts vacío); metadata.display_phone_number es el número del BOT (último recurso). */
    const from = String(
      (msg.from as string | undefined)
      || (value?.contacts as Array<Record<string, unknown>>)?.[0]?.wa_id
      || ""
    );
    let text = "";
    if (msg.type === "text") {
      text = String((msg.text as Record<string, unknown>)?.body || "");
    } else if (msg.type === "voice" || msg.type === "audio") {
      /* La transcripción llega del proveedor/puente (requisito del flujo) */
      text = String((msg.transcription as Record<string, unknown>)?.text || "");
    }
    if (!String(text).trim()) return null;
    /* `from` = dígitos exactos del wa_id (SIN insertar el 9): es el número que
       Meta espera en el campo `to` de la respuesta. La normalización con 9 se
       aplica aparte en phoneMatches para la comparación contra app_data. */
    return { from: rawDigits(from), text: String(text).trim() };
  } catch (_e) {
    return null;
  }
}

/* Extrae SOLO el teléfono del remitente (síncrono, sin transcripción).
   Se usa para rutear la cola: el texto se resuelve aparte con
   resolveIncomingText (que sí transcribe audio). */
export function extractFrom(payload: unknown): string {
  try {
    const p = (payload || {}) as Record<string, any>;
    if (typeof p.from === "string") return String(p.from).replace(/\D/g, "");
    const value = p.entry?.[0]?.changes?.[0]?.value;
    const msg = value?.messages?.[0];
    return String(msg?.from || value?.contacts?.[0]?.wa_id || "").replace(/\D/g, "");
  } catch (_e) {
    return "";
  }
}

/* Extrae el código de verificación del mensaje.
   Soporta el formato actual del botón "Vincular WhatsApp" ("Código: 99DKFR",
   alfanumérico) y el formato histórico ("código de verificación: 123456").
   Devuelve el código SIEMPRE en mayúsculas para comparar de forma estable. */
export function matchVerificationCode(text: string): string | null {
  /* Código de EXACTAMENTE 6 caracteres alfanuméricos. Se aplanan los
     acentos ANTES de matchear (código → codigo) para que la comparación
     sea robusta ante la codificación del texto que llega de Meta. */
  const flatText = String(text || "")
    .toLowerCase()
    .normalize("NFD").split("").filter((c: string) => { const n = c.charCodeAt(0); return n < 768 || n > 879; }).join("");
  const m = flatText.match(/codigo(?:\s+de\s+verificacion)?:?\s*([a-z0-9]{6})/i);
  return m ? m[1].toUpperCase() : null;
}

/* Detecta un código de licencia con formato "GADU-XXXXXX" (6 alfanuméricos).
   Tolera mayúsculas/minúsculas, espacios y guiones. Devuelve SIEMPRE en MAYÚSCULAS. */
export function matchLicenseCode(text: string): string | null {
  const flatText = String(text || "")
    .toLowerCase()
    .normalize("NFD").split("").filter((c: string) => { const n = c.charCodeAt(0); return n < 768 || n > 879; }).join("");
  const m = flatText.match(/\bgadu[- ]?([a-z0-9]{6})\b/i);
  return m ? "GADU-" + m[1].toUpperCase() : null;
}

export function normalizePhone(p: unknown): string {
  let d = rawDigits(p);
  /* Argentina (54): canonicaliza al formato SIN el "9" de móvil.
     "5493547469000" (13 dígitos) → "543547469000" (12 dígitos).
     Así "549…", "54…" y "+54…" (con o sin el 9) siempre comparan igual
     contra el teléfono guardado en app_data. */
  if (d.startsWith("549") && d.length === 13) {
    d = "54" + d.slice(3);
  }
  return d;
}

/* Dígitos exactos, sin la heurística del 9: se usa para el `to` del envío a
   Meta (debe ser el wa_id EXACTO que Meta reportó como remitente). */
export function rawDigits(p: unknown): string {
  return String(p == null ? "" : p).replace(/\D/g, "");
}

/* `to` para Meta en cuentas de PRUEBA de Argentina: descarta el "9" saliente
   de móvil. "5493547469000" (13 dígitos) → "543547469000" (12 dígitos).
   En sandbox de Meta a veces el destinatario permitido se registra SIN el 9. */
export function toMetaPhone(p: unknown): string {
  let d = rawDigits(p);
  if (d.startsWith("549") && d.length === 13) {
    d = "54" + d.slice(3);
  }
  return d;
}

/* El teléfono del perfil debe coincidir con el remitente (últimos 9 dígitos).
   Sin teléfono guardado en el perfil, el código por sí solo vincula. */
export function phoneMatches(profilePhone: unknown, sender: unknown): boolean {
  const a = normalizePhone(profilePhone);
  const b = normalizePhone(sender);
  if (!a || !b) return !a;   // sin teléfono en perfil → true; sin remitente → false
  return b.endsWith(a.slice(-9)) || a.endsWith(b.slice(-9));
}

/* Nombre de obra con el mismo fallback seguro del chat web */
export function workLabel(w: Record<string, unknown> | null | undefined): string {
  if (!w) return "";
  const cands = [w.nombre, w.name, w.titulo, w.nombreObra, w.nombre_obra];
  for (const c of cands) {
    if (c == null) continue;
    const s = String(c).trim();
    if (s && !/^(undefined|null|nan|\[object\s+object\])$/i.test(s)) return s;
  }
  return "";
}

function flat(s: string): string {
  return String(s || "").toLowerCase().normalize("NFD").split("").filter((c: string) => { const n = c.charCodeAt(0); return n < 768 || n > 879; }).join("");
}

export function findWork(works: Array<Record<string, unknown>>, mention: string): Record<string, unknown> | null {
  const fm = flat(String(mention || ""));
  if (!fm) return null;
  const exact = works.find(w => flat(workLabel(w)) === fm);
  if (exact) return exact;
  const partial = works.find(w => {
    const lbl = flat(workLabel(w));
    if (lbl.length >= 3 && (fm.includes(lbl) || lbl.includes(fm))) return true;
    /* Coincidencia por palabras (misma lógica del chat web): "la obra de pablo"
       resuelve a "casa pablo" por el prefijo de una palabra del nombre */
    return fm.split(/\s+/).some(word => word.length >= 5 && lbl.split(/\s+/).some(p => p.startsWith(word)));
  });
  return partial || null;
}

/* Palabras comunes → categorías canónicas del store */
/* Limpia prefijos comunes de un concepto: "pesos en papel de bano" → "papel de bano" */
function cleanConcept(raw: string): string {
  let s = String(raw || "").trim();
  let prev: string;
  do {
    prev = s;
    s = s.replace(/^(?:pesos?|peso|monto|total|importe|en|de|por|para|el|la|los|las|un|una|unos|unas)\s+/i, "");
  } while (s !== prev);
  /* Limpiar signos de puntuación al final: "hormigonera." → "hormigonera" */
  s = s.replace(/[.,;:!?\s]+$/g, "").trim();
  return s;
}

export function normCategory(raw: string): string {
  const limpio = cleanConcept(raw);
  const f = flat(limpio);
  if (!f) return "";
  if (/cemento|material|arena|ladrillo|hierro|pintura|yeso|cal|cer[aá]mic/.test(f)) return "Materiales";
  if (/nafta|gasoil|combustible|gas|diesel/.test(f)) return "Combustible";
  if (/flete|cami[oó]n|transporte|acarreo/.test(f)) return "Fletes";
  if (/comida|almuerzo|vianda|asado|bebida|cafe|desayuno|merienda|pan|empanada|picada/.test(f)) return "Comidas";
  if (/mano de obra|jornal|pe[oó]n|ayudante|oficial/.test(f)) return "Mano de obra";
  if (/herramienta|equipo|m[aá]quina|alquiler/.test(f)) return "Herramientas / Equipamiento";
  if (/seguro|art|p[oó]liza/.test(f)) return "Seguros";
  if (/servicio|luz|agua|internet|tel[eé]fono|gas natural/.test(f)) return "Servicios";
  if (/subcontrat|contratista/.test(f)) return "Subcontratos";
  if (/cigarrillo|tabaco|ocio|entretenimiento|cine|juego|recreaci[oó]n|esparcimiento/.test(f)) return "Ocio";
  return limpio;
}

/* Intención local simple (fallback sin LLM): registra gastos e ingresos con
   frases naturales, por si el motor de IA no está disponible o falla la auth
   servidor→servidor. Ej.: "Gasté 15000 en bolsas de cemento" ·
   "Ingresé 80000 por la obra de Pablo". */
export function localIntent(text: string): { modulo: string; campos?: Record<string, unknown>; reply?: string } | null {
  const f = flat(String(text || "")).trim();
  if (!f) return null;
  const num = (s: string) => {
    let t = String(s || "").trim();
    if (!t) return 0;
    if (t.includes(".") && t.includes(",")) {
      /* AR: "19.813,47" → 19813.47 (punto=miles, coma=decimal) */
      t = t.replace(/\./g, "").replace(",", ".");
    } else if (t.includes(",")) {
      const parts = t.split(",");
      if (parts.length === 2 && parts[1].length >= 1 && parts[1].length <= 2) t = t.replace(",", ".");
      else t = t.replace(/,/g, "");
    } else if (t.includes(".")) {
      /* Solo punto: si el ÚLTIMO grupo tiene 1-2 dígitos → decimal ("19813.47"),
         si no → miles ("19.813"). */
      const lastDot = t.lastIndexOf(".");
      const decimals = t.length - lastDot - 1;
      if (decimals >= 1 && decimals <= 2 && lastDot > 0) {
        const intPart = t.slice(0, lastDot).replace(/\./g, "");
        t = intPart + "." + t.slice(lastDot + 1);
      } else {
        t = t.replace(/\./g, "");
      }
    }
    const n = Number(t);
    return isFinite(n) ? n : 0;
  };

  /* 0) Saludo → intent de saludo (respuesta directa, sin acción contable) */
  if (/^(hola|holis|holi|buenas|buen\s*d[ií]a|buenos\s*d[ií]as|que\s*tal|c[oó]mo\s+(est[aá]s|est[aá]n|va)|hey|alo)\s*[.!?,]*$/.test(f)) {
    return {
      modulo: "saludo",
      reply: "¡Hola! 👋 Soy GADU, tu asistente de obra. Podés cargarme gastos o ingresos por acá, por ejemplo:\n• \"Gasté 15000 en cemento\"\n• \"Cobré 50000 por la obra\"\n\n¿En qué te ayudo?",
    };
  }

  /* 1) Gasto explícito: monto + (moneda opcional) + "en/de" + descripción */
  let m = f.match(/gas(?:te|to|t[eé]|t[oó])\s+(?:de\s+)?\$?\s*([\d][\d.,]*)\s+(?:(?:pesos?|peso|mangos?|lucas?|ars|usd|d[oó]lares)\s+)?(?:en|de)\s+(.+)/i);
  if (m && num(m[1]) > 0) {
    return { modulo: "gasto", campos: { monto: num(m[1]), categoria: String(m[2] || "").trim() } };
  }
  /* 2) Gasto explícito: monto + descripción sin preposición ("Gasto 1000 prueba") */
  m = f.match(/gas(?:te|to|t[eé]|t[oó])\s+(?:de\s+)?\$?\s*([\d][\d.,]*)\s+([a-záéíóúñ].*)/i);
  if (m && num(m[1]) > 0) {
    return { modulo: "gasto", campos: { monto: num(m[1]), categoria: String(m[2] || "").trim() } };
  }
  /* 3) Gasto explícito: descripción + monto al final ("Gasto flete 15000") */
  m = f.match(/gas(?:te|to|t[eé]|t[oó])\s+(.+?)\s+([\d][\d.,]*)\s*$/i);
  if (m && num(m[2]) > 0) {
    return { modulo: "gasto", campos: { monto: num(m[2]), categoria: String(m[1] || "").trim() } };
  }

  /* 4) Ingreso: "Cobré 50000 por la obra" / "Ingresé 80000 pesos por la obra" */
  m = f.match(/(?:cobr[eé]?|ingres[eé]?|cobro|ingreso)\s+(?:de\s+)?\$?\s*([\d][\d.,]*)\s+(?:(?:pesos?|peso|mangos?|lucas?|ars|usd|d[oó]lares)\s+)?(?:por|de)\s+(.+)/i);
  if (m && num(m[1]) > 0) {
    return { modulo: "ingreso", campos: { monto: num(m[1]), concepto: String(m[2] || "").trim() } };
  }
  /* 4b) Ingreso solo monto: "Ingreso de 30000" / "Cobré 30000" */
  m = f.match(/(?:cobr[eé]?|ingres[eé]?|cobro|ingreso)\s+(?:de\s+)?\$?\s*([\d][\d.,]*)\s*$/i);
  if (m && num(m[1]) > 0) {
    return { modulo: "ingreso", campos: { monto: num(m[1]), concepto: "Cobro" } };
  }

  /* 4c) Inversión: "Invertí 50000 pesos en una máquina" / "Inversión de 10000 mangos en capital" */
  m = f.match(/(?:invert[ií]|inversion|inversi[oó]n|invertir|compr[eé]\s+(?:para\s+)?invertir)\s+(?:de\s+)?\$?\s*([\d][\d.,]*)\s+(?:(?:pesos?|peso|mangos?|lucas?|ars|usd|d[oó]lares)\s+)?(?:en|de)\s+(.+)/i);
  if (m && num(m[1]) > 0) {
    return { modulo: "inversion", campos: { monto: num(m[1]), categoria: String(m[2] || "").trim() } };
  }

  /* 5) Empleado: "Agrega un nuevo empleado Juan Carlos Maldonado" / "empleado. Jorge"
        Extrae el nombre y, si detecta un oficio conocido al final, lo separa como rol
        (red de seguridad si la IA no responde). */
  const OFICIOS = [
    "peon de albanil", "oficial albanil", "oficial electricista", "oficial plomero",
    "maestro mayor de obra", "albanil", "plomero", "electricista", "pintor",
    "carpintero", "ayudante", "oficial", "herrero", "gasista", "yesero", "tornero",
  ];
  const separarEmpleado = (raw: string): { nombre: string; rol: string } => {
    const nombre = String(raw || "").trim();
    const fn = flat(nombre);
    for (const o of OFICIOS) {
      if (fn.endsWith(o) && nombre.length > o.length) {
        const nombreLimpio = nombre.slice(0, nombre.length - o.length).trim();
        const rol = nombre.slice(nombre.length - o.length).trim();
        if (nombreLimpio) return { nombre: nombreLimpio, rol };
      }
    }
    return { nombre, rol: "" };
  };
  m = f.match(/(?:agreg[aá]|agrega|alta|sumar|crear|contratar)\s+(?:un\s+)?(?:nuevo\s+)?empleado[\s.,;:]+(.+)/i);
  if (m && String(m[1] || "").trim()) {
    const sp = separarEmpleado(m[1]);
    return { modulo: "empleado", campos: { nombre: sp.nombre, rol: sp.rol } };
  }
  m = f.match(/nuevo\s+empleado[\s.,;:]+(.+)/i);
  if (m && String(m[1] || "").trim()) {
    const sp = separarEmpleado(m[1]);
    return { modulo: "empleado", campos: { nombre: sp.nombre, rol: sp.rol } };
  }

  /* 6) Adelanto: "Carga adelanto de 25000 a Luis Álamo" */
  m = f.match(/(?:adelanto|anticipo)\s+(?:de\s+)?\$?\s*([\d][\d.,]*)\s+(?:a|para)\s+(.+)/i);
  if (m && num(m[1]) > 0) return { modulo: "adelanto", campos: { monto: num(m[1]), empleado: String(m[2] || "").trim() } };

  /* 7) Obra: "Nueva obra Pérez en Alta Gracia" */
  m = f.match(/(?:nueva\s+obra|crear\s+obra|obra\s+nueva)\s+(.+?)(?:\s+en\s+(.+))?$/i);
  if (m && String(m[1] || "").trim()) return { modulo: "obra", campos: { nombre: String(m[1] || "").trim(), ubicacion: String(m[2] || "").trim() } };

  /* 7b) Gasto SIN verbo: "45678 de nafta" / "5000 de cemento" (número + "de" + concepto) */
  m = f.match(/^([\d][\d.,]*)\s+de\s+(.+)/i);
  if (m && num(m[1]) > 0) {
    return { modulo: "gasto", campos: { monto: num(m[1]), categoria: String(m[2] || "").trim() } };
  }

  /* 8) Gasto implícito SIN la palabra "gasto": "Flete 15000" / "Nafta 8000" */
  m = f.match(/^([a-záéíóúñ][a-záéíóúñ0-9\s]{1,40}?)\s+([\d][\d.,]*)\s*$/i);
  if (m && num(m[2]) > 0) {
    return { modulo: "gasto", campos: { monto: num(m[2]), categoria: String(m[1] || "").trim() } };
  }

  return null;
}

/* Detecta la intención de "adelanto" y extrae nombre + monto (tolera "12000p").
   "Adelanto de Hugo pereyra de 12000p" → { nombre: "hugo pereyra", monto: 12000 }
   "Adelanto" → { nombre: "", monto: 0 } (para arrancar el wizard paso a paso) */
export function detectAdvanceIntent(text: string): { nombre: string; monto: number } | null {
  const f = flat(String(text || "")).trim();
  if (!/(?:adelanto|anticipo)/i.test(f)) return null;

  // monto: número, tolerando "p"/"pe"/"pesos" pegada al final ("12000p")
  const mMonto = f.match(/([\d][\d.,]*)\s*(?:p|pe|pesos|peso)?(?=\s|$)/i);
  const monto = mMonto ? Number(mMonto[1].replace(/\./g, "").replace(",", ".")) : 0;

  // nombre: quitar palabras clave y el monto, quedan las palabras del nombre
  const nombre = f
    .replace(/adelanto|anticipo/gi, " ")
    .replace(/\b(?:de|del|a|para|al|le)\b/gi, " ")
    .replace(/[\d][\d.,]*\s*(?:p|pe|pesos|peso)?/gi, " ")
    .replace(/[^\wáéíóúñÁÉÍÓÚÑ\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return { nombre, monto };
}

/* Parsea la respuesta del wizard de adelanto sin la palabra "adelanto":
   "Hugo de 12000" → { nombre: "Hugo", monto: 12000 } */
export function parseAdvanceNameAmount(text: string): { nombre: string; monto: number } | null {
  const f = String(text || "").trim();
  const m = f.match(/^([a-záéíóúñ][a-záéíóúñ\s.'-]{2,40}?)\s+(?:de\s+)?\$?\s*([\d][\d.,]*)\s*(?:p|pe|pesos|peso)?\s*$/i);
  if (!m) return null;
  const monto = Number(m[2].replace(/\./g, "").replace(",", "."));
  if (!(monto > 0)) return null;
  return { nombre: m[1].trim(), monto };
}

export interface ExecResult {
  ok: boolean;
  label?: string;
  missing?: string;      // dato faltante para pedirlo por chat
  unsupported?: string;  // módulo que el conector no ejecuta (lo responde la IA)
  pendingWork?: boolean; // se guardó sin obra: el webhook debe preguntar "¿a qué obra?"
  notFound?: string;     // mensaje cuando la entidad nombrada no existe (ej. empleado)
}

/* Contexto compacto de la cuenta (mismo espíritu que context() del chat web) */
export function buildContext(data: Record<string, unknown>): string {
  const d = (data || {}) as Record<string, Array<Record<string, unknown>>>;
  let s = "";
  const works = (d.works || []).map(w => workLabel(w) + (w.status ? " (" + w.status + ")" : ""));
  if (works.length) s += " Obras: " + works.slice(0, 8).join(", ") + ".";
  const clis = (d.contacts || []).filter(c => (c.type || "cliente") === "cliente").map(c => c.name);
  if (clis.length) s += " Clientes: " + clis.slice(0, 8).join(", ") + ".";
  const emps = (d.employees || []).map(e => ((e.firstName || "") + " " + (e.lastName || "")).trim());
  if (emps.length) s += " Empleados: " + emps.slice(0, 8).join(", ") + ".";
  const assets = (d.assets || []).map(a => a.name + " (" + (a.status || "operativo") + ")");
  if (assets.length) s += " Herramientas: " + assets.slice(0, 8).join(", ") + ".";
  return s.trim();
}

/* Desambiguación de "adelanto de [Nombre]": ¿cliente (cobro anticipado) o empleado (adelanto)?
   Devuelve { kind: "cliente" | "empleado" | "desconocido", id, nombre }. */
export function resolveAdvanceTarget(data: Record<string, unknown>, nombre: string): { kind: string; id?: string; nombre: string } {
  const d = (data || {}) as Record<string, Array<Record<string, unknown>>>;
  const fn = flat(nombre);
  const cli = (d.contacts || []).find((c) => flat(String(c.name || "")).includes(fn));
  if (cli) return { kind: "cliente", id: String(cli.id || ""), nombre: String(cli.name || nombre) };
  const emp = (d.employees || []).find((e) => flat(String((e.firstName || "") + " " + (e.lastName || "")).trim()).includes(fn));
  if (emp) return { kind: "empleado", id: String(emp.id || ""), nombre: String(((emp.firstName || "") + " " + (emp.lastName || "")).trim() || nombre) };
  return { kind: "desconocido", nombre };
}

/* Normaliza el texto del empleado: quita relleno ("agrega", "nuevo", "se llama"),
   separa el oficio/rol (paréntesis o al final) y deja el nombre en Title Case.
   "agrega un empleado nuevo. se llama juan rodriguez albañil" → { firstName:"Juan", lastName:"Rodriguez", role:"Albañil" } */
export function formatProperName(raw: string): { firstName: string; lastName: string; role: string } {
  const title = (str: string) => str.toLowerCase().replace(/(^|\s)([a-záéíóúñ])/g, (_m: string, p1: string, p2: string) => p1 + p2.toUpperCase());

  let s = String(raw || "").toLowerCase()
    .replace(/[.,;:!?¿¡()]/g, ' ')
    .replace(/\s+/g, ' ').trim();

  // 1) Quitar relleno típico del dictado por WhatsApp
  s = s.replace(/\b(?:agrega|agregá|agregar|alta|crear|crea|nuevo|nueva|un|una|empleado|trabajador|se\s+llama|llamado|llamada|me\s+llamo|quiero\s+(?:agregar|cargar)|cargar)\b/g, ' ')
    .replace(/\s+/g, ' ').trim();

  // 2) Rol entre paréntesis al final (ej. "juan perez (albañil)")
  let role = '';
  const m = s.match(/\(([^)]+)\)\s*$/);
  if (m) { role = m[1].trim(); s = s.slice(0, m.index).trim(); }

  // 3) Rol al final sin paréntesis (oficios conocidos)
  if (!role) {
    const ROLES = [
      'maestro mayor de obra', 'peon de albañil', 'peon de albanil', 'oficial albañil', 'oficial albanil',
      'oficial electricista', 'oficial plomero', 'albañil', 'albanil', 'electricista', 'plomero',
      'pintor', 'carpintero', 'ayudante', 'oficial', 'herrero', 'gasista', 'yesero', 'tornero',
    ];
    for (const r of ROLES) {
      if (s.endsWith(r)) { role = r; s = s.slice(0, s.length - r.length).trim(); break; }
    }
  }

  // 4) Title Case + dividir en firstName / lastName
  const nombre = title(s);
  role = role ? title(role) : '';
  const partes = nombre.split(/\s+/).filter(Boolean);
  const firstName = partes[0] || '';
  const lastName = partes.slice(1).join(' ');

  return { firstName, lastName, role };
}

/* Ejecuta la acción del motor sobre los datos del usuario (misma lógica
   que el wizard del chat web: solo guarda con los campos obligatorios).
   No toca nada si falta un dato: devuelve qué falta para preguntarlo. */
export function executeAction(
  data: Record<string, unknown>,
  action: { modulo: string; campos?: Record<string, unknown> },
  sourceText: string,
  idGen: () => string,
  todayISO: string,
): ExecResult {
  const d = (data || {}) as Record<string, Array<Record<string, unknown>>>;
  const c = (action && action.campos) || {};
  const works = (d.works || []).filter(w => w.status !== "finalizada");
  const activas = works.filter(w => w.status === "activa");

  const resolveObra = (): { workId: string | null; label: string; missing: string | null } => {
    if (c.obra) {
      const w = findWork(works, String(c.obra));
      if (w) return { workId: String(w.id), label: workLabel(w), missing: null };
    }
    if (activas.length === 1) {
      return { workId: String(activas[0].id), label: workLabel(activas[0]), missing: null };
    }
    return { workId: null, label: "", missing: "la obra" };
  };

  const monto = Number(c.monto);
  if (action.modulo === "gasto") {
    if (!(monto > 0)) return { ok: false, missing: "el monto" };
    const concepto = cleanConcept(String(c.categoria || sourceText || "")).slice(0, 60) || "gasto";
    const cat = normCategory(String(c.categoria || sourceText));
    if (!cat) return { ok: false, missing: "la categoría" };
    const montoFmt = monto.toLocaleString("es-AR");
    const ob = resolveObra();
    if (ob.missing) {
      /* Quick Capture: sin obra → se guarda "sin asignar" (workId null). */
      (d.expenses || (d.expenses = [])).unshift({
        id: idGen(), type: "general", workId: null, date: todayISO, amount: monto,
        category: cat, providerId: null, employeeId: null, expenseKind: null,
        description: String(sourceText || "").slice(0, 200), invoiceNumber: "", paymentMethod: "", source: "whatsapp",
      } as unknown as Record<string, unknown>);
      console.log("[GADU-WA-INBOX] gasto sin obra guardado en bandeja: $" + monto + " (" + cat + ")");
      return { ok: true, pendingWork: true, label: "Gasto registrado: $" + montoFmt + " en " + concepto + " (" + cat + ") (Pendiente de asignar a obra)" };
    }
    (d.expenses || (d.expenses = [])).unshift({
      id: idGen(), type: "obra", workId: ob.workId, date: todayISO, amount: monto,
      category: cat, providerId: null, employeeId: null, expenseKind: null,
      description: String(sourceText || "").slice(0, 200), invoiceNumber: "", paymentMethod: "", source: "whatsapp",
    } as unknown as Record<string, unknown>);
    return { ok: true, label: "Gasto registrado: $" + montoFmt + " en " + concepto + " (" + cat + ") en " + ob.label };
  }
  if (action.modulo === "inversion") {
    if (!(monto > 0)) return { ok: false, missing: "el monto" };
    const concepto = cleanConcept(String(c.categoria || sourceText || "")).slice(0, 60) || "inversion";
    const montoFmt = monto.toLocaleString("es-AR");
    (d.expenses || (d.expenses = [])).unshift({
      id: idGen(), type: "general", workId: null, date: todayISO, amount: monto,
      category: "Inversion", providerId: null, employeeId: null, expenseKind: "inversion",
      description: String(sourceText || "").slice(0, 200), invoiceNumber: "", paymentMethod: "", source: "whatsapp",
    } as unknown as Record<string, unknown>);
    return { ok: true, label: "Inversion registrada: $" + montoFmt + " en " + concepto };
  }
  if (action.modulo === "ingreso") {
    if (!(monto > 0)) return { ok: false, missing: "el monto" };
    const concepto = ["Adelanto", "Certificación", "Cobro"].find(x => flat(String(c.concepto || "")).includes(flat(x))) || "Cobro";
    const ob = resolveObra();
    const esAdelanto = concepto === "Adelanto";
    /* Solo los "adelantos" de cliente pueden quedar sin obra (se pregunta después) */
    if (ob.missing && !esAdelanto) return { ok: false, missing: ob.missing };
    /* Cliente (si se nombra): buscar en el directorio para guardar su clientId */
    let clientId: string | null = null;
    let clientName = "";
    const clienteRaw = String(c.cliente || "").trim();
    if (clienteRaw) {
      const cli = (d.contacts || []).find((x: Record<string, unknown>) => flat(String(x.name || "")).includes(flat(clienteRaw)));
      if (cli) { clientId = String(cli.id || ""); clientName = String(cli.name || ""); }
    }
    (d.incomes || (d.incomes = [])).unshift({
      id: idGen(), workId: ob.workId, clientId, date: todayISO, amount: monto,
      concept: concepto, method: "", reference: "", notes: String(sourceText || "").slice(0, 200),
      incomeKind: concepto === "Adelanto" ? "adelanto" : "pago", source: "whatsapp",
    } as unknown as Record<string, unknown>);
    const label = concepto === "Adelanto" && clientName
      ? "Ingreso de $" + monto + " (Adelanto) del cliente " + clientName + " guardado"
      : "Ingreso de $" + monto + " (" + concepto + ") en " + ob.label + " ✓";
    return { ok: true, label, pendingWork: !!(esAdelanto && ob.missing) };
  }
  if (action.modulo === "empleado") {
    const raw = String(c.nombre || "").trim();
    if (!raw) return { ok: false, missing: "el nombre del empleado" };
    const { firstName, lastName, role: rolParen } = formatProperName(raw);
    const rol = String(c.rol || rolParen || "").trim();
    (d.employees || (d.employees = [])).push({
      id: idGen(), firstName, lastName, phone: "", role: rol || "empleado", active: true, source: "whatsapp",
    } as unknown as Record<string, unknown>);
    const nombre = (firstName + " " + lastName).trim();
    return { ok: true, label: "Empleado '" + nombre + "'" + (rol ? " (" + rol + ")" : "") + " agregado correctamente ✓" };
  }

  if (action.modulo === "adelanto") {
    const montoAd = Number(c.monto);
    if (!(montoAd > 0)) return { ok: false, missing: "el monto del adelanto" };
    const empleadoRaw = String(c.empleado || "").trim();
    if (!empleadoRaw) return { ok: false, missing: "el nombre del empleado" };
    /* Buscar el empleado por nombre (firstName + lastName) para obtener su employeeId */
    const emp = (d.employees || []).find((e: Record<string, unknown>) =>
      flat(String((e.firstName || "") + " " + (e.lastName || "")).trim()).includes(flat(empleadoRaw))
    );
    if (!emp) {
      return { ok: false, notFound: "No encontré a ese empleado en tu lista. ¿Querés crearlo primero?" };
    }
    const nombreEmp = String((emp.firstName || "") + " " + (emp.lastName || "")).trim();
    (d.expenses || (d.expenses = [])).unshift({
      id: idGen(), type: "general", workId: null, date: todayISO, amount: montoAd,
      category: "Adelanto", providerId: null, employeeId: String(emp.id || ""), expenseKind: "adelanto",
      description: "Adelanto a " + nombreEmp, invoiceNumber: "", paymentMethod: "Efectivo", source: "whatsapp",
    } as unknown as Record<string, unknown>);
    return { ok: true, label: "Adelanto de $" + montoAd + " a " + nombreEmp + " registrado ✓" };
  }

  if (action.modulo === "obra") {
    const nombreObra = String(c.nombre || "").trim();
    if (!nombreObra) return { ok: false, missing: "el nombre de la obra" };
    (d.works || (d.works = [])).unshift({
      id: idGen(), nombre: nombreObra, ubicacion: String(c.ubicacion || ""), status: "activa", source: "whatsapp",
    } as unknown as Record<string, unknown>);
    return { ok: true, label: "Obra '" + nombreObra + "' creada ✓" };
  }

  /* Módulos con wizard complejo: los responde la IA guiando a la app web */
  return { ok: false, unsupported: action.modulo };
}
