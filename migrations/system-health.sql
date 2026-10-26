-- ============================================================
-- GADU · FASE 3 — Salud del Sistema (System Health)
-- RPC get_system_health() → JSON con métricas en tiempo real
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_system_health()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_db_size_mb numeric;
  v_queue_pending bigint;
  v_queue_processing bigint;
  v_push_tokens bigint;
  v_broadcasts_today bigint;
BEGIN
  -- Solo admin / super_admin
  IF NOT public.es_admin() THEN
    RAISE EXCEPTION 'sin permisos';
  END IF;

  -- Tamaño de la base de datos (MB)
  SELECT round(pg_database_size(current_database()) / 1024.0 / 1024.0, 1) INTO v_db_size_mb;

  -- Cola de WhatsApp
  SELECT count(*) INTO v_queue_pending FROM public.whatsapp_queue WHERE status = 'pending';
  SELECT count(*) INTO v_queue_processing FROM public.whatsapp_queue WHERE status = 'processing';

  -- Suscripciones push activas
  SELECT count(*) INTO v_push_tokens FROM public.push_subscriptions;

  -- Anuncios enviados hoy
  SELECT count(*) INTO v_broadcasts_today FROM public.broadcasts WHERE created_at::date = CURRENT_DATE;

  RETURN json_build_object(
    'db_size_mb', v_db_size_mb,
    'queue_pending', v_queue_pending,
    'queue_processing', v_queue_processing,
    'push_tokens', v_push_tokens,
    'broadcasts_today', v_broadcasts_today
  );
END;
$$;
