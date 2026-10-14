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
      return { from: normalizePhone(String(p.from)), text: String(p.text).trim() };
    }
    const entry = (p.entry as Array<Record<string, unknown>>)?.[0];
    const value = entry?.changes?.[0]?.value as Record<string, unknown>;
    const msg = (value?.messages as Array<Record<string, unknown>>)?.[0];
    if (!msg) return null;
    const from = (value?.contacts as Array<Record<string, unknown>>)?.[0]?.wa_id
      || value?.metadata?.display_phone_number
      || "";
    let text = "";
    if (msg.type === "text") {
      text = String((msg.text as Record<string, unknown>)?.body || "");
    } else if (msg.type === "voice" || msg.type === "audio") {
      /* La transcripción llega del proveedor/puente (requisito del flujo) */
      text = String((msg.transcription as Record<string, unknown>)?.text || "");
    }
    if (!String(text).trim()) return null;
    return { from: normalizePhone(String(from)), text: String(text).trim() };
  } catch (_e) {
    return null;
  }
}

/* Extrae el código de verificación del mensaje.
   Soporta el formato actual del botón "Vincular WhatsApp" ("Código: 99DKFR",
   alfanumérico) y el formato histórico ("código de verificación: 123456").
   Devuelve el código SIEMPRE en mayúsculas para comparar de forma estable. */
export function matchVerificationCode(text: string): string | null {
  const m = String(text || "").match(/c[oó]digo(?:\s+de\s+verificaci[oó]n)?:?\s*([A-Z0-9]{4,10})/i);
  return m ? m[1].toUpperCase() : null;
}

export function normalizePhone(p: unknown): string {
  return String(p == null ? "" : p).replace(/\D/g, "");
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
  return String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
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
export function normCategory(raw: string): string {
  const f = flat(String(raw || ""));
  if (!f) return "";
  if (/cemento|material|arena|ladrillo|hierro|pintura|yeso|cal|cer[aá]mic/.test(f)) return "Materiales";
  if (/nafta|gasoil|combustible|gas|diesel/.test(f)) return "Combustible";
  if (/flete|cami[oó]n|transporte|acarreo/.test(f)) return "Fletes";
  if (/comida|almuerzo|vianda|asado|bebida/.test(f)) return "Comidas";
  if (/mano de obra|jornal|pe[oó]n|ayudante|oficial/.test(f)) return "Mano de obra";
  if (/herramienta|equipo|m[aá]quina|alquiler/.test(f)) return "Herramientas / Equipamiento";
  if (/seguro|art|p[oó]liza/.test(f)) return "Seguros";
  if (/servicio|luz|agua|internet|tel[eé]fono|gas natural/.test(f)) return "Servicios";
  if (/subcontrat|contratista/.test(f)) return "Subcontratos";
  return String(raw).trim();
}

export interface ExecResult {
  ok: boolean;
  label?: string;
  missing?: string;      // dato faltante para pedirlo por chat
  unsupported?: string;  // módulo que el conector no ejecuta (lo responde la IA)
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
    const cat = normCategory(String(c.categoria || sourceText));
    if (!cat) return { ok: false, missing: "la categoría" };
    const ob = resolveObra();
    if (ob.missing) return { ok: false, missing: ob.missing };
    (d.expenses || (d.expenses = [])).unshift({
      id: idGen(), type: "obra", workId: ob.workId, date: todayISO, amount: monto,
      category: cat, providerId: null, employeeId: null, expenseKind: null,
      description: String(sourceText || "").slice(0, 200), invoiceNumber: "", paymentMethod: "", source: "whatsapp",
    } as unknown as Record<string, unknown>);
    return { ok: true, label: "Gasto de $" + monto + " (" + cat + ") en " + ob.label + " ✓" };
  }
  if (action.modulo === "ingreso") {
    if (!(monto > 0)) return { ok: false, missing: "el monto" };
    const concepto = ["Adelanto", "Certificación", "Cobro"].find(x => flat(String(c.concepto || "")).includes(flat(x))) || "Cobro";
    const ob = resolveObra();
    if (ob.missing) return { ok: false, missing: ob.missing };
    (d.incomes || (d.incomes = [])).unshift({
      id: idGen(), workId: ob.workId, clientId: null, date: todayISO, amount: monto,
      concept: concepto, method: "", reference: "", notes: String(sourceText || "").slice(0, 200),
      incomeKind: concepto === "Adelanto" ? "adelanto" : "pago", source: "whatsapp",
    } as unknown as Record<string, unknown>);
    return { ok: true, label: "Ingreso de $" + monto + " (" + concepto + ") en " + ob.label + " ✓" };
  }
  /* Módulos con wizard complejo: los responde la IA guiando a la app web */
  return { ok: false, unsupported: action.modulo };
}
