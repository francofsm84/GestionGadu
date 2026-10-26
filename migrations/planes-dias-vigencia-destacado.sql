-- ============================================================
-- GADU · FASE 2 — Editor completo de planes
-- `dias_vigencia` → vigencia del plan (90 por defecto)
-- `destacado`     → badge "Más elegido"
-- ============================================================

-- 1) Vigencia por plan (Trimestral 90, Semestral 180, Anual 365 → se usa
--    el precio_* correspondiente al período elegido)
ALTER TABLE public.planes
  ADD COLUMN IF NOT EXISTS dias_vigencia int NOT NULL DEFAULT 90;

-- 2) Destacado (badge "Más elegido")
ALTER TABLE public.planes
  ADD COLUMN IF NOT EXISTS destacado boolean NOT NULL DEFAULT false;

-- 3) Marcar PRO como destacado por defecto
UPDATE public.planes SET destacado = true WHERE id = 'pro';

-- 4) Vigencia de referencia (todas 90 días; la facturación multi-período usa
--    precio_mensual=trimestral, precio_semestral=semestral, precio_anual=anual)
UPDATE public.planes SET dias_vigencia = 90 WHERE dias_vigencia IS NULL OR dias_vigencia = 0;
