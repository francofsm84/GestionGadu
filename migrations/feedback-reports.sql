-- ============================================================
-- GADU · FASE 1 — Buzón de Feedback (Reportes)
-- ============================================================

-- 1) Tabla de reportes
CREATE TABLE IF NOT EXISTS public.feedback_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'open',   -- 'open' | 'closed'
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 2) Trigger: autocompleta user_id con auth.uid()
CREATE OR REPLACE FUNCTION public.set_feedback_user_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  NEW.user_id := coalesce(NEW.user_id, auth.uid());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_feedback_user_id ON public.feedback_reports;
CREATE TRIGGER trg_feedback_user_id
  BEFORE INSERT ON public.feedback_reports
  FOR EACH ROW EXECUTE FUNCTION public.set_feedback_user_id();

-- 3) RLS: el usuario inserta lo suyo; admin/super_admin lee y actualiza todo
ALTER TABLE public.feedback_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "feedback_insert" ON public.feedback_reports;
CREATE POLICY "feedback_insert" ON public.feedback_reports
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "feedback_admin_select" ON public.feedback_reports;
CREATE POLICY "feedback_admin_select" ON public.feedback_reports
  FOR SELECT USING (es_admin());

DROP POLICY IF EXISTS "feedback_admin_update" ON public.feedback_reports;
CREATE POLICY "feedback_admin_update" ON public.feedback_reports
  FOR UPDATE USING (es_admin()) WITH CHECK (es_admin());
