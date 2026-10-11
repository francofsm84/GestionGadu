-- ============================================================
-- GADU SaaS v13 · Fallback de perfil desde el frontend
-- IMPORTANTE: en GADU la tabla de usuarios es "public.profiles"
--             (NO existe "public.usuarios"). El trigger inserta en profiles.
-- EJECUTAR SOBRE LA v12. Supabase → SQL Editor → pegar TODO → Run.
-- ============================================================

-- Permitir que un usuario autenticado inserte/actualice SU propia fila de
-- perfil (usado por el fallback ensureUserProfile() del frontend). Sin esta
-- política, el upsert desde el cliente da 403 por RLS.
drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert with check (user_id = auth.uid());

-- Re-asegurar permisos de ejecución del trigger
grant execute on function public.handle_new_user() to service_role, postgres, authenticated;

notify pgrst, 'reload schema';
