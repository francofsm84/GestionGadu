-- ============================================================
-- GADU · Consentimiento legal (Términos y Privacidad)
-- ============================================================

-- 1) Columnas de aceptación de términos en perfiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS terms_version text NOT NULL DEFAULT 'v1.0';

-- 2) RPC de aceptación (segura, sortea blindar_perfil)
CREATE OR REPLACE FUNCTION public.accept_terms()
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
  SET terms_accepted_at = now(),
      terms_version = 'v1.0'
  WHERE user_id = v_uid;
  perform set_config('gadu.canje_autorizado', 'false', true);

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_terms() TO authenticated;
