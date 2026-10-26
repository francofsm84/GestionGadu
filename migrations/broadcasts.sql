-- ============================================================
-- GADU · FASE 1 — Centro de Anuncios (Broadcast)
-- Tabla de historial + RPC de registro (el envío real se hace en FASE 2)
-- ============================================================

-- 1) Tabla de anuncios
CREATE TABLE IF NOT EXISTS public.broadcasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  message text NOT NULL,
  target text NOT NULL DEFAULT 'todos',   -- 'todos' | 'prueba' | 'pagos'
  status text NOT NULL DEFAULT 'pending', -- 'pending' | 'sent' | 'failed'
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 2) RPC que registra el anuncio y devuelve el id.
--    (FASE 2: acá se engancha el envío real por WhatsApp/push)
CREATE OR REPLACE FUNCTION public.enviar_broadcast(
  p_title text,
  p_message text,
  p_target text
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.broadcasts (title, message, target, status)
  VALUES (p_title, p_message, p_target, 'sent')
  RETURNING id INTO v_id;

  RETURN json_build_object('ok', true, 'id', v_id);
END;
$$;

-- 3) Permisos: solo admin/super_admin puede leer el historial
ALTER TABLE public.broadcasts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "broadcasts_admin" ON public.broadcasts;
CREATE POLICY "broadcasts_admin" ON public.broadcasts
  FOR ALL
  USING (public.es_admin())
  WITH CHECK (public.es_admin());
