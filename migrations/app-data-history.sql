-- ============================================================
-- GADU · Recuperación ante desastres — Historial de app_data
-- Cada UPDATE de app_data.data guarda el estado ANTERIOR.
-- ============================================================

-- 1) Tabla de historial
CREATE TABLE IF NOT EXISTS public.app_data_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS app_data_history_user_idx
  ON public.app_data_history (user_id, created_at DESC);

-- 2) Trigger: guarda el estado anterior en cada UPDATE (solo si cambió data)
CREATE OR REPLACE FUNCTION public.log_app_data_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF (OLD.data IS DISTINCT FROM NEW.data) THEN
    INSERT INTO public.app_data_history (user_id, data)
    VALUES (OLD.user_id, OLD.data);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_app_data_history ON public.app_data;
CREATE TRIGGER trg_app_data_history
  AFTER UPDATE ON public.app_data
  FOR EACH ROW
  EXECUTE FUNCTION public.log_app_data_history();

-- 3) RLS: solo admin/super_admin puede leer el historial
ALTER TABLE public.app_data_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "app_data_history_admin" ON public.app_data_history;
CREATE POLICY "app_data_history_admin" ON public.app_data_history
  FOR SELECT
  USING (es_admin());
