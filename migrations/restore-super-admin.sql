-- ============================================================
-- GADU · Restaurar rol de Super Admin (Franco Maldonado)
-- ============================================================
-- Ejecutar en el SQL Editor de Supabase.

BEGIN;

-- 1. Autorizamos el cambio temporalmente para que el trigger de
--    seguridad (blindar_perfil) no lo bloquee.
SELECT set_config('gadu.canje_autorizado', 'true', true);

-- 2. Restauramos el rol de Super Admin.
UPDATE public.profiles
SET rol = 'super_admin'
WHERE email = 'francofsm84@gmail.com';

COMMIT;
