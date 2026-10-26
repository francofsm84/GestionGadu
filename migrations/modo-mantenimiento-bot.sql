-- ============================================================
-- GADU · FASE 2 — Modo Mantenimiento (Kill Switch Global)
-- Pausa el Bot de WhatsApp respondiendo un mensaje fijo.
-- ============================================================

ALTER TABLE public.negocio
  ADD COLUMN IF NOT EXISTS mantenimiento_activo boolean NOT NULL DEFAULT false;
