/* Regresión: núcleo del conector de WhatsApp (core.ts) */
import {
  parseIncoming,
  matchVerificationCode,
  phoneMatches,
  workLabel,
  findWork,
  normCategory,
  buildContext,
  executeAction,
} from "../supabase/functions/whatsapp-webhook/core.ts";

let ok = 0, ko = 0;
function okk(cond: boolean, label: string) { if (cond) { ok++; console.log("  ✔ " + label); } else { ko++; console.log("  ✘ " + label); } }
const idGen = (() => { let n = 0; return () => "t" + (++n); })();
const today = "2026-10-13";

/* 1 · parseIncoming */
const simple = parseIncoming({ from: "+54 9 3547 55-1234", text: "Gasté 15000 en cemento" });
okk(simple !== null && simple.from === "5493547551234" && simple.text.startsWith("Gasté"), "payload simple {from,text}");
const meta = parseIncoming({
  entry: [{ changes: [{ value: {
    contacts: [{ wa_id: "5493547469000" }],
    messages: [{ type: "text", text: { body: "Hola GADU" } }],
  } }] }],
});
okk(meta !== null && meta.from === "5493547469000" && meta.text === "Hola GADU", "payload Meta Cloud API (texto)");
const voz = parseIncoming({
  entry: [{ changes: [{ value: {
    contacts: [{ wa_id: "5493547469000" }],
    messages: [{ type: "voice", transcription: { text: "gasté 15000 en bolsas de cemento" } }],
  } }] }],
});
okk(voz !== null && voz.text.includes("bolsas de cemento"), "payload Meta Cloud API (nota de voz transcrita)");
okk(parseIncoming({ from: "", text: "" }) === null, "payload vacío → null");

/* 2 · Código de verificación (alfanumérico actual + histórico numérico) */
okk(matchVerificationCode("GADU · Mi código de verificación: 123456") === "123456", "código histórico detectado");
okk(matchVerificationCode("GADU · Mi código de verificación 654321") === "654321", "código histórico sin dos puntos");
okk(matchVerificationCode("GADU · Vincular WhatsApp · Código: 99DKFR · Teléfono: +5493547469000") === "99DKFR", "código alfanumérico del botón Vincular WhatsApp");
okk(matchVerificationCode("Código: 99dkfr") === "99DKFR", "código alfanumérico en minúscula → se normaliza a mayúsculas");
okk(matchVerificationCode("Hola, cómo va") === null, "sin código → null");

/* 3 · phoneMatches */
okk(phoneMatches("+54 9 3547 55-1234", "5493547551234") === true, "teléfono coincide (últimos 9 dígitos)");
okk(phoneMatches("+54 9 3547 55-1234", "5491111111111") === false, "teléfono distinto → false");
okk(phoneMatches("", "5493547551234") === true, "sin teléfono en perfil → acepta por código");

/* 4 · workLabel / findWork */
okk(workLabel({ name: "casa angel" }) === "casa angel", "workLabel name");
okk(workLabel({ nombreObra: "pileta" }) === "pileta", "workLabel nombreObra");
okk(workLabel({ name: "undefined" }) === "", "workLabel rechaza 'undefined'");
const works = [
  { id: "w1", name: "casa pablo", code: "OB-1", status: "activa" },
  { id: "w2", name: "quinta lopez", code: "OB-2", status: "activa" },
];
okk(findWork(works, "casa pablo")?.id === "w1", "findWork por nombre exacto");
okk(findWork(works, "la obra de pablo")?.id === "w1", "findWork por mención parcial");

/* 5 · normCategory */
okk(normCategory("bolsas de cemento") === "Materiales", "cemento → Materiales");
okk(normCategory("nafta") === "Combustible", "nafta → Combustible");
okk(normCategory("flete") === "Fletes", "flete → Fletes");

/* 6 · executeAction: gasto completo con obra nombrada */
const data1: Record<string, unknown> = { works, incomes: [], expenses: [] };
const r1 = executeAction(data1, { modulo: "gasto", campos: { monto: 15000, categoria: "bolsas de cemento", obra: "casa pablo" } }, "Gasté 15000 en bolsas de cemento", idGen, today);
okk(r1.ok === true && (data1.expenses as unknown[]).length === 1, "gasto impactado en expenses");
const exp1 = (data1.expenses as Record<string, unknown>[])[0] as Record<string, unknown>;
okk(exp1.workId === "w1" && exp1.amount === 15000 && exp1.category === "Materiales" && exp1.source === "whatsapp", "expense con obra, monto, categoría y origen");

/* 7 · executeAction: obra única activa → auto-asignación (misma regla del chat) */
const data2: Record<string, unknown> = { works: [{ id: "w9", name: "unica", status: "activa" }], expenses: [] };
const r2 = executeAction(data2, { modulo: "gasto", campos: { monto: 5000, categoria: "nafta" } }, "Gasté 5000 en nafta", idGen, today);
okk(r2.ok === true && ((data2.expenses as Record<string, unknown>[])[0] as Record<string, unknown>).workId === "w9", "obra única → auto-asignada");

/* 8 · executeAction: varias obras sin especificar → pide la obra, no guarda */
const data3: Record<string, unknown> = { works, expenses: [] };
const r3 = executeAction(data3, { modulo: "gasto", campos: { monto: 2000, categoria: "comida" } }, "Gasté 2000 en comida", idGen, today);
okk(r3.ok === false && r3.missing === "la obra" && (data3.expenses as unknown[]).length === 0, "sin obra entre varias → pide la obra sin guardar");

/* 9 · executeAction: ingreso con adelanto */
const data4: Record<string, unknown> = { works, incomes: [] };
const r4 = executeAction(data4, { modulo: "ingreso", campos: { monto: 80000, concepto: "Adelanto", obra: "quinta lopez" } }, "Ingresé 80000 de adelanto", idGen, today);
const inc1 = (data4.incomes as Record<string, unknown>[])[0] as Record<string, unknown>;
okk(r4.ok === true && inc1.workId === "w2" && inc1.amount === 80000 && inc1.concept === "Adelanto" && inc1.incomeKind === "adelanto", "ingreso adelanto impactado");

/* 10 · módulo no ejecutable → unsupported */
const r5 = executeAction(data1, { modulo: "obra", campos: { nombre: "x" } }, "crear obra x", idGen, today);
okk(r5.ok === false && r5.unsupported === "obra", "módulos complejos → los responde la IA");

/* 11 · buildContext */
const ctx = buildContext({ works, contacts: [{ type: "cliente", name: "Familia Rossi" }], employees: [{ firstName: "Juan", lastName: "Pérez" }], assets: [{ name: "Amoladora", status: "operativo" }] });
okk(ctx.includes("casa pablo") && ctx.includes("Familia Rossi") && ctx.includes("Juan Pérez") && ctx.includes("Amoladora"), "contexto compacto de la cuenta");

console.log("\n──────────────────────────");
if (ko === 0) { console.log("✔ WHATSAPP CORE PASADO (" + ok + " checks)"); process.exit(0); }
else { console.log("✘ " + ko + " fallos de " + (ok + ko)); process.exit(1); }
