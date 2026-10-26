-- ============================================================
-- GADU · FASE 1 — Renombrar "Trial" → "Prueba" + días de prueba dinámicos
-- ============================================================

-- 1) Renombrar el plan de prueba en la tabla planes
UPDATE public.planes SET nombre = 'Prueba' WHERE id = 'free';

-- 2) Asegurar que el plan de prueba sea gratuito e ilimitado
--    (la duración de la prueba la controla public.negocio.trial_dias)
UPDATE public.planes
SET precio_mensual = 0,
    precio_anual = 0,
    limite_obras_activas = 999,
    limite_empleados = 999
WHERE id = 'free';

-- 3) Asegurar que la configuración de negocio tenga trial_dias (defecto 45)
UPDATE public.negocio SET trial_dias = 45 WHERE id = 1 AND trial_dias IS NULL;

-- 4) Por si la columna no existe en instalaciones viejas
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'negocio' AND column_name = 'trial_dias') THEN
    ALTER TABLE public.negocio ADD COLUMN trial_dias int NOT NULL DEFAULT 45;
  END IF;
END $$;
