-- ============================================================
-- GADU · MercadoPago (API de Orders) · Fase 2: tabla de órdenes
-- ============================================================
-- Nota: reemplaza a mercadopago_payments (Fase 1, que usaba la API de
-- Preferences). Con la API de Orders guardamos order_id + checkout_url.

CREATE TABLE IF NOT EXISTS public.mercadopago_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id text NOT NULL,
  periodo text NOT NULL,             -- trimestral | semestral | anual
  amount numeric NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  order_id text,
  checkout_url text,
  external_reference text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.mercadopago_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY mpo_select_own ON public.mercadopago_orders
  FOR SELECT USING (user_id = auth.uid() OR public.es_admin());

CREATE POLICY mpo_insert_own ON public.mercadopago_orders
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY mpo_update_own ON public.mercadopago_orders
  FOR UPDATE USING (user_id = auth.uid() OR public.es_admin())
  WITH CHECK (user_id = auth.uid() OR public.es_admin());

CREATE POLICY mpo_delete_own ON public.mercadopago_orders
  FOR DELETE USING (user_id = auth.uid() OR public.es_admin());
