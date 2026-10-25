/* ============================================================
   GADU   Nucleo del conector de WhatsApp (logica pura, testeable)
   Sin imports de Deno: lo consumen index.ts (Edge Function) y
   los tests de Node.
   ============================================================ */

export interface Incoming {
  from: string;   // telefono normalizado (solo digitos)
  text: string;   // texto o transcripcion de la nota de voz
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
    /* Emisor: contacts[0].wa_id -> messages[0].from -> metadata.display_phone_number.
       El payload de prueba de Meta trae el numero en messages[0].from (y a veces
       contacts vacio); metadata.display_phone_number es el numero del BOT (ultimo recurso). */
    const from = String(
      (msg.from as string | undefined)
      || (value?.contacts as Array<Record<string, unknown>>)?.[0]?.wa_id
      || ""
    );
    let text = "";
    if (msg.type === "text") {
      text = String((msg.text as Record<string, unknown>)?.body || "");
    } else if (msg.type === "voice" || msg.type === "audio") {
      /* La transcripcion llega del proveedor/puente (requisito del flujo) */
      text = String((msg.transcription as Record<string, unknown>)?.text || "");
    }
    if (!String(text).trim()) return null;
    /* `from` = digitos exactos del wa_id (SIN insertar el 9): es el numero que
       Meta espera en el campo `to` de la respuesta. La normalizacion con 9 se
       aplica aparte en phoneMatches para la comparacion contra app_data. */
    return { from: rawDigits(from), text: String(text).trim() };
  } catch (_e) {
    return null;
  }
}

/* Extrae SOLO el telefono del remitente (sincrono, sin transcripcion).
   Se usa para rutear la cola: el texto se resuelve aparte con
   resolveIncomingText (que si transcribe audio). */
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

/* Extrae el codigo de verificacion del mensaje.
   Soporta el formato actual del boton "Vincular WhatsApp" ("Codigo: 99DKFR",
   alfanumerico) y el formato historico ("codigo de verificacion: 123456").
   Devuelve el codigo SIEMPRE en mayusculas para comparar de forma estable. */
export function matchVerificationCode(text: string): string | null {
  /* Codigo de EXACTAMENTE 6 caracteres alfanumericos. Se aplanan los
     acentos ANTES de matchear (codigo -> codigo) para que la comparacion
     sea robusta ante la codificacion del texto que llega de Meta. */
  const flatText = String(text || "")
    .toLowerCase()
    .normalize("NFD").split("").filter((c: string) => { const n = c.charCodeAt(0); return n < 768 || n > 879; }).join("");
  const m = flatText.match(/codigo(?:\s+de\s+verificacion)?:?\s*([a-z0-9]{6})/i);
  return m ? m[1].toUpperCase() : null;
}

/* Detecta un codigo de licencia con formato "GADU-XXXXXX" (6 alfanumericos).
   Tolera mayusculas/minusculas, espacios y guiones. Devuelve SIEMPRE en MAYUSCULAS. */
export function matchLicenseCode(text: string): string | null {
  const flatText = String(text || "")
    .toLowerCase()
    .normalize("NFD").split("").filter((c: string) => { const n = c.charCodeAt(0); return n < 768 || n > 879; }).join("");
  const m = flatText.match(/\bgadu[- ]?([a-z0-9]{6})\b/i);
  return m ? "GADU-" + m[1].toUpperCase() : null;
}

export function normalizePhone(p: unknown): string {
  let d = rawDigits(p);
  /* Argentina (54): canonicaliza al formato SIN el "9" de movil.
     "5493547469000" (13 digitos) -> "543547469000" (12 digitos).
     Asi "549...", "54..." y "+54..." (con o sin el 9) siempre comparan igual
     contra el telefono guardado en app_data. */
  if (d.startsWith("549") && d.length === 13) {
    d = "54" + d.slice(3);
  }
  return d;
}

/* Digitos exactos, sin la heuristica del 9: se usa para el `to` del envio a
   Meta (debe ser el wa_id EXACTO que Meta reporto como remitente). */
export function rawDigits(p: unknown): string {
  return String(p == null ? "" : p).replace(/\D/g, "");
}

/* Parser robusto de numeros (AR): maneja "19813.47", "19.813,47", "19.813",
   "500000", "500 lucas", etc. Punto=miles   coma=decimal cuando corresponde. */
export function num(s: unknown): number {
  let t = String(s == null ? "" : s).trim();
  if (!t) return 0;
  if (t.includes(".") && t.includes(",")) {
    /* AR: "19.813,47" -> 19813.47 (punto=miles, coma=decimal) */
    t = t.replace(/\./g, "").replace(",", ".");
  } else if (t.includes(",")) {
    const parts = t.split(",");
    if (parts.length === 2 && parts[1].length >= 1 && parts[1].length <= 2) t = t.replace(",", ".");
    else t = t.replace(/,/g, "");
  } else if (t.includes(".")) {
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
}

/* `to` para Meta en cuentas de PRUEBA de Argentina: descarta el "9" saliente
   de movil. "5493547469000" (13 digitos) -> "543547469000" (12 digitos).
   En sandbox de Meta a veces el destinatario permitido se registra SIN el 9. */
export function toMetaPhone(p: unknown): string {
  let d = rawDigits(p);
  if (d.startsWith("549") && d.length === 13) {
    d = "54" + d.slice(3);
  }
  return d;
}

/* El telefono del perfil debe coincidir con el remitente (ultimos 9 digitos).
   Sin telefono guardado en el perfil, el codigo por si solo vincula. */
export function phoneMatches(profilePhone: unknown, sender: unknown): boolean {
  const a = normalizePhone(profilePhone);
  const b = normalizePhone(sender);
  if (!a || !b) return !a;   // sin telefono en perfil -> true; sin remitente -> false
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
    /* Coincidencia por palabras (misma logica del chat web): "la obra de pablo"
       resuelve a "casa pablo" por el prefijo de una palabra del nombre */
    return fm.split(/\s+/).some(word => word.length >= 5 && lbl.split(/\s+/).some(p => p.startsWith(word)));
  });
  return partial || null;
}

/* Palabras comunes -> categorias canonicas del store */
/* Limpia prefijos comunes de un concepto: "pesos en papel de bano" -> "papel de bano" */
function cleanConcept(raw: string): string {
  let s = String(raw || "").trim();
  let prev: string;
  do {
    prev = s;
    s = s.replace(/^(?:pesos?|peso|monto|total|importe|en|de|por|para|el|la|los|las|un|una|unos|unas)\s+/i, "");
  } while (s !== prev);
  /* Limpiar signos de puntuacion al final: "hormigonera." -> "hormigonera" */
  s = s.replace(/[.,;:!?\s]+$/g, "").trim();
  return s;
}

export function normCategory(raw: string): string {
  const limpio = cleanConcept(raw);
  const f = flat(limpio);
  if (!f) return "";
  if (/cemento|material|arena|ladrillo|hierro|pintura|yeso|cal|cer[aa]mic/.test(f)) return "Materiales";
  if (/nafta|gasoil|combustible|gas|diesel/.test(f)) return "Combustible";
  if (/flete|cami[oo]n|transporte|acarreo/.test(f)) return "Fletes";
  if (/comida|almuerzo|vianda|asado|bebida|cafe|desayuno|merienda|pan|empanada|picada/.test(f)) return "Comidas";
  if (/mano de obra|jornal|pe[oo]n|ayudante|oficial/.test(f)) return "Mano de obra";
  if (/herramienta|equipo|m[aa]quina|alquiler/.test(f)) return "Herramientas / Equipamiento";
  if (/seguro|art|p[oo]liza/.test(f)) return "Seguros";
  if (/servicio|luz|agua|internet|tel[ee]fono|gas natural/.test(f)) return "Servicios";
  if (/subcontrat|contratista/.test(f)) return "Subcontratos";
  if (/cigarrillo|tabaco|ocio|entretenimiento|cine|juego|recreaci[oo]n|esparcimiento/.test(f)) return "Ocio";
  return limpio;
}

/* Intencion local simple (fallback sin LLM): registra gastos e ingresos con
   frases naturales, por si el motor de IA no esta disponible o falla la auth
   servidor->servidor. Ej.: "Gaste 15000 en bolsas de cemento"  
   "Ingrese 80000 por la obra de Pablo". */
export function localIntent(text: string): { modulo: string; campos?: Record<string, unknown>; reply?: string } | null {
  const f = flat(String(text || "")).trim();
  if (!f) return null;
  const num = (s: string) => {
    let t = String(s || "").trim();
    if (!t) return 0;
    if (t.includes(".") && t.includes(",")) {
      /* AR: "19.813,47" -> 19813.47 (punto=miles, coma=decimal) */
      t = t.replace(/\./g, "").replace(",", ".");
    } else if (t.includes(",")) {
      const parts = t.split(",");
      if (parts.length === 2 && parts[1].length >= 1 && parts[1].length <= 2) t = t.replace(",", ".");
      else t = t.replace(/,/g, "");
    } else if (t.includes(".")) {
      /* Solo punto: si el ULTIMO grupo tiene 1-2 digitos -> decimal ("19813.47"),
         si no -> miles ("19.813"). */
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

  /* 0) Saludo -> intent de saludo (respuesta directa, sin accion contable) */
  if (/^(hola|holis|holi|buenas|buen\s*d[ii]a|buenos\s*d[ii]as|que\s*tal|c[oo]mo\s+(est[aa]s|est[aa]n|va)|hey|alo)\s*[.!?,]*$/.test(f)) {
    return {
      modulo: "saludo",
      reply: "Hola! \uD83D\uDC4B Soy GADU, tu asistente de obra. Podes cargarme gastos o ingresos por aca, por ejemplo:\n- \"Gaste 15000 en cemento\"\n- \"Cobre 50000 por la obra\"\n\nEn que te ayudo?",
    };
  }

  /* 1) Gasto explicito: monto + (moneda opcional) + "en/de" + descripcion */
  let m = f.match(/gas(?:te|to|t[ee]|t[oo])\s+(?:de\s+)?\$?\s*([\d][\d.,]*)\s+(?:(?:pesos?|peso|mangos?|lucas?|ars|usd|d[oo]lares)\s+)?(?:en|de)\s+(.+)/i);
  if (m && num(m[1]) > 0) {
    return { modulo: "gasto", campos: { monto: num(m[1]), categoria: String(m[2] || "").trim() } };
  }
  /* 2) Gasto explicito: monto + descripcion sin preposicion ("Gasto 1000 prueba") */
  m = f.match(/gas(?:te|to|t[ee]|t[oo])\s+(?:de\s+)?\$?\s*([\d][\d.,]*)\s+([a-zaeioun].*)/i);
  if (m && num(m[1]) > 0) {
    return { modulo: "gasto", campos: { monto: num(m[1]), categoria: String(m[2] || "").trim() } };
  }
  /* 3) Gasto explicito: descripcion + monto al final ("Gasto flete 15000") */
  m = f.match(/gas(?:te|to|t[ee]|t[oo])\s+(.+?)\s+([\d][\d.,]*)\s*$/i);
  if (m && num(m[2]) > 0) {
    return { modulo: "gasto", campos: { monto: num(m[2]), categoria: String(m[1] || "").trim() } };
  }

  /* 4) Ingreso: "Cobre 50000 por la obra" / "Ingrese 80000 pesos por la obra" */
  m = f.match(/(?:cobr[ee]?|ingres[ee]?|cobro|ingreso)\s+(?:de\s+)?\$?\s*([\d][\d.,]*)\s+(?:(?:pesos?|peso|mangos?|lucas?|ars|usd|d[oo]lares)\s+)?(?:por|de)\s+(.+)/i);
  if (m && num(m[1]) > 0) {
    return { modulo: "ingreso", campos: { monto: num(m[1]), concepto: String(m[2] || "").trim() } };
  }
  /* 4b) Ingreso solo monto: "Ingreso de 30000" / "Cobre 30000" */
  m = f.match(/(?:cobr[ee]?|ingres[ee]?|cobro|ingreso)\s+(?:de\s+)?\$?\s*([\d][\d.,]*)\s*$/i);
  if (m && num(m[1]) > 0) {
    return { modulo: "ingreso", campos: { monto: num(m[1]), concepto: "Cobro" } };
  }

  /* 4c) Inversion: "Inverti 50000 pesos en una maquina" / "Inversion de 10000 mangos en capital" */
  m = f.match(/(?:invert[ii]|inversion|inversi[oo]n|invertir|compr[ee]\s+(?:para\s+)?invertir)\s+(?:de\s+)?\$?\s*([\d][\d.,]*)\s+(?:(?:pesos?|peso|mangos?|lucas?|ars|usd|d[oo]lares)\s+)?(?:en|de)\s+(.+)/i);
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
  m = f.match(/(?:agreg[aa]|agrega|alta|sumar|crear|contratar)\s+(?:un\s+)?(?:nuevo\s+)?empleado[\s.,;:]+(.+)/i);
  if (m && String(m[1] || "").trim()) {
    const sp = separarEmpleado(m[1]);
    return { modulo: "empleado", campos: { nombre: sp.nombre, rol: sp.rol } };
  }
  m = f.match(/nuevo\s+empleado[\s.,;:]+(.+)/i);
  if (m && String(m[1] || "").trim()) {
    const sp = separarEmpleado(m[1]);
    return { modulo: "empleado", campos: { nombre: sp.nombre, rol: sp.rol } };
  }

  /* 6) Adelanto: "Carga adelanto de 25000 a Luis Alamo" */
  m = f.match(/(?:adelanto|anticipo)\s+(?:de\s+)?\$?\s*([\d][\d.,]*)\s+(?:a|para)\s+(.+)/i);
  if (m && num(m[1]) > 0) return { modulo: "adelanto", campos: { monto: num(m[1]), empleado: String(m[2] || "").trim() } };

  /* 7) Obra: "Nueva obra Perez en Alta Gracia" */
  m = f.match(/(?:nueva\s+obra|crear\s+obra|obra\s+nueva)\s+(.+?)(?:\s+en\s+(.+))?$/i);
  if (m && String(m[1] || "").trim()) return { modulo: "obra", campos: { nombre: String(m[1] || "").trim(), ubicacion: String(m[2] || "").trim() } };

  /* 7a) Agenda/compromiso: "agendar visita manana" / "nueva visita a la obra" */
  m = f.match(/(?:agendar|agenda|nuevo\s+compromiso|compromiso|visita|reuni[oo]n|entrega|evento)\s+(.+)/i);
  if (m && String(m[1] || "").trim()) return { modulo: "agendar", campos: { titulo: String(m[1] || "").trim() } };

  /* 7b) Asistencia: "Registra 6 horas de Angel en casa de chicho" /
          "Leo trabajo 8 horas en la obra de Hugo" /
          fallback jornada: "Juan 8 horas en obra X" */
  m = f.match(/^(?:registra[r]?|carg[aa]r?|anot[aa]r?|agreg[aa]r?)\s+([\d]+(?:\s*[.,]\s*\d+)?)\s*horas?\s+(?:de|para)\s+(.+?)\s+(?:en\s+)?(.+)/i);
  if (m && Number(m[1]) > 0 && String(m[2] || "").trim()) {
    return { modulo: "asistencia", campos: { empleado: String(m[2] || "").trim(), horas: Number(m[1]), obra: String(m[3] || "").trim() } };
  }
  m = f.match(/(.+?)\s+(?:trabaj[oo]|labur[oo]|hizo)\s+([\d]+(?:\s*[.,]\s*\d+)?)\s*horas?\s+(?:en\s+)?(.+)/i);
  if (m && String(m[1] || "").trim() && Number(m[2]) > 0) {
    return { modulo: "asistencia", campos: { empleado: String(m[1] || "").trim(), horas: Number(m[2]), obra: String(m[3] || "").trim() } };
  }
  m = f.match(/(?:jornada\s+(?:de\s+)?)?(.+?)\s+([\d]+(?:\s*[.,]\s*\d+)?)\s*horas?\s+(?:en\s+)?(.+)/i);
  if (m && String(m[1] || "").trim() && Number(m[2]) > 0) return { modulo: "jornada", campos: { empleado: String(m[1] || "").trim(), horas: Number(m[2]), obra: String(m[3] || "").trim() } };

  /* 7b) Gasto SIN verbo: "45678 de nafta" / "5000 de cemento" (numero + "de" + concepto) */
  m = f.match(/^([\d][\d.,]*)\s+de\s+(.+)/i);
  if (m && num(m[1]) > 0) {
    return { modulo: "gasto", campos: { monto: num(m[1]), categoria: String(m[2] || "").trim() } };
  }

  /* 8) Gasto implicito SIN la palabra "gasto": "Flete 15000" / "Nafta 8000" */
  m = f.match(/^([a-zaeioun][a-zaeioun0-9\s]{1,40}?)\s+([\d][\d.,]*)\s*$/i);
  if (m && num(m[2]) > 0) {
    return { modulo: "gasto", campos: { monto: num(m[2]), categoria: String(m[1] || "").trim() } };
  }

  return null;
}

/* Detecta la intencion de "adelanto" y extrae nombre + monto (tolera "12000p").
   "Adelanto de Hugo pereyra de 12000p" -> { nombre: "hugo pereyra", monto: 12000 }
   "Adelanto" -> { nombre: "", monto: 0 } (para arrancar el wizard paso a paso) */
export function detectAdvanceIntent(text: string): { nombre: string; monto: number } | null {
  const f = flat(String(text || "")).trim();
  if (!/(?:adelanto|anticipo)/i.test(f)) return null;

  // monto: numero, tolerando "p"/"pe"/"pesos" pegada al final ("12000p")
  const mMonto = f.match(/([\d][\d.,]*)\s*(?:p|pe|pesos|peso)?(?=\s|$)/i);
  const monto = mMonto ? Number(mMonto[1].replace(/\./g, "").replace(",", ".")) : 0;

  // nombre: quitar palabras clave y el monto, quedan las palabras del nombre
  const nombre = f
    .replace(/adelanto|anticipo/gi, " ")
    .replace(/\b(?:de|del|a|para|al|le)\b/gi, " ")
    .replace(/[\d][\d.,]*\s*(?:p|pe|pesos|peso)?/gi, " ")
    .replace(/[^\waeiounAEIOUN\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return { nombre, monto };
}

/* Parsea la respuesta del wizard de adelanto sin la palabra "adelanto":
   "Hugo de 12000" -> { nombre: "Hugo", monto: 12000 } */
export function parseAdvanceNameAmount(text: string): { nombre: string; monto: number } | null {
  const f = String(text || "").trim();
  const m = f.match(/^([a-zaeioun][a-zaeioun\s.'-]{2,40}?)\s+(?:de\s+)?\$?\s*([\d][\d.,]*)\s*(?:p|pe|pesos|peso)?\s*$/i);
  if (!m) return null;
  const monto = Number(m[2].replace(/\./g, "").replace(",", "."));
  if (!(monto > 0)) return null;
  return { nombre: m[1].trim(), monto };
}

export interface ExecResult {
  ok: boolean;
  label?: string;
  missing?: string;      // dato faltante para pedirlo por chat
  unsupported?: string;  // modulo que el conector no ejecuta (lo responde la IA)
  pendingWork?: boolean; // se guardo sin obra: el webhook debe preguntar "a que obra?"
  notFound?: string;     // mensaje cuando la entidad nombrada no existe (ej. empleado)
}

/* Contexto compacto de la cuenta (mismo espiritu que context() del chat web) */
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

/* Desambiguacion de "adelanto de [Nombre]": cliente (cobro anticipado) o empleado (adelanto)?
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
   separa el oficio/rol (parentesis o al final) y deja el nombre en Title Case.
   "agrega un empleado nuevo. se llama juan rodriguez albanil" -> { firstName:"Juan", lastName:"Rodriguez", role:"Albanil" } */
export function formatProperName(raw: string): { firstName: string; lastName: string; role: string } {
  const title = (str: string) => str.toLowerCase().replace(/(^|\s)([a-zaeioun])/g, (_m: string, p1: string, p2: string) => p1 + p2.toUpperCase());

  let s = String(raw || "").toLowerCase()
    .replace(/[.,;:!?()]/g, ' ')
    .replace(/\s+/g, ' ').trim();

  // 1) Quitar relleno tipico del dictado por WhatsApp
  s = s.replace(/\b(?:agrega|agrega|agregar|alta|crear|crea|nuevo|nueva|un|una|empleado|trabajador|se\s+llama|llamado|llamada|me\s+llamo|quiero\s+(?:agregar|cargar)|cargar)\b/g, ' ')
    .replace(/\s+/g, ' ').trim();

  // 2) Rol entre parentesis al final (ej. "juan perez (albanil)")
  let role = '';
  const m = s.match(/\(([^)]+)\)\s*$/);
  if (m) { role = m[1].trim(); s = s.slice(0, m.index).trim(); }

  // 3) Rol al final sin parentesis (oficios conocidos)
  if (!role) {
    const ROLES = [
      'maestro mayor de obra', 'peon de albanil', 'peon de albanil', 'oficial albanil', 'oficial albanil',
      'oficial electricista', 'oficial plomero', 'albanil', 'albanil', 'electricista', 'plomero',
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

/* Ejecuta la accion del motor sobre los datos del usuario (misma logica
   que el wizard del chat web: solo guarda con los campos obligatorios).
   No toca nada si falta un dato: devuelve que falta para preguntarlo. */
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
    if (!cat) return { ok: false, missing: "la categoria" };
    const montoFmt = monto.toLocaleString("es-AR");
    const ob = resolveObra();
    if (ob.missing) {
      /* Quick Capture: sin obra -> se guarda "sin asignar" (workId null). */
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
    const concepto = ["Adelanto", "Certificacion", "Cobro"].find(x => flat(String(c.concepto || "")).includes(flat(x))) || "Cobro";
    const ob = resolveObra();
    const esAdelanto = concepto === "Adelanto";
    /* Solo los "adelantos" de cliente pueden quedar sin obra (se pregunta despues) */
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
      : "Ingreso de $" + monto + " (" + concepto + ") en " + ob.label + " OK";
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
    return { ok: true, label: "Empleado '" + nombre + "'" + (rol ? " (" + rol + ")" : "") + " agregado correctamente OK" };
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
      return { ok: false, notFound: "No encontre a ese empleado en tu lista. Queres crearlo primero?" };
    }
    const nombreEmp = String((emp.firstName || "") + " " + (emp.lastName || "")).trim();
    (d.expenses || (d.expenses = [])).unshift({
      id: idGen(), type: "general", workId: null, date: todayISO, amount: montoAd,
      category: "Adelanto", providerId: null, employeeId: String(emp.id || ""), expenseKind: "adelanto",
      description: "Adelanto a " + nombreEmp, invoiceNumber: "", paymentMethod: "Efectivo", source: "whatsapp",
    } as unknown as Record<string, unknown>);
    return { ok: true, label: "Adelanto de $" + montoAd + " a " + nombreEmp + " registrado OK" };
  }

  if (action.modulo === "obra") {
    const nombreObra = String(c.nombre || "").trim();
    if (!nombreObra) return { ok: false, missing: "el nombre de la obra" };
    (d.works || (d.works = [])).unshift({
      id: idGen(), nombre: nombreObra, ubicacion: String(c.ubicacion || ""), status: "activa", source: "whatsapp",
      budgetTotal: Number(c.presupuesto) || 0,
    } as unknown as Record<string, unknown>);
    return { ok: true, label: "Obra '" + nombreObra + "' creada OK" };
  }

  /* Modulos con wizard complejo: los responde la IA guiando a la app web */
  return { ok: false, unsupported: action.modulo };
}

/* =====================================================================
   CONSULTAS ANALITICAS (SOLO LECTURA)
   Detectan preguntas ("cuanto pago esta semana", "balance de la obra X",
   "que tengo en la agenda", "donde esta la herramienta Y") y calculan
   la respuesta desde app_data SIN modificar nada.
   ===================================================================== */

export interface QueryIntent {
  type: "sueldos" | "balance" | "balance_general" | "gastos" | "ingresos" | "agenda" | "herramientas";
  target: string;
  periodo: "semana" | "mes" | "hoy";
}

/* Normaliza un nombre de obra para matching tolerante: minusculas, sin tildes,
   sin articulos/preposiciones ("de", "la", "el", "casa", "obra", etc.). */
function normWork(s: string): string {
  return flat(String(s || ""))
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(?:de|del|la|el|los|las|en|a|con|y|e|al|un|una|casa|obra|obras|proyecto|proyectos|the|of|para|por|mi|mis)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function detectQueryIntent(text: string): QueryIntent | null {
  const f = flat(String(text || "")).trim();
  if (!f) return null;

  /* Sueldos / pagos / adelantos de la semana o el mes */
  if (/(cu[aa]nto|cuanto).*(pagar|sueldos?|jornales|adelantos?|liquidar|deveng)/.test(f) ||
      /(sueldos?|jornales|salarios?|pagar).*(semana|mes|esta)/.test(f) ||
      /(cu[aa]nto|cuanto).*(gan[ao]|debo).*(empleados?|personal|cuadrilla)/.test(f)) {
    return { type: "sueldos", target: "", periodo: /mes/.test(f) ? "mes" : "semana" };
  }

  /* Balance GENERAL de todas las obras (global) */
  if (/(balance|estado|margen|resumen|saldo|financiero)/.test(f) &&
      /(general|todas|todos|global|completo|cartera|empresa)/.test(f)) {
    return { type: "balance_general", target: "", periodo: "mes" };
  }

  /* Balance / estado financiero de UNA obra */
  if (/(balance|estado|margen|resumen|saldo|financiero)/.test(f) &&
      /(obra|proyecto|casa|de|del|la|el)/.test(f)) {
    const target = f
      .replace(/^.*?(?:balance|estado|margen|resumen|saldo|financiero)/, "")
      .replace(/\b(?:de|del|la|el|los|las|obra|proyecto)\b/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return { type: "balance", target, periodo: "mes" };
  }

  /* Gastos de la semana/mes */
  if (/(gast[ee]|gastos|egresos|cu[aa]nto gast[ee])/.test(f) &&
      /(semana|mes|hoy|esta)/.test(f)) {
    return { type: "gastos", target: "", periodo: /mes/.test(f) ? "mes" : (/hoy/.test(f) ? "hoy" : "semana") };
  }

  /* Ingresos / cobros de la semana/mes */
  if (/(ingresos?|cobr[ee]|cobros|recaud)/.test(f) &&
      /(semana|mes|hoy|esta)/.test(f)) {
    return { type: "ingresos", target: "", periodo: /mes/.test(f) ? "mes" : (/hoy/.test(f) ? "hoy" : "semana") };
  }

  /* Agenda / compromisos pendientes (hoy o la semana) */
  if (/(agenda|compromisos?|tareas?|visitas?|reuniones?|qu[ee] tengo|pendiente)/.test(f) &&
      /(hoy|semana|manana|pendiente|agenda|compromisos?)/.test(f)) {
    return { type: "agenda", target: "", periodo: /hoy/.test(f) ? "hoy" : "semana" };
  }

  /* Herramientas: ubicacion / asignacion */
  if (/(herramienta|amoladora|sierra|taladro|rotomartillo|hormigonera|m[aa]quina|equipo)/.test(f) &&
      /(d[oo]nde|donde|ubicaci[oo]n|est[aa]|asignad|pr[ee]stamo|prestam|obra|dep[oo]sito)/.test(f)) {
    const m = f.match(/(?:d[oo]nde|donde)\s+(?:est[aa]\s+)?(?:la\s+|el\s+)?(.+)/i);
    const target = m ? String(m[1]).trim() : "";
    return { type: "herramientas", target, periodo: "hoy" };
  }

  return null;
}

export function computeQuery(data: Record<string, any>, q: QueryIntent): string {
  const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);
  const fmt = (n: number) => "$" + (Number(n) || 0).toLocaleString("es-AR");
  const works = (data.works || []) as any[];
  const employees = (data.employees || []) as any[];
  const attendance = (data.attendance || []) as any[];
  const expenses = (data.expenses || []) as any[];
  const incomes = (data.incomes || []) as any[];
  const compromisos = (data.compromisos || []) as any[];
  const assets = (data.assets || []) as any[];

  const hoy = new Date().toISOString().slice(0, 10);
  const desdeSemana = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const desdeMes = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

  if (q.type === "sueldos") {
    const desde = q.periodo === "mes" ? desdeMes : desdeSemana;
    const attPeriodo = attendance.filter(a => (a.date || "") >= desde && a.status === "presente");
    let total = 0;
    const lineas: string[] = [];
    employees.forEach(emp => {
      const nombre = ((emp.firstName || "") + " " + (emp.lastName || "")).trim() || "Empleado";
      const att = attPeriodo.filter(a => a.employeeId === emp.id);
      const horas = sum(att.flatMap((a: any) => (a.hours || []).map((h: any) => Number(h.hours) || 0)));
      const dias = att.length;
      const devengado = horas * (Number(emp.hourlyRate) || 0);
      const adelantos = sum(expenses.filter(x => x.employeeId === emp.id && x.expenseKind === "adelanto" && (x.date || "") >= desde).map(x => Number(x.amount) || 0));
      total += devengado - adelantos;
      lineas.push("- " + nombre + ": " + dias + "d   " + horas + "h   " + fmt(devengado) + (adelantos ? "   adelantos -" + fmt(adelantos) : ""));
    });
    return (q.periodo === "mes" ? "*Sueldos del mes*" : "*Sueldos de la semana*") +
      "\n*A pagar: " + fmt(total) + "*\n\n" + (lineas.join("\n") || "Sin jornadas registradas.");
  }

  if (q.type === "balance") {
    if (!q.target) return "De que obra queres el balance? Decime el nombre (ej. \"balance de la obra Casa Perez\").";
    const tn = normWork(q.target);
    const w = works.find(x => {
      const n = normWork(String(x.name || x.nombre || ""));
      return !!n && (n.includes(tn) || tn.includes(n));
    });
    if (!w) {
      const activas = works.filter(x => x.status === "activa").map(x => "- " + (x.name || x.nombre));
      return "No encontre la obra \"" + q.target + "\".\n\n*Obras activas:*\n" + (activas.join("\n") || "Sin obras activas.");
    }
    const wid = String(w.id || "");
    const ing = sum(incomes.filter(i => i.workId === wid).map(i => Number(i.amount) || 0));
    const cos = sum(expenses.filter(x => x.workId === wid).map(x => Number(x.amount) || 0));
    const margen = ing - cos;
    const presupuesto = Number(w.budgetTotal) || 0;
    const pendiente = Math.max(0, presupuesto - ing);
    return "*Balance: " + (w.name || w.nombre) + "*\n" +
      "- Ingresos: " + fmt(ing) + "\n" +
      "- Costos directos: -" + fmt(cos) + "\n" +
      "- Margen: " + fmt(margen) + "\n" +
      "- Presupuesto: " + fmt(presupuesto) + "\n" +
      "- Pendiente de cobrar: " + fmt(pendiente);
  }

  if (q.type === "balance_general") {
    const lineas = works.filter(x => x.status !== "finalizada").map(x => {
      const wid = String(x.id || "");
      const ing = sum(incomes.filter(i => i.workId === wid).map(i => Number(i.amount) || 0));
      const cos = sum(expenses.filter(e => e.workId === wid).map(e => Number(e.amount) || 0));
      return "- " + (x.name || x.nombre) + ": margen " + fmt(ing - cos) + " (" + fmt(ing) + " cobrado / -" + fmt(cos) + ")";
    });
    const totalIng = sum(incomes.map(i => Number(i.amount) || 0));
    const totalCos = sum(expenses.map(e => Number(e.amount) || 0));
    return "*Balance general*\n" +
      "- Ingresos totales: " + fmt(totalIng) + "\n" +
      "- Costos totales: -" + fmt(totalCos) + "\n" +
      "- Margen neto: " + fmt(totalIng - totalCos) + "\n\n" +
      (lineas.join("\n") || "Sin obras activas.");
  }

  if (q.type === "gastos") {
    const desde = q.periodo === "mes" ? desdeMes : (q.periodo === "hoy" ? hoy : desdeSemana);
    const gastos = expenses.filter(x => (x.date || "") >= desde);
    const total = sum(gastos.map(x => Number(x.amount) || 0));
    const label = q.periodo === "mes" ? "del mes" : (q.periodo === "hoy" ? "de hoy" : "de la semana");
    return "*Gastos " + label + "*\nTotal: " + fmt(total) + " (" + gastos.length + " movimientos)";
  }

  if (q.type === "ingresos") {
    const desde = q.periodo === "mes" ? desdeMes : (q.periodo === "hoy" ? hoy : desdeSemana);
    const cobros = incomes.filter(i => (i.date || "") >= desde);
    const total = sum(cobros.map(i => Number(i.amount) || 0));
    const label = q.periodo === "mes" ? "del mes" : (q.periodo === "hoy" ? "de hoy" : "de la semana");
    return "*Ingresos " + label + "*\nTotal: " + fmt(total) + " (" + cobros.length + " cobros)";
  }

  if (q.type === "agenda") {
    const hasta = q.periodo === "hoy" ? hoy : new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    const pend = compromisos.filter(c => c.estado !== "hecho" && (c.fecha || "") >= hoy && (c.fecha || "") <= hasta)
      .sort((a, b) => String(a.fecha || "").localeCompare(String(b.fecha || "")));
    const lineas = pend.map(c => "- " + (c.fecha || "") + "   " + (c.titulo || c.tipo || "Compromiso"));
    return (q.periodo === "hoy" ? "*Agenda de hoy*" : "*Agenda de la semana*") + "\n" + (lineas.join("\n") || "No tenes compromisos pendientes.");
  }

  if (q.type === "herramientas") {
    let list = assets;
    if (q.target) list = list.filter(a => flat(String(a.name || a.nombre || "")).includes(flat(q.target)));
    const lineas = list.map(a => {
      const loc = a.location ? works.find(w => String(w.id) === String(a.location)) : null;
      const lugar = loc ? (loc.name || loc.nombre) : (a.status === "operativo" ? "Deposito" : (a.status || "-"));
      return "- " + (a.name || a.nombre || "Herramienta") + " (" + (a.category || "-") + ") -> " + lugar;
    });
    return "*Herramientas*" + (q.target ? " (\"" + q.target + "\")" : "") + "\n" + (lineas.join("\n") || "No encontre esa herramienta.");
  }

  return "No pude procesar la consulta.";
}

/* Devuelve el enlace web del reporte visual correspondiente a la consulta
   (vistas publicas de solo lectura, estilo portal). */
export function queryLink(data: Record<string, any>, q: QueryIntent): string {
  const base = "https://gestiongadu.vercel.app";
  if (q.type === "sueldos") return base + "/#/reporte/empleados";
  if (q.type === "agenda") return base + "/#/agenda";
  if (q.type === "herramientas") return base + "/#/herramientas";
  if (q.type === "balance_general") return base + "/#/obras";
  if (q.type === "gastos") return base + "/#/gastos";
  if (q.type === "ingresos") return base + "/#/ingresos";
  if (q.type === "balance" && q.target) {
    const tn = normWork(q.target);
    const w = ((data.works || []) as any[]).find(x => {
      const n = normWork(String(x.name || x.nombre || ""));
      return !!n && (n.includes(tn) || tn.includes(n));
    });
    if (w) return base + "/#/reporte/obra/" + String(w.id);
  }
  return "";
}

/* =====================================================================
   REPORTES AVANZADOS (modulo "reporte" de la IA)
   balance_obra   dias_trabajados   pagos_empleado   deuda_empleado
   ===================================================================== */

function periodStart(periodo: string): string {
  const hoy = new Date();
  if (periodo === "semana") return new Date(hoy.getTime() - 7 * 86400000).toISOString().slice(0, 10);
  if (periodo === "mes") return new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().slice(0, 10);
  return "";  // historial completo
}

export function computeReporte(data: Record<string, any>, tipo: string, campos: Record<string, unknown>): string {
  const sum = (arr: any[]) => (arr || []).reduce((a, b) => a + (Number(b) || 0), 0);
  const fmt = (n: number) => "$" + (Number(n) || 0).toLocaleString("es-AR");
  const employees = (data.employees || []) as any[];
  const attendance = (data.attendance || []) as any[];
  const expenses = (data.expenses || []) as any[];
  const incomes = (data.incomes || []) as any[];
  const works = (data.works || []) as any[];

  const nombreEmp = (e: any) => ((e.firstName || "") + " " + (e.lastName || "")).trim() || "Empleado";
  const findEmp = (nombre: string) => employees.find(e => {
    const n = normWork(nombreEmp(e));
    const t = normWork(nombre);
    return !!n && !!t && (n.includes(t) || t.includes(n));
  });
  const findWork = (nombre: string) => works.find(w => {
    const n = normWork(String(w.name || w.nombre || ""));
    const t = normWork(nombre);
    return !!n && !!t && (n.includes(t) || t.includes(n));
  });
  const esPago = (x: any) => x.expenseKind === "adelanto" || x.expenseKind === "pago" || x.expenseKind === "sueldo";

  if (tipo === "balance_obra") {
    const nombre = String(campos.obra || campos.nombre || "").trim();
    if (!nombre) return "De que obra queres el balance?";
    const w = findWork(nombre);
    if (!w) return "No encontre la obra \"" + nombre + "\".";
    const ing = sum(incomes.filter(i => i.workId === w.id).map(i => i.amount));
    const cos = sum(expenses.filter(x => x.workId === w.id).map(x => x.amount));
    return "\uD83D\uDCB0 *Balance: " + (w.name || w.nombre) + "*\n" +
      "- Cobros: " + fmt(ing) + "\n" +
      "- Gastos: -" + fmt(cos) + "\n" +
      "- Saldo: " + fmt(ing - cos);
  }

  if (tipo === "dias_trabajados") {
    const nombre = String(campos.empleado || "").trim();
    if (!nombre) return "De que empleado queres los dias trabajados?";
    const e = findEmp(nombre);
    if (!e) return "No encontre al empleado \"" + nombre + "\".";
    const desde = periodStart(String(campos.periodo || ""));
    const dias = attendance.filter(a => a.employeeId === e.id && a.status === "presente" && (!desde || (a.date || "") >= desde)).length;
    const label = campos.periodo === "semana" ? "esta semana" : (campos.periodo === "mes" ? "este mes" : "en total");
    return "\uD83D\uDC77 *" + nombreEmp(e) + "*\n- Dias trabajados " + label + ": " + dias;
  }

  if (tipo === "pagos_empleado") {
    const nombre = String(campos.empleado || "").trim();
    if (!nombre) return "De que empleado queres los pagos?";
    const e = findEmp(nombre);
    if (!e) return "No encontre al empleado \"" + nombre + "\".";
    const desde = periodStart(String(campos.periodo || ""));
    const pagos = expenses.filter(x => x.employeeId === e.id && esPago(x) && (!desde || (x.date || "") >= desde));
    const total = sum(pagos.map(x => x.amount));
    const label = campos.periodo === "semana" ? "esta semana" : (campos.periodo === "mes" ? "este mes" : "en total");
    return "\uD83D\uDCB8 *Pagos a " + nombreEmp(e) + "* (" + label + ")\n" +
      "- Total: " + fmt(total) + "\n" +
      "- " + pagos.length + " pago(s)";
  }

  if (tipo === "deuda_empleado") {
    const nombre = String(campos.empleado || "").trim();
    if (!nombre) return "De que empleado queres la deuda?";
    const e = findEmp(nombre);
    if (!e) return "No encontre al empleado \"" + nombre + "\".";
    const att = attendance.filter(a => a.employeeId === e.id && a.status === "presente");
    const horas = sum(att.flatMap((a: any) => (a.hours || []).map((h: any) => Number(h.hours) || 0)));
    const devengado = horas * (Number(e.hourlyRate) || 0);
    const pagado = sum(expenses.filter(x => x.employeeId === e.id && esPago(x)).map(x => x.amount));
    const deuda = Math.max(0, devengado - pagado);
    return "\uD83E\uDDFE *Deuda a " + nombreEmp(e) + "*\n" +
      "- Dias trabajados: " + att.length + "\n" +
      "- Horas: " + horas + "\n" +
      "- Devengado: " + fmt(devengado) + "\n" +
      "- Pagado: -" + fmt(pagado) + "\n" +
      "- Deuda pendiente: " + fmt(deuda);
  }

  return "No pude procesar el reporte.";
}

/* Deudas de TODOS los empleados: haberes (horas \u00D7 tarifa) \u2212 pagos/adelantos.
   Devuelve un resumen formateado para WhatsApp. */
export function calcularDeudasEmpleados(data: Record<string, any>): string {
  const sum = (arr: any[]) => (arr || []).reduce((a, b) => a + (Number(b) || 0), 0);
  const fmt = (n: number) => "$" + (Number(n) || 0).toLocaleString("es-AR");
  const employees = (data.employees || []) as any[];
  const attendance = (data.attendance || []) as any[];
  const expenses = (data.expenses || []) as any[];
  const esPago = (x: any) => x.expenseKind === "adelanto" || x.expenseKind === "pago" || x.expenseKind === "sueldo";
  const nombreEmp = (e: any) => ((e.firstName || "") + " " + (e.lastName || "")).trim() || "Empleado";

  const filas = employees.map(e => {
    const att = attendance.filter(a => a.employeeId === e.id && a.status === "presente");
    const horas = sum(att.flatMap((a: any) => (a.hours || []).map((h: any) => Number(h.hours) || 0)));
    const devengado = horas * (Number(e.hourlyRate) || 0);
    const pagado = sum(expenses.filter(x => x.employeeId === e.id && esPago(x)).map(x => Number(x.amount) || 0));
    const deuda = Math.max(0, devengado - pagado);
    return { nombre: nombreEmp(e), dias: att.length, horas, devengado, pagado, deuda };
  }).filter(r => r.devengado > 0 || r.pagado > 0);

  if (!filas.length) return "\uD83E\uDDFE *Deudas de Empleados*\nNo hay jornadas ni pagos registrados.";

  const total = sum(filas.map(r => r.deuda));
  const body = filas.map(r =>
    "- " + r.nombre + ": " + r.dias + "d   devengado " + fmt(r.devengado) + "   pagado -" + fmt(r.pagado) + "   *deuda " + fmt(r.deuda) + "*"
  ).join("\n");
  return "\uD83E\uDDFE *Deudas de Empleados*\n\n" + body + "\n\n*Total a pagar: " + fmt(total) + "*";
}

/* Cuotas pendientes de "Deudas y Cuotas" (data.debts): monto restante
   y proximo vencimiento de cada deuda activa (no finalizada). */
export function calcularCuotas(data: Record<string, any>): string {
  const fmt = (n: number) => "$" + (Number(n) || 0).toLocaleString("es-AR");
  const debts = (data.debts || []) as any[];
  const activas = debts.filter(d => !d.finalizada);
  if (!activas.length) return "\uD83D\uDCB0 *Cuotas pendientes*\nNo tenes deudas activas en cuotas.";

  const lineas = activas.map(d => {
    const faltan = Math.max(0, (Number(d.cuotasTotales) || 0) - (Number(d.cuotaActual) || 0) + 1);
    const pendiente = faltan * (Number(d.montoPorCuota) || 0);
    return "- " + (d.concepto || "Deuda") + ": " + faltan + " cuota(s) restante(s)   " + fmt(pendiente) + "   vence " + (d.fechaVencimiento || "-");
  });
  const total = activas.reduce((s, d) => {
    const faltan = Math.max(0, (Number(d.cuotasTotales) || 0) - (Number(d.cuotaActual) || 0) + 1);
    return s + faltan * (Number(d.montoPorCuota) || 0);
  }, 0);
  return "\uD83D\uDCB0 *Cuotas pendientes*\n\n" + lineas.join("\n") + "\n\n*Total pendiente: " + fmt(total) + "*";
}

/* Avanza una fecha ISO (YYYY-MM-DD) N meses, clampando el dia al fin de mes. */
export function addMonthsISO(iso: unknown, n: number): string {
  const parts = String(iso || "").split("-").map(Number);
  if (parts.length !== 3 || !parts[0]) return String(iso || "");
  const target = new Date(parts[0], parts[1] - 1 + n, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  const day = Math.min(parts[2], lastDay);
  return target.getFullYear() + "-" + String(target.getMonth() + 1).padStart(2, "0") + "-" + String(day).padStart(2, "0");
}

/* Paga una cuota de una deuda: avanza cuotaActual +1, avanza la fecha un mes,
   crea el gasto general (category "Deuda") y marca finalizada si corresponde.
   MUTA data (expenses + debts) y devuelve el resultado para confirmar. */
export function pagarDeuda(data: Record<string, any>, debtId: string, nCuotas?: number): { ok: boolean; label?: string; error?: string } {
  const debts = (data.debts || []) as any[];
  const d = debts.find(x => String(x.id) === String(debtId));
  if (!d) return { ok: false, error: "No encontre esa deuda." };
  if (d.finalizada) return { ok: false, error: "Esa deuda ya esta finalizada." };
  const cuotaPrev = Number(d.cuotaActual) || 0;
  const cuotasTotales = Number(d.cuotasTotales) || 0;
  const restantes = Math.max(0, cuotasTotales - cuotaPrev);
  /* Cantidad de cuotas a abonar: por defecto 1; "all" -> todas las restantes.
     Se limita a lo que queda pendiente. */
  let n = Number(nCuotas) || 1;
  if (nCuotas === "all" || n > restantes) n = Math.max(1, restantes);
  const montoCuota = Number(d.montoPorCuota) || 0;
  const total = n * montoCuota;
  const cuotaActual = cuotaPrev + n;
  const finalizada = cuotaActual >= cuotasTotales;
  const descripcion = n === 1
    ? "Pago cuota " + cuotaPrev + "/" + cuotasTotales + " - " + d.concepto
    : "Pago cuotas " + (cuotaPrev + 1) + "-" + cuotaActual + "/" + cuotasTotales + " - " + d.concepto;
  (data.expenses || (data.expenses = [])).unshift({
    id: crypto.randomUUID(), type: "general", workId: null, date: new Date().toISOString().slice(0, 10),
    amount: total, category: "Deuda", providerId: null, employeeId: null,
    description: descripcion,
    invoiceNumber: "", paymentMethod: "Efectivo", expenseKind: null, source: "whatsapp",
  });
  d.cuotaActual = cuotaActual;
  d.fechaVencimiento = addMonthsISO(d.fechaVencimiento, n);
  d.finalizada = finalizada;
  d.updatedAt = new Date().toISOString();
  return { ok: true, label: n + " cuota(s) (" + (d.concepto || "Deuda") + ")" + (finalizada ? "   deuda finalizada" : "") };
}


// ============================================================
// GADU   Transcribir notas de voz de WhatsApp con Gemini
// Flujo: media_id -> URL (Graph API) -> descarga -> base64 -> Gemini -> texto
// El texto resultante se inyecta en la logica normal de texto.
// ============================================================

const API_VERSION = "v21.0";

/* Convierte ArrayBuffer -> base64 sin reventar el stack (en chunks) */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/* Normaliza el MIME para Gemini: WhatsApp manda "audio/ogg; codecs=opus";
   Gemini solo acepta el tipo simple (ej. "audio/ogg"). */
function normalizeMime(raw: string): string {
  const m = String(raw || "").split(";")[0].trim().toLowerCase();
  if (m === "audio/opus") return "audio/ogg";       // Opus sin contenedor -> ogg
  if (!m.startsWith("audio/")) return "audio/ogg";   // desconocido -> ogg por defecto
  return m;
}

/* 1) Obtiene la URL del archivo de audio desde Graph API (timeout 8s) */
async function getMediaUrl(mediaId: string): Promise<string> {
  const token = Deno.env.get("WHATSAPP_TOKEN") || "";
  if (!token) throw new Error("falta WHATSAPP_TOKEN");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`https://graph.facebook.com/${API_VERSION}/${mediaId}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("[GADU-WA-AUDIO] getMediaUrl fallo:", res.status, body);
      throw new Error("getMediaUrl HTTP " + res.status);
    }
    const j = await res.json();
    const url = String((j as { url?: string }).url || "");
    if (!url) throw new Error("getMediaUrl sin url");
    console.log("[GADU-WA-AUDIO] \u2705 URL del media obtenida:", url.slice(0, 80) + "...");
    return url;
  } catch (e) {
    console.error("[GADU-WA-CRITICAL-FIX] getMediaUrl timeout/error:", e);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/* 2) Descarga el archivo de audio (timeout 8s).
   IMPORTANTE: la URL que devuelve Meta es una URL FIRMADA (lookaside.fbsbx.com)
   y NO lleva el Bearer token; mandarlo puede devolver 403. */
async function downloadMedia(url: string): Promise<{ buffer: ArrayBuffer; mimeType: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    let res = await fetch(url, { signal: controller.signal });
    /* Si la URL no viene firmada (401/403), reintentar con el token de WhatsApp */
    if (res.status === 401 || res.status === 403) {
      const token = Deno.env.get("WHATSAPP_TOKEN") || "";
      console.warn("[GADU-WA-MEDIA] descarga 401/403 -> reintentando con Authorization");
      res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {}, signal: controller.signal });
    }
    if (!res.ok) {
      console.error("[GADU-WA-AUDIO] downloadMedia HTTP", res.status, url.slice(0, 120));
      throw new Error("downloadMedia HTTP " + res.status);
    }
    const buffer = await res.arrayBuffer();
    const rawMime = res.headers.get("content-type") || "application/octet-stream";
    const mimeType = String(rawMime).split(";")[0].trim().toLowerCase();
    console.log("[GADU-WA-MEDIA] \u2705 media descargado:", buffer.byteLength, "bytes   mime:", mimeType, "(raw:", rawMime + ")");
    return { buffer, mimeType };
  } catch (e) {
    console.error("[GADU-WA-CRITICAL-FIX] downloadMedia timeout/error:", e);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/* 3) Transcribe con Gemini (inline_data) */
async function geminiTranscribe(buffer: ArrayBuffer, mimeType: string): Promise<string> {
  const apiKey = Deno.env.get("GEMINI_API_KEY") || "";
  if (!apiKey) {
    console.warn("[GADU-WA-AUDIO] sin GEMINI_API_KEY: no se puede transcribir");
    return "";
  }
  const model = Deno.env.get("GEMINI_MODEL") || "gemini-1.5-flash";
  const base64 = arrayBufferToBase64(buffer);
  console.log("[GADU-WA-AUDIO] gemini transcribir:", buffer.byteLength, "bytes   mime:", mimeType, "  model:", model);
  /* Timeout de 8s: si Gemini tarda, abortamos y liberamos la cola. */
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: "Transcribi el audio de WhatsApp. Responde SOLO con el texto transcrito, sin comentarios." },
              { inline_data: { mime_type: mimeType, data: base64 } },
            ],
          }],
        }),
        signal: controller.signal,
      },
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("[GADU-WA-AUDIO] geminiTranscribe fallo   HTTP", res.status, "  body:", body.slice(0, 400));
      return "";
    }
    const j = await res.json();
    const text = j?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    if (text) console.log("[GADU-WA-AUDIO] \u2705 transcripcion Gemini:", text.slice(0, 80));
    else console.warn("[GADU-WA-AUDIO] Gemini respondio 200 pero sin texto:", JSON.stringify(j).slice(0, 200));
    return String(text).trim();
  } catch (e) {
    console.error("[GADU-WA-AUDIO] geminiTranscribe timeout/error:", e);
    return "";
  } finally {
    clearTimeout(timer);
  }
}

/* 3b) Transcribe audio con Groq (whisper-large-v3-turbo). Devuelve "" si falla. */
async function groqTranscribe(buffer: ArrayBuffer, mimeType: string): Promise<string> {
  const apiKey = Deno.env.get("GROQ_API_KEY") || "";
  if (!apiKey) {
    console.warn("[GADU-WA-GROQ] sin GROQ_API_KEY");
    return "";
  }
  const norm = normalizeMime(mimeType);
  console.log("[GADU-WA-GROQ] transcribir audio:", buffer.byteLength, "bytes   mime:", norm, "  model: whisper-large-v3-turbo");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const form = new FormData();
    /* Extension derivada del MIME real (mp4/m4a/wav/ogg) para que Groq
       infiera el formato correcto. WhatsApp manda opus en ogg o AAC en mp4. */
    const ext = norm.includes("mp4") ? "mp4" : (norm.includes("m4a") ? "m4a" : (norm.includes("wav") ? "wav" : "ogg"));
    form.append("file", new Blob([buffer], { type: norm }), "audio." + ext);
    form.append("model", "whisper-large-v3-turbo");
    const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { "Authorization": "Bearer " + apiKey },
      body: form,
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.warn("[GADU-WA-GROQ] transcripcion fallo   HTTP", res.status, "  body:", body.slice(0, 400));
      return "";
    }
    const j = await res.json();
    const text = String((j as { text?: string }).text || "").trim();
    if (text) console.log("[GADU-WA-GROQ] \u2705 transcripcion:", text.slice(0, 80));
    else console.warn("[GADU-WA-GROQ] 200 pero sin text:", JSON.stringify(j).slice(0, 200));
    return text;
  } catch (e) {
    console.warn("[GADU-WA-GROQ] error/timeout transcribiendo:", e);
    return "";
  } finally {
    clearTimeout(timer);
  }
}

/* Transcribe con Groq y, si falla, con Gemini (fallback). */
async function transcribeAudio(buffer: ArrayBuffer, mimeType: string): Promise<string> {
  const text = await groqTranscribe(buffer, mimeType);
  if (text) return text;
  return await geminiTranscribe(buffer, normalizeMime(mimeType));
}

async function transcribeMedia(mediaId: string): Promise<string> {
  const url = await getMediaUrl(mediaId);
  const { buffer, mimeType } = await downloadMedia(url);
  return await transcribeAudio(buffer, mimeType);
}

/* Normaliza el MIME de imagen para Gemini Vision */
function normalizeImageMime(raw: string): string {
  const m = String(raw || "").split(";")[0].trim().toLowerCase();
  if (m === "image/jpeg" || m === "image/jpg") return "image/jpeg";
  if (m === "image/png") return "image/png";
  if (m === "image/webp") return "image/webp";
  return "image/jpeg";
}

/* Sube el media (imagen de ticket) a Supabase Storage y devuelve la URL publica.
   Bucket: gadu_tickets   ruta: gadu_tickets/<userId>/whatsapp/<ts>.<ext> */
async function uploadMediaToStorage(buffer: ArrayBuffer, mimeType: string, userId: string): Promise<string> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !serviceKey) {
    console.warn("[GADU-WA-IMAGE] sin SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY: no se sube la imagen");
    return "";
  }
  const norm = normalizeImageMime(mimeType);
  const ext = norm === "image/png" ? "png" : (norm === "image/webp" ? "webp" : "jpg");
  const path = "gadu_tickets/" + userId + "/whatsapp/" + Date.now() + "." + ext;
  try {
    const res = await fetch(supabaseUrl + "/storage/v1/object/" + path, {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + serviceKey,
        "apikey": serviceKey,
        "Content-Type": norm,
        "x-upsert": "false",
      },
      body: new Uint8Array(buffer),
    });
    if (!res.ok) {
      console.error("[GADU-WA-IMAGE] subida a Storage fallo:", res.status, await res.text().catch(() => ""));
      return "";
    }
    return supabaseUrl + "/storage/v1/object/public/" + path;
  } catch (e) {
    console.error("[GADU-WA-IMAGE] uploadMediaToStorage error:", e);
    return "";
  }
}

/* Analiza una imagen (ticket) con Gemini Vision + el caption del usuario */
async function geminiAnalyzeImage(buffer: ArrayBuffer, mimeType: string, caption: string): Promise<string> {
  const apiKey = Deno.env.get("GEMINI_API_KEY") || "";
  if (!apiKey) {
    console.warn("[GADU-WA-IMAGE] sin GEMINI_API_KEY: no se puede analizar la imagen");
    return "";
  }
  const model = Deno.env.get("GEMINI_MODEL") || "gemini-1.5-flash";
  const base64 = arrayBufferToBase64(buffer);
  const prompt = "Eres un experto leyendo tickets de compra, incluso si estan rotados, borrosos, con poca luz, arrugados o fotografiados de costado. " +
    "Haz un esfuerzo EXTRA: busca la palabra 'TOTAL' (o 'TOTAL A PAGAR', 'IMPORTE', 'SUBTOTAL') y lee los numeros AUNQUE esten al final o al borde de la imagen. " +
    "Devuelve SOLO y ESTRICTAMENTE un JSON valido, sin markdown ni comentarios, con esta estructura exacta: " +
    '{"monto": <numero>, "concepto": "<descripcion>"}. ' +
    'Si no puedes leer el monto, devuelve {"monto": 0, "concepto": ""}. ' +
    'Texto que acompana la imagen: "' + (caption || "") + '".';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  console.log("[GADU-WA-IMAGE] gemini analizar imagen:", buffer.byteLength, "bytes   mime:", mimeType);
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: prompt },
              { inline_data: { mime_type: mimeType, data: base64 } },
            ],
          }],
        }),
        signal: controller.signal,
      },
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("[GADU-WA-IMAGE] geminiAnalyzeImage fallo   HTTP", res.status, "  body:", body.slice(0, 400));
      return "";
    }
    const j = await res.json();
    const text = j?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    if (text) console.log("[GADU-WA-IMAGE] \u2705 analisis Gemini:", text.slice(0, 80));
    else console.warn("[GADU-WA-IMAGE] Gemini respondio 200 pero sin texto:", JSON.stringify(j).slice(0, 200));
    return String(text).trim();
  } catch (e) {
    console.error("[GADU-WA-IMAGE] geminiAnalyzeImage timeout/error:", e);
    return "";
  } finally {
    clearTimeout(timer);
  }
}

/* Analiza una imagen con Groq Vision. Devuelve "" si falla.
   Modelo vigente de vision Groq: meta-llama/llama-4-scout-17b-16e-instruct
   (llama-3.2-11b-vision-preview y qwen/qwen3.8-27b quedaron deprecados). */
async function groqAnalyzeImage(buffer: ArrayBuffer, mimeType: string, caption: string): Promise<string> {
  const apiKey = Deno.env.get("GROQ_API_KEY") || "";
  if (!apiKey) {
    console.warn("[GADU-WA-GROQ] sin GROQ_API_KEY");
    return "";
  }
  const norm = normalizeImageMime(mimeType);
  console.log("[GADU-WA-GROQ] analizar imagen:", buffer.byteLength, "bytes   mime:", norm, "  model: meta-llama/llama-4-scout-17b-16e-instruct");
  /* Groq: las imagenes mayores a ~20MB se rechazan con 400 -> cortamos antes */
  if (buffer.byteLength > 20 * 1024 * 1024) {
    console.warn("[GADU-WA-GROQ] imagen excede 20MB:", buffer.byteLength, "bytes -> no se envia a Groq");
    return "";
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const base64 = arrayBufferToBase64(buffer);
    const dataUrl = "data:" + norm + ";base64," + base64;
    const prompt = "Eres un experto leyendo tickets de compra, incluso si estan rotados, borrosos, con poca luz, arrugados o fotografiados de costado. " +
      "Haz un esfuerzo EXTRA: busca la palabra 'TOTAL' (o 'TOTAL A PAGAR', 'IMPORTE', 'SUBTOTAL') y lee los numeros AUNQUE esten al final o al borde de la imagen. " +
      "Devuelve SOLO y ESTRICTAMENTE un JSON valido, sin markdown ni comentarios, con esta estructura exacta: " +
      '{"monto": <numero>, "concepto": "<descripcion>"}. ' +
      'Si no puedes leer el monto, devuelve {"monto": 0, "concepto": ""}. ' +
      'Texto que acompana la imagen: "' + (caption || "") + '".';
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": "Bearer " + apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "meta-llama/llama-4-scout-17b-16e-instruct",
        messages: [{
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        }],
        max_tokens: 200,
        temperature: 0.2,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.warn("[GADU-WA-GROQ] vision fallo   HTTP", res.status, "  body:", body.slice(0, 400));
      return "";
    }
    const j = await res.json();
    const text = String(j?.choices?.[0]?.message?.content || "").trim();
    if (text) console.log("[GADU-WA-GROQ] \u2705 vision:", text.slice(0, 80));
    else console.warn("[GADU-WA-GROQ] 200 pero sin contenido:", JSON.stringify(j).slice(0, 200));
    return text;
  } catch (e) {
    console.warn("[GADU-WA-GROQ] error/timeout analizando imagen:", e);
    return "";
  } finally {
    clearTimeout(timer);
  }
}

/* Analiza la imagen con Groq y, si falla, con Gemini Vision (fallback). */
async function analyzeImageWithFallback(buffer: ArrayBuffer, mimeType: string, caption: string): Promise<string> {
  const text = await groqAnalyzeImage(buffer, mimeType, caption);
  if (text) return text;
  return await geminiAnalyzeImage(buffer, normalizeImageMime(mimeType), caption);
}

export interface ResolvedIncoming {
  from: string;
  text: string;
  audioFailed?: boolean;
  imageFailed?: boolean;
  imageNoMonto?: boolean;
  mediaUrl?: string;
  contact?: { name: string; phone: string };
}

/* Resuelve el texto del mensaje entrante: texto plano O transcripcion de audio.
   - null -> no es un mensaje valido (o no hay texto/media)
   - { from, text } -> texto resuelto (texto plano o audio transcrito)
   - { from, text: "", audioFailed: true } -> era audio pero fallo la transcripcion */
export async function resolveIncomingText(payload: unknown): Promise<ResolvedIncoming | null> {
  try {
    const p = (payload || {}) as Record<string, any>;

    // payload simple de puente {from, text}
    if (typeof p.from === "string" && typeof p.text === "string" && String(p.text).trim()) {
      return { from: String(p.from).replace(/\D/g, ""), text: String(p.text).trim() };
    }

    const value = p.entry?.[0]?.changes?.[0]?.value;
    const msg = value?.messages?.[0];
    if (!msg) return null;

    const from = String(msg.from || value?.contacts?.[0]?.wa_id || "").replace(/\D/g, "");
    if (!from) return null;

    // Texto plano
    if (msg.type === "text") {
      const text = String(msg.text?.body || "").trim();
      return text ? { from, text } : null;
    }

    // Audio / voz -> transcribir
    if (msg.type === "audio" || msg.type === "voice") {
      const mediaId = String(msg.audio?.id || msg.voice?.id || "");
      if (!mediaId) return null;
      console.log("[GADU-WA-AUDIO] audio detectado, media_id:", mediaId);
      let text = "";
      try {
        text = await transcribeMedia(mediaId);
      } catch (e) {
        console.error("[GADU-WA-CRITICAL-FIX] transcribeMedia fallo:", e);
        return { from, text: "", audioFailed: true };
      }
      if (!text) {
        console.warn("[GADU-WA-AUDIO] transcripcion vacia para media", mediaId);
        return { from, text: "", audioFailed: true };
      }
      /* Ruido / audio demasiado breve ("mmm", "eh", "ah") -> pedir repetir,
         en lugar de dejar que caiga al menu de fallback generico. */
      const limpio = String(text).replace(/[^a-zaeioun0-9\s]/gi, "").replace(/\s+/g, " ").trim();
      if (limpio.length < 3 || /^(m+|h+|a+h+|e+h+|u+h+|mmm+|hmm|aja|jaja|jajaja|si|no)$/i.test(limpio)) {
        console.warn("[GADU-WA-AUDIO] transcripcion ruido/breve descartada:", JSON.stringify(text));
        return { from, text: "", audioFailed: true };
      }
      console.log("[GADU-WA-AUDIO] texto transcrito (exacto):", JSON.stringify(text));
      return { from, text };
    }

    // Imagen (ticket) -> analizar con Gemini Vision + caption
    if (msg.type === "image") {
      const mediaId = String(msg.image?.id || "");
      const caption = String(msg.image?.caption || "");
      if (!mediaId) return null;
      console.log("[GADU-WA-IMAGE] imagen detectada, media_id:", mediaId, "  caption:", caption);
      let text = "";
      let mediaUrl = "";
      try {
        /* Descargamos una sola vez: con el buffer hacemos el analisis Gemini
           Y subimos el comprobante a Storage. */
        const url = await getMediaUrl(mediaId);
        const { buffer, mimeType } = await downloadMedia(url);
        text = await analyzeImageWithFallback(buffer, mimeType, caption);
        try {
          mediaUrl = await uploadMediaToStorage(buffer, mimeType, from);
        } catch (e) {
          console.warn("[GADU-WA-IMAGE] no se pudo subir el comprobante:", e);
        }
      } catch (e) {
        console.error("[GADU-WA-CRITICAL-FIX] analyzeImage fallo:", e);
        /* Si la vision lanzo error pero hay caption, usar el texto como fallback */
        if (caption && caption.trim()) {
          console.warn("[GADU-WA-IMAGE] vision lanzo error, uso caption como fallback:", caption);
          return { from, text: caption, mediaUrl: "" };
        }
        return { from, text: "", imageFailed: true };
      }
      if (!text) {
        /* La vision fallo. Si el usuario escribio un caption, usarlo como
           red de seguridad para que el flujo normal de texto procese el gasto. */
        if (caption && caption.trim()) {
          console.warn("[GADU-WA-IMAGE] vision vacia, uso caption como fallback:", caption);
          return { from, text: caption, mediaUrl };
        }
        console.warn("[GADU-WA-IMAGE] analisis vacio para media", mediaId);
        return { from, text: "", imageFailed: true, mediaUrl };
      }
      console.log("[GADU-WA-IMAGE] analisis:", text, "  mediaUrl:", mediaUrl ? mediaUrl.slice(0, 80) : "(sin subir)");
      /* El modelo devuelve JSON {monto, concepto, categoria}. Parsearlo:
         - monto > 0 -> construir texto de gasto natural (lo categoriza el flujo normal)
         - monto === 0 -> el ticket se leyo pero no se pudo extraer el monto */
      try {
        const parsed = JSON.parse(String(text).replace(/```json|```/g, "").trim());
        const monto = Number(parsed && parsed.monto);
        if (monto > 0) {
          const concepto = String((parsed && parsed.concepto) || caption || "gasto").slice(0, 60);
          return { from, text: "Gasto de " + monto + " en " + concepto, mediaUrl };
        }
        console.warn("[GADU-WA-IMAGE] monto 0 -> no se pudo leer el monto del ticket");
        /* Si hay caption (texto del usuario), usarlo como fallback */
        if (caption && caption.trim()) {
          console.warn("[GADU-WA-IMAGE] monto 0, uso caption como fallback:", caption);
          return { from, text: caption, mediaUrl };
        }
        return { from, text: "", imageNoMonto: true, mediaUrl };
      } catch (e) {
        /* No devolvio JSON: usar el texto crudo como fallback (flujo normal) */
        return { from, text, mediaUrl };
      }
    }

    // Contacto compartido (vCard): extraer nombre + telefono
    if (msg.type === "contacts") {
      const contacts = Array.isArray(msg.contacts) ? msg.contacts : [];
      const c = contacts[0] || {};
      const nombre = String(c.name?.formatted_name || c.name?.first_name || c.name?.last_name || "").trim();
      const phone = String(
        c.phones?.[0]?.phone ||
        c.phones?.[0]?.wa_id ||
        (Array.isArray(c.phones) && c.phones.length ? String(c.phones[0]).replace(/\D/g, "") : "") ||
        ""
      ).trim();
      if (!nombre && !phone) return null;
      console.log("[GADU-WA-CONTACT] contacto compartido:", JSON.stringify({ nombre, phone }));
      return { from, text: "", contact: { name: nombre, phone } };
    }

    return null;
  } catch (e) {
    console.error("[GADU-WA-AUDIO] resolveIncomingText error:", e);
    return null;
  }
}


// ============================================================
// GADU   Cola FIFO de mensajes WhatsApp (anti rafagas)
// Cada webhook entrante se guarda inmediatamente y se procesa
// en orden (FIFO) por telefono, evitando perder mensajes cuando
// el usuario escribe varios seguidos en pocos segundos.
// ============================================================

export interface QueueItem {
  id: number;
  phone: string;
  payload: Record<string, unknown>;
  status: string;
  attempts: number;
}

/* Insertar inmediato al recibir el webhook */
export async function enqueueMessage(
  rest: (path: string, opts?: Record<string, unknown>) => Promise<Response>,
  phone: string,
  payload: unknown,
): Promise<void> {
  await rest("whatsapp_queue", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ phone, payload, status: "pending" }),
  });
}

/* Reclama el siguiente mensaje pendiente (FIFO). Marca 'processing' en la
   misma operacion para minimizar que dos drains concurrentes lo dupliquen. */
export async function claimNext(
  rest: (path: string, opts?: Record<string, unknown>) => Promise<Response>,
  phone: string,
): Promise<QueueItem | null> {
  const r = await rest(
    "whatsapp_queue?status=eq.pending&phone=eq." + encodeURIComponent(phone) +
    "&order=created_at.asc&limit=1",
    { method: "GET" },
  );
  const rows = (await r.json().catch(() => [])) as QueueItem[];
  if (!Array.isArray(rows) || !rows.length) return null;
  const item = rows[0];
  const up = await rest("whatsapp_queue?id=eq." + item.id, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ status: "processing", attempts: item.attempts + 1, claimed_at: new Date().toISOString() }),
  });
  return up.ok ? item : null;
}

/* Libera mensajes 'processing' que quedaron huerfanos (crash) hace mas de 3 min.
   Los devuelve a 'pending' para que se reintenten. Devuelve cuantos libero. */
export async function resetStaleProcessing(
  rest: (path: string, opts?: Record<string, unknown>) => Promise<Response>,
): Promise<number> {
  const cutoff = new Date(Date.now() - 3 * 60000).toISOString();
  const up = await rest(
    "whatsapp_queue?status=eq.processing&claimed_at=lt." + encodeURIComponent(cutoff) + "&select=id",
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ status: "pending", claimed_at: null }),
    },
  );
  const rows = (await up.json().catch(() => [])) as Array<{ id: number }>;
  return Array.isArray(rows) ? rows.length : 0;
}

export async function markDone(
  rest: (path: string, opts?: Record<string, unknown>) => Promise<Response>,
  id: number,
): Promise<void> {
  await rest("whatsapp_queue?id=eq." + id, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ status: "done", processed_at: new Date().toISOString() }),
  });
}

export async function markFailed(
  rest: (path: string, opts?: Record<string, unknown>) => Promise<Response>,
  id: number,
): Promise<void> {
  /* Marcar 'failed' INMEDIATAMENTE (sin reintentos) para que la cola no se bloquee:
     el drainPhone pasa al siguiente mensaje al instante. */
  await rest("whatsapp_queue?id=eq." + id, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ status: "failed", processed_at: new Date().toISOString() }),
  });
}


// ============================================================
// GADU   Conector de WhatsApp (Supabase Edge Function)
// Ruta: /functions/v1/whatsapp-webhook
// Recibe mensajes de texto o notas de voz (ya transcritas) de
// usuarios vinculados y los procesa con el MISMO motor del chat
// web (ai-assistant -> action -> app_data). El chat flotante de la
// web sigue funcionando independiente: este conector solo agrega
// el canal omnicanal.
//
// Variables de entorno (secrets de Supabase - NO commitear en el repo):
//   SUPABASE_URL   SUPABASE_ANON_KEY   SUPABASE_SERVICE_ROLE_KEY
//   WHATSAPP_TOKEN        -> token de acceso de Meta Cloud API
//   WHATSAPP_PHONE_ID     -> Phone Number ID de Meta (del bot de prueba)
//   WHATSAPP_WABA_ID      -> WhatsApp Business Account ID (referencia)
//   WHATSAPP_VERIFY_TOKEN -> token de verificacion del webhook (GET hub.verify_token)
//   Numero de prueba del bot: 15556643689 (+1 555 664-3689)
//
// Como cargarlos (NO en archivos versionados):
//   supabase secrets set \
//     WHATSAPP_TOKEN="<TOKEN>" \
//     WHATSAPP_PHONE_ID="1360123317189034" \
//     WHATSAPP_WABA_ID="4685722798416623" \
//     WHATSAPP_VERIFY_TOKEN="<CADENA_ALEATORIA_PROPIA>"
//
// Despliegue:
//   supabase functions deploy whatsapp-webhook
// ============================================================

import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/* Desacopla trabajo pesado de la respuesta a Meta: responde 200 YA y sigue
   procesando en segundo plano. Evita que Meta marque timeout y deje de entregar. */
function fireAndForget(p: Promise<unknown>) {
  try {
    // deno-lint-ignore no-undef
    if (typeof EdgeRuntime !== "undefined" && typeof EdgeRuntime.waitUntil === "function") {
      // deno-lint-ignore no-undef
      EdgeRuntime.waitUntil(p.catch(e => console.error("[GADU-WA-CRITICAL-FIX] async error (waitUntil):", e)));
      return;
    }
  } catch (_e) { /* caer al fallback */ }
  p.catch(e => console.error("[GADU-WA-CRITICAL-FIX] async error:", e));
}

/* Configuracion de Supabase (lectura LAZY por request: el runtime inyecta
   las variables por peticion, no siempre disponibles a nivel de modulo) */
function supabaseUrl() { return Deno.env.get("SUPABASE_URL") || ""; }
function serviceKey() { return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""; }
function anonKey() { return Deno.env.get("SUPABASE_ANON_KEY") || ""; }

/* Dispara una notificacion push (fire-and-forget; nunca bloquea ni tira) */
function firePush(userId: string, title: string, message: string, url: string) {
  fireAndForget((async () => {
    try {
      const res = await fetchWithTimeout(supabaseUrl() + "/functions/v1/send-push", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-service-secret": Deno.env.get("SERVICE_SECRET") || "",
        },
        body: JSON.stringify({ user_id: userId, title, message, url }),
      });
      if (!res.ok) console.warn("[GADU-WA-PUSH] send-push respondio:", res.status);
    } catch (e) {
      console.warn("[GADU-WA-PUSH] error:", e);
    }
  })());
}

/* Verifica la firma HMAC-SHA256 de Meta (X-Hub-Signature-256).
   Comparacion en tiempo constante para evitar timing attacks. */
async function verifyMetaSignature(rawBody: string, secret: string, signatureHeader: string): Promise<boolean> {
  try {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const sig = await crypto.subtle.sign("HMAC", key, enc.encode(rawBody));
    const hex = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
    const expected = "sha256=" + hex;
    const a = enc.encode(expected);
    const b = enc.encode(String(signatureHeader || "").trim());
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
    return diff === 0;
  } catch (e) {
    console.error("[whatsapp-webhook] error verificando firma de Meta:", e);
    return false;
  }
}

/* fetch con timeout (AbortController). Lanza "Timeout exceeded" si se agota. */
async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 8000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (e) {
    if (controller.signal.aborted) throw new Error("Timeout exceeded");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

async function rest(path: string, opts: Record<string, unknown> = {}) {
  const sk = serviceKey();
  const headers = {
    apikey: sk,
    Authorization: `Bearer ${sk}`,
    "Content-Type": "application/json",
    ...((opts.headers as Record<string, string>) || {}),
  };
  return await fetchWithTimeout(supabaseUrl() + "/rest/v1/" + path, { ...opts, headers } as RequestInit);
}

/* Envio de la respuesta al usuario por WhatsApp (Meta Cloud API).
   Sin token configurado, la respuesta viaja en el body del webhook (util
   para puentes propios o pruebas). */
async function sendWhatsApp(to: string, text: string) {
  const token = Deno.env.get("WHATSAPP_TOKEN") || "";
  const phoneId = Deno.env.get("WHATSAPP_PHONE_ID") || "";
  const apiVersion = Deno.env.get("WHATSAPP_API_VERSION") || "v21.0";
  console.log("[DEBUG] Destinatario (to): " + to);
  console.log("[DEBUG] phone_number_id usado para enviar: " + phoneId);
  if (!token || !phoneId) {
    console.log("[whatsapp-webhook] sin WHATSAPP_TOKEN/WHATSAPP_PHONE_ID -> respuesta en body");
    return false;
  }
  /* Destinatario normalizado para cuentas de prueba AR (549... -> 54... sin el 9) */
  const toNormalized = toMetaPhone(to);
  const body = {
    messaging_product: "whatsapp",
    to: toNormalized,
    type: "text",
    text: { body: text },
  };
  /* Log detallado del payload exacto que se envia a Meta (incluye el `to` y la version) */
  console.log("[whatsapp-webhook] sendWhatsApp payload (", apiVersion, "):", JSON.stringify(body));
  const res = await fetchWithTimeout(`https://graph.facebook.com/${apiVersion}/${phoneId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const respText = await res.text().catch(() => "");
  if (!res.ok) {
    if (respText.includes("131030") || respText.includes("not in allowed list")) {
      console.warn(
        "[whatsapp-webhook] Meta 131030: el destinatario",
        to,
        "NO esta en la lista de permitidos del bot de prueba. Agregalo en Meta for Developers -> WhatsApp -> Test numbers.",
      );
    } else {
      console.error("[whatsapp-webhook] Meta Graph API fallo:", res.status, respText);
    }
  } else {
    console.log("[whatsapp-webhook] Meta Graph API respondio:", res.status, respText);
  }
  return res.ok;
}

/* Indicador "escribiendo..." (sender_action: typing_on) hacia la API de Meta.
   Se dispara en segundo plano al empezar a procesar; no bloquea la respuesta. */
async function sendTypingOn(to: string): Promise<void> {
  const token = Deno.env.get("WHATSAPP_TOKEN") || "";
  const phoneId = Deno.env.get("WHATSAPP_PHONE_ID") || "";
  const apiVersion = Deno.env.get("WHATSAPP_API_VERSION") || "v21.0";
  if (!token || !phoneId) return;
  try {
    const res = await fetch(`https://graph.facebook.com/${apiVersion}/${phoneId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: toMetaPhone(to), sender_action: "typing_on" }),
    });
    if (!res.ok) console.warn("[whatsapp-webhook] typing_on fallo:", res.status);
  } catch (e) {
    console.warn("[whatsapp-webhook] typing_on error:", e);
  }
}

/* Envia un mensaje interactivo con hasta 3 botones de respuesta (obras) */
async function sendWhatsAppButtons(
  to: string,
  text: string,
  buttons: Array<{ id: string; title: string }>,
): Promise<boolean> {
  const token = Deno.env.get("WHATSAPP_TOKEN") || "";
  const phoneId = Deno.env.get("WHATSAPP_PHONE_ID") || "";
  const apiVersion = Deno.env.get("WHATSAPP_API_VERSION") || "v21.0";
  if (!token || !phoneId) {
    console.warn("[GADU-WA-BUTTONS] sin WHATSAPP_TOKEN/WHATSAPP_PHONE_ID");
    return false;
  }
  const body = {
    messaging_product: "whatsapp",
    to: toMetaPhone(to),
    type: "interactive",
    interactive: {
      type: "button",
      body: { text },
      action: {
        buttons: buttons.slice(0, 3).map(b => ({
          type: "reply",
          reply: { id: b.id, title: b.title.slice(0, 20) },
        })),
      },
    },
  };
  console.log("[GADU-WA-BUTTONS] payload:", JSON.stringify(body));
  const res = await fetchWithTimeout(`https://graph.facebook.com/${apiVersion}/${phoneId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const respText = await res.text().catch(() => "");
  if (!res.ok) console.error("[GADU-WA-BUTTONS] Meta fallo:", res.status, respText);
  else console.log("[GADU-WA-BUTTONS] Meta OK:", res.status);
  return res.ok;
}

/* Envia un mensaje interactivo de tipo "list" (hasta 10 filas).
   Cada fila usa un id estable; `description` y los rotulos son configurables. */
async function sendWhatsAppList(
  to: string,
  text: string,
  works: Array<{ id: string; title: string; description?: string }>,
  opts?: { button?: string; sectionTitle?: string },
): Promise<boolean> {
  const token = Deno.env.get("WHATSAPP_TOKEN") || "";
  const phoneId = Deno.env.get("WHATSAPP_PHONE_ID") || "";
  const apiVersion = Deno.env.get("WHATSAPP_API_VERSION") || "v21.0";
  if (!token || !phoneId) {
    console.warn("[GADU-WA-LIST] sin WHATSAPP_TOKEN/WHATSAPP_PHONE_ID");
    return false;
  }
  const buttonLabel = (opts && opts.button) || "Ver opciones";
  const sectionTitle = (opts && opts.sectionTitle) || "Opciones";
  const body = {
    messaging_product: "whatsapp",
    to: toMetaPhone(to),
    type: "interactive",
    interactive: {
      type: "list",
      body: { text },
      action: {
        button: buttonLabel,
        sections: [{
          title: sectionTitle,
          rows: works.slice(0, 10).map(w => ({
            id: w.id,
            title: w.title.slice(0, 24),
            ...(w.description ? { description: w.description } : {}),
          })),
        }],
      },
    },
  };
  console.log("[GADU-WA-LIST] payload:", JSON.stringify(body));
  const res = await fetchWithTimeout(`https://graph.facebook.com/${apiVersion}/${phoneId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const respText = await res.text().catch(() => "");
  if (!res.ok) console.error("[GADU-WA-LIST] Meta fallo:", res.status, respText);
  else console.log("[GADU-WA-LIST] Meta OK:", res.status);
  return res.ok;
}

/* Menu principal unificado (lista interactiva, hasta 10 filas) */
/* ============================================================
   MENU JERARQUICO (3 categorias -> submenus)
   Evita el spam: UN solo mensaje interactivo por pantalla.
   ============================================================ */
const MENU_CATEGORIES = [
  { id: "menu_cargar", title: "\uD83D\uDCB0 Cargar Movimiento", description: "Gasto, inversion, adelanto, cobro" },
  { id: "menu_metricas", title: "\uD83D\uDCCA Consultar y Reportes", description: "Saldos, balances y deudas" },
  { id: "menu_gestionar", title: "\uD83C\uDFD7\uFE0F Gestionar", description: "Obra, presupuesto, contacto" },
];

const SUBMENUS: Record<string, Array<{ id: string; title: string; description?: string }>> = {
  menu_cargar: [
    { id: "action_nuevo_gasto", title: "Cargar Gasto" },
    { id: "action_inversion", title: "Registrar Inversion" },
    { id: "action_adelanto", title: "Pago / Adelanto" },
    { id: "action_pagar_deuda", title: "Pagar Deuda" },
    { id: "action_nueva_deuda", title: "Registrar Deuda" },
    { id: "action_herramienta", title: "Registrar Herramienta" },
    { id: "action_ingreso", title: "Registrar Cobro" },
    { id: "menu_root", title: "\uD83C\uDFE0 Volver al menu" },
  ],
  menu_metricas: [
    { id: "action_balance_obra", title: "Consultar Saldo Obra" },
    { id: "metricas_deudas", title: "Deudas Empleados" },
    { id: "metricas_cuotas", title: "Cuotas" },
    { id: "menu_root", title: "\uD83C\uDFE0 Volver al menu" },
  ],
  menu_gestionar: [
    { id: "action_nueva_obra", title: "Nueva Obra" },
    { id: "action_presupuesto", title: "Presupuesto" },
    { id: "action_contacto", title: "Nuevo Contacto" },
    { id: "action_crear_cuadrilla", title: "\u2795 Crear Cuadrilla" },
    { id: "action_asistencia", title: "Registrar Asistencia" },
    { id: "action_humano", title: "Hablar con humano" },
    { id: "menu_root", title: "\uD83C\uDFE0 Volver al menu" },
  ],
};

/* Envia el saludo + el menu en UN SOLO mensaje interactivo (sin spam).
   El cuerpo del mensaje es el saludo; las categorias van dentro de la lista. */
async function showMainMenu(from: string, header: string): Promise<void> {
  await sendWhatsAppList(from, header, MENU_CATEGORIES, { button: "Ver menu", sectionTitle: "Que queres hacer?" });
}

/* Envia un submenu (segunda pantalla del menu jerarquico).
   Si la categoria no existe, avisa y vuelve al menu principal (nunca queda mudo). */
async function showSubMenu(from: string, categoria: string): Promise<void> {
  const items = SUBMENUS[categoria] || [];
  if (!items.length) {
    console.warn("[GADU-WA-SUBMENU] submenu no encontrado:", categoria);
    fireAndForget(sendWhatsApp(from, "\uD83E\uDD16 Error: Submenu no encontrado. Volviendo al inicio."));
    await showMainMenu(from, "Hola! \uD83D\uDC4B Soy tu asistente GADU. Que queres hacer hoy?");
    return;
  }
  const titulos: Record<string, string> = {
    menu_cargar: "\uD83D\uDCB0 Cargar Movimiento",
    menu_metricas: "\uD83D\uDCCA Consultar y Reportes",
    menu_gestionar: "\uD83C\uDFD7\uFE0F Gestionar",
  };
  await sendWhatsAppList(from, "Elegi una opcion \uD83D\uDC47", items, { button: "Ver opciones", sectionTitle: titulos[categoria] || "Opciones" });
}

/* Busca el user_id por telefono (variantes con/sin 9, con/sin +) */
async function findUserId(from: string): Promise<string | null> {
  const fromCandidates = [...new Set([from, normalizePhone(from), "+" + normalizePhone(from)])];
  for (const phone of fromCandidates) {
    for (const field of ["linkedPhone", "phone"]) {
      const q = "data->settings->profile->whatsapp->>" + field + "=eq." + encodeURIComponent(phone);
      const r = await rest("app_data?select=user_id&" + q + "&limit=1");
      const rows = (await r.json().catch(() => [])) as Array<{ user_id: string }>;
      if (Array.isArray(rows) && rows.length) return rows[0].user_id;
    }
    const qp = "whatsapp_number=eq." + encodeURIComponent(phone);
    const rp = await rest("profiles?select=user_id&" + qp + "&limit=1");
    const rowsP = (await rp.json().catch(() => [])) as Array<{ user_id: string }>;
    if (Array.isArray(rowsP) && rowsP.length) return rowsP[0].user_id;
  }
  return null;
}

/* Sesiones del wizard (tabla whatsapp_sessions).
   IMPORTANTE: normalizamos el telefono SIEMPRE (canonical 54 sin "9") para que
   upsertSession/deleteSession (que reciben el `from` crudo de los botones) y
   getSession (que recibe normalizePhone desde processMessage) apunten a la MISMA
   clave. Antes, un boton guardaba "549..." (con 9) y el wizard leia "54..." (sin 9),
   perdiendo el estado (p. ej. WAITING_CONTACT) y cayendo al fallback. */
async function getSession(phone: string) {
  const r = await rest("whatsapp_sessions?phone_number=eq." + encodeURIComponent(normalizePhone(phone)) + "&limit=1", { method: "GET" });
  const rows = (await r.json().catch(() => [])) as Array<{ state: string; context: Record<string, unknown>; is_paused?: boolean; paused_until?: string }>;
  return (Array.isArray(rows) && rows.length) ? rows[0] : null;
}
async function upsertSession(phone: string, userId: string, state: string, context: Record<string, unknown>) {
  await rest("whatsapp_sessions", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({ phone_number: normalizePhone(phone), user_id: userId, state, context, is_paused: false, updated_at: new Date().toISOString() }),
  });
}
async function deleteSession(phone: string) {
  await rest("whatsapp_sessions?phone_number=eq." + encodeURIComponent(normalizePhone(phone)), { method: "DELETE" });
}

/* Pausa/Reanuda el bot para un telefono (flag is_paused en whatsapp_sessions).
   Mientras esta pausado, processMessage corta y no responde automaticamente. */
async function setPaused(phone: string, paused: boolean) {
  await rest("whatsapp_sessions?phone_number=eq." + encodeURIComponent(normalizePhone(phone)), {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ is_paused: paused, paused_until: paused ? new Date().toISOString() : null, updated_at: new Date().toISOString() }),
  });
}

/* El usuario tiene un ticket de soporte ABIERTO? Devuelve el ticket (id + messages)
   o null. Mientras este abierto, el bot NO responde automaticamente. */
async function getOpenSupportTicket(phone: string): Promise<{ id: number; messages: Array<{ role: string; text: string; at: string }> } | null> {
  try {
    const r = await rest(
      "support_tickets?phone=eq." + encodeURIComponent(normalizePhone(phone)) + "&status=eq.open&select=id,messages&limit=1",
      { method: "GET" },
    );
    const rows = (await r.json().catch(() => [])) as Array<{ id: number; messages?: unknown }>;
    if (!Array.isArray(rows) || !rows.length) return null;
    const messages = Array.isArray(rows[0].messages) ? rows[0].messages : [];
    return { id: rows[0].id, messages };
  } catch (e) {
    return null;
  }
}

/* Registra un mensaje del usuario en el historial del ticket (para que el
   admin lo vea en el chat). No responde: el bot queda en silencio. */
async function appendSupportMessage(phone: string, text: string): Promise<void> {
  try {
    const ticket = await getOpenSupportTicket(phone);
    if (!ticket) return;
    const messages = ticket.messages.concat([{ role: "user", text, at: new Date().toISOString() }]);
    await rest("support_tickets?id=eq." + ticket.id, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ messages }),
    });
  } catch (e) {
    console.warn("[GADU-WA-SUPPORT] error registrando mensaje:", e);
  }
}

/* Numero personal del administrador (Franco) que recibe la alerta de nuevos tickets */
const ADMIN_WHATSAPP = Deno.env.get("ADMIN_WHATSAPP") || "5493547469000";

/* Avisa al administrador por WhatsApp cuando se crea un nuevo ticket de soporte */
async function notifyAdminNewTicket(phone: string): Promise<void> {
  try {
    const token = Deno.env.get("WHATSAPP_TOKEN") || "";
    const phoneId = Deno.env.get("WHATSAPP_PHONE_ID") || "";
    const apiVersion = Deno.env.get("WHATSAPP_API_VERSION") || "v21.0";
    if (!token || !phoneId) return;
    const body = {
      messaging_product: "whatsapp",
      to: ADMIN_WHATSAPP,
      type: "text",
      text: { body: "\uD83D\uDD14 Nueva solicitud de soporte de " + phone + ". Revisa el panel para responder." },
    };
    const res = await fetchWithTimeout(`https://graph.facebook.com/${apiVersion}/${phoneId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) console.warn("[GADU-WA-SUPPORT] no se pudo avisar al admin:", res.status);
    else console.log("[GADU-WA-SUPPORT] admin notificado por ticket de", phone);
  } catch (e) {
    console.warn("[GADU-WA-SUPPORT] error avisando al admin:", e);
  }
}

/* Al pedir obra: SELECT obras activas (LIMIT 3) y envia botones */
async function askForWork(phone: string, userId: string, data: Record<string, any>) {
  const activeWorks = (data.works || []).filter((w: any) => w.status === "activa");

  if (activeWorks.length >= 1 && activeWorks.length <= 3) {
    const buttons = activeWorks.map((w: any) => ({
      id: "assign_work:" + String(w.id),
      title: String(w.nombre || w.name || "Obra"),
    }));
    buttons.push({ id: "assign_general", title: "Gasto General" });
    await upsertSession(phone, userId, "WAITING_WORK", {});
    await sendWhatsAppButtons(phone, "A que obra asignamos el gasto?", buttons);
    return;
  }

  if (activeWorks.length > 3) {
    const works = activeWorks.map((w: any) => ({
      id: "assign_work:" + String(w.id),
      title: String(w.nombre || w.name || "Obra"),
    }));
    works.push({ id: "assign_general", title: "Gasto General" });
    works.push({ id: "menu_root", title: "\uD83C\uDFE0 Volver al menu", description: "Cancelar y volver al inicio" });
    await upsertSession(phone, userId, "WAITING_WORK", {});
    await sendWhatsAppList(phone, "A que obra asignamos el gasto?", works);
    return;
  }

  await upsertSession(phone, userId, "WAITING_WORK", {});
  await sendWhatsAppButtons(phone, "No tenes obras activas. Lo dejamos como Gasto General?", [
    { id: "assign_general", title: "Gasto General" },
  ]);
}

/* Idempotencia: evita procesar dos veces el mismo mensaje (reintentos de Meta) */
function extractMessageId(payload: unknown): string {
  const p = payload as Record<string, any>;
  return String(p?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.id || "");
}
async function isDuplicate(messageId: string): Promise<boolean> {
  if (!messageId) return false;
  const r = await rest("whatsapp_processed_messages?message_id=eq." + encodeURIComponent(messageId) + "&limit=1", { method: "GET" });
  const rows = await r.json().catch(() => []);
  return Array.isArray(rows) && rows.length > 0;
}
async function markProcessed(messageId: string): Promise<void> {
  if (!messageId) return;
  await rest("whatsapp_processed_messages", {
    method: "POST",
    headers: { Prefer: "resolution=ignore-duplicates" },
    body: JSON.stringify({ message_id: messageId }),
  });
}

/* ===== Consultas (Q&A) sobre app_data ===== */
function money(n: unknown): string {
  return "$" + Math.round(Number(n) || 0).toLocaleString("es-AR");
}
function flatStr(s: unknown): string {
  return String(s || "").toLowerCase().normalize("NFD").split("").filter((c: string) => { const n = c.charCodeAt(0); return n < 768 || n > 879; }).join("");
}
/* Normaliza nombres para matching tolerante (sin articulos/preposiciones) */
function normStr(s: unknown): string {
  return flatStr(s)
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(?:de|del|la|el|los|las|en|a|con|y|e|al|un|una|casa|obra|obras|proyecto|the|of|para|por|mi|mis)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function resolveFecha(raw: string): string {
  const r = String(raw || "hoy").toLowerCase().trim();
  const hoy = new Date();
  const toISO = (d: Date) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  if (!r || r === "hoy") return toISO(hoy);
  if (r === "ayer") return toISO(new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - 1));
  if (r === "anteayer" || r === "antier") return toISO(new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - 2));
  /* Dias de la semana ("lunes", "miercoles", "sabado") -> el mas reciente */
  const dias: Record<string, number> = { domingo: 0, lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6 };
  const diaKey = flatStr(r);
  if (dias[diaKey] !== undefined) {
    let delta = dias[diaKey] - hoy.getDay();
    if (delta > 0) delta -= 7;   // ya paso esta semana -> semana anterior
    return toISO(new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + delta));
  }
  /* DD/MM/YYYY o DD/MM (ano actual si no se da) */
  let m = r.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/);
  if (m) {
    const day = Number(m[1]), month = Number(m[2]), year = m[3] ? Number(m[3]) : hoy.getFullYear();
    const d = new Date(year, month - 1, day);
    if (d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day) return toISO(d);
  }
  /* YYYY-MM-DD */
  if (/^\d{4}-\d{2}-\d{2}$/.test(r)) return r;
  /* Numero suelto -> dia del mes actual (ej. "20") */
  m = r.match(/^(\d{1,2})$/);
  if (m) {
    const day = Number(m[1]);
    if (day >= 1 && day <= 31) return toISO(new Date(hoy.getFullYear(), hoy.getMonth(), day));
  }
  return toISO(hoy);
}
function findWorkByName(data: Record<string, any>, target: string): Record<string, any> | null {
  const ws = (data.works || []) as Array<Record<string, any>>;
  if (!ws.length) return null;
  const t = String(target || "").toLowerCase();
  if (t) {
    const hit = ws.find((w) => String(w.name || w.nombre || "").toLowerCase().includes(t));
    if (hit) return hit;
  }
  return ws[0];
}
function queryBalanceWork(data: Record<string, any>, target: string): string {
  const w = findWorkByName(data, target);
  if (!w) return "\uD83E\uDD16 No encontre esa obra.";
  const cobrado = (data.incomes || []).filter((i: any) => i.workId === w.id).reduce((s: number, i: any) => s + (Number(i.amount) || 0), 0);
  const gastos = (data.expenses || []).filter((e: any) => e.type === "obra" && e.workId === w.id).reduce((s: number, e: any) => s + (Number(e.amount) || 0), 0);
  return "\uD83D\uDCCA El saldo de la obra *" + (w.name || w.nombre || "sin nombre") + "* es de *" + money(cobrado - gastos) + "* (Cobrado: " + money(cobrado) + ", Gastos: " + money(gastos) + ")";
}
function queryExpensesWeek(data: Record<string, any>): string {
  const cutoff = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const list = (data.expenses || []).filter((e: any) => String(e.date || "") >= cutoff);
  if (!list.length) return "\uD83D\uDCB0 No tenes gastos en los ultimos 7 dias.";
  const total = list.reduce((s: number, e: any) => s + (Number(e.amount) || 0), 0);
  const detalle = list.slice(0, 5).map((e: any) => "  " + (e.category || e.description || "gasto") + ": " + money(e.amount)).join("\n");
  return "\uD83D\uDCB0 Gastaste *" + money(total) + "* en los ultimos 7 dias (" + list.length + " gastos):\n" + detalle;
}
function queryAttendanceToday(data: Record<string, any>): string {
  const hoy = new Date().toISOString().slice(0, 10);
  const att = (data.attendance || []).filter((a: any) => String(a.date || "").slice(0, 10) === hoy && a.status !== "ausente");
  if (!att.length) return "\uD83D\uDC77 Hoy no registraste jornadas.";
  const names = att.map((a: any) => {
    const emp = (data.employees || []).find((e: any) => e.id === a.employeeId);
    return emp ? ((emp.firstName || "") + " " + (emp.lastName || "")).trim() : "empleado";
  });
  return "\uD83D\uDC77 Hoy trabajaron: *" + names.join(", ") + "*";
}
function queryPendingSalaries(data: Record<string, any>, target: string): string {
  const emps = (data.employees || []) as Array<Record<string, any>>;
  if (!emps.length) return "\uD83E\uDD16 No tenes empleados cargados.";
  const t = String(target || "").toLowerCase();
  const emp = (t && emps.find((e) => String((e.firstName || "") + " " + (e.lastName || "")).toLowerCase().includes(t))) || emps[0];
  const nombre = ((emp.firstName || "") + " " + (emp.lastName || "")).trim();

  const mk = new Date().toISOString().slice(0, 7); // mes actual (YYYY-MM)
  const present = (data.attendance || []).filter((a: any) => a.employeeId === emp.id && String(a.date || "").slice(0, 7) === mk && a.status === "presente");
  const horas = present.reduce((s: number, a: any) => s + (a.hours || []).reduce((s2: number, h: any) => s2 + (Number(h.hours) || 0), 0), 0);
  const rate = Number(emp.hourlyRate || emp.hourly_rate || 0);
  const generado = horas * rate;

  const pays = (data.expenses || []).filter((x: any) => x.employeeId === emp.id && String(x.date || "").slice(0, 7) === mk);
  const pagado = pays.filter((x: any) => x.expenseKind !== "adelanto").reduce((s: number, x: any) => s + (Number(x.amount) || 0), 0);
  const adelantos = pays.filter((x: any) => x.expenseKind === "adelanto").reduce((s: number, x: any) => s + (Number(x.amount) || 0), 0);

  const deuda = generado - (pagado + adelantos);
  return "\uD83D\uDCB8 *" + nombre + "*: Trabajo " + horas + " hs. Genero " + money(generado) + ". Pagado/Adelantado " + money(pagado + adelantos) + ". *Saldo pendiente: " + money(deuda) + "*";
}

/* ===== Presupuesto en PDF (pdf-lib) + envio de documentos ===== */
interface BudgetItem { descripcion: string; cantidad: number; precio: number }

async function generateBudgetPDF(budgetData: { cliente: string; items: BudgetItem[] }): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  let page = doc.addPage([595.28, 841.89]); // A4 portrait
  const hoy = new Date().toLocaleDateString("es-AR", { day: "2-digit", month: "long", year: "numeric" });

  const drawHeader = () => {
    const { height } = page.getSize();
    page.drawText("PRESUPUESTO GADU", { x: 50, y: height - 60, size: 22, font: fontBold, color: rgb(0.06, 0.09, 0.13) });
    page.drawText("GADU Construye   Tu gestion, perfecta", { x: 50, y: height - 82, size: 11, font: font, color: rgb(0.39, 0.45, 0.55) });
    page.drawText("Fecha: " + hoy, { x: 400, y: height - 60, size: 10, font: font, color: rgb(0.39, 0.45, 0.55) });
    page.drawText("Cliente: " + (budgetData.cliente || "-"), { x: 50, y: height - 118, size: 13, font: fontBold, color: rgb(0.06, 0.09, 0.13) });
  };

  drawHeader();
  let y = 841.89 - 158;
  const cols = { desc: 50, cant: 330, prec: 400, total: 470 };
  page.drawText("Descripcion", { x: cols.desc, y, size: 10, font: fontBold, color: rgb(0.39, 0.45, 0.55) });
  page.drawText("Cant.", { x: cols.cant, y, size: 10, font: fontBold, color: rgb(0.39, 0.45, 0.55) });
  page.drawText("P. unit.", { x: cols.prec, y, size: 10, font: fontBold, color: rgb(0.39, 0.45, 0.55) });
  page.drawText("Total", { x: cols.total, y, size: 10, font: fontBold, color: rgb(0.39, 0.45, 0.55) });
  y -= 16;
  page.drawLine({ start: { x: 50, y: y + 8 }, end: { x: 545, y: y + 8 }, thickness: 1, color: rgb(0.83, 0.86, 0.9) });

  let totalGeneral = 0;
  for (const it of budgetData.items || []) {
    if (y < 90) { page = doc.addPage([595.28, 841.89]); drawHeader(); y = 841.89 - 158; }
    y -= 22;
    const cant = Number(it.cantidad) || 0;
    const prec = Number(it.precio) || 0;
    const tot = cant * prec;
    totalGeneral += tot;
    page.drawText(String(it.descripcion || "").slice(0, 55), { x: cols.desc, y, size: 10, font: font, color: rgb(0.06, 0.09, 0.13) });
    page.drawText(String(cant), { x: cols.cant, y, size: 10, font: font, color: rgb(0.06, 0.09, 0.13) });
    page.drawText("$" + prec.toLocaleString("es-AR"), { x: cols.prec, y, size: 10, font: font, color: rgb(0.06, 0.09, 0.13) });
    page.drawText("$" + tot.toLocaleString("es-AR"), { x: cols.total, y, size: 10, font: font, color: rgb(0.06, 0.09, 0.13) });
  }

  y -= 30;
  page.drawLine({ start: { x: 50, y: y + 12 }, end: { x: 545, y: y + 12 }, thickness: 1.5, color: rgb(0.83, 0.86, 0.9) });
  page.drawText("TOTAL", { x: cols.desc, y, size: 12, font: fontBold, color: rgb(0.06, 0.09, 0.13) });
  page.drawText("$" + totalGeneral.toLocaleString("es-AR"), { x: cols.total, y, size: 12, font: fontBold, color: rgb(0.06, 0.09, 0.13) });

  page.drawText("Generado por GADU - Tu gestion, perfecta", { x: 50, y: 40, size: 10, font: font, color: rgb(0.58, 0.63, 0.71) });

  return await doc.save();
}

async function sendWhatsAppDocument(to: string, bytes: Uint8Array, filename: string, mimeType = "application/pdf", caption = "Presupuesto GADU"): Promise<boolean> {
  const token = Deno.env.get("WHATSAPP_TOKEN") || "";
  const phoneId = Deno.env.get("WHATSAPP_PHONE_ID") || "";
  const apiVersion = Deno.env.get("WHATSAPP_API_VERSION") || "v21.0";
  if (!token || !phoneId) {
    console.warn("[GADU-WA-DOC] sin WHATSAPP_TOKEN/WHATSAPP_PHONE_ID");
    return false;
  }

  /* 1) Subir el archivo a Meta para obtener media_id */
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: mimeType }), filename);
  form.append("messaging_product", "whatsapp");
  form.append("type", mimeType);
  const up = await fetchWithTimeout(`https://graph.facebook.com/${apiVersion}/${phoneId}/media`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const upJson = await up.json().catch(() => ({}));
  if (!up.ok || !upJson.id) {
    console.error("[GADU-WA-DOC] subir media fallo:", up.status, JSON.stringify(upJson));
    return false;
  }
  const mediaId = String(upJson.id);

  /* 2) Enviar el mensaje tipo document con ese media_id */
  const body = {
    messaging_product: "whatsapp",
    to: toMetaPhone(to),
    type: "document",
    document: { id: mediaId, filename, caption },
  };
  const res = await fetchWithTimeout(`https://graph.facebook.com/${apiVersion}/${phoneId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const respText = await res.text().catch(() => "");
  if (!res.ok) console.error("[GADU-WA-DOC] enviar documento fallo:", res.status, respText);
  else console.log("[GADU-WA-DOC] documento enviado OK:", filename);
  return res.ok;
}

/* Genera un .xlsx con los gastos del usuario (Fecha, Monto, Categoria, Concepto, Obra) */
function exportExpensesXlsx(data: Record<string, any>): Uint8Array {
  const works = data.works || [];
  const workName = (id: string | null | undefined) => {
    if (!id) return "";
    const w = works.find((x: Record<string, any>) => String(x.id) === String(id));
    return w ? String(w.name || w.nombre || "") : "";
  };
  const rows = (data.expenses || []).map((x: Record<string, any>) => ({
    Fecha: String(x.date || x.fecha || ""),
    Monto: Number(x.amount) || 0,
    "Categoria": String(x.category || x.categoria || ""),
    Concepto: String(x.description || x.name || "").slice(0, 60),
    Obra: workName(x.workId),
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Gastos");
  return new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer);
}

Deno.serve(async (req) => {
  /* Rastreo verbose: imprime SIEMPRE metodo, URL y headers de cualquier
     peticion, para descartar filtros internos y validar el formato de los
     headers que envia Meta. */
  console.log("[whatsapp-webhook] request:", req.method, req.url);
  try {
    const headers: Record<string, string> = {};
    req.headers.forEach((v, k) => { headers[k] = v; });
    console.log("[whatsapp-webhook] headers:", JSON.stringify(headers));
  } catch (e) { console.warn("[whatsapp-webhook] no se pudieron leer headers:", e); }
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  /* ===== Verificacion del webhook de Meta (GET) =====
     Meta exige responder con `hub.challenge` cuando `hub.verify_token`
     coincide con nuestro secreto (WHATSAPP_VERIFY_TOKEN). SIN este
     handshake Meta NO habilita el webhook y NUNCA entrega mensajes:
     esta es la causa mas comun de "no vincula ni responde". */
  if (req.method === "GET") {
    try {
      const url = new URL(req.url);
      const mode = url.searchParams.get("hub.mode");
      const token = url.searchParams.get("hub.verify_token");
      const challenge = url.searchParams.get("hub.challenge");
      const expected = Deno.env.get("WHATSAPP_VERIFY_TOKEN") || "";
      if (mode === "subscribe" && expected && token === expected && challenge) {
        return new Response(challenge, { status: 200 });
      }
      console.warn("[whatsapp-webhook] verificacion GET fallida:", { mode, token, expected });
      return new Response("verification failed", { status: 403 });
    } catch (e) {
      return new Response("verification failed", { status: 403 });
    }
  }

  /* ===== Validacion de firma de Meta (X-Hub-Signature-256) =====
     Intercepta el body crudo ANTES de parsear, verifica el HMAC-SHA256
     con WHATSAPP_APP_SECRET y rechaza con 403 si no coincide. */
  const rawBody = await req.text().catch(() => "");
  const signature = req.headers.get("x-hub-signature-256") || "";
  const appSecret = Deno.env.get("WHATSAPP_APP_SECRET") || "";
  if (appSecret) {
    if (!signature) {
      console.warn("[whatsapp-webhook] falta header X-Hub-Signature-256");
      return new Response("invalid signature", { status: 403, headers: corsHeaders });
    }
    const okSig = await verifyMetaSignature(rawBody, appSecret, signature);
    if (!okSig) {
      console.warn("[whatsapp-webhook] firma invalida de Meta");
      return new Response("invalid signature", { status: 403, headers: corsHeaders });
    }
  } else {
    console.warn("[whatsapp-webhook] WHATSAPP_APP_SECRET no configurado: no se valida firma");
  }

  let body: Record<string, any> = {};
  try { body = JSON.parse(rawBody || "{}"); } catch (e) { body = {}; }
  console.log("=== PAYLOAD ENTRANTE ===", JSON.stringify(body));
  console.log("=== WEBHOOK EVENT RECEIVED ===", JSON.stringify(body));

  const messageId = extractMessageId(body);
  const fromQuick = extractFrom(body);
  const phoneQuick = fromQuick ? normalizePhone(fromQuick) : "desconocido";

  /* Responder 200 OK INMEDIATAMENTE (en <1s) y procesar TODO en segundo plano.
     Asi un audio que tarde (o falle) NUNCA bloquea el 200 OK ni los mensajes
     siguientes. La idempotencia tambien va en background. */
  fireAndForget((async () => {
    /* Idempotencia: si este message.id ya se proceso, salir sin tocar nada */
    if (messageId) {
      if (await isDuplicate(messageId)) {
        console.log("[GADU-WA-DEDUP] message_id ya procesado:", messageId);
        return;
      }
      await markProcessed(messageId);
    }
    /* Encolar PRIMERO y recien despues drenar (secuencial): si el drain corre
       antes de insertar, no ve el mensaje y queda "pending" para siempre. */
    await enqueueMessage(rest, phoneQuick, body);
    await drainPhone(phoneQuick);
  })());

  return json({ ok: true });
});

/* ===== Mensajes interactivos (botones) ===== */
function detectInteractive(body: unknown): { from: string; buttonId: string } | null {
  try {
    const p = body as Record<string, any>;
    const msg = p?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!msg || msg.type !== "interactive") return null;
    /* Log del objeto interactive completo para diagnostico (list_reply vs button_reply) */
    console.log("[GADU-WA-INTERACTIVE] interactive completo:", JSON.stringify(msg.interactive || {}));
    const buttonId = String(msg.interactive?.button_reply?.id || msg.interactive?.list_reply?.id || msg.interactive?.nfm_reply?.response_json || "");
    console.log("[GADU-WA-INTERACTIVE] list_reply.id:", JSON.stringify(msg.interactive?.list_reply?.id), "  button_reply.id:", JSON.stringify(msg.interactive?.button_reply?.id), "  buttonId resuelto:", buttonId);
    const from = String(msg.from || p?.entry?.[0]?.changes?.[0]?.value?.contacts?.[0]?.wa_id || "");
    if (!buttonId || !from) return null;
    return { from: String(from).replace(/\D/g, ""), buttonId };
  } catch (_e) {
    return null;
  }
}

async function handleButtonReply(from: string, buttonId: string) {
  console.log("[GADU-WA-BUTTONS] ID recibido:", buttonId, "  de:", from);

  /* 1) Buscar usuario (helper compartido) */
  const userId = await findUserId(from);
  if (!userId) {
    console.warn("[GADU-WA-BUTTONS] usuario no encontrado para", from);
    fireAndForget(sendWhatsApp(from, "\uD83E\uDD16 No pude identificar tu cuenta."));
    return;
  }

  /* [GADU-WA-MENU] Navegacion jerarquica: SIEMPRE PRIMERO, antes de cualquier
     otro chequeo (soporte, wizards, etc.). menu_root + menu_* no caen a texto. */
  if (buttonId === "menu_root") {
    /* Volver al menu limpia cualquier wizard en curso (evita quedarse colgado) */
    try { await deleteSession(normalizePhone(from)); } catch (e) {}
    await showMainMenu(from, "Hola! \uD83D\uDC4B Soy tu asistente GADU. Que queres hacer hoy?");
    return;
  }
  if (buttonId.startsWith("menu_")) {
    console.log("[GADU-WA-MENU] mostrando submenu para:", buttonId);
    await showSubMenu(from, buttonId);
    return;
  }

  /* [GADU-WA-CANCEL] Cancelar flujo: resetea sesion y vuelve al menu (siempre disponible) */
  if (buttonId === "action_cancel") {
    try { await deleteSession(normalizePhone(from)); } catch (e) {}
    await showMainMenu(from, "\u270B Operacion cancelada. En que te ayudo?");
    return;
  }

  /* [GADU-WA-PAYDEBT] Ejecutar el pago de N cuotas (paydebt_n_<id>_<n>) */
  if (buttonId.startsWith("paydebt_n_")) {
    const restId = buttonId.slice("paydebt_n_".length);
    const idxSep = restId.lastIndexOf("_");
    const debtId = restId.slice(0, idxSep);
    const nCuotas = restId.slice(idxSep + 1);
    try {
      const rPn = await rest("app_data?select=data&user_id=eq." + encodeURIComponent(userId) + "&limit=1");
      const rowsPn = (await rPn.json().catch(() => [])) as Array<{ data: Record<string, any> }>;
      const dPn = (Array.isArray(rowsPn) && rowsPn.length) ? (rowsPn[0].data || {}) : {};
      const res = pagarDeuda(dPn, debtId, nCuotas);
      if (res.ok) {
        const upPn = await rest("app_data?user_id=eq." + encodeURIComponent(userId), {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({ data: dPn, updated_at: new Date().toISOString() }),
        });
        if (!upPn.ok) {
          console.error("[GADU-WA-PAYDEBT] PATCH fallo:", upPn.status);
          fireAndForget(sendWhatsApp(from, "\u26A0\uFE0F No pude guardar el pago en la nube. Reintenta."));
          return;
        }
        fireAndForget(sendWhatsApp(from, "\u2705 Pago registrado: " + res.label + ". Se registro el gasto en tu caja general."));
      } else {
        fireAndForget(sendWhatsApp(from, "\uD83E\uDD16 " + (res.error || "No pude pagar esa deuda.")));
      }
    } catch (e) {
      console.error("[GADU-WA-PAYDEBT] error:", e);
      fireAndForget(sendWhatsApp(from, "\u26A0\uFE0F No pude procesar el pago. Proba de nuevo."));
    }
    return;
  }

  /* [GADU-WA-PAYDEBT] Elegir deuda -> preguntar cuantas cuotas pagar */
  if (buttonId.startsWith("paydebt_")) {
    const debtId = buttonId.slice("paydebt_".length);
    try {
      const rPd = await rest("app_data?select=data&user_id=eq." + encodeURIComponent(userId) + "&limit=1");
      const rowsPd = (await rPd.json().catch(() => [])) as Array<{ data: Record<string, any> }>;
      const dPd = (Array.isArray(rowsPd) && rowsPd.length) ? (rowsPd[0].data || {}) : {};
      const d = (dPd.debts || []).find((x: any) => String(x.id) === debtId);
      if (!d || d.finalizada) {
        fireAndForget(sendWhatsApp(from, "\uD83E\uDD16 No encontre esa deuda o ya esta finalizada."));
        return;
      }
      const restantes = Math.max(0, (Number(d.cuotasTotales) || 0) - (Number(d.cuotaActual) || 0));
      const montoCuota = Number(d.montoPorCuota) || 0;
      const fmt = (n: number) => "$" + n.toLocaleString("es-AR");
      const opts: Array<{ id: string; title: string; description: string }> = [];
      if (restantes >= 1) opts.push({ id: "paydebt_n_" + debtId + "_1", title: "1 cuota", description: fmt(montoCuota) });
      if (restantes >= 2) opts.push({ id: "paydebt_n_" + debtId + "_2", title: "2 cuotas", description: fmt(montoCuota * 2) });
      if (restantes >= 3) opts.push({ id: "paydebt_n_" + debtId + "_3", title: "3 cuotas", description: fmt(montoCuota * 3) });
      if (restantes > 3) opts.push({ id: "paydebt_n_" + debtId + "_all", title: "Todas (" + restantes + ")", description: fmt(montoCuota * restantes) });
      opts.push({ id: "menu_root", title: "\uD83C\uDFE0 Volver al menu", description: "Cancelar y volver al inicio" });
      await sendWhatsAppList(from, "Cuantas cuotas de " + (d.concepto || "Deuda") + " queres pagar?", opts, { button: "Elegir cuotas", sectionTitle: "Cuotas a pagar" });
    } catch (e) {
      console.error("[GADU-WA-PAYDEBT] error:", e);
      fireAndForget(sendWhatsApp(from, "\u26A0\uFE0F No pude cargar la deuda. Proba de nuevo."));
    }
    return;
  }

  /* [GADU-WA-ATT] Alta rapida de empleado desde el selector de asistencia */
  if (buttonId === "att_new_emp") {
    await upsertSession(from, userId, "WAITING_EMP_OFICIO", { resumeAttendance: true });
    fireAndForget(sendWhatsApp(from, "\uD83D\uDC77 Dale! Cual es el nombre del nuevo empleado? (ej. Juan Perez)"));
    return;
  }

  /* [GADU-WA-SUPPORT] Si hay un ticket ABIERTO, ignorar cualquier boton salvo
     los de "hablar con humano" (que re-confirman el ticket). */
  if (buttonId !== "action_humano" && buttonId !== "fallback_humano") {
    try {
      if (await getOpenSupportTicket(from)) {
        console.log("[GADU-WA-SUPPORT] ticket abierto, ignorando boton:", buttonId);
        return;
      }
    } catch (e) {}
  }

  /* [GADU-WA-ADVANCE-TYPE] Seleccion del tipo de adelanto */
  if (buttonId.startsWith("advance_type:")) {
    const tipo = buttonId.slice("advance_type:".length);
    if (tipo === "empleado") {
      await upsertSession(from, userId, "WAITING_ADVANCE", {});
      fireAndForget(sendWhatsApp(from, "\uD83D\uDCB8 Decime *a que empleado* y *de cuanto* es el adelanto. Ej: \"Adelanto de Hugo de 12000\"."));
    } else if (tipo === "cliente") {
      await upsertSession(from, userId, "WAITING_CLIENT_ADVANCE", {});
      fireAndForget(sendWhatsApp(from, "\uD83D\uDCB0 Decime *de que cliente/obra* es el adelanto y *de cuanto*. Ej: \"Adelanto de 50000 de la obra Casa Perez\"."));
    }
    return;
  }

  /* [GADU-WA-ATTENDANCE] Paso 1: empleado seleccionado -> acumular y preguntar si agrega otro */
  if (buttonId.startsWith("att_emp:")) {
    const empId = buttonId.slice("att_emp:".length);
    try {
      const rAtt = await rest("app_data?select=data&user_id=eq." + encodeURIComponent(userId) + "&limit=1");
      const rowsAtt = (await rAtt.json().catch(() => [])) as Array<{ data: Record<string, any> }>;
      const dAtt = (Array.isArray(rowsAtt) && rowsAtt.length) ? (rowsAtt[0].data || {}) : {};
      const emp = (dAtt.employees || []).find((e: any) => String(e.id) === empId);
      const empName = emp ? String((emp.firstName || "") + " " + (emp.lastName || "")).trim() : "el empleado";
      /* Acumular IDs en el contexto de sesion (cuadrilla / seleccion multiple) */
      const sessPrev = await getSession(normalizePhone(from));
      const prevCtx = ((sessPrev && sessPrev.context) || {}) as Record<string, unknown>;
      const employeeIds: string[] = Array.isArray(prevCtx.employeeIds) ? (prevCtx.employeeIds as string[]).slice() : [];
      const employeeNames: string[] = Array.isArray(prevCtx.employeeNames) ? (prevCtx.employeeNames as string[]).slice() : [];
      if (employeeIds.indexOf(empId) < 0) {
        employeeIds.push(empId);
        employeeNames.push(empName);
      }
      await upsertSession(from, userId, "WAITING_ATTENDANCE_MORE", { employeeIds, employeeNames });
      await sendWhatsAppButtons(from, "\uD83D\uDC77 " + employeeNames.join(", ") + "   Queres agregar otro empleado a esta obra?", [
        { id: "att_more:yes", title: "Si, agregar otro" },
        { id: "att_more:no", title: "No, seguir" },
      ]);
    } catch (e) {
      fireAndForget(sendWhatsApp(from, "\u26A0\uFE0F No pude cargar el empleado. Proba de nuevo."));
    }
    return;
  }

  /* [GADU-WA-ATTENDANCE] Agregar otro empleado a la cuadrilla */
  if (buttonId === "att_more:yes") {
    try {
      const rAtt = await rest("app_data?select=data&user_id=eq." + encodeURIComponent(userId) + "&limit=1");
      const rowsAtt = (await rAtt.json().catch(() => [])) as Array<{ data: Record<string, any> }>;
      const dAtt = (Array.isArray(rowsAtt) && rowsAtt.length) ? (rowsAtt[0].data || {}) : {};
      const emps = (dAtt.employees || []).filter((e: any) => e.active !== false).slice(0, 10);
      const empRows = emps.map((e: any) => ({ id: "att_emp:" + String(e.id), title: String((e.firstName || "") + " " + (e.lastName || "")).trim() }));
      empRows.push({ id: "att_more:no", title: "Ya esta, seguir", description: "Terminar de elegir la cuadrilla" });
      empRows.push({ id: "menu_root", title: "\uD83C\uDFE0 Volver al menu", description: "Cancelar y volver al inicio" });
      await sendWhatsAppList(from, "Que otro empleado trabajo?", empRows, { button: "Elegir empleado", sectionTitle: "Empleados" });
    } catch (e) {
      fireAndForget(sendWhatsApp(from, "\u26A0\uFE0F No pude cargar los empleados. Proba de nuevo."));
    }
    return;
  }

  /* [GADU-WA-ATTENDANCE] Cuadrilla cerrada -> pedir obra */
  if (buttonId === "att_more:no") {
    try {
      const sessM = await getSession(normalizePhone(from));
      const ctxM = ((sessM && sessM.context) || {}) as Record<string, unknown>;
      const employeeIds: string[] = Array.isArray(ctxM.employeeIds) ? (ctxM.employeeIds as string[]) : [];
      const rAtt = await rest("app_data?select=data&user_id=eq." + encodeURIComponent(userId) + "&limit=1");
      const rowsAtt = (await rAtt.json().catch(() => [])) as Array<{ data: Record<string, any> }>;
      const dAtt = (Array.isArray(rowsAtt) && rowsAtt.length) ? (rowsAtt[0].data || {}) : {};
      const obras = (dAtt.works || []).filter((w: any) => w.status === "activa").slice(0, 10);
      if (!obras.length) {
        fireAndForget(sendWhatsApp(from, "\uD83E\uDD16 No tenes obras activas. Crea una con \"nueva obra [nombre]\"."));
        await deleteSession(normalizePhone(from));
        return;
      }
      if (!employeeIds.length) {
        fireAndForget(sendWhatsApp(from, "\uD83E\uDD16 No elegiste ningun empleado. Empeza de nuevo con \"registrar asistencia\"."));
        await deleteSession(normalizePhone(from));
        return;
      }
      await upsertSession(from, userId, "WAITING_ATTENDANCE_WORK", { employeeIds });
      const obraRows = obras.map((w: any) => ({ id: "att_work:" + String(w.id), title: String(w.nombre || w.name || "Obra") }));
      obraRows.push({ id: "menu_root", title: "\uD83C\uDFE0 Volver al menu", description: "Cancelar y volver al inicio" });
      await sendWhatsAppList(from, "En que obra trabajo la cuadrilla (" + employeeIds.length + " empleados)?", obraRows, { button: "Elegir obra", sectionTitle: "Obras activas" });
    } catch (e) {
      fireAndForget(sendWhatsApp(from, "\u26A0\uFE0F No pude continuar. Proba de nuevo."));
    }
    return;
  }

  /* [GADU-WA-ATTENDANCE] Paso 2: obra seleccionada -> pedir fecha.
     La cuadrilla (employeeIds) viaja en el contexto de sesion. */
  if (buttonId.startsWith("att_work:")) {
    const workId = buttonId.slice("att_work:".length);
    try {
      const sessW = await getSession(normalizePhone(from));
      const ctxW = ((sessW && sessW.context) || {}) as Record<string, unknown>;
      const employeeIds: string[] = Array.isArray(ctxW.employeeIds) ? (ctxW.employeeIds as string[]) : [];
      const rAtt = await rest("app_data?select=data&user_id=eq." + encodeURIComponent(userId) + "&limit=1");
      const rowsAtt = (await rAtt.json().catch(() => [])) as Array<{ data: Record<string, any> }>;
      const dAtt = (Array.isArray(rowsAtt) && rowsAtt.length) ? (rowsAtt[0].data || {}) : {};
      const work = (dAtt.works || []).find((w: any) => String(w.id) === workId);
      const workName = work ? String(work.nombre || work.name || "la obra") : "la obra";
      if (!employeeIds.length) {
        fireAndForget(sendWhatsApp(from, "\uD83E\uDD16 No elegiste empleados. Empeza de nuevo con \"registrar asistencia\"."));
        await deleteSession(normalizePhone(from));
        return;
      }
      console.log("[GADU-WA-ATT] att_work: workId=", workId, "  cuadrilla=", employeeIds.length, "  workName=", workName);
      await upsertSession(from, userId, "WAITING_ATTENDANCE_FECHA", { employeeIds, workId, workName });
      await sendWhatsAppButtons(from, "La asistencia es de hoy o de otra fecha?", [
        { id: "att_fecha:" + workId + ":hoy", title: "Hoy" },
        { id: "att_fecha:" + workId + ":ayer", title: "Ayer" },
      ]);
      fireAndForget(sendWhatsApp(from, "Tambien podes escribir la fecha (ej. *20/10*, *lunes*, *anteayer*)."));
    } catch (e) {
      fireAndForget(sendWhatsApp(from, "\u26A0\uFE0F No pude continuar. Proba de nuevo."));
    }
    return;
  }

  /* [GADU-WA-ATT] Fecha elegida por boton (att_fecha:<workId>:hoy|ayer) */
  if (buttonId.startsWith("att_fecha:")) {
    const restF = buttonId.slice("att_fecha:".length);
    const parts = restF.split(":");
    const workId = parts[0] || "";
    const fechaKey = parts[1] || "hoy";
    try {
      const sessF = await getSession(normalizePhone(from));
      const ctxF = ((sessF && sessF.context) || {}) as Record<string, unknown>;
      const employeeIds: string[] = Array.isArray(ctxF.employeeIds) ? (ctxF.employeeIds as string[]) : [];
      const rF = await rest("app_data?select=data&user_id=eq." + encodeURIComponent(userId) + "&limit=1");
      const rowsF = (await rF.json().catch(() => [])) as Array<{ data: Record<string, any> }>;
      const dF = (Array.isArray(rowsF) && rowsF.length) ? (rowsF[0].data || {}) : {};
      const workF = (dF.works || []).find((w: any) => String(w.id) === workId);
      const workName = workF ? String(workF.nombre || workF.name || "la obra") : "la obra";
      const fecha = fechaKey === "ayer" ? resolveFecha("ayer") : resolveFecha("hoy");
      console.log("[GADU-WA-ATT] att_fecha: workId=", workId, "  fecha=", fecha, "  cuadrilla=", employeeIds.length);
      await upsertSession(from, userId, "WAITING_ATTENDANCE_HOURS", { employeeIds, workId, workName, fecha });
      fireAndForget(sendWhatsApp(from, "Cuantas horas trabajo la cuadrilla (" + employeeIds.length + " empleados) en " + workName + "? (Ej: 8)"));
    } catch (e) {
      fireAndForget(sendWhatsApp(from, "\u26A0\uFE0F No pude continuar. Proba de nuevo."));
    }
    return;
  }

  /* [GADU-WA-METRICAS] Deudas de TODOS los empleados (solo lectura) */
  if (buttonId === "metricas_deudas") {
    try {
      const rDeudas = await rest("app_data?select=data&user_id=eq." + encodeURIComponent(userId) + "&limit=1");
      const rowsDeudas = (await rDeudas.json().catch(() => [])) as Array<{ data: Record<string, any> }>;
      const dDeudas = (Array.isArray(rowsDeudas) && rowsDeudas.length) ? (rowsDeudas[0].data || {}) : {};
      const reply = calcularDeudasEmpleados(dDeudas);
      console.log("[GADU-WA-METRICAS] deudas calculadas para", userId);
      fireAndForget(sendWhatsApp(from, reply));
    } catch (e) {
      console.error("[GADU-WA-METRICAS] fallo:", e);
      fireAndForget(sendWhatsApp(from, "\u26A0\uFE0F No pude calcular las deudas. Proba de nuevo."));
    }
    return;
  }

  /* [GADU-WA-METRICAS] Cuotas pendientes de Deudas y Cuotas (data.debts) */
  if (buttonId === "metricas_cuotas") {
    try {
      const rCuotas = await rest("app_data?select=data&user_id=eq." + encodeURIComponent(userId) + "&limit=1");
      const rowsCuotas = (await rCuotas.json().catch(() => [])) as Array<{ data: Record<string, any> }>;
      const dCuotas = (Array.isArray(rowsCuotas) && rowsCuotas.length) ? (rowsCuotas[0].data || {}) : {};
      const reply = calcularCuotas(dCuotas);
      console.log("[GADU-WA-METRICAS] cuotas calculadas para", userId);
      fireAndForget(sendWhatsApp(from, reply));
    } catch (e) {
      console.error("[GADU-WA-METRICAS] fallo:", e);
      fireAndForget(sendWhatsApp(from, "\u26A0\uFE0F No pude calcular las cuotas. Proba de nuevo."));
    }
    return;
  }

  /* [GADU-WA-MENU] Opciones del menu principal (lista interactiva unificada) */
  if (buttonId.startsWith("action_")) {
    const act = buttonId.slice("action_".length);
    if (act === "nuevo_gasto") {
      await upsertSession(from, userId, "WAITING_GASTO", {});
      fireAndForget(sendWhatsApp(from, "Dale, decime el monto y el concepto (ej: \"Gaste 5000 de nafta\" o \"5000 de cemento\")"));
      return;
    }
    if (act === "inversion") {
      await upsertSession(from, userId, "WAITING_INVERSION", {});
      fireAndForget(sendWhatsApp(from, "De cuanto fue la inversion y en que? Ej: \"Inverti 50000 en herramientas\"."));
      return;
    }
    if (act === "herramienta") {
      await upsertSession(from, userId, "WAITING_HERRAMIENTA", {});
      fireAndForget(sendWhatsApp(from, "Decime la herramienta y su costo, ej: \"Amoladora 50000\" o \"Hormigonera 380000\"."));
      return;
    }
    if (act === "nueva_obra") {
      await upsertSession(from, userId, "WAITING_OBRA", {});
      fireAndForget(sendWhatsApp(from, "Como se llama la obra y en que direccion esta? Ej: \"Casa Perez en Alta Gracia\""));
      return;
    }
    if (act === "adelanto") {
      await upsertSession(from, userId, "WAITING_ADVANCE_TYPE", {});
      await sendWhatsAppButtons(from, "Que tipo de adelanto es?", [
        { id: "advance_type:empleado", title: "Adelanto a Empleado" },
        { id: "advance_type:cliente", title: "Adelanto de Cliente" },
      ]);
      return;
    }
    if (act === "presupuesto") {
      await upsertSession(from, userId, "WAITING_PRESUPUESTO", {});
      fireAndForget(sendWhatsApp(from, "Para que cliente es el presupuesto y que items incluye?"));
      return;
    }
    if (act === "consulta") {
      await upsertSession(from, userId, "WAITING_CONSULTA", {});
      fireAndForget(sendWhatsApp(from, "Que queres consultar? Saldo de una obra, gastos de la semana, etc."));
      return;
    }
    if (act === "balance_obra") {
      fireAndForget(sendWhatsApp(from, "De que obra queres el balance? Escribi por ejemplo: \"balance de la obra Casa Perez\"."));
      return;
    }
    if (act === "ingreso") {
      await upsertSession(from, userId, "WAITING_INGRESO", {});
      fireAndForget(sendWhatsApp(from, "De cuanto es el cobro? (ej. 50000)"));
      return;
    }
    if (act === "nueva_deuda") {
      await upsertSession(from, userId, "WAITING_DEBT_CONCEPT", {});
      fireAndForget(sendWhatsApp(from, "Cual es el concepto de la deuda? (Ej: Heladera, Prestamo Banco). Escribi *cancelar* para abortar."));
      return;
    }
    if (act === "pagar_deuda") {
      try {
        const rPag = await rest("app_data?select=data&user_id=eq." + encodeURIComponent(userId) + "&limit=1");
        const rowsPag = (await rPag.json().catch(() => [])) as Array<{ data: Record<string, any> }>;
        const dPag = (Array.isArray(rowsPag) && rowsPag.length) ? (rowsPag[0].data || {}) : {};
        const activas = (dPag.debts || []).filter((d: any) => !d.finalizada).slice(0, 10);
        if (!activas.length) {
          fireAndForget(sendWhatsApp(from, "\uD83E\uDD16 No tenes deudas activas en cuotas."));
          return;
        }
        const deudaRows = activas.map((d: any) => ({
          id: "paydebt_" + String(d.id),
          title: String(d.concepto || "Deuda"),
          description: "Cuota " + d.cuotaActual + "/" + d.cuotasTotales + "   " + (d.montoPorCuota ? "$" + Number(d.montoPorCuota).toLocaleString("es-AR") : ""),
        }));
        deudaRows.push({ id: "menu_root", title: "\uD83C\uDFE0 Volver al menu", description: "Cancelar y volver al inicio" });
        await sendWhatsAppList(from, "Que deuda queres pagar?", deudaRows, { button: "Elegir deuda", sectionTitle: "Deudas activas" });
      } catch (e) {
        fireAndForget(sendWhatsApp(from, "\u26A0\uFE0F No pude cargar las deudas. Proba de nuevo."));
      }
      return;
    }
    if (act === "contacto") {
      await upsertSession(from, userId, "WAITING_CONTACT_ROLE", {});
      await sendWhatsAppList(from, "Que tipo de contacto queres registrar?", [
        { id: "contact_role:cliente", title: "Cliente" },
        { id: "contact_role:proveedor", title: "Proveedor" },
        { id: "contact_role:subcontratista", title: "Subcontratista" },
        { id: "contact_role:socio", title: "Socio" },
        { id: "contact_role:empleado", title: "Empleado" },
        { id: "menu_root", title: "\uD83C\uDFE0 Volver al menu", description: "Cancelar y volver al inicio" },
      ], { button: "Elegir tipo", sectionTitle: "Contacto" });
      return;
    }
    if (act === "crear_cuadrilla") {
      await upsertSession(from, userId, "WAITING_CREW_NAME", {});
      fireAndForget(sendWhatsApp(from, "\uD83D\uDC65 Dale! Escribi el nombre para la nueva cuadrilla (ej. *Cuadrilla de Yeseros*)."));
      return;
    }
    if (act === "asistencia") {
      try {
        const rAsis = await rest("app_data?select=data&user_id=eq." + encodeURIComponent(userId) + "&limit=1");
        const rowsAsis = (await rAsis.json().catch(() => [])) as Array<{ data: Record<string, any> }>;
        const dAsis = (Array.isArray(rowsAsis) && rowsAsis.length) ? (rowsAsis[0].data || {}) : {};
        const emps = (dAsis.employees || []).filter((e: any) => e.active !== false).slice(0, 10);
        if (!emps.length) {
          fireAndForget(sendWhatsApp(from, "\uD83E\uDD16 No tenes empleados activos. Carga uno con \"nuevo empleado [nombre]\"."));
          return;
        }
        /* Seleccion multiple por NUMEROS o por CUADRILLA prefijada */
        const lista = emps.map((e: any, i: number) => (i + 1) + ". " + String((e.firstName || "") + " " + (e.lastName || "")).trim()).join("\n");
        const crews = (dAsis.crews || []).filter((c: any) => (c.employeeIds || []).length);
        const crewLines = crews.length ? "\n\nCUADRILLAS:\n" + crews.map((c: any) => "  " + String(c.name || "Cuadrilla") + " (" + (c.employeeIds || []).length + ")").join("\n") : "";
        await upsertSession(from, userId, "WAITING_ATTENDANCE_EMPLOYEES", { employeeIds: emps.map((e: any) => String(e.id)) });
        fireAndForget(sendWhatsApp(from, "\uD83D\uDC77 Elegi quien trabajo:\n\n" + lista + crewLines + "\n\nEscribi los numeros (ej. *1, 3*), *todos*, o el nombre de una cuadrilla (ej. *cuadrilla albaniles*)."));
      } catch (e) {
        fireAndForget(sendWhatsApp(from, "\u26A0\uFE0F No pude cargar los empleados. Proba de nuevo."));
      }
      return;
    }
    if (act === "humano") {
      try {
        await rest("support_tickets", {
          method: "POST",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({ user_id: userId, phone: from, message: "Solicitud de soporte desde WhatsApp", status: "open" }),
        });
      } catch (e) {}
      /* Pausar el bot: mientras is_paused=true, processMessage NO responde automaticamente */
      await upsertSession(from, userId, "PAUSED", {});
      await setPaused(from, true);
      fireAndForget(notifyAdminNewTicket(from));   // avisar al admin por WhatsApp
      fireAndForget(sendWhatsApp(from, "\u2705 Tu pedido fue enviado. Un asesor de GADU te contactara por este medio a la brevedad."));
      return;
    }
    console.warn("[GADU-WA-MENU] accion desconocida:", act);
    return;
  }

  /* [GADU-WA-MENU] Seleccion de rol para el nuevo contacto.
     Guarda el wizard multi-paso: WAITING_CONTACT_NAME -> WAITING_CONTACT_PHONE. */
  if (buttonId.startsWith("contact_role:")) {
    const role = buttonId.slice("contact_role:".length);
    if (role === "empleado" || role === "socio" || role === "cliente" || role === "proveedor" || role === "subcontratista") {
      /* Si vino de un contacto compartido (vCard), crear directamente con nombre+telefono ya conocidos */
      try {
        const sessC = await getSession(normalizePhone(from));
        const ctxC = ((sessC && sessC.context) || {}) as Record<string, unknown>;
        if (ctxC.fromVcard && (ctxC.contactName || ctxC.contactPhone)) {
          const name = String(ctxC.contactName || "Contacto");
          const phone = String(ctxC.contactPhone || "");
          const rC = await rest("app_data?select=data&user_id=eq." + encodeURIComponent(userId) + "&limit=1");
          const rowsC = (await rC.json().catch(() => [])) as Array<{ data: Record<string, any> }>;
          const dC = (Array.isArray(rowsC) && rowsC.length) ? (rowsC[0].data || {}) : {};
          if (role === "empleado") {
            const parsed = formatProperName(name);
            (dC.employees || (dC.employees = [])).unshift({
              id: crypto.randomUUID(), firstName: parsed.firstName, lastName: parsed.lastName,
              phone, role: parsed.role || "empleado", active: true, source: "whatsapp",
            });
          } else {
            (dC.contacts || (dC.contacts = [])).unshift({
              id: crypto.randomUUID(), name,
              type: role === "subcontratista" ? "subcontratista" : (role === "proveedor" ? "proveedor" : (role === "socio" ? "socio" : "cliente")),
              phone, email: "", source: "whatsapp",
            });
          }
          const upC = await rest("app_data?user_id=eq." + encodeURIComponent(userId), {
            method: "PATCH",
            headers: { Prefer: "return=minimal" },
            body: JSON.stringify({ data: dC, updated_at: new Date().toISOString() }),
          });
          if (!upC.ok) {
            fireAndForget(sendWhatsApp(from, "\u26A0\uFE0F No pude guardar el contacto en la nube (error " + upC.status + "). Proba de nuevo."));
            return;
          }
          await deleteSession(normalizePhone(from));
          const label = role === "empleado" ? "Empleado" : (role === "socio" ? "Socio" : (role === "proveedor" ? "Proveedor" : (role === "subcontratista" ? "Subcontratista" : "Cliente")));
          fireAndForget(sendWhatsApp(from, "\u2705 Contacto guardado: " + label + " '" + name + "'."));
          return;
        }
      } catch (e) {
        console.error("[GADU-WA-CONTACT] error guardando vCard:", e);
      }
      await upsertSession(from, userId, "WAITING_CONTACT_NAME", { contactType: role });
      const label = role === "empleado" ? "Empleado" : (role === "socio" ? "Socio" : (role === "proveedor" ? "Proveedor" : (role === "subcontratista" ? "Subcontratista" : "Cliente")));
      fireAndForget(sendWhatsApp(from, "Perfecto, vamos a registrar un *" + label + "*. Cual es el nombre completo? (Escribi *cancelar* para abortar)"));
      return;
    }
    console.warn("[GADU-WA-MENU] rol de contacto desconocido:", role);
    return;
  }

  /* [GADU-WA-AI-UPGRADE] Botones del fallback inteligente (no necesitan gasto pendiente) */
  if (buttonId === "fallback_gasto") {
    fireAndForget(sendWhatsApp(from, "\uD83D\uDCB0 Decime el gasto, por ejemplo: \"Gaste 15000 en cemento\" o \"5000 de nafta\"."));
    await deleteSession(normalizePhone(from));
    return;
  }
  if (buttonId === "fallback_adelanto") {
    await upsertSession(from, userId, "WAITING_ADVANCE", {});
    fireAndForget(sendWhatsApp(from, "\uD83D\uDCB8 Decime *a que empleado* y *de cuanto* es el adelanto. Ej: \"Adelanto de Hugo de 12000\"."));
    return;
  }
  if (buttonId === "fallback_humano") {
    /* Insertar ticket de soporte (el admin lo ve en el panel) */
    try {
      await rest("support_tickets", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ user_id: userId, phone: from, message: "Solicitud de soporte desde WhatsApp", status: "open" }),
      });
      console.log("[GADU-WA-SUPPORT] ticket creado para", userId, "/", from);
    } catch (e) {
      console.error("[GADU-WA-SUPPORT] fallo insertar ticket:", e);
    }
    fireAndForget(notifyAdminNewTicket(from));   // avisar al admin por WhatsApp
    fireAndForget(sendWhatsApp(from, "\u2705 Tu pedido fue enviado. Un asesor de GADU te contactara por este medio a la brevedad."));
    await deleteSession(normalizePhone(from));
    return;
  }

  /* [GADU-WA-FALLBACK] Solo los botones de asignacion de obra llegan hasta aca.
     Cualquier otro ID es desconocido -> avisar y volver al menu principal. */
  if (!buttonId.startsWith("assign_work:") && buttonId !== "assign_general") {
    console.warn("[GADU-WA-BUTTONS] boton no reconocido:", buttonId);
    fireAndForget(sendWhatsApp(from, "\uD83E\uDD16 Opcion no reconocida, volviendo al menu."));
    await showMainMenu(from, "Hola! \uD83D\uDC4B Soy tu asistente GADU. Que queres hacer hoy?");
    return;
  }

  /* 2) Recuperar app_data */
  const rData = await rest("app_data?select=user_id,data&user_id=eq." + encodeURIComponent(userId) + "&limit=1");
  const rowsData = (await rData.json().catch(() => [])) as Array<{ data: Record<string, any> }>;
  if (!Array.isArray(rowsData) || !rowsData.length) {
    console.warn("[GADU-WA-BUTTONS] usuario sin app_data:", userId);
    fireAndForget(sendWhatsApp(from, "\uD83E\uDD16 No encontre tus datos."));
    return;
  }
  const data = rowsData[0].data || {};

  /* 3) Pendiente mas reciente: primero gastos, despues ingresos (adelanto de cliente) */
  const expenses = (data.expenses || []) as Array<Record<string, any>>;
  const incomes = (data.incomes || []) as Array<Record<string, any>>;
  const idxExp = expenses.findIndex(e => e.source === "whatsapp" && e.workId == null);
  let target: Record<string, any> | null = null;
  let esIngreso = false;
  if (idxExp !== -1) {
    target = expenses[idxExp];
  } else {
    const idxInc = incomes.findIndex(i => i.source === "whatsapp" && i.workId == null);
    if (idxInc !== -1) { target = incomes[idxInc]; esIngreso = true; }
  }
  if (!target) {
    console.warn("[GADU-WA-BUTTONS] sin movimientos pendientes para", userId);
    fireAndForget(sendWhatsApp(from, "\uD83E\uDD16 No encontre movimientos pendientes de asignar."));
    return;
  }
  const monto = Number(target.amount) || 0;

  /* 4) Asignar segun el boton */
  let confirmMsg = "";
  if (buttonId.startsWith("assign_work:")) {
    const workId = buttonId.slice("assign_work:".length);
    const work = (data.works || []).find((w: Record<string, any>) => String(w.id) === workId);
    const workName = String(work?.nombre || work?.name || "la obra");
    target.workId = workId;
    if (!esIngreso) target.type = "obra";
    confirmMsg = "\u2705 Listo, " + (esIngreso ? "el ingreso" : "el gasto") + " de $" + monto + " fue asignado a la obra " + workName + ".";
  } else if (buttonId === "assign_general") {
    target.workId = null;
    if (!esIngreso) target.type = "general";
    confirmMsg = "\u2705 Listo, " + (esIngreso ? "el ingreso" : "el gasto") + " de $" + monto + " quedo registrado como " + (esIngreso ? "ingreso sin obra" : "Gasto General") + ".";
  } else {
    console.warn("[GADU-WA-BUTTONS] boton desconocido:", buttonId);
    return;
  }

  /* 5) Guardar el JSON actualizado ANTES de confirmar (validacion real) */
  const up = await rest("app_data?user_id=eq." + encodeURIComponent(userId), {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ data, updated_at: new Date().toISOString() }),
  });
  if (!up.ok) {
    console.error("[GADU-WA-BUTTONS] fallo PATCH app_data:", up.status);
    fireAndForget(sendWhatsApp(from, "\u26A0\uFE0F No pude guardar en la nube (error " + up.status + "). El movimiento quedo pendiente de asignar."));
    return;   // NO limpia la sesion -> el WAITING_WORK queda para reintentar
  }
  console.log("[GADU-WA-BUTTONS] gasto asignado OK:", buttonId);
  fireAndForget(sendWhatsApp(from, confirmMsg));

  /* 6) Limpiar el estado WAITING_WORK */
  await deleteSession(normalizePhone(from));
}

/* ===== Procesamiento del mensaje (extraido del handler) ===== */
async function processMessage(body: unknown) {
  try {
    /* Mensajes interactivos (botones) -> asignar gasto pendiente */
    const btn = detectInteractive(body);
    if (btn) {
      fireAndForget(sendTypingOn(btn.from));
      await handleButtonReply(btn.from, btn.buttonId);
      return;
    }
    const resolved = await resolveIncomingText(body);
    if (!resolved) {
      console.warn("[whatsapp-webhook] payload no reconocido:", JSON.stringify(body));
      return;
    }
    /* Indicador "escribiendo..." mientras el bot procesa */
    fireAndForget(sendTypingOn(resolved.from));

    /* [GADU-WA-SUPPORT] Soporte humano activo: PRIORITARIO, antes de cualquier
       respuesta automatica (menus, estados, audios). Si hay ticket OPEN, anexar
       el mensaje y retornar sin que el bot responda. */
    try {
      const openTicket = await getOpenSupportTicket(resolved.from);
      if (openTicket) {
        console.log("[GADU-WA-SUPPORT] ticket abierto para", resolved.from, "-> registrando y sin responder");
        if (resolved.text) await appendSupportMessage(resolved.from, resolved.text);
        return json({ ok: true, from: resolved.from, ignored: true });
      }
    } catch (e) {
      console.warn("[GADU-WA-SUPPORT] error chequeando ticket:", e);
    }

    if (resolved.audioFailed) {
      console.warn("[GADU-WA-AUDIO] transcripcion fallo para", resolved.from);
      fireAndForget(sendWhatsApp(resolved.from, "\uD83E\uDD16 No pude escuchar bien el audio. Podes repetirlo o escribirmelo por texto?"));
      return;
    }
    if (resolved.imageFailed) {
      console.warn("[GADU-WA-IMAGE] analisis de imagen fallo para", resolved.from);
      fireAndForget(sendWhatsApp(resolved.from, "\uD83E\uDD16 No pude leer el ticket. Me escribis el gasto?"));
      return;
    }
    if (resolved.imageNoMonto) {
      console.warn("[GADU-WA-IMAGE] no se pudo leer el monto del ticket para", resolved.from);
      fireAndForget(sendWhatsApp(resolved.from, "\uD83E\uDD16 No pude leer el ticket. Me escribis el monto?"));
      return;
    }

    /* [GADU-WA-CONTACT] Contacto compartido (vCard): guardar en sesion y preguntar rol */
    if (resolved.contact && (resolved.contact.name || resolved.contact.phone)) {
      try {
        const userIdC = await findUserId(resolved.from);
        if (!userIdC) {
          fireAndForget(sendWhatsApp(resolved.from, "\uD83E\uDD16 No pude identificar tu cuenta."));
          return json({ ok: false, error: "usuario no encontrado" });
        }
        await upsertSession(resolved.from, userIdC, "WAITING_CONTACT_ROLE", { contactName: resolved.contact.name, contactPhone: resolved.contact.phone, fromVcard: true });
        await sendWhatsAppButtons(resolved.from, "Recibi el contacto de " + (resolved.contact.name || "desconocido") + ". Donde queres agendarlo?", [
          { id: "contact_role:empleado", title: "Empleado" },
          { id: "contact_role:cliente", title: "Cliente" },
          { id: "contact_role:socio", title: "Socio" },
        ]);
        return json({ ok: true, from: resolved.from, reply: "contacto recibido" });
      } catch (e) {
        console.error("[GADU-WA-CONTACT] error procesando contacto:", e);
      }
    }

    const inc = { from: resolved.from, text: resolved.text, mediaUrl: resolved.mediaUrl || "" };
    console.log("[whatsapp-webhook] from=" + inc.from + " text=" + JSON.stringify(inc.text));
    console.log("[DEBUG] Remitente detectado: " + inc.from);

    if (!supabaseUrl() || !serviceKey()) {
      console.error("[whatsapp-webhook] falta SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
      return;
    }

    /* 0) Codigo de licencia "GADU-XXXXXX": validar contra license_codes y
       guiar al usuario a canjearlo en la app (NO lo activa aca). */
    const licenseCode = matchLicenseCode(inc.text);
    if (licenseCode) {
      console.log("[whatsapp-webhook] codigo de licencia detectado:", licenseCode);
      const q = "code=eq." + encodeURIComponent(licenseCode) + "&select=id,code,plan_id,duration_days,is_used";
      const r = await rest("license_codes?" + q + "&limit=1");
      const rows = await r.json().catch(() => []);
      if (!r.ok || !Array.isArray(rows) || !rows.length) {
        console.warn("[whatsapp-webhook] licencia no encontrada:", licenseCode);
        fireAndForget(sendWhatsApp(inc.from, "\uD83E\uDD16 El codigo " + licenseCode + " no existe. Verificalo o pedilo de nuevo."));
        return json({ ok: false, error: "licencia no encontrada" });
      }
      const lic = rows[0];
      if (lic.is_used) {
        console.warn("[whatsapp-webhook] licencia ya usada:", licenseCode);
        fireAndForget(sendWhatsApp(inc.from, "\uD83E\uDD16 El codigo " + licenseCode + " ya fue utilizado."));
        return json({ ok: false, error: "licencia ya usada" });
      }
      console.log("[whatsapp-webhook] licencia valida:", licenseCode, "  plan:", lic.plan_id, " ", lic.duration_days, "dias");
      const reply = "\u2705 El codigo " + licenseCode + " es valido (plan " + String(lic.plan_id).toUpperCase() + " por " + lic.duration_days + " dias).\n" +
        "Para activarlo, abri la app: *Planes y Suscripcion -> Canjear codigo*.";
      fireAndForget(sendWhatsApp(inc.from, reply));
      return json({ ok: true, from: inc.from, reply });
    }

    /* 1) Vinculacion: codigo alfanumerico (mayusculas, sin espacios).
       Busqueda CASE-INSENSITIVE por codigo (ilike) y SIN filtrar por prefijo
       de celular: el numero se valida aparte de forma tolerante (con/sin 9). */
    const code = (matchVerificationCode(inc.text) || "").trim().toUpperCase();
    if (code) {
      console.log("[whatsapp-webhook] codigo extraido:", code);
      const q = "data->settings->profile->whatsapp->>code=ilike." + encodeURIComponent(code);
      const r = await rest("app_data?select=user_id,data&" + q + "&limit=1");
      const rows = await r.json().catch(() => []);
      console.log("[whatsapp-webhook] consulta app_data (codigo):", code, "-> http", r.status, " ", (Array.isArray(rows) ? rows.length : 0), "coincidencia(s)", (Array.isArray(rows) && rows[0]) ? ("user_id=" + rows[0].user_id) : "");
      if (!r.ok || !Array.isArray(rows) || !rows.length) {
        console.warn("[whatsapp-webhook] codigo no encontrado/vencido:", code, "(http", r.status + ")");
        fireAndForget(sendWhatsApp(inc.from, "\uD83E\uDD16 El codigo no es valido o ya expiro. Volve a generarlo desde la app (Perfil -> Vincular WhatsApp -> Generar codigo) y envialo de nuevo."));
        return json({ ok: false, error: "codigo no encontrado o expirado" });
      }
      const row = rows[0];
      const wp = row.data?.settings?.profile?.whatsapp || {};
      if (!phoneMatches(wp.phone, inc.from)) {
        console.warn("[whatsapp-webhook] telefono no coincide: from=" + inc.from + " perfil=" + String(wp.phone));
        fireAndForget(sendWhatsApp(inc.from, "\uD83E\uDD16 El codigo es valido pero este numero no coincide con el telefono registrado en tu perfil."));
        return json({ ok: false, error: "telefono no coincide" });
      }
      row.data.settings.profile.whatsapp = {
        ...wp,
        linked: true,
        linkedPhone: normalizePhone(inc.from),   // forma canonica (54 sin 9)
        linkedAt: new Date().toISOString(),
      };
      const up = await rest("app_data?user_id=eq." + encodeURIComponent(row.user_id), {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ data: row.data, updated_at: new Date().toISOString() }),
      });
      if (!up.ok) {
        console.error("[whatsapp-webhook] fallo marcar linked:", up.status);
        return json({ ok: false, error: "no se pudo guardar la vinculacion" });
      }
      /* Sincronizar la columna canonica whatsapp_number en public.profiles */
      try {
        const pPatch = await rest("profiles?user_id=eq." + encodeURIComponent(row.user_id), {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({ whatsapp_number: normalizePhone(inc.from) }),
        });
        if (!pPatch.ok) console.warn("[whatsapp-webhook] no se pudo sincronizar profiles.whatsapp_number:", pPatch.status);
      } catch (e) {
        console.warn("[whatsapp-webhook] error sincronizando profiles.whatsapp_number:", e);
      }
      console.log("[whatsapp-webhook] cuenta vinculada:", row.user_id, "telefono:", inc.from);
      const reply = "Hola! Tu cuenta de Gestion GADU ha sido vinculada correctamente con este numero de WhatsApp. Ya podes recibir tus avisos y reportes aqui.";
      fireAndForget(sendWhatsApp(inc.from, reply));
      return json({ ok: true, from: inc.from, reply });
    }

    /* 1b) Saludo -> forzar el menu SOLO si NO hay un wizard activo.
       Si hay un wizard en curso, el saludo es una respuesta al formulario:
       NO se resetea (prioridad absoluta de sesion) y el wizard lo captura. */
    const menuText = String(inc.text || "").trim().toLowerCase();
    /* Solo un saludo PURO (sin contenido extra) resetea y muestra el menu.
       Si el mensaje es "hola, quiero cargar un gasto...", NO lo trata como saludo:
       deja que el wizard/IA procese el contenido. */
    if (/^(hola|holis|holi|buenas|buen\s*d[ii]a|buenos\s*d[ii]as|menu|men[uu]|empezar|ayuda|help|inicio)\s*[.!?,]*$/.test(menuText)) {
      let activeState = "";
      let activeCtx: Record<string, unknown> = {};
      try {
        const sessMenu = await getSession(normalizePhone(inc.from));
        if (sessMenu && sessMenu.state && String(sessMenu.state).startsWith("WAITING_")) {
          activeState = String(sessMenu.state);
          activeCtx = (sessMenu.context as Record<string, unknown>) || {};
        }
      } catch (e) { /* sin sesion: no hay wizard */ }

      /* Contexto: gasto pendiente de asignar a obra -> recordar en vez de mostrar el menu */
      if (activeState === "WAITING_GASTO_OBRA") {
        const monto = String(activeCtx.monto || activeCtx.amount || "");
        fireAndForget(sendWhatsApp(inc.from, "Hola! \uD83D\uDC4B Antes de seguir, a que obra asignamos el gasto de $" + monto + " pendiente?"));
        return json({ ok: true, from: inc.from });
      }

      /* Cualquier otro saludo PURO limpia el wizard activo (evita estados fantasma)
         y muestra el menu principal. */
      try { await deleteSession(normalizePhone(inc.from)); } catch (e) { /* sin sesion: ok */ }
      await showMainMenu(inc.from, "Hola! \uD83D\uDC4B Soy tu asistente GADU. Que queres hacer hoy?");
      return json({ ok: true, from: inc.from });
    }

    /* 2) Usuario vinculado: busca por linkedPhone/phone (app_data) y por la
       columna canonica whatsapp_number (public.profiles), probando todas las
       variantes del numero (con/sin el 9, con/sin '+'). */
    const userId2 = await findUserId(inc.from);
    if (!userId2) {
      console.warn("[whatsapp-webhook] numero no vinculado:", inc.from);
      const rpl = "\uD83E\uDD16 No reconozco este numero. Primero vincula tu cuenta: desde la app genera tu codigo y envialo por WhatsApp.";
      fireAndForget(sendWhatsApp(inc.from, rpl));
      return json({ ok: false, error: "numero no vinculado", reply: rpl });
    }
    /* 2c) Recuperar el documento app_data del usuario encontrado */
    const rData = await rest("app_data?select=user_id,data&user_id=eq." + encodeURIComponent(userId2) + "&limit=1");
    const rowsData = await rData.json().catch(() => []);
    if (!Array.isArray(rowsData) || !rowsData.length) {
      console.warn("[whatsapp-webhook] usuario sin app_data:", userId2);
      const rpl = "\uD83E\uDD16 Encontre tu cuenta pero aun no tiene datos. Abri la app una vez para sincronizar y volve a intentarlo.";
      fireAndForget(sendWhatsApp(inc.from, rpl));
      return json({ ok: false, error: "sin app_data", reply: rpl });
    }
    const row = rowsData[0];
    const data = row.data || {};

    /* 2c) Pausa por soporte humano: si is_paused=true, el bot NO responde
       automaticamente (corta antes de cualquier wizard/IA/fallback). */
    try {
      const sessPause = await getSession(normalizePhone(inc.from));
      if (sessPause && sessPause.is_paused) {
        fireAndForget(sendWhatsApp(inc.from, "\uD83E\uDD16 Un asesor de GADU esta revisando tu caso, aguarda un momento."));
        return json({ ok: true, from: inc.from, reply: "pausado" });
      }
    } catch (e) { /* sin sesion: seguimos normal */ }

    /* Guard de sesion activa: PRIORIDAD ABSOLUTA del wizard sobre texto libre/IA.
       Registra el estado activo para diagnostico y evita que un WAITING_* huerfano
       caiga a la IA (se limpia en el fallback). */
    let activeWizardState = "";
    try {
      const sessGuard = await getSession(normalizePhone(inc.from));
      if (sessGuard && String(sessGuard.state || "").startsWith("WAITING_")) {
        activeWizardState = String(sessGuard.state);
      }
    } catch (e) {}
    if (activeWizardState) {
      console.log("[GADU-WA-SESSION] estado activo:", activeWizardState, "  texto:", JSON.stringify(inc.text));
    }

    /* 2d) RESTAURAR: recuperar el ultimo registro de la papelera */
    if (String(inc.text || "").trim().toUpperCase() === "RESTAURAR") {
      const trash = Array.isArray(data.trash) ? data.trash : [];
      if (!trash.length) {
        fireAndForget(sendWhatsApp(inc.from, "\uD83E\uDD16 No hay registros para restaurar en tu papelera."));
        return json({ ok: true, from: inc.from });
      }
      const t = trash[0];   // el mas reciente (unshift)
      if (!t || !t.collection || !Array.isArray(data[t.collection])) {
        fireAndForget(sendWhatsApp(inc.from, "\uD83E\uDD16 No pude restaurar el registro."));
        return json({ ok: true, from: inc.from });
      }
      data[t.collection].unshift(t.item);
      data.trash = data.trash.filter(x => x.id !== t.id);

      const item = t.item || {};
      const tipos: Record<string, string> = {
        expenses: "Gasto", incomes: "Ingreso", works: "Obra", employees: "Empleado",
        contacts: "Contacto", budgets: "Presupuesto", attendance: "Jornada",
        assets: "Herramienta", seguros: "Seguro", compromisos: "Compromiso",
      };
      const tipo = tipos[t.collection] || String(t.collection);
      let detalle = "";
      if (t.collection === "expenses") detalle = "$" + (item.amount || 0) + "   " + (item.category || item.description || "");
      else if (t.collection === "incomes") detalle = "$" + (item.amount || 0);
      else if (t.collection === "works") detalle = item.name || item.nombre || "";
      else if (t.collection === "employees") detalle = ((item.firstName || "") + " " + (item.lastName || "")).trim();
      else if (t.collection === "contacts") detalle = item.name || "";
      else detalle = item.description || item.name || item.nombre || "";

      const up = await rest("app_data?user_id=eq." + encodeURIComponent(row.user_id), {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ data, updated_at: new Date().toISOString() }),
      });
      if (!up.ok) {
        console.error("[GADU-WA-RESTORE] fallo PATCH app_data:", up.status);
        fireAndForget(sendWhatsApp(inc.from, "\uD83E\uDD16 No pude restaurar el registro."));
        return json({ ok: false, error: "patch " + up.status });
      }
      console.log("[GADU-WA-RESTORE] restaurado:", t.collection, t.id);
      fireAndForget(sendWhatsApp(inc.from, "\u2705 El registro " + tipo + (detalle ? "   " + detalle : "") + " ha sido recuperado con exito."));
      return json({ ok: true, from: inc.from });
    }

    /* 2e) CANCELAR: en CUALQUIER wizard activo, la palabra "cancelar" limpia la
       sesion y vuelve al menu principal. Se revisa antes de los wizards/IA. */
    if (/^(cancelar|cancela|salir|abortar|no quiero|nada)\s*[.!?]*$/i.test(String(inc.text || "").trim())) {
      try {
        const sessCancel = await getSession(normalizePhone(inc.from));
        if (sessCancel && sessCancel.state) {
          await deleteSession(normalizePhone(inc.from));
          await showMainMenu(inc.from, "\u270B Operacion cancelada. En que te ayudo?");
          return json({ ok: true, from: inc.from, reply: "cancelado" });
        }
      } catch (e) { /* sin sesion: seguimos normal */ }
    }

    /* 3) Mismo motor que el chat web: ai-assistant en modo servidor.
       Esperamos la respuesta de la IA con un timeout de seguridad de 10s.
       Recien si la IA FALLA (o tarda mas de 10s) caemos al fallback local. */
    let aiReply = "";
    let action: { modulo: string; campos?: Record<string, unknown> } | null = null;

    /* [GADU-WA-AI-UPGRADE] Deteccion deterministica de "adelanto" (regex de apoyo).
       Si solo dijo "adelanto" sin datos -> arrancamos el wizard paso a paso. */
    const advIntent = detectAdvanceIntent(inc.text);

    /* [GADU-WA-WIZARD] Wizard de gasto (WAITING_GASTO): captura monto + concepto
       de forma deterministica ANTES de la IA o el menu de respaldo. */
    let enWizardGasto = false;
    try {
      const sessGasto = await getSession(normalizePhone(inc.from));
      if (sessGasto && sessGasto.state === "WAITING_GASTO") enWizardGasto = true;
    } catch (e) {}
    if (enWizardGasto) {
      const localGasto = localIntent(inc.text);
      if (localGasto && localGasto.modulo === "gasto") {
        const resG = executeAction(data, localGasto, inc.text, () => crypto.randomUUID(), new Date().toISOString().slice(0, 10));
        if (resG.ok) {
          const upG = await rest("app_data?user_id=eq." + encodeURIComponent(row.user_id), {
            method: "PATCH",
            headers: { Prefer: "return=minimal" },
            body: JSON.stringify({ data, updated_at: new Date().toISOString() }),
          });
          if (!upG.ok) {
            console.error("[GADU-WA-GASTO] fallo PATCH app_data:", upG.status);
            fireAndForget(sendWhatsApp(inc.from, "\u26A0\uFE0F No pude guardar en la nube (error " + upG.status + "). Proba de nuevo."));
            return json({ ok: true, from: inc.from, reply: "" });
          }
          await deleteSession(normalizePhone(inc.from));
          const reply = "\u2705 " + resG.label;
          fireAndForget(sendWhatsApp(inc.from, reply));
          return json({ ok: true, from: inc.from, reply });
        }
        await deleteSession(normalizePhone(inc.from));
        fireAndForget(sendWhatsApp(inc.from, "\uD83E\uDD16 " + (resG.missing ? "Me falta " + resG.missing + "." : "No pude cargar el gasto.") + " Proba de nuevo: \"Gaste 5000 de nafta\"."));
        return json({ ok: true, from: inc.from, reply: "" });
      }
      if (localGasto && localGasto.modulo && localGasto.modulo !== "gasto") {
        await deleteSession(normalizePhone(inc.from));
        console.log("[GADU-WA-WIZARD] WAITING_GASTO cancelado, respuesta es:", localGasto.modulo);
      } else {
        /* Monto suelto? -> guardar monto y pedir categoria (multi-paso) */
        const mSuelto = String(inc.text || "").trim().match(/^\$?\s*([\d][\d.,]*)\s*$/);
        if (mSuelto) {
          const monto = Number(String(mSuelto[1]).replace(/\./g, "").replace(",", "."));
          if (monto > 0) {
            await upsertSession(inc.from, row.user_id, "WAITING_GASTO_CATEGORIA", { monto });
            fireAndForget(sendWhatsApp(inc.from, "Que concepto o categoria? (ej. nafta, cemento, flete)"));
            return json({ ok: true, from: inc.from, reply: "" });
          }
        }
        fireAndForget(sendWhatsApp(inc.from, "\uD83E\uDD16 Decime el gasto, por ejemplo: \"Gaste 5000 de nafta\" o \"5000 de cemento\"."));
        return json({ ok: true, from: inc.from, reply: "" });
      }
    }

    /* Gasto paso 2: categoria (WAITING_GASTO_CATEGORIA) */
    let enWizardGastoCat = false;
    let gastoCatCtx: Record<string, unknown> = {};
    try {
      const sessGC = await getSession(normalizePhone(inc.from));
      if (sessGC && sessGC.state === "WAITING_GASTO_CATEGORIA") { enWizardGastoCat = true; gastoCatCtx = (sessGC.context as Record<string, unknown>) || {}; }
    } catch (e) {}
    if (enWizardGastoCat) {
      const t = String(inc.text || "").trim();
      if (!t) { fireAndForget(sendWhatsApp(inc.from, "\uD83E\uDD16 Que concepto o categoria?")); return json({ ok: true, from: inc.from, reply: "" }); }
      await upsertSession(inc.from, row.user_id, "WAITING_GASTO_OBRA", { monto: gastoCatCtx.monto, categoria: t });
      fireAndForget(sendWhatsApp(inc.from, "A que obra corresponde? (escribi *general* si es un gasto general)"));
      return json({ ok: true, from: inc.from, reply: "" });
    }

    /* Gasto paso 3: obra -> guardar (WAITING_GASTO_OBRA) */
    let enWizardGastoObra = false;
    let gastoObraCtx: Record<string, unknown> = {};
    try {
      const sessGO = await getSession(normalizePhone(inc.from));
      if (sessGO && sessGO.state === "WAITING_GASTO_OBRA") { enWizardGastoObra = true; gastoObraCtx = (sessGO.context as Record<string, unknown>) || {}; }
    } catch (e) {}
    if (enWizardGastoObra) {
      const t = String(inc.text || "").trim();
      const esGeneral = /^(general|sin asignar|sin obra)$/i.test(t);
      const actionG = { modulo: "gasto", campos: { monto: gastoObraCtx.monto, categoria: gastoObraCtx.categoria, obra: esGeneral ? "" : t } };
      const resG = executeAction(data, actionG, inc.text, () => crypto.randomUUID(), new Date().toISOString().slice(0, 10));
      if (resG.ok) {
        const upGO = await rest("app_data?user_id=eq." + encodeURIComponent(row.user_id), {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({ data, updated_at: new Date().toISOString() }),
        });
        if (!upGO.ok) {
          console.error("[GADU-WA-GASTO] fallo PATCH obra:", upGO.status);
          fireAndForget(sendWhatsApp(inc.from, "\u26A0\uFE0F No pude guardar en la nube (error " + upGO.status + "). Proba de nuevo."));
          return json({ ok: true, from: inc.from, reply: "" });
        }
        await deleteSession(normalizePhone(inc.from));
        fireAndForget(sendWhatsApp(inc.from, "\u2705 " + resG.label));
        return json({ ok: true, from: inc.from, reply: "\u2705 " + resG.label });
      }
      fireAndForget(sendWhatsApp(inc.from, "\uD83E\uDD16 No pude guardar el gasto. Proba de nuevo."));
      return json({ ok: true, from: inc.from, reply: "" });
    }

    /* [GADU-WA-WIZARD] Ingreso/cobro (WAITING_INGRESO): monto -> concepto -> obra */
    let enWizardIngreso = false;
    try {
      const sessIng = await getSession(normalizePhone(inc.from));
      if (sessIng && sessIng.state === "WAITING_INGRESO") enWizardIngreso = true;
    } catch (e) {}
    if (enWizardIngreso) {
      const localIng = localIntent(inc.text);
      if (localIng && localIng.modulo === "ingreso") {
        const res = executeAction(data, localIng, inc.text, () => crypto.randomUUID(), new Date().toISOString().slice(0, 10));
        if (res.ok) {
          const upIng = await rest("app_data?user_id=eq." + encodeURIComponent(row.user_id), {
            method: "PATCH",
            headers: { Prefer: "return=minimal" },
            body: JSON.stringify({ data, updated_at: new Date().toISOString() }),
          });
          if (!upIng.ok) {
            fireAndForget(sendWhatsApp(inc.from, "\u26A0\uFE0F No pude guardar en la nube (error " + upIng.status + "). Proba de nuevo."));
            return json({ ok: true, from: inc.from, reply: "" });
          }
          await deleteSession(normalizePhone(inc.from));
          fireAndForget(sendWhatsApp(inc.from, "\u2705 " + res.label));
          return json({ ok: true, from: inc.from, reply: "\u2705 " + res.label });
        }
        await deleteSession(normalizePhone(inc.from));
        fireAndForget(sendWhatsApp(inc.from, "\uD83E\uDD16 " + (res.missing ? "Me falta " + res.missing + "." : "No pude cargarlo.")));
        return json({ ok: true, from: inc.from, reply: "" });
      }
      const mSuelto = String(inc.text || "").trim().match(/^\$?\s*([\d][\d.,]*)\s*$/);
      if (mSuelto) {
        const monto = Number(String(mSuelto[1]).replace(/\./g, "").replace(",", "."));
        if (monto > 0) {
          await upsertSession(inc.from, row.user_id, "WAITING_INGRESO_CONCEPTO", { monto });
          fireAndForget(sendWhatsApp(inc.from, "Que concepto? (Cobro, Adelanto, Certificacion)"));
          return json({ ok: true, from: inc.from, reply: "" });
        }
      }
      fireAndForget(sendWhatsApp(inc.from, "\uD83E\uDD16 De cuanto es el cobro? Ej: \"Cobre 50000 por la obra\"."));
      return json({ ok: true, from: inc.from, reply: "" });
    }

    /* Ingreso paso 2: concepto (WAITING_INGRESO_CONCEPTO) */
    let enWizardIngConc = false;
    let ingConcCtx: Record<string, unknown> = {};
    try {
      const sessIC2 = await getSession(normalizePhone(inc.from));
      if (sessIC2 && sessIC2.state === "WAITING_INGRESO_CONCEPTO") { enWizardIngConc = true; ingConcCtx = (sessIC2.context as Record<string, unknown>) || {}; }
    } catch (e) {}
    if (enWizardIngConc) {
      const t = String(inc.text || "").trim();
      if (!t) { fireAndForget(sendWhatsApp(inc.from, "\uD83E\uDD16 Que concepto? (Cobro, Adelanto, Certificacion)")); return json({ ok: true, from: inc.from, reply: "" }); }
      await upsertSession(inc.from, row.user_id, "WAITING_INGRESO_OBRA", { monto: ingConcCtx.monto, concepto: t });
      fireAndForget(sendWhatsApp(inc.from, "A que obra corresponde?"));
      return json({ ok: true, from: inc.from, reply: "" });
    }

    /* Ingreso paso 3: obra -> guardar (WAITING_INGRESO_OBRA) */
    let enWizardIngObra = false;
    let ingObraCtx: Record<string, unknown> = {};
    try {
      const sessIO = await getSession(normalizePhone(inc.from));
      if (sessIO && sessIO.state === "WAITING_INGRESO_OBRA") { enWizardIngObra = true; ingObraCtx = (sessIO.context as Record<string, unknown>) || {}; }
    } catch (e) {}
    if (enWizardIngObra) {
      const t = String(inc.text || "").trim();
      const actionI = { modulo: "ingreso", campos: { monto: ingObraCtx.monto, concepto: ingObraCtx.concepto, obra: t } };
      const res = executeAction(data, actionI, inc.text, () => crypto.randomUUID(), new Date().toISOString().slice(0, 10));
      if (res.ok) {
        const upIngO = await rest("app_data?user_id=eq." + encodeURIComponent(row.user_id), {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({ data, updated_at: new Date().toISOString() }),
        });
        if (!upIngO.ok) {
          fireAndForget(sendWhatsApp(inc.from, "\u26A0\uFE0F No pude guardar en la nube (error " + upIngO.status + "). Proba de nuevo."));
          return json({ ok: true, from: inc.from, reply: "" });
        }
        await deleteSession(normalizePhone(inc.from));
        fireAndForget(sendWhatsApp(inc.from, "\u2705 " + res.label));
        return json({ ok: true, from: inc.from, reply: "\u2705 " + res.label });
      }
      fireAndForget(sendWhatsApp(inc.from, res.missing ? "\uD83E\uDD16 Me falta " + res.missing + "." : "\uD83E\uDD16 No pude cargarlo."));
      return json({ ok: true, from: inc.from, reply: "" });
    }

    /* [GADU-WA-WIZARD] Wizard de inversion (WAITING_INVERSION): captura monto + concepto
       con localIntent y registra la inversion ANTES de la IA. */
    let enWizardInversion = false;
    try {
      const sessInv = await getSession(normalizePhone(inc.from));
      if (sessInv && sessInv.state === "WAITING_INVERSION") enWizardInversion = true;
    } catch (e) {}
    if (enWizardInversion) {
      const txtInv = String(inc.text || "").trim();
      if (!txtInv) {
        fireAndForget(sendWhatsApp(inc.from, "\uD83E\uDD16 De cuanto fue la inversion? (ej. 50000)"));
        return json({ ok: true, from: inc.from, reply: "" });
      }
      const localInv = localIntent(inc.text);
      if (localInv && localInv.modulo === "inversion") {
        const resI = executeAction(data, localInv, inc.text, () => crypto.randomUUID(), new Date().toISOString().slice(0, 10));
        if (resI.ok) {
          const upInv = await rest("app_data?user_id=eq." + encodeURIComponent(row.user_id), {
            method: "PATCH",
            headers: { Prefer: "return=minimal" },
            body: JSON.stringify({ data, updated_at: new Date().toISOString() }),
          });
          if (!upInv.ok) {
            fireAndForget(sendWhatsApp(inc.from, "\u26A0\uFE0F No pude guardar en la nube (error " + upInv.status + "). Proba de nuevo."));
            return json({ ok: true, from: inc.from, reply: "" });
          }
          await deleteSession(normalizePhone(inc.from));
          fireAndForget(sendWhatsApp(inc.from, "\u2705 " + resI.label));
          return json({ ok: true, from: inc.from, reply: "\u2705 " + resI.label });
        }
        await deleteSession(normalizePhone(inc.from));
        fireAndForget(sendWhatsApp(inc.from, "\uD83E\uDD16 " + (resI.missing ? "Me falta " + resI.missing + "." : "No pude cargar la inversion.")));
        return json({ ok: true, from: inc.from, reply: "" });
      }
      if (localInv && localInv.modulo && localInv.modulo !== "inversion") {
        await deleteSession(normalizePhone(inc.from));
        console.log("[GADU-WA-WIZARD] WAITING_INVERSION cancelado, respuesta es:", localInv.modulo);
      } else {
        /* Monto suelto? -> guardar monto y pedir concepto (multi-paso) */
        const mSuelto = txtInv.match(/^\$?\s*([\d][\d.,]*)\s*$/);
        if (mSuelto) {
          const monto = Number(String(mSuelto[1]).replace(/\./g, "").replace(",", "."));
          if (monto > 0) {
            await upsertSession(inc.from, row.user_id, "WAITING_INVERSION_CONCEPTO", { monto });
            fireAndForget(sendWhatsApp(inc.from, "En que invertiste? (ej. herramientas, maquina, capital de trabajo)"));
            return json({ ok: true, from: inc.from, reply: "" });
          }
        }
        fireAndForget(sendWhatsApp(inc.from, "\uD83E\uDD16 De cuanto fue la inversion y en que? Ej: \"Inverti 50000 en herramientas\"."));
        return json({ ok: true, from: inc.from, reply: "" });
      }
    }

    /* Inversion paso 2: concepto -> guardar (WAITING_INVERSION_CONCEPTO) */
    let enWizardInvConcepto = false;
    let invConcCtx: Record<string, unknown> = {};
    try {
      const sessIC = await getSession(normalizePhone(inc.from));
      if (sessIC && sessIC.state === "WAITING_INVERSION_CONCEPTO") { enWizardInvConcepto = true; invConcCtx = (sessIC.context as Record<string, unknown>) || {}; }
    } catch (e) {}
    if (enWizardInvConcepto) {
      const t = String(inc.text || "").trim();
      if (!t) { fireAndForget(sendWhatsApp(inc.from, "\uD83E\uDD16 En que invertiste?")); return json({ ok: true, from: inc.from, reply: "" }); }
      const actionI = { modulo: "inversion", campos: { monto: invConcCtx.monto, categoria: t } };
      const resI = executeAction(data, actionI, inc.text, () => crypto.randomUUID(), new Date().toISOString().slice(0, 10));
      if (resI.ok) {
        const upInvC = await rest("app_data?user_id=eq." + encodeURIComponent(row.user_id), {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({ data, updated_at: new Date().toISOString() }),
        });
        if (!upInvC.ok) {
          fireAndForget(sendWhatsApp(inc.from, "\u26A0\uFE0F No pude guardar en la nube (error " + upInvC.status + "). Proba de nuevo."));
          return json({ ok: true, from: inc.from, reply: "" });
        }
        await deleteSession(normalizePhone(inc.from));
        fireAndForget(sendWhatsApp(inc.from, "\u2705 " + resI.label));
        return json({ ok: true, from: inc.from, reply: "\u2705 " + resI.label });
      }
      fireAndForget(sendWhatsApp(inc.from, "\uD83E\uDD16 No pude cargar la inversion."));
      return json({ ok: true, from: inc.from, reply: "" });
    }

    /* [GADU-WA-WIZARD] Wizard de herramienta (WAITING_HERRAMIENTA): nombre + costo.
       Crea el activo en data.assets ANTES de confirmar (mismo patron blindado). */
    let enWizardHerramienta = false;
    try {
      const sessHer = await getSession(normalizePhone(inc.from));
      if (sessHer && sessHer.state === "WAITING_HERRAMIENTA") enWizardHerramienta = true;
    } catch (e) {}
    if (enWizardHerramienta) {
      const tHer = String(inc.text || "").trim();
      if (!tHer) {
        fireAndForget(sendWhatsApp(inc.from, "\uD83E\uDD16 Decime la herramienta y su costo, ej: \"Amoladora 50000\"."));
        return json({ ok: true, from: inc.from, reply: "" });
      }
      const mHer = tHer.match(/^(.+?)\s+([\d][\d.,]*)\s*$/);
      if (mHer) {
        const nombreRaw = String(mHer[1]).trim();
        const costo = Number(String(mHer[2]).replace(/\./g, "").replace(",", "."));
        let categoria = "Herramienta manual";
        if (/el[ee]ctric|amoladora|sierra|rotomartillo|taladro|mezcladora/i.test(nombreRaw)) categoria = "Herramienta electrica";
        else if (/hormigonera|m[aa]quina|maquinaria|equipo/i.test(nombreRaw)) categoria = "Equipo mayor";
        else if (/cami[oo]n|veh[ii]culo|utilitario|auto/i.test(nombreRaw)) categoria = "Vehiculo";
        (data.assets || (data.assets = [])).unshift({
          id: crypto.randomUUID(), name: nombreRaw, category: categoria,
          purchaseDate: new Date().toISOString().slice(0, 10), cost: costo,
          status: "operativo", supplierId: null, notes: "", maintenance: [],
        });
        const upHer = await rest("app_data?user_id=eq." + encodeURIComponent(row.user_id), {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({ data, updated_at: new Date().toISOString() }),
        });
        if (!upHer.ok) {
          fireAndForget(sendWhatsApp(inc.from, "\u26A0\uFE0F No pude guardar en la nube (error " + upHer.status + "). Proba de nuevo."));
          return json({ ok: true, from: inc.from, reply: "" });
        }
        await deleteSession(normalizePhone(inc.from));
        fireAndForget(sendWhatsApp(inc.from, "\u2705 Herramienta registrada: " + nombreRaw + " (" + categoria + ")   $" + costo.toLocaleString("es-AR")));
        return json({ ok: true, from: inc.from, reply: "herramienta guardada" });
      }
      /* Solo nombre -> pedir categoria (multi-paso) */
      await upsertSession(inc.from, row.user_id, "WAITING_HERRAMIENTA_CATEGORIA", { nombre: tHer });
      fireAndForget(sendWhatsApp(inc.from, "Que tipo de herramienta es? (Herramienta electrica, Herramienta manual, Maquinaria, Equipo mayor, Vehiculo)"));
      return json({ ok: true, from: inc.from, reply: "" });
    }

    /* Herramienta paso 2: categoria (WAITING_HERRAMIENTA_CATEGORIA) */
    let enWizardHerCat = false;
    let herCatCtx: Record<string, unknown> = {};
    try {
      const sessHC = await getSession(normalizePhone(inc.from));
      if (sessHC && sessHC.state === "WAITING_HERRAMIENTA_CATEGORIA") { enWizardHerCat = true; herCatCtx = (sessHC.context as Record<string, unknown>) || {}; }
    } catch (e) {}
    if (enWizardHerCat) {
      const t = String(inc.text || "").trim();
      if (!t) { fireAndForget(sendWhatsApp(inc.from, "\uD83E\uDD16 Que tipo de herramienta es?")); return json({ ok: true, from: inc.from, reply: "" }); }
      await upsertSession(inc.from, row.user_id, "WAITING_HERRAMIENTA_COSTO", { nombre: herCatCtx.nombre, categoria: t });
      fireAndForget(sendWhatsApp(inc.from, "Cuanto costo? (ej. 50000)"));
      return json({ ok: true, from: inc.from, reply: "" });
    }

    /* Herramienta paso 3: costo -> guardar (WAITING_HERRAMIENTA_COSTO) */
    let enWizardHerCosto = false;
    let herCostoCtx: Record<string, unknown> = {};
    try {
      const sessHK = await getSession(normalizePhone(inc.from));
      if (sessHK && sessHK.state === "WAITING_HERRAMIENTA_COSTO") { enWizardHerCosto = true; herCostoCtx = (sessHK.context as Record<string, unknown>) || {}; }
    } catch (e) {}
    if (enWizardHerCosto) {
      const t = String(inc.text || "").trim();
      const costo = Number(t.replace(/\./g, "").replace(",", "."));
      if (!costo || costo <= 0) { fireAndForget(sendWhatsApp(inc.from, "\uD83E\uDD16 Eso no es un monto valido. Cuanto costo?")); return json({ ok: true, from: inc.from, reply: "" }); }
      const nombreRaw = String(herCostoCtx.nombre || "");
      const categoria = String(herCostoCtx.categoria || "Herramienta manual");
      (data.assets || (data.assets = [])).unshift({
        id: crypto.randomUUID(), name: nombreRaw, category: categoria,
        purchaseDate: new Date().toISOString().slice(0, 10), cost: costo,
        status: "operativo", supplierId: null, notes: "", maintenance: [],
      });
      const upHC = await rest("app_data?user_id=eq." + encodeURIComponent(row.user_id), {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ data, updated_at: new Date().toISOString() }),
      });
      if (!upHC.ok) {
        fireAndForget(sendWhatsApp(inc.from, "\u26A0\uFE0F No pude guardar en la nube (error " + upHC.status + "). Proba de nuevo."));
        return json({ ok: true, from: inc.from, reply: "" });
      }
      await deleteSession(normalizePhone(inc.from));
      fireAndForget(sendWhatsApp(inc.from, "\u2705 Herramienta registrada: " + nombreRaw + " (" + categoria + ")   $" + costo.toLocaleString("es-AR")));
      return json({ ok: true, from: inc.from, reply: "herramienta guardada" });
    }

    /* [GADU-WA-WIZARD] Presupuesto (WAITING_PRESUPUESTO): la IA extrae cliente + items.
       Interceptamos el texto, limpiamos el estado y dejamos que la IA (CREATE_BUDGET)
       lo procese sin que el menu de respaldo lo intercepte. */
    let enWizardPresupuesto = false;
    try {
      const sessPres = await getSession(normalizePhone(inc.from));
      if (sessPres && sessPres.state === "WAITING_PRESUPUESTO") enWizardPresupuesto = true;
    } catch (e) {}
    if (enWizardPresupuesto) {
      if (!inc.text || !inc.text.trim()) {
        fireAndForget(sendWhatsApp(inc.from, "\uD83E\uDD16 Contame que queres incluir en el presupuesto y para que cliente."));
        return json({ ok: true, from: inc.from, reply: "" });
      }
      await deleteSession(normalizePhone(inc.from));   // la IA procesa el texto libre a continuacion
    }

    /* [GADU-WA-WIZARD] Consulta (WAITING_CONSULTA): la IA resuelve la pregunta.
       Igual que arriba: limpiamos el estado y dejamos que QUERY_DATA responda. */
    let enWizardConsulta = false;
    try {
      const sessCons = await getSession(normalizePhone(inc.from));
      if (sessCons && sessCons.state === "WAITING_CONSULTA") enWizardConsulta = true;
    } catch (e) {}
    if (enWizardConsulta) {
      if (!inc.text || !inc.text.trim()) {
        fireAndForget(sendWhatsApp(inc.from, "\uD83E\uDD16 Que queres consultar? Saldo de una obra, gastos de la semana, etc."));
        return json({ ok: true, from: inc.from, reply: "" });
      }
      await deleteSession(normalizePhone(inc.from));   // la IA (QUERY_DATA) responde a continuacion
    }

    /* [GADU-WA-ADVANCE-TYPE] Seleccion del tipo de adelanto por texto */
    let enWizardAdvType = false;
    try {
      const sessAT = await getSession(normalizePhone(inc.from));
      if (sessAT && sessAT.state === "WAITING_ADVANCE_TYPE") enWizardAdvType = true;
    } catch (e) {}
    if (enWizardAdvType) {
      const t = String(inc.text || "").trim().toLowerCase();
      if (/empleado|trabajador|operario|personal|obrero/.test(t)) {
        await upsertSession(inc.from, row.user_id, "WAITING_ADVANCE", {});
        fireAndForget(sendWhatsApp(inc.from, "\uD83D\uDCB8 Decime *a que empleado* y *de cuanto* es el adelanto. Ej: \"Adelanto de Hugo de 12000\"."));
        return json({ ok: true, from: inc.from, reply: "" });
      }
      if (/cliente|obra|sena|sena|anticipo|cobro/.test(t)) {
        await upsertSession(inc.from, row.user_id, "WAITING_CLIENT_ADVANCE", {});
        fireAndForget(sendWhatsApp(inc.from, "\uD83D\uDCB0 Decime *de que cliente/obra* es el adelanto y *de cuanto*. Ej: \"Adelanto de 50000 de la obra Casa Perez\"."));
        return json({ ok: true, from: inc.from, reply: "" });
      }
      await sendWhatsAppButtons(inc.from, "Elegi una opcion:", [
        { id: "advance_type:empleado", title: "Adelanto a Empleado" },
        { id: "advance_type:cliente", title: "Adelanto de Cliente" },
      ]);
      return json({ ok: true, from: inc.from, reply: "" });
    }

    /* [GADU-WA-ADVANCE-CLIENTE] Adelanto de cliente -> ingreso (cobro anticipado) */
    let enWizardClientAdvance = false;
    try {
      const sessCA = await getSession(normalizePhone(inc.from));
      if (sessCA && sessCA.state === "WAITING_CLIENT_ADVANCE") enWizardClientAdvance = true;
    } catch (e) {}
    if (enWizardClientAdvance) {
      const parsed = parseAdvanceNameAmount(inc.text);
      if (parsed && parsed.monto > 0) {
        const res = executeAction(data, { modulo: "ingreso", campos: { concepto: "Adelanto", monto: parsed.monto, cliente: parsed.nombre, obra: parsed.nombre } }, inc.text, () => crypto.randomUUID(), new Date().toISOString().slice(0, 10));
        if (res.ok) {
          const upCA = await rest("app_data?user_id=eq." + encodeURIComponent(row.user_id), {
            method: "PATCH",
            headers: { Prefer: "return=minimal" },
            body: JSON.stringify({ data, updated_at: new Date().toISOString() }),
          });
          if (!upCA.ok) {
            fireAndForget(sendWhatsApp(inc.from, "\u26A0\uFE0F No pude guardar en la nube (error " + upCA.status + "). Proba de nuevo."));
            return json({ ok: true, from: inc.from, reply: "" });
          }
          await deleteSession(normalizePhone(inc.from));
          fireAndForget(sendWhatsApp(inc.from, "\u2705 " + res.label));
          return json({ ok: true, from: inc.from, reply: "\u2705 " + res.label });
        }
        await deleteSession(normalizePhone(inc.from));
        fireAndForget(sendWhatsApp(inc.from, res.missing ? "\uD83E\uDD16 Me falta " + res.missing + "." : "\uD83E\uDD16 No pude cargarlo."));
        return json({ ok: true, from: inc.from, reply: "" });
      }
      fireAndForget(sendWhatsApp(inc.from, "\uD83D\uDCB0 Decime *de que cliente/obra* es el adelanto y *de cuanto*. Ej: \"Adelanto de 50000 de Casa Perez\"."));
      return json({ ok: true, from: inc.from, reply: "" });
    }

    /* [GADU-WA-AI-UPGRADE] Wizard de adelanto en curso (estado WAITING_ADVANCE) */
    let enWizardAdelanto = false;
    try {
      const sessAdv = await getSession(normalizePhone(inc.from));
      if (sessAdv && sessAdv.state === "WAITING_ADVANCE") enWizardAdelanto = true;
    } catch (e) {}
    if (enWizardAdelanto) {
      const parsed = (advIntent && advIntent.nombre && advIntent.monto > 0) ? advIntent : parseAdvanceNameAmount(inc.text);
      if (parsed && parsed.nombre && parsed.monto > 0) {
        const res = executeAction(data, { modulo: "adelanto", campos: { empleado: parsed.nombre, monto: parsed.monto } }, inc.text, () => crypto.randomUUID(), new Date().toISOString().slice(0, 10));
        if (res.ok) {
          const upAdv = await rest("app_data?user_id=eq." + encodeURIComponent(row.user_id), {
            method: "PATCH",
            headers: { Prefer: "return=minimal" },
            body: JSON.stringify({ data, updated_at: new Date().toISOString() }),
          });
          if (!upAdv.ok) {
            fireAndForget(sendWhatsApp(inc.from, "\u26A0\uFE0F No pude guardar en la nube (error " + upAdv.status + "). Proba de nuevo."));
            return json({ ok: true, from: inc.from, reply: "" });
          }
          await deleteSession(normalizePhone(inc.from));
          fireAndForget(sendWhatsApp(inc.from, "\u2705 " + res.label));
          return json({ ok: true, from: inc.from, reply: "\u2705 " + res.label });
        }
        await deleteSession(normalizePhone(inc.from));
        fireAndForget(sendWhatsApp(inc.from, res.notFound || "\uD83E\uDD16 No pude cargarlo. Proba: \"Adelanto de Hugo de 12000\"."));
        return json({ ok: true, from: inc.from, reply: "" });
      }
      /* Solo el nombre -> pedir monto (multi-paso) */
      if (parsed && parsed.nombre) {
        await upsertSession(inc.from, row.user_id, "WAITING_ADVANCE_MONTO", { empleado: parsed.nombre });
        fireAndForget(sendWhatsApp(inc.from, "De cuanto es el adelanto? (ej. 12000)"));
        return json({ ok: true, from: inc.from, reply: "" });
      }
      fireAndForget(sendWhatsApp(inc.from, "\uD83D\uDCB8 A que empleado y de cuanto es el adelanto? Ej: \"Hugo de 12000\"."));
      return json({ ok: true, from: inc.from, reply: "" });
    }

    /* Adelanto paso 2: monto -> obra (WAITING_ADVANCE_MONTO) */
    let enWizardAdvMonto = false;
    let advMontoCtx: Record<string, unknown> = {};
    try {
      const sessAM = await getSession(normalizePhone(inc.from));
      if (sessAM && sessAM.state === "WAITING_ADVANCE_MONTO") { enWizardAdvMonto = true; advMontoCtx = (sessAM.context as Record<string, unknown>) || {}; }
    } catch (e) {}
    if (enWizardAdvMonto) {
      const t = String(inc.text || "").trim();
      const monto = num(t);   // parser robusto: enteros y decimales ("15000", "15000.50", "15.000")
      if (!monto || monto <= 0) { fireAndForget(sendWhatsApp(inc.from, "\uD83E\uDD16 Eso no es un monto valido. De cuanto es el adelanto?")); return json({ ok: true, from: inc.from, reply: "" }); }
      await upsertSession(inc.from, row.user_id, "WAITING_ADVANCE_OBRA", { empleado: advMontoCtx.empleado, monto });
      fireAndForget(sendWhatsApp(inc.from, "A que obra corresponde? (escribi *general* si no sabes)"));
      return json({ ok: true, from: inc.from, reply: "" });
    }

    /* Adelanto paso 3: obra -> guardar (WAITING_ADVANCE_OBRA) */
    let enWizardAdvObra = false;
    let advObraCtx: Record<string, unknown> = {};
    try {
      const sessAO = await getSession(normalizePhone(inc.from));
      if (sessAO && sessAO.state === "WAITING_ADVANCE_OBRA") { enWizardAdvObra = true; advObraCtx = (sessAO.context as Record<string, unknown>) || {}; }
    } catch (e) {}
    if (enWizardAdvObra) {
      const t = String(inc.text || "").trim();
      const esGeneral = /^(general|sin asignar|sin obra)$/i.test(t);
      const actionA = { modulo: "adelanto", campos: { empleado: advObraCtx.empleado, monto: advObraCtx.monto, obra: esGeneral ? "" : t } };
      const res = executeAction(data, actionA, inc.text, () => crypto.randomUUID(), new Date().toISOString().slice(0, 10));
      if (res.ok) {
        const upAO = await rest("app_data?user_id=eq." + encodeURIComponent(row.user_id), {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({ data, updated_at: new Date().toISOString() }),
        });
        if (!upAO.ok) {
          fireAndForget(sendWhatsApp(inc.from, "\u26A0\uFE0F No pude guardar en la nube (error " + upAO.status + "). Proba de nuevo."));
          return json({ ok: true, from: inc.from, reply: "" });
        }
        await deleteSession(normalizePhone(inc.from));
        fireAndForget(sendWhatsApp(inc.from, "\u2705 " + res.label));
        return json({ ok: true, from: inc.from, reply: "\u2705 " + res.label });
      }
      fireAndForget(sendWhatsApp(inc.from, res.notFound || "\uD83E\uDD16 No pude cargarlo."));
      return json({ ok: true, from: inc.from, reply: "" });
    }

    /* [GADU-WA-WIZARD] Wizard de obra (WAITING_OBRA): nombre -> ubicacion -> presupuesto */
    let enWizardObra = false;
    try {
      const sessObra = await getSession(normalizePhone(inc.from));
      if (sessObra && sessObra.state === "WAITING_OBRA") enWizardObra = true;
    } catch (e) {}
    if (enWizardObra) {
      const localOtra = localIntent(inc.text);
      if (localOtra && localOtra.modulo && localOtra.modulo !== "obra") {
        await deleteSession(normalizePhone(inc.from));
        console.log("[GADU-WA-WIZARD] WAITING_OBRA cancelado, respuesta es:", localOtra.modulo);
      } else {
        const tObra = String(inc.text || "").trim();
        const mObra = tObra.match(/^(.*?)\s+en\s+(.+)$/i);
        if (mObra) {
          /* "Casa Perez en Alta Gracia" -> nombre + ubicacion en un solo mensaje */
          await upsertSession(inc.from, row.user_id, "WAITING_OBRA_PRESUPUESTO", { nombre: String(mObra[1]).trim(), ubicacion: String(mObra[2]).trim() });
          fireAndForget(sendWhatsApp(inc.from, "Cual es el presupuesto total? (ej. 100000   escribi *omitir* si no lo sabes)"));
          return json({ ok: true, from: inc.from, reply: "" });
        }
        if (tObra) {
          await upsertSession(inc.from, row.user_id, "WAITING_OBRA_UBICACION", { nombre: tObra });
          fireAndForget(sendWhatsApp(inc.from, "Donde queda la obra? (ej. Alta Gracia   escribi *omitir* si no lo sabes)"));
          return json({ ok: true, from: inc.from, reply: "" });
        }
        fireAndForget(sendWhatsApp(inc.from, "\uD83E\uDD16 Como se llama la obra? Ej: \"Casa Perez en Alta Gracia\"."));
        return json({ ok: true, from: inc.from, reply: "" });
      }
    }

    /* Obra paso 2: ubicacion (WAITING_OBRA_UBICACION) */
    let enWizardObraUbi = false;
    let obraUbiCtx: Record<string, unknown> = {};
    try {
      const sessOU = await getSession(normalizePhone(inc.from));
      if (sessOU && sessOU.state === "WAITING_OBRA_UBICACION") { enWizardObraUbi = true; obraUbiCtx = (sessOU.context as Record<string, unknown>) || {}; }
    } catch (e) {}
    if (enWizardObraUbi) {
      const t = String(inc.text || "").trim();
      const ubicacion = /^omitir$/i.test(t) ? "" : t;
      await upsertSession(inc.from, row.user_id, "WAITING_OBRA_PRESUPUESTO", { nombre: obraUbiCtx.nombre, ubicacion });
      fireAndForget(sendWhatsApp(inc.from, "Cual es el presupuesto total? (ej. 100000   escribi *omitir* si no lo sabes)"));
      return json({ ok: true, from: inc.from, reply: "" });
    }

    /* Obra paso 3: presupuesto -> crear (WAITING_OBRA_PRESUPUESTO) */
    let enWizardObraPre = false;
    let obraPreCtx: Record<string, unknown> = {};
    try {
      const sessOP = await getSession(normalizePhone(inc.from));
      if (sessOP && sessOP.state === "WAITING_OBRA_PRESUPUESTO") { enWizardObraPre = true; obraPreCtx = (sessOP.context as Record<string, unknown>) || {}; }
    } catch (e) {}
    if (enWizardObraPre) {
      const t = String(inc.text || "").trim();
      const omitir = /^omitir$/i.test(t);
      const presupuesto = omitir ? 0 : Number(t.replace(/\./g, "").replace(",", "."));
      if (!omitir && (!presupuesto || presupuesto <= 0)) {
        fireAndForget(sendWhatsApp(inc.from, "\uD83E\uDD16 Eso no es un monto valido. Cual es el presupuesto total? (o *omitir*)"));
        return json({ ok: true, from: inc.from, reply: "" });
      }
      const res = executeAction(data, { modulo: "obra", campos: { nombre: String(obraPreCtx.nombre || ""), ubicacion: String(obraPreCtx.ubicacion || ""), presupuesto } }, inc.text, () => crypto.randomUUID(), new Date().toISOString().slice(0, 10));
      if (res.ok) {
        const upObra = await rest("app_data?user_id=eq." + encodeURIComponent(row.user_id), {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({ data, updated_at: new Date().toISOString() }),
        });
        if (!upObra.ok) {
          fireAndForget(sendWhatsApp(inc.from, "\u26A0\uFE0F No pude guardar en la nube (error " + upObra.status + "). Proba de nuevo."));
          return json({ ok: true, from: inc.from, reply: "" });
        }
        await deleteSession(normalizePhone(inc.from));
        fireAndForget(sendWhatsApp(inc.from, "\u2705 " + res.label));
        return json({ ok: true, from: inc.from, reply: "\u2705 " + res.label });
      }
      await deleteSession(normalizePhone(inc.from));
      fireAndForget(sendWhatsApp(inc.from, "\uD83E\uDD16 No pude crear la obra. Proba de nuevo."));
      return json({ ok: true, from: inc.from, reply: "" });
    }

    /* [GADU-WA-WIZARD] Contacto paso 1: nombre (WAITING_CONTACT_NAME).
       Intercepta el texto libre ANTES de la IA/fallback. */
    let enWizardContactName = false;
    let contactNameCtx: Record<string, unknown> = {};
    try {
      const sessCN = await getSession(normalizePhone(inc.from));
      if (sessCN && sessCN.state === "WAITING_CONTACT_NAME") {
        enWizardContactName = true;
        contactNameCtx = (sessCN.context as Record<string, unknown>) || {};
      }
    } catch (e) {}
    if (enWizardContactName) {
      const t = inc.text.trim();
      if (/^cancelar$/i.test(t)) {
        await deleteSession(normalizePhone(inc.from));
        fireAndForget(sendWhatsApp(inc.from, "\u2705 Carga cancelada. En que mas te ayudo?"));
        return json({ ok: true, from: inc.from, reply: "cancelado" });
      }
      if (!t) {
        fireAndForget(sendWhatsApp(inc.from, "\uD83E\uDD16 Cual es el nombre completo del contacto?"));
        return json({ ok: true, from: inc.from, reply: "" });
      }
      await upsertSession(inc.from, row.user_id, "WAITING_CONTACT_PHONE", { contactType: contactNameCtx.contactType, name: t });
      fireAndForget(sendWhatsApp(inc.from, "Perfecto. Cual es el numero de telefono de *" + t + "*? (o escribi *omitir*)"));
      return json({ ok: true, from: inc.from, reply: "" });
    }

    /* [GADU-WA-WIZARD] Contacto paso 2: telefono (WAITING_CONTACT_PHONE) */
    let enWizardContactPhone = false;
    let contactPhoneCtx: Record<string, unknown> = {};
    try {
      const sessCP = await getSession(normalizePhone(inc.from));
      if (sessCP && sessCP.state === "WAITING_CONTACT_PHONE") {
        enWizardContactPhone = true;
        contactPhoneCtx = (sessCP.context as Record<string, unknown>) || {};
      }
    } catch (e) {}
    if (enWizardContactPhone) {
      const t = inc.text.trim();
      if (/^cancelar$/i.test(t)) {
        await deleteSession(normalizePhone(inc.from));
        fireAndForget(sendWhatsApp(inc.from, "\u2705 Carga cancelada. En que mas te ayudo?"));
        return json({ ok: true, from: inc.from, reply: "cancelado" });
      }
      const name = String(contactPhoneCtx.name || "").trim();
      const contactType = String(contactPhoneCtx.contactType || "cliente");
      const phone = /^omitir$/i.test(t) ? "" : t;
      if (contactType === "empleado") {
        const parsed = formatProperName(name);
        (data.employees || (data.employees = [])).unshift({
          id: crypto.randomUUID(), firstName: parsed.firstName, lastName: parsed.lastName,
          phone, role: parsed.role || "empleado", active: true, source: "whatsapp",
        });
      } else {
        (data.contacts || (data.contacts = [])).unshift({
          id: crypto.randomUUID(), name,
          type: contactType === "subcontratista" ? "subcontratista" : (contactType === "proveedor" ? "proveedor" : (contactType === "socio" ? "socio" : "cliente")),
          phone, email: "", source: "whatsapp",
        });
      }
      const upCt = await rest("app_data?user_id=eq." + encodeURIComponent(row.user_id), {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ data, updated_at: new Date().toISOString() }),
      });
      if (!upCt.ok) {
        fireAndForget(sendWhatsApp(inc.from, "\u26A0\uFE0F No pude guardar en la nube (error " + upCt.status + "). Proba de nuevo."));
        return json({ ok: true, from: inc.from, reply: "" });
      }
      await deleteSession(normalizePhone(inc.from));
      const label = contactType === "empleado" ? "Empleado" : (contactType === "socio" ? "Socio" : (contactType === "proveedor" ? "Proveedor" : (contactType === "subcontratista" ? "Subcontratista" : "Cliente")));
      fireAndForget(sendWhatsApp(inc.from, "\u2705 Contacto guardado correctamente: " + label + " '" + name + "'."));
      return json({ ok: true, from: inc.from, reply: "contacto guardado" });
    }

    /* [GADU-WA-WIZARD] Empleado paso 1: oficio (WAITING_EMP_OFICIO) */
    let enWizardEmpOficio = false;
    let empOficioCtx: Record<string, unknown> = {};
    try {
      const sessEO = await getSession(normalizePhone(inc.from));
      if (sessEO && sessEO.state === "WAITING_EMP_OFICIO") { enWizardEmpOficio = true; empOficioCtx = (sessEO.context as Record<string, unknown>) || {}; }
    } catch (e) {}
    if (enWizardEmpOficio) {
      const t = String(inc.text || "").trim();
      if (!t) { fireAndForget(sendWhatsApp(inc.from, "\uD83E\uDD16 Cual es su oficio? (ej. Albanil, Pintor, Plomero)")); return json({ ok: true, from: inc.from, reply: "" }); }
      await upsertSession(inc.from, row.user_id, "WAITING_EMP_TARIFA", { nombre: empOficioCtx.nombre, oficio: t, resumeAttendance: empOficioCtx.resumeAttendance });
      fireAndForget(sendWhatsApp(inc.from, "Cuanto cobra por hora? (ej. 1500)"));
      return json({ ok: true, from: inc.from, reply: "" });
    }

    /* Empleado paso 2: tarifa por hora (WAITING_EMP_TARIFA) */
    let enWizardEmpTarifa = false;
    let empTarifaCtx: Record<string, unknown> = {};
    try {
      const sessET = await getSession(normalizePhone(inc.from));
      if (sessET && sessET.state === "WAITING_EMP_TARIFA") { enWizardEmpTarifa = true; empTarifaCtx = (sessET.context as Record<string, unknown>) || {}; }
    } catch (e) {}
    if (enWizardEmpTarifa) {
      const t = String(inc.text || "").trim();
      const tarifa = num(t);   // enteros y decimales ("6000", "6000.50", "6.000")
      if (!tarifa || tarifa <= 0) { fireAndForget(sendWhatsApp(inc.from, "\uD83E\uDD16 Eso no es un monto valido. Cuanto cobra por hora?")); return json({ ok: true, from: inc.from, reply: "" }); }
      await upsertSession(inc.from, row.user_id, "WAITING_EMP_TELEFONO", { nombre: empTarifaCtx.nombre, oficio: empTarifaCtx.oficio, tarifa, resumeAttendance: empTarifaCtx.resumeAttendance });
      fireAndForget(sendWhatsApp(inc.from, "Su telefono / WhatsApp? (o escribi *omitir*)"));
      return json({ ok: true, from: inc.from, reply: "" });
    }

    /* Empleado paso 3: telefono -> crear empleado (WAITING_EMP_TELEFONO) */
    let enWizardEmpTelefono = false;
    let empTelCtx: Record<string, unknown> = {};
    try {
      const sessEL = await getSession(normalizePhone(inc.from));
      if (sessEL && sessEL.state === "WAITING_EMP_TELEFONO") { enWizardEmpTelefono = true; empTelCtx = (sessEL.context as Record<string, unknown>) || {}; }
    } catch (e) {}
    if (enWizardEmpTelefono) {
      const t = String(inc.text || "").trim();
      const phone = /^omitir$/i.test(t) ? "" : t;
      const parsed = formatProperName(String(empTelCtx.nombre || ""));
      const nuevoId = crypto.randomUUID();
      (data.employees || (data.employees = [])).push({
        id: nuevoId, firstName: parsed.firstName, lastName: parsed.lastName,
        phone, role: String(empTelCtx.oficio || parsed.role || "empleado"),
        hourlyRate: Number(empTelCtx.tarifa) || 0, paymentData: "", active: true, source: "whatsapp",
      });
      const upEmp = await rest("app_data?user_id=eq." + encodeURIComponent(row.user_id), {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ data, updated_at: new Date().toISOString() }),
      });
      if (!upEmp.ok) {
        console.error("[GADU-WA-EMP] PATCH fallo:", upEmp.status);
        fireAndForget(sendWhatsApp(inc.from, "\u26A0\uFE0F No pude guardar el empleado en la nube. Reintenta."));
        return json({ ok: true, from: inc.from, reply: "" });
      }
      const nombreEmp = (parsed.firstName + " " + parsed.lastName).trim();

      /* Alta rapida desde asistencia: retomar el registro de asistencia */
      if (empTelCtx.resumeAttendance) {
        const obras = (data.works || []).filter((w: any) => w.status === "activa").slice(0, 10);
        if (!obras.length) {
          await deleteSession(normalizePhone(inc.from));
          fireAndForget(sendWhatsApp(inc.from, "\u2705 " + nombreEmp + " registrado, pero no tenes obras activas para cargarle asistencia."));
          return json({ ok: true, from: inc.from, reply: "" });
        }
        await upsertSession(inc.from, row.user_id, "WAITING_ATTENDANCE_WORK", { employeeId: nuevoId, employeeName: nombreEmp });
        const obraRowsResume = obras.map((w: any) => ({ id: "att_work:" + String(w.id), title: String(w.nombre || w.name || "Obra") }));
        obraRowsResume.push({ id: "menu_root", title: "\uD83C\uDFE0 Volver al menu", description: "Cancelar y volver al inicio" });
        await sendWhatsAppList(inc.from, "\u2705 " + nombreEmp + " registrado. En que obra trabajo?", obraRowsResume, { button: "Elegir obra", sectionTitle: "Obras activas" });
        return json({ ok: true, from: inc.from, reply: "" });
      }

      await deleteSession(normalizePhone(inc.from));
      fireAndForget(sendWhatsApp(inc.from, "\u2705 Empleado registrado: " + nombreEmp + " (" + String(empTelCtx.oficio || "empleado") + ")" + (Number(empTelCtx.tarifa) ? "   $" + Number(empTelCtx.tarifa) + "/h" : "")));
      return json({ ok: true, from: inc.from, reply: "empleado guardado" });
    }

    /* [GADU-WA-WIZARD] Agenda paso 2: fecha (WAITING_AGENDA_FECHA) */
    let enWizardAgendaFecha = false;
    let agendaFechaCtx: Record<string, unknown> = {};
    try {
      const sessAF = await getSession(normalizePhone(inc.from));
      if (sessAF && sessAF.state === "WAITING_AGENDA_FECHA") { enWizardAgendaFecha = true; agendaFechaCtx = (sessAF.context as Record<string, unknown>) || {}; }
    } catch (e) {}
    if (enWizardAgendaFecha) {
      const t = String(inc.text || "").trim();
      const fecha = resolveFecha(t);
      if (!fecha) { fireAndForget(sendWhatsApp(inc.from, "\uD83E\uDD16 No entendi esa fecha. Decime \"hoy\", \"manana\" o una fecha (ej. 15/04).")); return json({ ok: true, from: inc.from, reply: "" }); }
      await upsertSession(inc.from, row.user_id, "WAITING_AGENDA_OBRA", { titulo: agendaFechaCtx.titulo, fecha });
      fireAndForget(sendWhatsApp(inc.from, "A que obra o contacto se relaciona? (escribi *ninguna* si no aplica)"));
      return json({ ok: true, from: inc.from, reply: "" });
    }

    /* Agenda paso 3: obra/contacto -> guardar (WAITING_AGENDA_OBRA) */
    let enWizardAgendaObra = false;
    let agendaObraCtx: Record<string, unknown> = {};
    try {
      const sessAO2 = await getSession(normalizePhone(inc.from));
      if (sessAO2 && sessAO2.state === "WAITING_AGENDA_OBRA") { enWizardAgendaObra = true; agendaObraCtx = (sessAO2.context as Record<string, unknown>) || {}; }
    } catch (e) {}
    if (enWizardAgendaObra) {
      const t = String(inc.text || "").trim();
      const sinRef = /^(ninguna|nada|sin\s+obra)$/i.test(t);
      const work = !sinRef ? (data.works || []).find((w: any) => flat(String(w.nombre || w.name || "")).includes(flat(t))) : null;
      (data.compromisos || (data.compromisos = [])).unshift({
        id: crypto.randomUUID(), fecha: String(agendaObraCtx.fecha || ""), hora: "", tipo: "compromiso",
        titulo: String(agendaObraCtx.titulo || "Compromiso"), lugar: "", contactoId: work ? String(work.id) : null,
        notas: sinRef ? "" : t, estado: "pendiente", createdAt: new Date().toISOString(),
      });
      const upAg = await rest("app_data?user_id=eq." + encodeURIComponent(row.user_id), {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ data, updated_at: new Date().toISOString() }),
      });
      if (!upAg.ok) {
        fireAndForget(sendWhatsApp(inc.from, "\u26A0\uFE0F No pude guardar en la nube (error " + upAg.status + "). Proba de nuevo."));
        return json({ ok: true, from: inc.from, reply: "" });
      }
      await deleteSession(normalizePhone(inc.from));
      fireAndForget(sendWhatsApp(inc.from, "\u2705 Compromiso agendado: " + String(agendaObraCtx.titulo || "") + " (" + String(agendaObraCtx.fecha || "") + ")"));
      return json({ ok: true, from: inc.from, reply: "compromiso guardado" });
    }

    /* [GADU-WA-WIZARD] Jornada paso 1: empleado (WAITING_JORNADA) */
    let enWizardJornada = false;
    try {
      const sessJor = await getSession(normalizePhone(inc.from));
      if (sessJor && sessJor.state === "WAITING_JORNADA") enWizardJornada = true;
    } catch (e) {}
    if (enWizardJornada) {
      const t = String(inc.text || "").trim();
      if (!t) { fireAndForget(sendWhatsApp(inc.from, "\uD83E\uDD16 A que empleado le cargamos la jornada?")); return json({ ok: true, from: inc.from, reply: "" }); }
      await upsertSession(inc.from, row.user_id, "WAITING_JORNADA_HORAS", { empleado: t });
      fireAndForget(sendWhatsApp(inc.from, "Cuantas horas trabajo? (ej. 8)"));
      return json({ ok: true, from: inc.from, reply: "" });
    }

    /* Jornada paso 2: horas (WAITING_JORNADA_HORAS) */
    let enWizardJorHoras = false;
    let jorHorasCtx: Record<string, unknown> = {};
    try {
      const sessJH = await getSession(normalizePhone(inc.from));
      if (sessJH && sessJH.state === "WAITING_JORNADA_HORAS") { enWizardJorHoras = true; jorHorasCtx = (sessJH.context as Record<string, unknown>) || {}; }
    } catch (e) {}
    if (enWizardJorHoras) {
      const t = String(inc.text || "").trim();
      const horas = num(t);   // enteros y decimales ("8", "8.5", "8,5")
      if (!horas || horas <= 0) { fireAndForget(sendWhatsApp(inc.from, "\uD83E\uDD16 Eso no es un numero de horas valido. Cuantas horas trabajo?")); return json({ ok: true, from: inc.from, reply: "" }); }
      await upsertSession(inc.from, row.user_id, "WAITING_JORNADA_OBRA", { empleado: jorHorasCtx.empleado, horas });
      fireAndForget(sendWhatsApp(inc.from, "En que obra trabajo?"));
      return json({ ok: true, from: inc.from, reply: "" });
    }

    /* Jornada paso 3: obra -> guardar (WAITING_JORNADA_OBRA) */
    let enWizardJorObra = false;
    let jorObraCtx: Record<string, unknown> = {};
    try {
      const sessJO = await getSession(normalizePhone(inc.from));
      if (sessJO && sessJO.state === "WAITING_JORNADA_OBRA") { enWizardJorObra = true; jorObraCtx = (sessJO.context as Record<string, unknown>) || {}; }
    } catch (e) {}
    if (enWizardJorObra) {
      const t = String(inc.text || "").trim();
      const emp = (data.employees || []).find((e: any) => flat(String((e.firstName || "") + " " + (e.lastName || "")).trim()).includes(flat(String(jorObraCtx.empleado || ""))));
      if (!emp) {
        await deleteSession(normalizePhone(inc.from));
        fireAndForget(sendWhatsApp(inc.from, "\uD83E\uDD16 No encontre a ese empleado. Primero cargalo con \"nuevo empleado [nombre]\"."));
        return json({ ok: true, from: inc.from, reply: "" });
      }
      const work = (data.works || []).find((w: any) => flat(String(w.nombre || w.name || "")).includes(flat(t)));
      (data.attendance || (data.attendance = [])).unshift({
        id: crypto.randomUUID(), employeeId: String((emp as any).id || ""), date: new Date().toISOString().slice(0, 10),
        status: "presente", hours: [{ workId: work ? String((work as any).id) : null, hours: Number(jorObraCtx.horas) || 0 }], notes: "",
      });
      const upJor = await rest("app_data?user_id=eq." + encodeURIComponent(row.user_id), {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ data, updated_at: new Date().toISOString() }),
      });
      if (!upJor.ok) {
        fireAndForget(sendWhatsApp(inc.from, "\u26A0\uFE0F No pude guardar en la nube (error " + upJor.status + "). Proba de nuevo."));
        return json({ ok: true, from: inc.from, reply: "" });
      }
      await deleteSession(normalizePhone(inc.from));
      const empName = String((emp as any).firstName || "") + " " + String((emp as any).lastName || "");
      fireAndForget(sendWhatsApp(inc.from, "\u2705 Jornada registrada: " + empName.trim() + "   " + Number(jorObraCtx.horas) + "h" + (work ? " en " + String((work as any).nombre || (work as any).name || "") : "")));
      return json({ ok: true, from: inc.from, reply: "jornada guardada" });
    }

    /* [GADU-WA-CREW] Crear cuadrilla paso 1: nombre (WAITING_CREW_NAME) */
    let enWizardCrewName = false;
    try {
      const sessCN = await getSession(normalizePhone(inc.from));
      if (sessCN && sessCN.state === "WAITING_CREW_NAME") enWizardCrewName = true;
    } catch (e) {}
    if (enWizardCrewName) {
      const nombre = String(inc.text || "").trim();
      if (!nombre) { fireAndForget(sendWhatsApp(inc.from, "\uD83E\uDD16 Como se llama la cuadrilla? (ej. Cuadrilla de Yeseros)")); return json({ ok: true, from: inc.from, reply: "" }); }
      const emps = (data.employees || []).filter((e: any) => e.active !== false).slice(0, 10);
      if (!emps.length) {
        fireAndForget(sendWhatsApp(inc.from, "\uD83E\uDD16 No tenes empleados activos. Carga uno con \"nuevo empleado [nombre]\"."));
        try { await deleteSession(normalizePhone(inc.from)); } catch (e) {}
        return json({ ok: true, from: inc.from, reply: "" });
      }
      const lista = emps.map((e: any, i: number) => (i + 1) + ". " + String((e.firstName || "") + " " + (e.lastName || "")).trim()).join("\n");
      await upsertSession(inc.from, row.user_id, "WAITING_CREW_MEMBERS", { crewName: nombre, employeeIds: emps.map((e: any) => String(e.id)) });
      fireAndForget(sendWhatsApp(inc.from, "\uD83D\uDC65 Ahora elegi los integrantes de *" + nombre + "*:\n\n" + lista + "\n\nEscribi los numeros separados por coma (ej. *1, 3, 4*) o *todos*."));
      return json({ ok: true, from: inc.from, reply: "" });
    }

    /* [GADU-WA-CREW] Crear cuadrilla paso 2: integrantes -> guardar (WAITING_CREW_MEMBERS) */
    let enWizardCrewMembers = false;
    let crewMembersCtx: Record<string, unknown> = {};
    try {
      const sessCM = await getSession(normalizePhone(inc.from));
      if (sessCM && sessCM.state === "WAITING_CREW_MEMBERS") { enWizardCrewMembers = true; crewMembersCtx = (sessCM.context as Record<string, unknown>) || {}; }
    } catch (e) {}
    if (enWizardCrewMembers) {
      const t = String(inc.text || "").trim().toLowerCase();
      const allIds: string[] = Array.isArray(crewMembersCtx.employeeIds) ? (crewMembersCtx.employeeIds as string[]) : [];
      let selected: string[] = [];
      if (t === "todos" || t === "todas") selected = allIds.slice();
      else {
        const nums = t.split(/[,\s]+/).map(s => parseInt(s, 10)).filter(n => !isNaN(n) && n >= 1 && n <= allIds.length);
        selected = nums.map(n => allIds[n - 1]).filter((id): id is string => Boolean(id));
      }
      if (!selected.length) {
        fireAndForget(sendWhatsApp(inc.from, "\uD83E\uDD16 No entendi. Escribi los numeros separados por coma (ej. *1, 3, 4*) o *todos*."));
        return json({ ok: true, from: inc.from, reply: "" });
      }
      const crewName = String(crewMembersCtx.crewName || "Cuadrilla");
      (data.crews || (data.crews = [])).unshift({
        id: crypto.randomUUID(), name: crewName, employeeIds: selected,
      });
      const upCrew = await rest("app_data?user_id=eq." + encodeURIComponent(row.user_id), {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ data, updated_at: new Date().toISOString() }),
      });
      if (!upCrew.ok) {
        fireAndForget(sendWhatsApp(inc.from, "\u26A0\uFE0F No pude guardar la cuadrilla en la nube (error " + upCrew.status + "). Proba de nuevo."));
        return json({ ok: true, from: inc.from, reply: "" });
      }
      await deleteSession(normalizePhone(inc.from));
      fireAndForget(sendWhatsApp(inc.from, "\u2705 Cuadrilla " + crewName + " creada con exito con " + selected.length + " empleados! Ya podes usarla para registrar asistencia."));
      return json({ ok: true, from: inc.from, reply: "cuadrilla creada" });
    }

    /* [GADU-WA-ATTENDANCE] Cuadrilla por numeros: "1, 3" o "todos" (WAITING_ATTENDANCE_EMPLOYEES) */
    let enWizardAttEmps = false;
    let attEmpsCtx: Record<string, unknown> = {};
    try {
      const sessAE = await getSession(normalizePhone(inc.from));
      if (sessAE && sessAE.state === "WAITING_ATTENDANCE_EMPLOYEES") { enWizardAttEmps = true; attEmpsCtx = (sessAE.context as Record<string, unknown>) || {}; }
    } catch (e) {}
    if (enWizardAttEmps) {
      const t = String(inc.text || "").trim().toLowerCase();
      const allIds: string[] = Array.isArray(attEmpsCtx.employeeIds) ? (attEmpsCtx.employeeIds as string[]) : [];
      /* Cargar datos ANTES de parsear (para resolver cuadrillas por nombre) */
      const rW = await rest("app_data?select=data&user_id=eq." + encodeURIComponent(row.user_id) + "&limit=1");
      const rowsW = (await rW.json().catch(() => [])) as Array<{ data: Record<string, any> }>;
      const dW = (Array.isArray(rowsW) && rowsW.length) ? (rowsW[0].data || {}) : {};
      let selected: string[] = [];
      /* Cuadrilla prefijada por nombre: "cuadrilla albaniles" / "albaniles" */
      const crewKey = t.replace(/^cuadrilla\s+de\s+/i, "").replace(/^cuadrilla\s+/i, "").replace(/^la\s+/i, "").trim();
      if (crewKey) {
        const crew = (dW.crews || []).find((c: any) => {
          const cn = normStr(String(c.name || ""));
          const ck = normStr(crewKey);
          return cn.includes(ck) || ck.includes(cn);
        });
        if (crew && (crew.employeeIds || []).length) {
          selected = (crew.employeeIds || []).map((id: any) => String(id)).filter((id: string) => allIds.indexOf(id) >= 0);
          console.log("[GADU-WA-ATT] cuadrilla prefijada:", crew.name, "->", selected.length, "integrantes");
        }
      }
      if (!selected.length) {
        if (t === "todos" || t === "todas" || t === "toda la cuadrilla") {
          selected = allIds.slice();
        } else {
          const nums = t.split(/[,\s]+/).map(s => parseInt(s, 10)).filter(n => !isNaN(n) && n >= 1 && n <= allIds.length);
          selected = nums.map(n => allIds[n - 1]).filter((id): id is string => Boolean(id));
        }
      }
      if (!selected.length) {
        fireAndForget(sendWhatsApp(inc.from, "\uD83E\uDD16 No entendi. Escribi los numeros (ej. *1, 3*), *todos*, o el nombre de una cuadrilla (ej. *cuadrilla albaniles*)."));
        return json({ ok: true, from: inc.from, reply: "" });
      }
      const obras = (dW.works || []).filter((w: any) => w.status === "activa").slice(0, 10);
      if (!obras.length) {
        fireAndForget(sendWhatsApp(inc.from, "\uD83E\uDD16 No tenes obras activas. Crea una con \"nueva obra [nombre]\"."));
        try { await deleteSession(normalizePhone(inc.from)); } catch (e) {}
        return json({ ok: true, from: inc.from, reply: "" });
      }
      console.log("[GADU-WA-ATT] cuadrilla elegida:", selected.length, "empleados:", JSON.stringify(selected));
      await upsertSession(inc.from, row.user_id, "WAITING_ATTENDANCE_WORK", { employeeIds: selected });
      const obraRows = obras.map((w: any) => ({ id: "att_work:" + String(w.id), title: String(w.nombre || w.name || "Obra") }));
      obraRows.push({ id: "menu_root", title: "\uD83C\uDFE0 Volver al menu", description: "Cancelar y volver al inicio" });
      await sendWhatsAppList(inc.from, "En que obra trabajo la cuadrilla (" + selected.length + " empleados)?", obraRows, { button: "Elegir obra", sectionTitle: "Obras activas" });
      return json({ ok: true, from: inc.from, reply: "" });
    }

    /* [GADU-WA-ATTENDANCE] Asistencia paso intermedio: fecha (WAITING_ATTENDANCE_FECHA)
       Se activa si el usuario escribio la fecha en vez de tocar "Hoy"/"Ayer". */
    let enWizardAttFecha = false;
    let attFechaCtx: Record<string, unknown> = {};
    try {
      const sessAF = await getSession(normalizePhone(inc.from));
      if (sessAF && sessAF.state === "WAITING_ATTENDANCE_FECHA") { enWizardAttFecha = true; attFechaCtx = (sessAF.context as Record<string, unknown>) || {}; }
    } catch (e) {}
    if (enWizardAttFecha) {
      const fecha = resolveFecha(inc.text);
      const empIds = Array.isArray(attFechaCtx.employeeIds) ? (attFechaCtx.employeeIds as string[]) : [];
      console.log("[GADU-WA-ATT] fecha interpretada:", fecha, "  texto:", JSON.stringify(inc.text), "  cuadrilla:", empIds.length);
      await upsertSession(inc.from, row.user_id, "WAITING_ATTENDANCE_HOURS", { ...attFechaCtx, fecha });
      fireAndForget(sendWhatsApp(inc.from, "Cuantas horas trabajo la cuadrilla (" + (empIds.length || 1) + " empleados) en " + String(attFechaCtx.workName || "la obra") + "? (Ej: 8)"));
      return json({ ok: true, from: inc.from, reply: "" });
    }

    /* [GADU-WA-ATTENDANCE] Asistencia paso 3: horas -> guardar (WAITING_ATTENDANCE_HOURS) */
    let enWizardAttHoras = false;
    let attHorasCtx: Record<string, unknown> = {};
    try {
      const sessAH = await getSession(normalizePhone(inc.from));
      console.log("[GADU-WA-ATT] sesion recuperada:", JSON.stringify(sessAH ? { state: sessAH.state, ctx: sessAH.context } : null));
      if (sessAH && sessAH.state === "WAITING_ATTENDANCE_HOURS") { enWizardAttHoras = true; attHorasCtx = (sessAH.context as Record<string, unknown>) || {}; }
    } catch (e) {
      console.error("[GADU-WA-ATT] error leyendo sesion:", e);
    }
    if (enWizardAttHoras) {
      try {
        console.log("[GADU-WA-ATT] contexto WAITING_ATTENDANCE_HOURS:", JSON.stringify(attHorasCtx));
        const t = String(inc.text || "").trim();
        const horas = num(t);   // parser robusto: enteros y decimales ("8", "8.5", "8,5")
        console.log("[GADU-WA-ATT] horas parseadas:", horas, "  texto:", JSON.stringify(t));
        if (!horas || horas <= 0 || !isFinite(horas)) {
          fireAndForget(sendWhatsApp(inc.from, "\uD83E\uDD16 Eso no es un numero de horas valido. Cuantas horas trabajo? (ej. 8 o 6.5)"));
          return json({ ok: true, from: inc.from, reply: "" });
        }
        if (!data || !Array.isArray(data.attendance)) data.attendance = [];
        /* Cuadrilla: array de employeeIds desde el contexto (o fallback a 1 ID) */
        let employeeIds: string[] = Array.isArray(attHorasCtx.employeeIds) ? (attHorasCtx.employeeIds as string[]) : [];
        if (!employeeIds.length && attHorasCtx.employeeId) employeeIds = [String(attHorasCtx.employeeId)];
        let workId = attHorasCtx.workId ? String(attHorasCtx.workId) : null;
        /* AUTO-REPARO por nombre si el contexto perdio los IDs */
        if (!employeeIds.length && attHorasCtx.employeeName) {
          const empByName = (data.employees || []).find((e: any) =>
            normStr(String((e.firstName || "") + " " + (e.lastName || "")).trim()).includes(normStr(String(attHorasCtx.employeeName)))
          );
          if (empByName) employeeIds = [String(empByName.id)];
        }
        if (!workId && attHorasCtx.workName) {
          const wByName = (data.works || []).find((w: any) =>
            normStr(String(w.nombre || w.name || "")).includes(normStr(String(attHorasCtx.workName)))
          );
          if (wByName) workId = String(wByName.id);
        }
        console.log("[GADU-WA-ATT] FINAL employeeIds:", employeeIds.length, "  workId:", workId, "  data ok:", !!data);
        /* Validacion: sin empleados validos NO se inserta un registro roto */
        if (!employeeIds.length) {
          console.error("[GADU-WA-ATT] employeeIds vacio tras auto-reparo -> no se inserta");
          fireAndForget(sendWhatsApp(inc.from, "\uD83E\uDD16 No encontre a los empleados. Primero cargalos con \"nuevo empleado [nombre]\"."));
          try { await deleteSession(normalizePhone(inc.from)); } catch (e) {}
          return json({ ok: true, from: inc.from, reply: "" });
        }
        const fechaAtt = String(attHorasCtx.fecha || new Date().toISOString().slice(0, 10));
        /* Loop de guardado: un registro por empleado de la cuadrilla */
        for (const empId of employeeIds) {
          let attId = "";
          try { attId = crypto.randomUUID(); } catch (_e) { attId = "att-" + Date.now() + "-" + Math.random().toString(36).slice(2, 10); }
          const nuevoReg = {
            id: attId, employeeId: String(empId), date: fechaAtt,
            status: "presente", hours: [{ workId, hours: horas }], notes: "",
          };
          console.log("[GADU-WA-ATT] objeto a insertar:", JSON.stringify({ employeeId: String(empId), workId, hours: horas, date: fechaAtt }));
          data.attendance.unshift(nuevoReg);
        }
        console.log("[GADU-WA-ATT] registros a insertar:", employeeIds.length);
        /* PATCH con REINTENTO (2 intentos, 500ms de separacion) */
        const patchBody = JSON.stringify({ data, updated_at: new Date().toISOString() });
        let up = await rest("app_data?user_id=eq." + encodeURIComponent(row.user_id), {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: patchBody,
        });
        if (!up.ok) {
          console.warn("[GADU-WA-ATT] PATCH fallo (intento 1):", up.status, "-> reintentando");
          await new Promise(r => setTimeout(r, 500));
          up = await rest("app_data?user_id=eq." + encodeURIComponent(row.user_id), {
            method: "PATCH",
            headers: { Prefer: "return=minimal" },
            body: patchBody,
          });
        }
        console.log("[GADU-WA-ATT] PATCH app_data status:", up.status);
        if (!up.ok) {
          console.error("[GADU-WA-ATT] PATCH fallo definitivamente:", up.status);
          fireAndForget(sendWhatsApp(inc.from, "\u26A0\uFE0F No pude guardar en la nube (error " + up.status + "). Proba de nuevo en unos segundos."));
          return json({ ok: true, from: inc.from, reply: "" });
        }
        await deleteSession(normalizePhone(inc.from));
        const workNameAtt = String(attHorasCtx.workName || "");
        fireAndForget(sendWhatsApp(inc.from, "\u2705 Se registro con exito la jornada para la cuadrilla de " + employeeIds.length + " empleados" + (workNameAtt ? " en la obra " + workNameAtt : "") + "   " + horas + " hs" + (fechaAtt ? "   " + fechaAtt : "")));
        return json({ ok: true, from: inc.from, reply: "asistencia guardada" });
      } catch (err) {
        const eMsg = (err && (err as any).message) ? String((err as any).message) : String(err);
        const eDet = (err && (err as any).details) ? String((err as any).details) : "";
        const eCode = (err && (err as any).code) ? String((err as any).code) : "";
        console.error("[GADU-WA-ATT] ERROR en WAITING_ATTENDANCE_HOURS:", eMsg, "  code:", eCode, "  details:", eDet);
        fireAndForget(sendWhatsApp(inc.from, "\uD83E\uDD16 No pude registrar la asistencia (" + eMsg + "). Escribi *cancelar* y volve a intentar con \"registrar asistencia\"."));
        try { await deleteSession(normalizePhone(inc.from)); } catch (e) {}
        return json({ ok: true, from: inc.from, reply: "" });
      }
    }

    /* [GADU-WA-DEBT] Deuda paso 1: concepto (WAITING_DEBT_CONCEPT) */
    let enWizardDebtConcept = false;
    try {
      const sessDC = await getSession(normalizePhone(inc.from));
      if (sessDC && sessDC.state === "WAITING_DEBT_CONCEPT") enWizardDebtConcept = true;
    } catch (e) {}
    if (enWizardDebtConcept) {
      const t = String(inc.text || "").trim();
      if (!t) { fireAndForget(sendWhatsApp(inc.from, "\uD83E\uDD16 Cual es el concepto de la deuda? (Ej: Heladera)")); return json({ ok: true, from: inc.from, reply: "" }); }
      await upsertSession(inc.from, row.user_id, "WAITING_DEBT_TOTAL", { concepto: t });
      fireAndForget(sendWhatsApp(inc.from, "Cual es el monto total de la deuda? (Ej: 500000)"));
      return json({ ok: true, from: inc.from, reply: "" });
    }

    /* Deuda paso 2: monto total (WAITING_DEBT_TOTAL) */
    let enWizardDebtTotal = false;
    let debtTotalCtx: Record<string, unknown> = {};
    try {
      const sessDT = await getSession(normalizePhone(inc.from));
      if (sessDT && sessDT.state === "WAITING_DEBT_TOTAL") { enWizardDebtTotal = true; debtTotalCtx = (sessDT.context as Record<string, unknown>) || {}; }
    } catch (e) {}
    if (enWizardDebtTotal) {
      const monto = num(inc.text);
      if (!(monto > 0)) { fireAndForget(sendWhatsApp(inc.from, "\uD83E\uDD16 Eso no es un monto valido. Cual es el monto total? (ej. 500000)")); return json({ ok: true, from: inc.from, reply: "" }); }
      await upsertSession(inc.from, row.user_id, "WAITING_DEBT_INSTALLMENTS", { concepto: debtTotalCtx.concepto, montoTotal: monto });
      fireAndForget(sendWhatsApp(inc.from, "En cuantas cuotas se paga? (Ej: 12)"));
      return json({ ok: true, from: inc.from, reply: "" });
    }

    /* Deuda paso 3: cuotas -> guardar (WAITING_DEBT_INSTALLMENTS) */
    let enWizardDebtInst = false;
    let debtInstCtx: Record<string, unknown> = {};
    try {
      const sessDI = await getSession(normalizePhone(inc.from));
      if (sessDI && sessDI.state === "WAITING_DEBT_INSTALLMENTS") { enWizardDebtInst = true; debtInstCtx = (sessDI.context as Record<string, unknown>) || {}; }
    } catch (e) {}
    if (enWizardDebtInst) {
      const cuotas = parseInt(rawDigits(inc.text), 10);
      if (!(cuotas > 0)) { fireAndForget(sendWhatsApp(inc.from, "\uD83E\uDD16 Ingresa una cantidad de cuotas valida (ej. 12).")); return json({ ok: true, from: inc.from, reply: "" }); }
      const montoTotal = Number(debtInstCtx.montoTotal) || 0;
      const concepto = String(debtInstCtx.concepto || "Deuda");
      /* fechaVencimiento = hoy + 1 mes (clamp de dia a fin de mes) */
      const hoy = new Date();
      const venc = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 1);
      const lastDay = new Date(venc.getFullYear(), venc.getMonth() + 1, 0).getDate();
      const fechaVencimiento = venc.getFullYear() + "-" + String(venc.getMonth() + 1).padStart(2, "0") + "-" + String(Math.min(hoy.getDate(), lastDay)).padStart(2, "0");
      const nuevoDebt = {
        id: crypto.randomUUID(), concepto, tipo: "Personal", montoTotal,
        cuotasTotales: cuotas, cuotaActual: 1,
        montoPorCuota: Math.round((montoTotal / cuotas) * 100) / 100,
        fechaVencimiento, finalizada: false,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      };
      console.log("[GADU-WA-DEBT] JSON a insertar:", JSON.stringify(nuevoDebt));
      (data.debts || (data.debts = [])).unshift(nuevoDebt);
      const upDebt = await rest("app_data?user_id=eq." + encodeURIComponent(row.user_id), {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ data, updated_at: new Date().toISOString() }),
      });
      if (!upDebt.ok) {
        fireAndForget(sendWhatsApp(inc.from, "\u26A0\uFE0F No pude guardar en la nube (error " + upDebt.status + "). Proba de nuevo."));
        return json({ ok: true, from: inc.from, reply: "" });
      }
      await deleteSession(normalizePhone(inc.from));
      fireAndForget(sendWhatsApp(inc.from, "\u2705 Deuda registrada: " + concepto + " por $" + montoTotal.toLocaleString("es-AR") + " en " + cuotas + " cuotas. Podes verla y pagarla desde la seccion 'Deudas y Cuotas' de la app."));
      return json({ ok: true, from: inc.from, reply: "deuda guardada" });
    }

    /* [GADU-WA-EXPORT] Exportar gastos a Excel (comando "excel" / "exportar gastos") */
    if (/\b(excel|planilla|xlsx)\b/i.test(inc.text) || /exportar\s+(gastos|movimientos|todo|mis\s+datos)/i.test(inc.text)) {
      console.log("[GADU-WA-EXPORT] pedido de exportacion:", inc.text);
      try {
        const xlsxBytes = exportExpensesXlsx(data);
        const ok = await sendWhatsAppDocument(
          inc.from,
          xlsxBytes,
          "gastos-gadu.xlsx",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Gastos GADU",
        );
        if (!ok) {
          fireAndForget(sendWhatsApp(inc.from, "\uD83E\uDD16 No pude generar el archivo. Proba de nuevo en unos minutos."));
        }
      } catch (e) {
        console.error("[GADU-WA-EXPORT] error generando excel:", e);
        fireAndForget(sendWhatsApp(inc.from, "\uD83E\uDD16 No pude generar el archivo. Proba de nuevo en unos minutos."));
      }
      return json({ ok: true, from: inc.from, reply: "excel" });
    }

    if (advIntent && !advIntent.nombre && advIntent.monto <= 0) {
      const reply = "\uD83D\uDCB8 Vamos a cargar el adelanto! Decime *a que empleado* y *de cuanto* es. Por ejemplo: \"Adelanto de Hugo de 12000\".";
      await upsertSession(inc.from, row.user_id, "WAITING_ADVANCE", {});
      fireAndForget(sendWhatsApp(inc.from, reply));
      return json({ ok: true, from: inc.from, reply });
    }

    /* Blindaje: si llegamos hasta aca con un WAITING_* activo que NINGUN wizard
       intercepto (estado huerfano), lo limpiamos y volvemos al menu. Evita que
       una respuesta numerica caiga a la IA o cambie de flujo. */
    if (activeWizardState) {
      console.warn("[GADU-WA-SESSION] estado huerfano sin interceptor:", activeWizardState);
      try { await deleteSession(normalizePhone(inc.from)); } catch (e) {}
      await showMainMenu(inc.from, "Hola! \uD83D\uDC4B Soy tu asistente GADU. Que queres hacer hoy?");
      return json({ ok: true, from: inc.from, reply: "" });
    }

    /* Consultas analiticas (SOLO LECTURA): detectar + calcular ANTES de la IA.
       Sueldos, balance de obra, agenda y herramientas se resuelven localmente. */
    const queryIntent = detectQueryIntent(inc.text);
    if (queryIntent) {
      const qr = computeQuery(data, queryIntent);
      const link = queryLink(data, queryIntent);
      const reply = link ? qr + "\n\n\uD83D\uDCCA Podes ver el reporte completo y detallado aca: " + link : qr;
      console.log("[GADU-WA-QUERY] consulta:", queryIntent.type, "  target:", queryIntent.target || "(-)");
      fireAndForget(sendWhatsApp(inc.from, reply));
      return json({ ok: true, from: inc.from, reply });
    }

    const RECOGNIZED_MODULOS = ["saludo", "consulta", "presupuesto_pdf", "asistencia", "gasto", "ingreso", "empleado", "adelanto", "obra", "inversion", "reporte", "nueva_deuda"];
    console.log("[GADU-WA-INTENT] texto a interpretar:", JSON.stringify(inc.text));

    const aiController = new AbortController();
    const aiTimer = setTimeout(() => aiController.abort(), 10000);
    try {
      const aiRes = await fetch(supabaseUrl() + "/functions/v1/ai-assistant", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: anonKey(),
          Authorization: `Bearer ${serviceKey()}`,
          "x-service-secret": Deno.env.get("SERVICE_SECRET") || "",
        },
        body: JSON.stringify({
          message: inc.text,
          context: buildContext(data),
          mode: "usuario",
          channel: "whatsapp",
          service: true,
          userId: row.user_id,
        }),
        signal: aiController.signal,
      });
      const ai = await aiRes.json().catch(() => ({}));
      console.log("[GADU-WA-BACKGROUND] ai-assistant http", aiRes.status, "  action:", JSON.stringify(ai.action || null), "  reply:", JSON.stringify(ai.reply || ai.error || ""));
      aiReply = ai.reply || "";
      if (ai.action && ai.action.modulo && RECOGNIZED_MODULOS.includes(ai.action.modulo)) {
        action = ai.action;
      } else {
        console.warn("[GADU-WA-BACKGROUND] IA sin accion o modulo no reconocido:", JSON.stringify(ai.action || null), "  status=", aiRes.status);
      }
    } catch (e) {
      console.error("[GADU-WA-BACKGROUND] ai-assistant fallo/aborto:", e);
    } finally {
      clearTimeout(aiTimer);
    }
    /* Fallback local SOLO si la IA no devolvio accion */
    if (!action) {
      const local = localIntent(inc.text);
      if (local) {
        action = local;
        console.log("[GADU-WA-BACKGROUND] usando intent local (fallback):", JSON.stringify(local));
      }
    }
    /* [GADU-WA-SMART-CONTEXT] Si el regex detecto "adelanto" con nombre+monto, desambiguar cliente vs empleado */
    if (advIntent && advIntent.nombre && advIntent.monto > 0) {
      const target = resolveAdvanceTarget(data, advIntent.nombre);
      if (target.kind === "cliente") {
        action = { modulo: "ingreso", campos: { concepto: "Adelanto", cliente: target.nombre, monto: advIntent.monto } };
      } else {
        action = { modulo: "adelanto", campos: { empleado: target.nombre, monto: advIntent.monto } };
      }
      console.log("[GADU-WA-SMART-CONTEXT] adelanto -> " + target.kind + ":", target.nombre, "  monto:", advIntent.monto);
    }
    console.log("[DEBUG] Intent detectado: " + (action ? action.modulo : "ninguno"));

    /* Saludo -> respuesta directa (sin accion contable) */
    if (action && action.modulo === "saludo") {
      const reply = ((action as unknown) as { reply?: string }).reply || "Hola! \uD83D\uDC4B Soy GADU. En que te ayudo?";
      fireAndForget(sendWhatsApp(inc.from, reply));
      return json({ ok: true, from: inc.from, reply });
    }

    /* Consultas (QUERY_DATA): responder con calculos en memoria (no guardar nada) */
    if (action && action.modulo === "consulta") {
      const c = (action.campos || {}) as Record<string, unknown>;
      const qtype = String(c.query_type || "");
      const target = String(c.target || "");
      let reply = "";
      if (qtype === "balance_work") reply = queryBalanceWork(data, target);
      else if (qtype === "expenses_week") reply = queryExpensesWeek(data);
      else if (qtype === "attendance_today") reply = queryAttendanceToday(data);
      else if (qtype === "pending_salaries") reply = queryPendingSalaries(data, target);
      else reply = "\uD83E\uDD16 No entendi la consulta. Proba preguntando 'Cual es el saldo de la obra X?'";
      console.log("[GADU-WA-QUERY]", qtype || "(sin tipo)", "  target:", target);
      fireAndForget(sendWhatsApp(inc.from, reply));
      return json({ ok: true, from: inc.from, reply });
    }

    /* Presupuesto PDF (CREATE_BUDGET): guardar en data.budgets + generar + enviar documento */
    if (action && action.modulo === "presupuesto_pdf") {
      const c = (action.campos || {}) as Record<string, unknown>;
      const cliente = String(c.cliente || "Cliente");
      const items = Array.isArray(c.items)
        ? c.items.map((it: any) => ({ descripcion: String(it.descripcion || ""), cantidad: Number(it.cantidad) || 0, precio: Number(it.precio) || 0 }))
        : [];
      if (!items.length) {
        fireAndForget(sendWhatsApp(inc.from, "\uD83E\uDD16 Me faltan los items del presupuesto. Decimelos de nuevo, por ejemplo: \"20 m2 de ceramica, 3 bolsas de pegamento\"."));
        return json({ ok: true, from: inc.from, reply: "" });
      }
      try {
        const hoy = new Date().toISOString().slice(0, 10);
        const subtotal = items.reduce((s, i) => s + (i.cantidad * i.precio), 0);
        const discount = Number(c.discount || c.descuento || 0);
        const tax = Number(c.tax || c.iva || 0);
        const total = Math.max(0, subtotal - discount + tax);

        /* Resolver clientId (buscar en el directorio por nombre) */
        let clientId: string | null = null;
        const cli = (data.contacts || []).find((x: any) => String(x.name || "").toLowerCase().includes(cliente.toLowerCase()));
        if (cli) clientId = String(cli.id || "");

        const year = new Date().getFullYear();
        const code = "PR-" + year + "-" + String((data.budgets || []).length + 1).padStart(3, "0");
        const budget = {
          id: crypto.randomUUID(), code, clientId, workId: null,
          name: "Presupuesto " + cliente, date: hoy, validUntil: "",
          status: "borrador",
          items: items.map(i => ({ desc: i.descripcion, unit: "", qty: i.cantidad, price: i.precio })),
          discount, subtotal, total, tax, notes: "",
        };
        (data.budgets || (data.budgets = [])).unshift(budget);

        /* Sincronizar con la nube (Realtime lo ve aparecer al instante) */
        const up = await rest("app_data?user_id=eq." + encodeURIComponent(row.user_id), {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({ data, updated_at: new Date().toISOString() }),
        });
        if (!up.ok) {
          console.error("[GADU-WA-BUDGET] fallo PATCH app_data:", up.status);
          fireAndForget(sendWhatsApp(inc.from, "\u26A0\uFE0F No pude guardar el presupuesto en la nube (error " + up.status + "). Proba de nuevo."));
          return json({ ok: true, from: inc.from, reply: "" });
        }

        const pdf = await generateBudgetPDF({ cliente, items });
        const filename = "Presupuesto_" + String(cliente || "gadu").replace(/[^a-z0-9aeioun ]/gi, "").replace(/\s+/g, "_") + ".pdf";
        const ok = await sendWhatsAppDocument(inc.from, pdf, filename);
        const reply = ok
          ? "\u2705 Presupuesto para " + cliente + " guardado y adjuntado. Podes verlo en la seccion 'Presupuestos' de la app."
          : "\u2705 Presupuesto para " + cliente + " guardado. (No pude adjuntar el PDF, proba de nuevo.)";
        fireAndForget(sendWhatsApp(inc.from, reply));
        return json({ ok: true, from: inc.from, reply });
      } catch (e) {
        console.error("[GADU-WA-DOC] error generando PDF:", e);
        fireAndForget(sendWhatsApp(inc.from, "\u274C No pude generar el PDF. Proba de nuevo."));
        return json({ ok: true, from: inc.from, reply: "" });
      }
    }

    /* Registro de asistencia (REGISTER_ATTENDANCE) - acepta formato array
       (employees) o simple (empleado/obra/horas) */
    if (action && action.modulo === "asistencia") {
      const c = (action.campos || {}) as Record<string, unknown>;
      const fecha = resolveFecha(String(c.fecha || "hoy"));
      /* Formato simple: {empleado, horas, obra} -> envolver como array */
      let employees: Array<Record<string, unknown>> = Array.isArray(c.employees) ? (c.employees as Array<Record<string, unknown>>) : [];
      if (!employees.length && c.empleado) {
        employees = [{ nombre: String(c.empleado || ""), horas: Number(c.horas) || 0, work: String(c.obra || c.work || "") }];
      }
      const registrados: Array<{ nombre: string; horas: number; workLabel: string }> = [];
      const noEncontrados: string[] = [];
      for (const e of employees) {
        const nombre = String((e as any).nombre || (e as any).empleado || "").trim();
        const horas = Number((e as any).horas) || 0;
        if (!nombre || horas <= 0) continue;
        const emp = (data.employees || []).find((x: any) =>
          normStr(String((x.firstName || "") + " " + (x.lastName || "")).trim()).includes(normStr(nombre))
        );
        if (!emp) { noEncontrados.push(nombre); continue; }
        /* Resolver la obra -> workId con matching flexible (normWork) */
        const workName = String((e as any).work || (e as any).obra || "").trim();
        let workId: string | null = null;
        let workLabel = "";
        if (workName) {
          const w = (data.works || []).find((x: any) => normStr(String(x.nombre || x.name || "")).includes(normStr(workName)));
          if (w) { workId = String(w.id || ""); workLabel = String(w.nombre || w.name || workName); }
        }
        (data.attendance || (data.attendance = [])).push({
          id: crypto.randomUUID(), employeeId: String(emp.id || ""), date: fecha,
          status: "presente", hours: [{ workId, hours: horas }], notes: "",
        });
        registrados.push({ nombre: String((emp.firstName || "") + " " + (emp.lastName || "")).trim(), horas, workLabel });
      }
      const up = await rest("app_data?user_id=eq." + encodeURIComponent(row.user_id), {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ data, updated_at: new Date().toISOString() }),
      });
      if (!up.ok) {
        console.error("[GADU-WA-ATT] fallo PATCH app_data:", up.status);
        fireAndForget(sendWhatsApp(inc.from, "\u26A0\uFE0F No pude guardar la asistencia en la nube (error " + up.status + "). Proba de nuevo."));
        return json({ ok: true, from: inc.from, reply: "" });
      }
      const partes = registrados.map(r => r.nombre + " (" + r.horas + "hs" + (r.workLabel ? " en " + r.workLabel : " sin obra asignada") + ")");
      let reply = "\u2705 Asistencia registrada: " + (partes.join(", ") || "nadie") + ".";
      if (noEncontrados.length) reply += " (No encontre a " + noEncontrados.join(", ") + " en tu lista de empleados).";
      fireAndForget(sendWhatsApp(inc.from, reply));
      return json({ ok: true, from: inc.from, reply });
    }

    /* 4) Ejecutar la accion contable (gasto/ingreso) e impactar en app_data */
    /* [AGENDA/JORNADA] modulos con wizard propio: NO pasan por executeAction */
    if (action && action.modulo === "agendar") {
      const titulo = String((action.campos || {}).titulo || "").trim();
      await upsertSession(inc.from, row.user_id, "WAITING_AGENDA_FECHA", { titulo: titulo || "Compromiso" });
      fireAndForget(sendWhatsApp(inc.from, "Para que dia? (ej. hoy, manana, 15/04, 2026-04-15)"));
      return json({ ok: true, from: inc.from, reply: "" });
    }
    if (action && action.modulo === "jornada") {
      const cj = (action.campos || {}) as Record<string, unknown>;
      const empleado = String(cj.empleado || "").trim();
      const horas = Number(cj.horas) || 0;
      if (empleado && horas > 0) {
        await upsertSession(inc.from, row.user_id, "WAITING_JORNADA_OBRA", { empleado, horas });
        fireAndForget(sendWhatsApp(inc.from, "En que obra trabajo?"));
        return json({ ok: true, from: inc.from, reply: "" });
      }
      await upsertSession(inc.from, row.user_id, "WAITING_JORNADA", {});
      fireAndForget(sendWhatsApp(inc.from, "A que empleado le cargamos la jornada?"));
      return json({ ok: true, from: inc.from, reply: "" });
    }

    /* [REPORTE] consulta gerencial (solo lectura): calcular y responder */
    if (action && action.modulo === "reporte") {
      const rc = (action.campos || {}) as Record<string, unknown>;
      const reply = computeReporte(data, String(rc.tipo || ""), rc);
      console.log("[GADU-WA-REPORTE] tipo:", rc.tipo, "  campos:", JSON.stringify(rc));
      fireAndForget(sendWhatsApp(inc.from, reply));
      return json({ ok: true, from: inc.from, reply });
    }

    /* [GADU-WA-DEBT] Deuda one-shot (IA): "Cargame una deuda de 500000 en 12 cuotas..." */
    if (action && action.modulo === "nueva_deuda") {
      const cDebt = (action.campos || {}) as Record<string, unknown>;
      const concepto = String(cDebt.concepto || cDebt.nombre || "").trim();
      const monto = Number(cDebt.monto || cDebt.montoTotal) || 0;
      const cuotas = parseInt(String(cDebt.cuotas || cDebt.cuotasTotales || ""), 10) || 0;
      if (concepto && monto > 0 && cuotas > 0) {
        const hoyD = new Date();
        const vencD = new Date(hoyD.getFullYear(), hoyD.getMonth() + 1, 1);
        const lastD = new Date(vencD.getFullYear(), vencD.getMonth() + 1, 0).getDate();
        const fechaVenc = vencD.getFullYear() + "-" + String(vencD.getMonth() + 1).padStart(2, "0") + "-" + String(Math.min(hoyD.getDate(), lastD)).padStart(2, "0");
        (data.debts || (data.debts = [])).unshift({
          id: crypto.randomUUID(), concepto, tipo: "Personal", montoTotal: monto,
          cuotasTotales: cuotas, cuotaActual: 1,
          montoPorCuota: Math.round((monto / cuotas) * 100) / 100,
          fechaVencimiento: fechaVenc, finalizada: false,
          createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        });
        const upDebt2 = await rest("app_data?user_id=eq." + encodeURIComponent(row.user_id), {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({ data, updated_at: new Date().toISOString() }),
        });
        if (!upDebt2.ok) {
          fireAndForget(sendWhatsApp(inc.from, "\u26A0\uFE0F No pude guardar en la nube (error " + upDebt2.status + "). Proba de nuevo."));
          return json({ ok: true, from: inc.from, reply: "" });
        }
        fireAndForget(sendWhatsApp(inc.from, "\u2705 Deuda registrada: " + concepto + " por $" + monto.toLocaleString("es-AR") + " en " + cuotas + " cuotas."));
      } else {
        fireAndForget(sendWhatsApp(inc.from, "\uD83E\uDD16 Me falta un dato de la deuda (concepto, monto o cuotas). Decimelo completo, ej: \"deuda de 500000 en 12 cuotas para la heladera\"."));
      }
      return json({ ok: true, from: inc.from, reply: "" });
    }

    if (action && ["gasto", "ingreso", "empleado", "adelanto", "obra", "inversion"].includes(action.modulo)) {
      /* [EMPLEADO multi-paso] Si hay nombre pero faltan oficio/tarifa/telefono,
         arrancar el wizard secuencial en lugar de crear un empleado incompleto. */
      if (action.modulo === "empleado") {
        const nombreEmp = String((action.campos || {}).nombre || "").trim();
        if (nombreEmp) {
          await upsertSession(inc.from, row.user_id, "WAITING_EMP_OFICIO", { nombre: nombreEmp });
          fireAndForget(sendWhatsApp(inc.from, "Dale, cual es su oficio? (ej. Albanil, Pintor, Plomero)"));
          return json({ ok: true, from: inc.from, reply: "" });
        }
      }
      const res = executeAction(data, action, inc.text, () => crypto.randomUUID(), new Date().toISOString().slice(0, 10));
      if (res.ok) {
        /* Si el gasto vino de una FOTO de ticket, adjuntar el comprobante ANTES del PATCH
           (si lo hacemos despues, el receiptUrl no se persiste). */
        if (action.modulo === "gasto" && inc.mediaUrl) {
          const gastoNuevo = (data.expenses && data.expenses[0]) || null;
          if (gastoNuevo) gastoNuevo.receiptUrl = inc.mediaUrl;
        }
        const up = await rest("app_data?user_id=eq." + encodeURIComponent(row.user_id), {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({ data, updated_at: new Date().toISOString() }),
        });
        if (!up.ok) {
          console.error("[whatsapp-webhook] fallo impactar el movimiento:", up.status);
          return json({ ok: false, error: "no se pudo guardar el movimiento" });
        }
        let reply = "\u2705 " + res.label;
        /* Deep link + notificacion push: enlazar al gasto recien creado */
        if (action.modulo === "gasto") {
          const gasto = (data.expenses && data.expenses[0]) || null;
          if (gasto) {
            const gastoId = String(gasto.id || "");
            const monto = Number(gasto.amount) || 0;
            const cat = String(gasto.category || "gasto");
            if (gastoId) reply += "\n\n\uD83D\uDC49 Ver en GADU: https://gestiongadu.vercel.app/#/gastos?id=" + gastoId;
            firePush(row.user_id, "GADU   Gasto registrado", "Se guardo un gasto de $" + monto + " en " + cat + ". Toca para verlo.", "/#/gastos?id=" + gastoId);
          }
        }
        fireAndForget(sendWhatsApp(inc.from, reply));
        /* Si quedo SIN obra (gasto en bandeja o adelanto de cliente), preguntar a que obra */
        if (res.pendingWork) {
          await askForWork(inc.from, row.user_id, data);
        }
        return json({ ok: true, from: inc.from, reply });
      }
      const reply = res.notFound ? res.notFound : "\uD83E\uDD16 Me falta " + (res.missing || "un dato") + " para cargarlo. Decimelo por aca.";
      fireAndForget(sendWhatsApp(inc.from, reply));
      return json({ ok: true, from: inc.from, reply });
    }

      /* 5) Fallback: desplegar el menu principal unificado (misma lista).
         Nunca responde con texto plano "no entiendo": siempre menu interactivo. */
      const reply = aiReply || "En que te ayudo hoy? Toca *Ver menu* para ver las opciones.";
      await showMainMenu(inc.from, reply);
      return json({ ok: true, from: inc.from, reply });
  } catch (error) {
    console.error("[GADU-WA-QUEUE-FIX] CRITICAL ERROR en processMessage:", error);
    throw error;   // \u2190 propagar para que drainPhone lo marque como fallido y siga
  }
}

/* ===== Drain FIFO de la cola ===== */
async function drainPhone(phone: string) {
  /* [GADU-WA-RESET] Liberar mensajes 'processing' huerfanos (crash) hace mas de 3 min */
  try {
    const freed = await resetStaleProcessing(rest);
    if (freed > 0) console.warn("[GADU-WA-RESET] liberados", freed, "mensaje(s) processing huerfano(s)");
  } catch (e) {
    console.warn("[GADU-WA-RESET] error liberando huerfanos:", e);
  }

  /* Mutex por telefono: si otro drain ya tiene un mensaje en 'processing',
     salimos para no pisar el read-modify-write de app_data. */
  const busy = await rest("whatsapp_queue?status=eq.processing&phone=eq." + encodeURIComponent(phone) + "&limit=1", { method: "GET" });
  const busyRows = (await busy.json().catch(() => [])) as Array<{ id: number }>;
  if (Array.isArray(busyRows) && busyRows.length) return;

  let item = await claimNext(rest, phone);
  while (item) {
    console.log("[GADU-WA-CRITICAL-FIX] Procesando mensaje", item.id, "  status=", item.status, "  attempts=", item.attempts);
    try {
      await processMessage(item.payload);
      await markDone(rest, item.id);
      console.log("[GADU-WA-CRITICAL-FIX] mensaje", item.id, "procesado OK");
    } catch (e) {
      console.error("[GADU-WA-CRITICAL-FIX] Fallo en mensaje", item.id + ":", e);
      await markFailed(rest, item.id);
      /* Avisar al usuario y SEGUIR con el siguiente mensaje de la cola */
      try {
        await sendWhatsApp(item.phone, "\uD83E\uDD16 Fallo el procesamiento, reintenta o escribelo por texto.");
      } catch (e2) {
        console.error("[GADU-WA-CRITICAL-FIX] no se pudo notificar el fallo:", e2);
      }
      console.log("[GADU-WA-CRITICAL-FIX] mensaje", item.id, "marcado como fallido, sigo con el siguiente");
    }
    item = await claimNext(rest, phone);
  }
}
