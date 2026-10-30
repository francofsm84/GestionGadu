-- ============================================================
-- GADU · Nueva estructura de 4 planes (Free + 3 pagos) + downgrade
-- ============================================================

-- 1) Free Básico: gratis, 1 obra, 3 empleados
UPDATE public.planes
SET nombre = 'Free', precio_mensual = 0, precio_semestral = 0, precio_anual = 0,
    limite_obras_activas = 1, limite_empleados = 3
WHERE id = 'free_basico';

-- 2) Plan 1: $5.000 (trimestral), 2 obras, 10 empleados
UPDATE public.planes
SET precio_mensual = 5000, precio_semestral = 9000, precio_anual = 16000,
    limite_obras_activas = 2, limite_empleados = 10
WHERE id = 'pro';

-- 3) Plan 2: $20.000 (trimestral), 5 obras, 20 empleados
UPDATE public.planes
SET precio_mensual = 20000, precio_semestral = 36000, precio_anual = 64000,
    limite_obras_activas = 5, limite_empleados = 20
WHERE id = 'pyme';

-- 4) Plan 3: $50.000 (trimestral), ilimitado
UPDATE public.planes
SET precio_mensual = 50000, precio_semestral = 90000, precio_anual = 160000,
    limite_obras_activas = 999, limite_empleados = 999
WHERE id = 'empresa';

-- 5) RPC de downgrade seguro a Free Básico (desbloquea al usuario sin pagar).
--    Usa la bandera gadu.canje_autorizado para sortear el trigger blindar_perfil.
CREATE OR REPLACE FUNCTION public.downgrade_to_free()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sin sesión activa');
  END IF;

  perform set_config('gadu.canje_autorizado', 'true', true);
  UPDATE public.profiles
  SET plan_id = 'free_basico',
      subscription_status = 'active',
      estado_cuenta = 'activo',
      trial_end = null,
      trial_ends_at = null
  WHERE user_id = v_uid;
  perform set_config('gadu.canje_autorizado', 'false', true);

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.downgrade_to_free() TO authenticated;
