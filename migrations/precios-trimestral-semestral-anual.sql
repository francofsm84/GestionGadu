-- ============================================================
-- GADU · FASE 1 — Precios Trimestral / Semestral / Anual
-- `precio_mensual`  → ahora representa el precio Trimestral (90 días)
-- `precio_semestral`→ precio Semestral (180 días) — NUEVO
-- `precio_anual`    → precio Anual (365 días) — ya existe, se normaliza
-- ============================================================

-- 1) Columna semestral (si no existe)
ALTER TABLE public.planes
  ADD COLUMN IF NOT EXISTS precio_semestral numeric NOT NULL DEFAULT 0;

-- 2) Normalizar precio_anual por si es nulo en instalaciones viejas
ALTER TABLE public.planes
  ALTER COLUMN precio_anual SET DEFAULT 0;

-- 3) Inicializar con descuentos estándar:
--    Semestral ≈ 1.8× el trimestral · Anual ≈ 3.2× el trimestral
UPDATE public.planes
SET precio_semestral = ROUND(precio_mensual * 1.8)
WHERE precio_semestral = 0 AND precio_mensual > 0;

UPDATE public.planes
SET precio_anual = ROUND(precio_mensual * 3.2)
WHERE (precio_anual IS NULL OR precio_anual = 0) AND precio_mensual > 0;

-- 4) Valores de referencia (ejemplo PRO)
--    Trimestral $60.000 · Semestral $110.000 · Anual $200.000
UPDATE public.planes
SET precio_mensual = 60000, precio_semestral = 110000, precio_anual = 200000
WHERE id = 'pro' AND precio_mensual = 0;
