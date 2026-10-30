-- ============================================================
-- GADU · MercadoPago (Checkout Pro) · Fase 1: tabla + RLS
-- ============================================================

-- 1) Tabla de pagos de MercadoPago
CREATE TABLE IF NOT EXISTS public.mercadopago_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id text NOT NULL,
  periodo text NOT NULL,             -- trimestral | semestral | anual
  amount numeric NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  preference_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 2) RLS: solo el dueño ve sus pagos; los admin/super_admin ven todos
ALTER TABLE public.mercadopago_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY mp_select_own ON public.mercadopago_payments
  FOR SELECT USING (user_id = auth.uid() OR public.es_admin());

CREATE POLICY mp_insert_own ON public.mercadopago_payments
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY mp_update_own ON public.mercadopago_payments
  FOR UPDATE USING (user_id = auth.uid() OR public.es_admin())
  WITH CHECK (user_id = auth.uid() OR public.es_admin());

CREATE POLICY mp_delete_own ON public.mercadopago_payments
  FOR DELETE USING (user_id = auth.uid() OR public.es_admin());
