-- ============================================================
-- GADU · Unicidad de teléfono en el registro
-- Impide que un mismo número de teléfono quede vinculado a más
-- de una cuenta (crítico para la asociación del bot de WhatsApp).
-- ============================================================

-- 1) Índice único sobre el teléfono NORMALIZADO (solo dígitos).
--    "+54 9 3547 66-1122" y "5493547661122" se consideran el mismo número.
--    Solo aplica a teléfonos no vacíos (los vacíos quedan libres).
CREATE UNIQUE INDEX IF NOT EXISTS profiles_telefono_normalizado_unique
ON public.profiles (regexp_replace(telefono, '[^0-9]', '', 'g'))
WHERE telefono IS NOT NULL AND trim(telefono) <> '';

-- 2) RPC de validación previa al alta (llamable SIN sesión, con anon key).
--    Devuelve true si el número ya está registrado.
CREATE OR REPLACE FUNCTION public.telefono_registrado(p_telefono text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_norm text;
BEGIN
  v_norm := regexp_replace(coalesce(p_telefono, ''), '[^0-9]', '', 'g');
  IF v_norm = '' OR length(v_norm) < 6 THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE regexp_replace(telefono, '[^0-9]', '', 'g') = v_norm
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.telefono_registrado(text) TO anon, authenticated;

-- 3) (Diagnóstico) Ver duplicados existentes ANTES de crear el índice único.
--    Si esto devuelve filas, hay que resolverlos manualmente porque el índice
--    fallará al crearse. Copiá este query y ejecutalo aparte si el índice falla:
-- SELECT regexp_replace(telefono, '[^0-9]', '', 'g') AS tel_norm, count(*), array_agg(email)
-- FROM public.profiles
-- WHERE telefono IS NOT NULL AND trim(telefono) <> ''
-- GROUP BY 1 HAVING count(*) > 1;
