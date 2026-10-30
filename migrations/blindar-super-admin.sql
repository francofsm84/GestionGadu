-- ============================================================
-- GADU · Blindaje del Super Admin (Franco Maldonado)
-- Impide que cualquier UPDATE degrade el rol de super_admin.
-- ============================================================

-- 1) Función: si la fila actualizada es la de Franco, forzar super_admin
CREATE OR REPLACE FUNCTION public.blindar_super_admin()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.email = 'francofsm84@gmail.com' THEN
    NEW.rol := 'super_admin';
  END IF;
  RETURN NEW;
END;
$$;

-- 2) Trigger: se dispara BEFORE UPDATE cuando se intenta cambiar la columna rol
DROP TRIGGER IF EXISTS trg_blindar_super_admin ON public.profiles;
CREATE TRIGGER trg_blindar_super_admin
BEFORE UPDATE OF rol ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.blindar_super_admin();
