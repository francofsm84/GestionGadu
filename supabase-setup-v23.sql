-- ============================================================
-- GADU SaaS v23 · Corrección de acentos + límites del trial
--   - El plan 'free' (Trial 45 días) pasa a límites ILIMITADOS
--     (999 obras, 999 empleados) para que el usuario pruebe todo.
--   - Corrige los nombres con acentos usando chr() (evita
--     problemas de encoding al ejecutar el SQL por API).
-- EJECUTAR SOBRE LA v22. (Idempotente.)
-- ============================================================

update public.planes
  set nombre = 'Trial (45 d' || chr(237) || 'as)',
      limite_obras_activas = 999,
      limite_empleados = 999
  where id = 'free';

update public.planes
  set nombre = 'Free B' || chr(225) || 'sico'
  where id = 'free_basico';

notify pgrst, 'reload schema';
