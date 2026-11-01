-- ============================================================
-- GADU · Actualización de precios 2026 (trimestral / semestral / anual)
-- Ratificado 2026-10-31.
--   PRO     trimestral $30.000  · semestral $50.000  · anual $100.000
--   PYME    trimestral $50.000  · semestral $100.000 · anual $200.000
--   Empresa trimestral $150.000 · semestral $250.000 · anual $500.000
--
-- Convención de columnas (ver migrations/precios-trimestral-semestral-anual.sql):
--   precio_mensual    = trimestral (90 días)
--   precio_semestral  = semestral (180 días)
--   precio_anual      = anual (365 días)
--
-- Los planes "free" / "Prueba" no se tocan (mantienen 0 = Gratis).
-- ============================================================

UPDATE public.planes SET precio_mensual = 30000,  precio_semestral = 50000,  precio_anual = 100000 WHERE id = 'pro';
UPDATE public.planes SET precio_mensual = 50000,  precio_semestral = 100000, precio_anual = 200000 WHERE id = 'pyme';
UPDATE public.planes SET precio_mensual = 150000, precio_semestral = 250000, precio_anual = 500000 WHERE id = 'empresa';

-- Verificación (debe devolver los valores de arriba):
-- SELECT id, nombre, precio_mensual, precio_semestral, precio_anual FROM public.planes ORDER BY orden;
