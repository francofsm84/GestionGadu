-- ============================================================
-- GADU · Blindaje del Super Admin (Franco Maldonado) — fail-safe
-- ============================================================
-- Trigger BEFORE UPDATE que impide degradar la cuenta principal.
-- Cualquier intento de cambiar el rol (frontend, Supabase o bug)
-- se ignora: el rol de francofsm84@gmail.com SIEMPRE será super_admin.

-- 1) Función SECURITY DEFINER (corre con privilegios del owner, no falla por RLS)
CREATE OR REPLACE FUNCTION public.blindar_super_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.email = 'francofsm84@gmail.com' THEN
    NEW.rol := 'super_admin';
  END IF;
  RETURN NEW;
END;
$$;

-- 2) Trigger: se dispara BEFORE UPDATE (en cualquier columna). Si la fila es
--    la de Franco, re-afirma super_admin sin tocar el resto de los campos.
DROP TRIGGER IF EXISTS trg_blindar_super_admin ON public.profiles;
CREATE TRIGGER trg_blindar_super_admin
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.blindar_super_admin();

-- 3) Verificación (opcional): el rol debe seguir siendo super_admin
-- SELECT user_id, email, rol FROM public.profiles WHERE email = 'francofsm84@gmail.com';
