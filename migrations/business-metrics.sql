-- ============================================================
-- GADU · Métricas de Negocio (uso real de la plataforma)
-- RPC get_business_metrics() · solo super_admin
-- ============================================================

-- Helper super_admin (idempotente, por si se ejecuta este archivo solo)
CREATE OR REPLACE FUNCTION public.es_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid() AND p.rol = 'super_admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.get_business_metrics()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total_users bigint;
  v_active_today bigint;
  v_total_works bigint;
  v_total_expenses bigint;
  v_wa_today bigint;
BEGIN
  IF NOT public.es_super_admin() THEN
    RAISE EXCEPTION 'sin permisos';
  END IF;

  SELECT count(*) INTO v_total_users FROM public.profiles;

  SELECT count(*) INTO v_active_today
  FROM public.app_data
  WHERE updated_at::date = CURRENT_DATE;

  SELECT coalesce(sum(
    CASE WHEN jsonb_typeof(coalesce(data->'works', '[]'::jsonb)) = 'array'
         THEN jsonb_array_length(data->'works')
         ELSE 0 END
  ), 0) INTO v_total_works
  FROM public.app_data;

  SELECT coalesce(sum(
    CASE WHEN jsonb_typeof(coalesce(data->'expenses', '[]'::jsonb)) = 'array'
         THEN jsonb_array_length(data->'expenses')
         ELSE 0 END
  ), 0) INTO v_total_expenses
  FROM public.app_data;

  SELECT count(*) INTO v_wa_today
  FROM public.whatsapp_queue
  WHERE created_at::date = CURRENT_DATE;

  RETURN json_build_object(
    'total_users', v_total_users,
    'active_users_today', v_active_today,
    'total_works', v_total_works,
    'total_expenses', v_total_expenses,
    'wa_messages_today', v_wa_today
  );
END;
$$;
