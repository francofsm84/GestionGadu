// ============================================================
// GADU · notificar-registro
// Envía a Telegram (Super Admin) los nuevos registros pendientes.
//
// - Lee de public.notificaciones_registros donde procesado = false
// - Envía un mensaje por cada uno al chat del admin
// - Marca procesado = true (idempotente, no reenvía)
//
// Configuración (secrets del proyecto):
//   TELEGRAM_BOT_TOKEN   → token del bot (de @BotFather)
//   TELEGRAM_CHAT_ID     → id del chat del Super Admin
//
// Se dispara por cron/Webhook (ver README al pie).
// ============================================================
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function escapeMd(s) {
  return String(s == null ? "" : s)
    .replace(/([_*[\]()~`>#+\-=|{}.!])/g, "\\$1");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
    const chatId = Deno.env.get("TELEGRAM_CHAT_ID");

    if (!botToken || !chatId) {
      return new Response(
        JSON.stringify({ ok: false, error: "Telegram no configurado (faltan TELEGRAM_BOT_TOKEN o TELEGRAM_CHAT_ID)" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 1) Leer notificaciones pendientes (bypassa RLS con service_role)
    const listRes = await fetch(
      `${supabaseUrl}/rest/v1/notificaciones_registros?procesado=eq.false&select=id,email,nombre,empresa,fecha,creado_en&order=creado_en.asc`,
      {
        headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
      },
    );
    if (!listRes.ok) {
      return new Response(
        JSON.stringify({ ok: false, error: "No se pudo leer notificaciones: " + listRes.status }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const pendientes = await listRes.json();

    let enviados = 0;
    for (const n of pendientes || []) {
      const lineas = [
        "🆕 *Nuevo registro en GADU*",
        `👤 Nombre: ${n.nombre || "—"}`,
        `🏢 Empresa: ${n.empresa || "—"}`,
        `📧 Email: ${n.email || "—"}`,
        `📅 Fecha: ${n.fecha || (n.creado_en ? String(n.creado_en).slice(0, 19).replace("T", " ") : "—")}`,
      ];
      const text = lineas.map(escapeMd).join("\n");

      const tg = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: "MarkdownV2" }),
      });

      if (tg.ok) {
        // Marcar como procesado (evita reenvíos)
        await fetch(`${supabaseUrl}/rest/v1/notificaciones_registros?id=eq.${n.id}`, {
          method: "PATCH",
          headers: {
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
            "Content-Type": "application/json",
            Prefer: "return=minimal",
          },
          body: JSON.stringify({ procesado: true }),
        });
        enviados++;
      } else {
        console.error(`[notificar-registro] Telegram falló (${tg.status}):`, await tg.text());
      }
    }

    return new Response(
      JSON.stringify({ ok: true, enviados, pendientes: (pendientes || []).length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[notificar-registro] error:", e);
    return new Response(
      JSON.stringify({ ok: false, error: String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
