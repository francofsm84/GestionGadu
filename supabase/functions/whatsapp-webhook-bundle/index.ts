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
export function normCategory(raw: string): string {
  const f = flat(String(raw || ""));
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
  return String(raw).trim();
}

/* Intencion local simple (fallback sin LLM): registra gastos e ingresos con
   frases naturales, por si el motor de IA no esta disponible o falla la auth
   servidor->servidor. Ej.: "Gaste 15000 en bolsas de cemento"  
   "Ingrese 80000 por la obra de Pablo". */
export function localIntent(text: string): { modulo: string; campos?: Record<string, unknown>; reply?: string } | null {
  const f = flat(String(text || "")).trim();
  if (!f) return null;
  const num = (s: string) => Number(s.replace(/\./g, "").replace(",", "."));

  /* 0) Saludo -> intent de saludo (respuesta directa, sin accion contable) */
  if (/^(hola|holis|holi|buenas|buen\s*d[ii]a|buenos\s*d[ii]as|que\s*tal|c[oo]mo\s+(est[aa]s|est[aa]n|va)|hey|alo)\b/.test(f)) {
    return {
      modulo: "saludo",
      reply: "Hola! Hola Soy GADU, tu asistente de obra. Podes cargarme gastos o ingresos por aca, por ejemplo:\n- \"Gaste 15000 en cemento\"\n- \"Cobre 50000 por la obra\"\n\nEn que te ayudo?",
    };
  }

  /* 1) Gasto explicito: monto + "en/de" + descripcion ("Gaste 5000 criollos") */
  let m = f.match(/gas(?:te|to|t[ee]|t[oo])\s+(?:de\s+)?\$?\s*([\d][\d.,]*)\s+(?:en|de)\s+(.+)/i);
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

  /* 4) Ingreso: "Cobre 50000 por la obra" / "Ingrese 80000 por la obra" */
  m = f.match(/(?:cobr[ee]?|ingres[ee]?|cobro|ingreso)\s+(?:de\s+)?\$?\s*([\d][\d.,]*)\s+(?:por|de)\s+(.+)/i);
  if (m && num(m[1]) > 0) {
    return { modulo: "ingreso", campos: { monto: num(m[1]), concepto: String(m[2] || "").trim() } };
  }
  /* 4b) Ingreso solo monto: "Ingreso de 30000" / "Cobre 30000" */
  m = f.match(/(?:cobr[ee]?|ingres[ee]?|cobro|ingreso)\s+(?:de\s+)?\$?\s*([\d][\d.,]*)\s*$/i);
  if (m && num(m[1]) > 0) {
    return { modulo: "ingreso", campos: { monto: num(m[1]), concepto: "Cobro" } };
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
    const concepto = String(c.categoria || sourceText || "").trim().slice(0, 60) || "gasto";
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
    } as unknown as Record<string, unknown>);
    return { ok: true, label: "Obra '" + nombreObra + "' creada OK" };
  }

  /* Modulos con wizard complejo: los responde la IA guiando a la app web */
  return { ok: false, unsupported: action.modulo };
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
    console.log("[GADU-WA-AUDIO] OK URL del media obtenida:", url.slice(0, 80) + "...");
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
    console.log("[GADU-WA-MEDIA] OK media descargado:", buffer.byteLength, "bytes   mime:", mimeType, "(raw:", rawMime + ")");
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
    if (text) console.log("[GADU-WA-AUDIO] OK transcripcion Gemini:", text.slice(0, 80));
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
    if (text) console.log("[GADU-WA-GROQ] OK transcripcion:", text.slice(0, 80));
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
  const prompt = "Eres un experto leyendo tickets de compra, incluso si estan rotados, borrosos o con letra muy pequena. " +
    "Busca SIEMPRE la palabra 'TOTAL' (o 'TOTAL A PAGAR', 'IMPORTE') para extraer el monto exacto. " +
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
    if (text) console.log("[GADU-WA-IMAGE] OK analisis Gemini:", text.slice(0, 80));
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
    const prompt = "Eres un experto leyendo tickets de compra, incluso si estan rotados, borrosos o con letra muy pequena. " +
      "Busca SIEMPRE la palabra 'TOTAL' (o 'TOTAL A PAGAR', 'IMPORTE') para extraer el monto exacto. " +
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
    if (text) console.log("[GADU-WA-GROQ] OK vision:", text.slice(0, 80));
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
      console.log("[GADU-WA-AUDIO] transcripcion:", text);
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
        return { from, text: "", imageFailed: true };
      }
      if (!text) {
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
        return { from, text: "", imageNoMonto: true, mediaUrl };
      } catch (e) {
        /* No devolvio JSON: usar el texto crudo como fallback (flujo normal) */
        return { from, text, mediaUrl };
      }
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
            description: w.description || "Seleccionar opcion",
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
  const rows = (await r.json().catch(() => [])) as Array<{ state: string; context: Record<string, unknown> }>;
  return (Array.isArray(rows) && rows.length) ? rows[0] : null;
}
async function upsertSession(phone: string, userId: string, state: string, context: Record<string, unknown>) {
  await rest("whatsapp_sessions", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({ phone_number: normalizePhone(phone), user_id: userId, state, context, updated_at: new Date().toISOString() }),
  });
}
async function deleteSession(phone: string) {
  await rest("whatsapp_sessions?phone_number=eq." + encodeURIComponent(normalizePhone(phone)), { method: "DELETE" });
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
      text: { body: "[alerta] Nueva solicitud de soporte de " + phone + ". Revisa el panel para responder." },
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
function resolveFecha(raw: string): string {
  const r = String(raw || "hoy").toLowerCase();
  const hoy = new Date();
  if (r === "hoy" || !r) return hoy.toISOString().slice(0, 10);
  if (r === "ayer") return new Date(hoy.getTime() - 86400000).toISOString().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(r)) return r;
  return hoy.toISOString().slice(0, 10);
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
  if (!w) return "[BOT] No encontre esa obra.";
  const cobrado = (data.incomes || []).filter((i: any) => i.workId === w.id).reduce((s: number, i: any) => s + (Number(i.amount) || 0), 0);
  const gastos = (data.expenses || []).filter((e: any) => e.type === "obra" && e.workId === w.id).reduce((s: number, e: any) => s + (Number(e.amount) || 0), 0);
  return "[metricas] El saldo de la obra *" + (w.name || w.nombre || "sin nombre") + "* es de *" + money(cobrado - gastos) + "* (Cobrado: " + money(cobrado) + ", Gastos: " + money(gastos) + ")";
}
function queryExpensesWeek(data: Record<string, any>): string {
  const cutoff = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const list = (data.expenses || []).filter((e: any) => String(e.date || "") >= cutoff);
  if (!list.length) return "$ No tenes gastos en los ultimos 7 dias.";
  const total = list.reduce((s: number, e: any) => s + (Number(e.amount) || 0), 0);
  const detalle = list.slice(0, 5).map((e: any) => "  " + (e.category || e.description || "gasto") + ": " + money(e.amount)).join("\n");
  return "$ Gastaste *" + money(total) + "* en los ultimos 7 dias (" + list.length + " gastos):\n" + detalle;
}
function queryAttendanceToday(data: Record<string, any>): string {
  const hoy = new Date().toISOString().slice(0, 10);
  const att = (data.attendance || []).filter((a: any) => String(a.date || "").slice(0, 10) === hoy && a.status !== "ausente");
  if (!att.length) return "[empleado] Hoy no registraste jornadas.";
  const names = att.map((a: any) => {
    const emp = (data.employees || []).find((e: any) => e.id === a.employeeId);
    return emp ? ((emp.firstName || "") + " " + (emp.lastName || "")).trim() : "empleado";
  });
  return "[empleado] Hoy trabajaron: *" + names.join(", ") + "*";
}
function queryPendingSalaries(data: Record<string, any>, target: string): string {
  const emps = (data.employees || []) as Array<Record<string, any>>;
  if (!emps.length) return "[BOT] No tenes empleados cargados.";
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
  return "$ *" + nombre + "*: Trabajo " + horas + " hs. Genero " + money(generado) + ". Pagado/Adelantado " + money(pagado + adelantos) + ". *Saldo pendiente: " + money(deuda) + "*";
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
    const buttonId = String(msg.interactive?.button_reply?.id || msg.interactive?.list_reply?.id || "");
    const from = String(msg.from || p?.entry?.[0]?.changes?.[0]?.value?.contacts?.[0]?.wa_id || "");
    if (!buttonId || !from) return null;
    return { from: String(from).replace(/\D/g, ""), buttonId };
  } catch (_e) {
    return null;
  }
}

async function handleButtonReply(from: string, buttonId: string) {
  console.log("[GADU-WA-BUTTONS] boton:", buttonId, "de", from);

  /* 1) Buscar usuario (helper compartido) */
  const userId = await findUserId(from);
  if (!userId) {
    console.warn("[GADU-WA-BUTTONS] usuario no encontrado para", from);
    fireAndForget(sendWhatsApp(from, "[BOT] No pude identificar tu cuenta."));
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

  /* [GADU-WA-MENU] Opciones del menu principal (lista interactiva unificada) */
  if (buttonId.startsWith("action_")) {
    const act = buttonId.slice("action_".length);
    if (act === "nuevo_gasto") {
      await upsertSession(from, userId, "WAITING_GASTO", {});
      fireAndForget(sendWhatsApp(from, "Dale, decime el monto y el concepto (ej: \"Gaste 5000 de nafta\" o \"5000 de cemento\")"));
      return;
    }
    if (act === "nueva_obra") {
      await upsertSession(from, userId, "WAITING_OBRA", {});
      fireAndForget(sendWhatsApp(from, "Como se llama la obra y en que direccion esta? Ej: \"Casa Perez en Alta Gracia\""));
      return;
    }
    if (act === "adelanto") {
      await upsertSession(from, userId, "WAITING_ADVANCE", {});
      fireAndForget(sendWhatsApp(from, "$ Decime *a que empleado* y *de cuanto* es el adelanto. Ej: \"Adelanto de Hugo de 12000\"."));
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
    if (act === "contacto") {
      await upsertSession(from, userId, "WAITING_CONTACT_ROLE", {});
      await sendWhatsAppButtons(from, "Que tipo de contacto queres registrar?", [
        { id: "contact_role:empleado", title: "Empleado" },
        { id: "contact_role:socio", title: "Socio" },
        { id: "contact_role:cliente", title: "Cliente" },
      ]);
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
      fireAndForget(notifyAdminNewTicket(from));   // avisar al admin por WhatsApp
      fireAndForget(sendWhatsApp(from, "OK Tu pedido fue enviado. Un asesor de GADU te contactara por este medio a la brevedad."));
      await deleteSession(normalizePhone(from));
      return;
    }
    console.warn("[GADU-WA-MENU] accion desconocida:", act);
    return;
  }

  /* [GADU-WA-MENU] Seleccion de rol para el nuevo contacto.
     Guarda el wizard multi-paso: WAITING_CONTACT_NAME -> WAITING_CONTACT_PHONE. */
  if (buttonId.startsWith("contact_role:")) {
    const role = buttonId.slice("contact_role:".length);
    if (role === "empleado" || role === "socio" || role === "cliente") {
      await upsertSession(from, userId, "WAITING_CONTACT_NAME", { contactType: role });
      const label = role === "empleado" ? "Empleado" : (role === "socio" ? "Socio" : "Cliente");
      fireAndForget(sendWhatsApp(from, "Perfecto, vamos a registrar un *" + label + "*. Cual es el nombre completo? (Escribi *cancelar* para abortar)"));
      return;
    }
    console.warn("[GADU-WA-MENU] rol de contacto desconocido:", role);
    return;
  }

  /* [GADU-WA-AI-UPGRADE] Botones del fallback inteligente (no necesitan gasto pendiente) */
  if (buttonId === "fallback_gasto") {
    fireAndForget(sendWhatsApp(from, "$ Decime el gasto, por ejemplo: \"Gaste 15000 en cemento\" o \"5000 de nafta\"."));
    await deleteSession(normalizePhone(from));
    return;
  }
  if (buttonId === "fallback_adelanto") {
    await upsertSession(from, userId, "WAITING_ADVANCE", {});
    fireAndForget(sendWhatsApp(from, "$ Decime *a que empleado* y *de cuanto* es el adelanto. Ej: \"Adelanto de Hugo de 12000\"."));
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
    fireAndForget(sendWhatsApp(from, "OK Tu pedido fue enviado. Un asesor de GADU te contactara por este medio a la brevedad."));
    await deleteSession(normalizePhone(from));
    return;
  }

  /* 2) Recuperar app_data */
  const rData = await rest("app_data?select=user_id,data&user_id=eq." + encodeURIComponent(userId) + "&limit=1");
  const rowsData = (await rData.json().catch(() => [])) as Array<{ data: Record<string, any> }>;
  if (!Array.isArray(rowsData) || !rowsData.length) {
    console.warn("[GADU-WA-BUTTONS] usuario sin app_data:", userId);
    fireAndForget(sendWhatsApp(from, "[BOT] No encontre tus datos."));
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
    fireAndForget(sendWhatsApp(from, "[BOT] No encontre movimientos pendientes de asignar."));
    return;
  }
  const monto = Number(target.amount) || 0;

  /* 4) Asignar segun el boton */
  if (buttonId.startsWith("assign_work:")) {
    const workId = buttonId.slice("assign_work:".length);
    const work = (data.works || []).find((w: Record<string, any>) => String(w.id) === workId);
    const workName = String(work?.nombre || work?.name || "la obra");
    target.workId = workId;
    if (!esIngreso) target.type = "obra";
    fireAndForget(sendWhatsApp(from, "OK Listo, " + (esIngreso ? "el ingreso" : "el gasto") + " de $" + monto + " fue asignado a la obra " + workName + "."));
  } else if (buttonId === "assign_general") {
    target.workId = null;
    if (!esIngreso) target.type = "general";
    fireAndForget(sendWhatsApp(from, "OK Listo, " + (esIngreso ? "el ingreso" : "el gasto") + " de $" + monto + " quedo registrado como " + (esIngreso ? "ingreso sin obra" : "Gasto General") + "."));
  } else {
    console.warn("[GADU-WA-BUTTONS] boton desconocido:", buttonId);
    return;
  }

  /* 5) Guardar el JSON actualizado */
  const up = await rest("app_data?user_id=eq." + encodeURIComponent(userId), {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ data, updated_at: new Date().toISOString() }),
  });
  if (!up.ok) console.error("[GADU-WA-BUTTONS] fallo PATCH app_data:", up.status);
  else console.log("[GADU-WA-BUTTONS] gasto asignado OK:", buttonId);

  /* 6) Limpiar el estado WAITING_WORK */
  await deleteSession(normalizePhone(from));
}

/* ===== Procesamiento del mensaje (extraido del handler) ===== */
async function processMessage(body: unknown) {
  try {
    /* Mensajes interactivos (botones) -> asignar gasto pendiente */
    const btn = detectInteractive(body);
    if (btn) {
      await handleButtonReply(btn.from, btn.buttonId);
      return;
    }
    const resolved = await resolveIncomingText(body);
    if (!resolved) {
      console.warn("[whatsapp-webhook] payload no reconocido:", JSON.stringify(body));
      return;
    }

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
      fireAndForget(sendWhatsApp(resolved.from, "[BOT] No pude escuchar el audio, me lo escribis?"));
      return;
    }
    if (resolved.imageFailed) {
      console.warn("[GADU-WA-IMAGE] analisis de imagen fallo para", resolved.from);
      fireAndForget(sendWhatsApp(resolved.from, "[BOT] No pude leer la imagen, me escribis el gasto?"));
      return;
    }
    if (resolved.imageNoMonto) {
      console.warn("[GADU-WA-IMAGE] no se pudo leer el monto del ticket para", resolved.from);
      fireAndForget(sendWhatsApp(resolved.from, "[BOT] No pude leer el ticket. Me escribis el monto?"));
      return;
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
        fireAndForget(sendWhatsApp(inc.from, "[BOT] El codigo " + licenseCode + " no existe. Verificalo o pedilo de nuevo."));
        return json({ ok: false, error: "licencia no encontrada" });
      }
      const lic = rows[0];
      if (lic.is_used) {
        console.warn("[whatsapp-webhook] licencia ya usada:", licenseCode);
        fireAndForget(sendWhatsApp(inc.from, "[BOT] El codigo " + licenseCode + " ya fue utilizado."));
        return json({ ok: false, error: "licencia ya usada" });
      }
      console.log("[whatsapp-webhook] licencia valida:", licenseCode, "  plan:", lic.plan_id, " ", lic.duration_days, "dias");
      const reply = "OK El codigo " + licenseCode + " es valido (plan " + String(lic.plan_id).toUpperCase() + " por " + lic.duration_days + " dias).\n" +
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
        fireAndForget(sendWhatsApp(inc.from, "[BOT] El codigo no es valido o ya expiro. Volve a generarlo desde la app (Perfil -> Vincular WhatsApp -> Generar codigo) y envialo de nuevo."));
        return json({ ok: false, error: "codigo no encontrado o expirado" });
      }
      const row = rows[0];
      const wp = row.data?.settings?.profile?.whatsapp || {};
      if (!phoneMatches(wp.phone, inc.from)) {
        console.warn("[whatsapp-webhook] telefono no coincide: from=" + inc.from + " perfil=" + String(wp.phone));
        fireAndForget(sendWhatsApp(inc.from, "[BOT] El codigo es valido pero este numero no coincide con el telefono registrado en tu perfil."));
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

    /* 1b) Menu principal unificado: saludo + lista de opciones (igual que la web).
       Solo si el texto es un saludo/palabra clave y NO esta en medio de un wizard. */
    const menuText = String(inc.text || "").trim().toLowerCase();
    if (/^(hola|holis|holi|buenas|buen\s*d[ii]a|buenos\s*d[ii]as|menu|men[uu]|empezar|ayuda|help|inicio)\b/.test(menuText)) {
      try {
        const sessMenu = await getSession(normalizePhone(inc.from));
        if (!sessMenu || !sessMenu.state) {
          const opts = [
            { id: "action_nueva_obra", title: "Nueva Obra" },
            { id: "action_nuevo_gasto", title: "Cargar Gasto" },
            { id: "action_adelanto", title: "Pago / Adelanto" },
            { id: "action_presupuesto", title: "Presupuesto" },
            { id: "action_consulta", title: "Consultar Saldo" },
            { id: "action_contacto", title: "Nuevo Contacto / Directorio" },
            { id: "action_humano", title: "Hablar con humano" },
          ];
          fireAndForget(sendWhatsApp(inc.from, "Hola! Hola Soy tu asistente GADU. Que queres hacer hoy?"));
          await sendWhatsAppList(inc.from, "Elegi una opcion [abajo]", opts, { button: "Ver opciones", sectionTitle: "Menu" });
          return json({ ok: true, from: inc.from });
        }
      } catch (e) { /* si no hay sesion, seguimos normal */ }
    }

    /* 2) Usuario vinculado: busca por linkedPhone/phone (app_data) y por la
       columna canonica whatsapp_number (public.profiles), probando todas las
       variantes del numero (con/sin el 9, con/sin '+'). */
    const userId2 = await findUserId(inc.from);
    if (!userId2) {
      console.warn("[whatsapp-webhook] numero no vinculado:", inc.from);
      const rpl = "[BOT] No reconozco este numero. Primero vincula tu cuenta: desde la app genera tu codigo y envialo por WhatsApp.";
      fireAndForget(sendWhatsApp(inc.from, rpl));
      return json({ ok: false, error: "numero no vinculado", reply: rpl });
    }
    /* 2c) Recuperar el documento app_data del usuario encontrado */
    const rData = await rest("app_data?select=user_id,data&user_id=eq." + encodeURIComponent(userId2) + "&limit=1");
    const rowsData = await rData.json().catch(() => []);
    if (!Array.isArray(rowsData) || !rowsData.length) {
      console.warn("[whatsapp-webhook] usuario sin app_data:", userId2);
      const rpl = "[BOT] Encontre tu cuenta pero aun no tiene datos. Abri la app una vez para sincronizar y volve a intentarlo.";
      fireAndForget(sendWhatsApp(inc.from, rpl));
      return json({ ok: false, error: "sin app_data", reply: rpl });
    }
    const row = rowsData[0];
    const data = row.data || {};

    /* 2d) RESTAURAR: recuperar el ultimo registro de la papelera */
    if (String(inc.text || "").trim().toUpperCase() === "RESTAURAR") {
      const trash = Array.isArray(data.trash) ? data.trash : [];
      if (!trash.length) {
        fireAndForget(sendWhatsApp(inc.from, "[BOT] No hay registros para restaurar en tu papelera."));
        return json({ ok: true, from: inc.from });
      }
      const t = trash[0];   // el mas reciente (unshift)
      if (!t || !t.collection || !Array.isArray(data[t.collection])) {
        fireAndForget(sendWhatsApp(inc.from, "[BOT] No pude restaurar el registro."));
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
        fireAndForget(sendWhatsApp(inc.from, "[BOT] No pude restaurar el registro."));
        return json({ ok: false, error: "patch " + up.status });
      }
      console.log("[GADU-WA-RESTORE] restaurado:", t.collection, t.id);
      fireAndForget(sendWhatsApp(inc.from, "OK El registro " + tipo + (detalle ? "   " + detalle : "") + " ha sido recuperado con exito."));
      return json({ ok: true, from: inc.from });
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
          await rest("app_data?user_id=eq." + encodeURIComponent(row.user_id), {
            method: "PATCH",
            headers: { Prefer: "return=minimal" },
            body: JSON.stringify({ data, updated_at: new Date().toISOString() }),
          });
          await deleteSession(normalizePhone(inc.from));
          const reply = "OK " + resG.label;
          fireAndForget(sendWhatsApp(inc.from, reply));
          return json({ ok: true, from: inc.from, reply });
        }
        await deleteSession(normalizePhone(inc.from));
        fireAndForget(sendWhatsApp(inc.from, "[BOT] " + (resG.missing ? "Me falta " + resG.missing + "." : "No pude cargar el gasto.") + " Proba de nuevo: \"Gaste 5000 de nafta\"."));
        return json({ ok: true, from: inc.from, reply: "" });
      }
      if (localGasto && localGasto.modulo && localGasto.modulo !== "gasto") {
        /* El usuario cambio de idea: cancelar el wizard y dejar que la IA lo resuelva */
        await deleteSession(normalizePhone(inc.from));
        console.log("[GADU-WA-WIZARD] WAITING_GASTO cancelado, respuesta es:", localGasto.modulo);
      } else {
        fireAndForget(sendWhatsApp(inc.from, "[BOT] Decime el gasto, por ejemplo: \"Gaste 5000 de nafta\" o \"5000 de cemento\"."));
        return json({ ok: true, from: inc.from, reply: "" });
      }
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
        fireAndForget(sendWhatsApp(inc.from, "[BOT] Contame que queres incluir en el presupuesto y para que cliente."));
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
        fireAndForget(sendWhatsApp(inc.from, "[BOT] Que queres consultar? Saldo de una obra, gastos de la semana, etc."));
        return json({ ok: true, from: inc.from, reply: "" });
      }
      await deleteSession(normalizePhone(inc.from));   // la IA (QUERY_DATA) responde a continuacion
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
          await rest("app_data?user_id=eq." + encodeURIComponent(row.user_id), {
            method: "PATCH",
            headers: { Prefer: "return=minimal" },
            body: JSON.stringify({ data, updated_at: new Date().toISOString() }),
          });
          await deleteSession(normalizePhone(inc.from));
          const reply = "OK " + res.label;
          fireAndForget(sendWhatsApp(inc.from, reply));
          return json({ ok: true, from: inc.from, reply });
        }
        await deleteSession(normalizePhone(inc.from));
        fireAndForget(sendWhatsApp(inc.from, res.notFound || "[BOT] No pude cargarlo. Proba: \"Adelanto de Hugo de 12000\"."));
        return json({ ok: true, from: inc.from, reply: "" });
      }
      fireAndForget(sendWhatsApp(inc.from, "$ A que empleado y de cuanto es el adelanto? Ej: \"Hugo de 12000\"."));
      return json({ ok: true, from: inc.from, reply: "" });
    }

    /* [GADU-WA-WIZARD] Wizard de obra (estado WAITING_OBRA): nombre + direccion */
    let enWizardObra = false;
    try {
      const sessObra = await getSession(normalizePhone(inc.from));
      if (sessObra && sessObra.state === "WAITING_OBRA") enWizardObra = true;
    } catch (e) {}
    if (enWizardObra) {
      /* Si el usuario cambio de idea (dijo un gasto/adelanto/consulta en lugar del
         nombre de la obra), cancelar el wizard y dejar que la IA lo resuelva. */
      const localOtra = localIntent(inc.text);
      if (localOtra && localOtra.modulo && localOtra.modulo !== "obra") {
        await deleteSession(normalizePhone(inc.from));
        console.log("[GADU-WA-WIZARD] WAITING_OBRA cancelado, respuesta es:", localOtra.modulo);
      } else {
        const mObra = inc.text.match(/^(.*?)\s+en\s+(.+)$/i);
        const nombreObra = String(mObra ? mObra[1] : inc.text).trim();
        const ubicacionObra = String(mObra ? mObra[2] : "").trim();
        if (nombreObra) {
          const res = executeAction(data, { modulo: "obra", campos: { nombre: nombreObra, ubicacion: ubicacionObra } }, inc.text, () => crypto.randomUUID(), new Date().toISOString().slice(0, 10));
          if (res.ok) {
            await rest("app_data?user_id=eq." + encodeURIComponent(row.user_id), {
              method: "PATCH",
              headers: { Prefer: "return=minimal" },
              body: JSON.stringify({ data, updated_at: new Date().toISOString() }),
            });
            await deleteSession(normalizePhone(inc.from));
            const reply = "OK " + res.label;
            fireAndForget(sendWhatsApp(inc.from, reply));
            return json({ ok: true, from: inc.from, reply });
          }
          await deleteSession(normalizePhone(inc.from));
          fireAndForget(sendWhatsApp(inc.from, "[BOT] No pude crear la obra. Proba de nuevo: \"Casa Perez en Alta Gracia\"."));
          return json({ ok: true, from: inc.from, reply: "" });
        }
        fireAndForget(sendWhatsApp(inc.from, "[BOT] Como se llama la obra? Ej: \"Casa Perez en Alta Gracia\"."));
        return json({ ok: true, from: inc.from, reply: "" });
      }
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
        fireAndForget(sendWhatsApp(inc.from, "OK Carga cancelada. En que mas te ayudo?"));
        return json({ ok: true, from: inc.from, reply: "cancelado" });
      }
      if (!t) {
        fireAndForget(sendWhatsApp(inc.from, "[BOT] Cual es el nombre completo del contacto?"));
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
        fireAndForget(sendWhatsApp(inc.from, "OK Carga cancelada. En que mas te ayudo?"));
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
          type: contactType === "socio" ? "socio" : "cliente",
          phone, email: "", source: "whatsapp",
        });
      }
      await rest("app_data?user_id=eq." + encodeURIComponent(row.user_id), {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ data, updated_at: new Date().toISOString() }),
      });
      await deleteSession(normalizePhone(inc.from));
      const label = contactType === "empleado" ? "Empleado" : (contactType === "socio" ? "Socio" : "Cliente");
      fireAndForget(sendWhatsApp(inc.from, "OK Contacto guardado correctamente: " + label + " '" + name + "'."));
      return json({ ok: true, from: inc.from, reply: "contacto guardado" });
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
          fireAndForget(sendWhatsApp(inc.from, "[BOT] No pude generar el archivo. Proba de nuevo en unos minutos."));
        }
      } catch (e) {
        console.error("[GADU-WA-EXPORT] error generando excel:", e);
        fireAndForget(sendWhatsApp(inc.from, "[BOT] No pude generar el archivo. Proba de nuevo en unos minutos."));
      }
      return json({ ok: true, from: inc.from, reply: "excel" });
    }

    if (advIntent && !advIntent.nombre && advIntent.monto <= 0) {
      const reply = "$ Vamos a cargar el adelanto! Decime *a que empleado* y *de cuanto* es. Por ejemplo: \"Adelanto de Hugo de 12000\".";
      await upsertSession(inc.from, row.user_id, "WAITING_ADVANCE", {});
      fireAndForget(sendWhatsApp(inc.from, reply));
      return json({ ok: true, from: inc.from, reply });
    }

    const RECOGNIZED_MODULOS = ["saludo", "consulta", "presupuesto_pdf", "asistencia", "gasto", "ingreso", "empleado", "adelanto", "obra"];
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
      const reply = ((action as unknown) as { reply?: string }).reply || "Hola! Hola Soy GADU. En que te ayudo?";
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
      else reply = "[BOT] No entendi la consulta. Proba preguntando 'Cual es el saldo de la obra X?'";
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
        fireAndForget(sendWhatsApp(inc.from, "[BOT] Me faltan los items del presupuesto. Decimelos de nuevo, por ejemplo: \"20 m2 de ceramica, 3 bolsas de pegamento\"."));
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
        if (!up.ok) console.error("[GADU-WA-BUDGET] fallo PATCH app_data:", up.status);

        const pdf = await generateBudgetPDF({ cliente, items });
        const filename = "Presupuesto_" + String(cliente || "gadu").replace(/[^a-z0-9aeioun ]/gi, "").replace(/\s+/g, "_") + ".pdf";
        const ok = await sendWhatsAppDocument(inc.from, pdf, filename);
        const reply = ok
          ? "OK Presupuesto para " + cliente + " guardado y adjuntado. Podes verlo en la seccion 'Presupuestos' de la app."
          : "OK Presupuesto para " + cliente + " guardado. (No pude adjuntar el PDF, proba de nuevo.)";
        fireAndForget(sendWhatsApp(inc.from, reply));
        return json({ ok: true, from: inc.from, reply });
      } catch (e) {
        console.error("[GADU-WA-DOC] error generando PDF:", e);
        fireAndForget(sendWhatsApp(inc.from, "[ERROR] No pude generar el PDF. Proba de nuevo."));
        return json({ ok: true, from: inc.from, reply: "" });
      }
    }

    /* Registro de asistencia (REGISTER_ATTENDANCE) */
    if (action && action.modulo === "asistencia") {
      const c = (action.campos || {}) as Record<string, unknown>;
      const fecha = resolveFecha(String(c.fecha || "hoy"));
      const employees = Array.isArray(c.employees) ? c.employees : [];
      const registrados: Array<{ nombre: string; horas: number; workLabel: string }> = [];
      const noEncontrados: string[] = [];
      for (const e of employees) {
        const nombre = String((e as any).nombre || "").trim();
        const horas = Number((e as any).horas) || 0;
        if (!nombre || horas <= 0) continue;
        const emp = (data.employees || []).find((x: any) =>
          flatStr(String((x.firstName || "") + " " + (x.lastName || "")).trim()).includes(flatStr(nombre))
        );
        if (!emp) { noEncontrados.push(nombre); continue; }
        /* Resolver la obra (work) -> workId; si no se encuentra o no se dijo, null */
        const workName = String((e as any).work || "").trim();
        let workId: string | null = null;
        let workLabel = "";
        if (workName) {
          const w = (data.works || []).find((x: any) => flatStr(String(x.nombre || x.name || "")).includes(flatStr(workName)));
          if (w) { workId = String(w.id || ""); workLabel = String(w.nombre || w.name || workName); }
        }
        (data.attendance || (data.attendance = [])).push({
          id: crypto.randomUUID(), employeeId: String(emp.id || ""), date: fecha,
          status: "presente", hours: [{ workId, hours }], notes: "",
        });
        registrados.push({ nombre: String((emp.firstName || "") + " " + (emp.lastName || "")).trim(), horas, workLabel });
      }
      const up = await rest("app_data?user_id=eq." + encodeURIComponent(row.user_id), {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ data, updated_at: new Date().toISOString() }),
      });
      if (!up.ok) console.error("[GADU-WA-ATT] fallo PATCH app_data:", up.status);
      const partes = registrados.map(r => r.nombre + " (" + r.horas + "hs" + (r.workLabel ? " en " + r.workLabel : " sin obra asignada") + ")");
      let reply = "OK Asistencia registrada: " + (partes.join(", ") || "nadie") + ".";
      if (noEncontrados.length) reply += " (No encontre a " + noEncontrados.join(", ") + " en tu lista de empleados).";
      fireAndForget(sendWhatsApp(inc.from, reply));
      return json({ ok: true, from: inc.from, reply });
    }

    /* 4) Ejecutar la accion contable (gasto/ingreso) e impactar en app_data */
    if (action && ["gasto", "ingreso", "empleado", "adelanto", "obra"].includes(action.modulo)) {
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
        let reply = (aiReply ? aiReply + "\n\n" : "") + "OK " + res.label;
        /* Deep link + notificacion push: enlazar al gasto recien creado */
        if (action.modulo === "gasto") {
          const gasto = (data.expenses && data.expenses[0]) || null;
          if (gasto) {
            const gastoId = String(gasto.id || "");
            const monto = Number(gasto.amount) || 0;
            const cat = String(gasto.category || "gasto");
            if (gastoId) reply += "\n\n-> Ver en GADU: https://gestiongadu.vercel.app/#/gastos?id=" + gastoId;
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
      const reply = aiReply || (res.notFound ? res.notFound : "[BOT] Me falta " + (res.missing || "un dato") + " para cargarlo. Decimelo por aca.");
      fireAndForget(sendWhatsApp(inc.from, reply));
      return json({ ok: true, from: inc.from, reply });
    }

      /* 5) Fallback inteligente: ofrecer opciones en lugar de mandar a la web */
      const reply = aiReply || "[BOT] No estoy seguro de que queres hacer. Elegi una opcion [abajo]";
      fireAndForget(sendWhatsAppButtons(inc.from, reply, [
        { id: "fallback_gasto", title: "Cargar un Gasto" },
        { id: "fallback_adelanto", title: "Cargar un Adelanto" },
        { id: "fallback_humano", title: "Hablar con un humano" },
      ]));
      return json({ ok: true, from: inc.from, reply });
  } catch (error) {
    console.error("[GADU-WA-QUEUE-FIX] CRITICAL ERROR en processMessage:", error);
    throw error;   //  propagar para que drainPhone lo marque como fallido y siga
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
        await sendWhatsApp(item.phone, "[BOT] Fallo el procesamiento, reintenta o escribelo por texto.");
      } catch (e2) {
        console.error("[GADU-WA-CRITICAL-FIX] no se pudo notificar el fallo:", e2);
      }
      console.log("[GADU-WA-CRITICAL-FIX] mensaje", item.id, "marcado como fallido, sigo con el siguiente");
    }
    item = await claimNext(rest, phone);
  }
}
