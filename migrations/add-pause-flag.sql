-- ============================================================
-- GADU · Flag de pausa por soporte humano en whatsapp_sessions
-- ------------------------------------------------------------
-- is_paused = true  → el bot NO responde automáticamente
-- paused_until      → (opcional) marca de tiempo de la pausa
-- ============================================================
ALTER TABLE public.whatsapp_sessions
  ADD COLUMN IF NOT EXISTS is_paused boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS paused_until timestamptz;
