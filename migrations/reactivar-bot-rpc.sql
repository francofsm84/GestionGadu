-- ============================================================
-- GADU · RPC para reactivar el bot (quitar la pausa de soporte)
-- Lo llama el Panel de Admin desde la pestaña Soporte.
-- ============================================================
CREATE OR REPLACE FUNCTION public.reactivar_bot(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.whatsapp_sessions
  SET is_paused = false, paused_until = null, updated_at = now()
  WHERE user_id = p_user_id;
END;
$$;
