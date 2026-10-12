-- ============================================================
-- GADU SaaS v17 · Supabase Realtime para app_data
-- Habilita la tabla app_data en la publicación "supabase_realtime"
-- para que los cambios se transmitan en tiempo real entre
-- dispositivos del MISMO usuario (PC <-> móvil).
-- EJECUTAR SOBRE LA v16. (Idempotente.)
-- ============================================================

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'app_data'
  ) then
    alter publication supabase_realtime add table public.app_data;
  end if;
end $$;
