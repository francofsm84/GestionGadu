-- ============================================================
-- GADU SaaS v7 · Columnas de perfil ampliadas + refresh de caché
-- EJECUTAR SOBRE LA v6. Supabase → SQL Editor → pegar TODO → Run.
-- Soluciona: "Could not find the 'direccion' column ... in the schema cache"
-- ============================================================

alter table public.profiles
  add column if not exists direccion text,
  add column if not exists latitud text,
  add column if not exists longitud text,
  add column if not exists localidad text,
  add column if not exists telefono text,
  add column if not exists empresa_constructora text,
  add column if not exists rubro_principal text,
  add column if not exists perfil_tipo text,
  add column if not exists obras_simultaneas int,
  add column if not exists tamano_equipo text;

-- Migrar datos de las columnas viejas a las nuevas (backward-compat)
update public.profiles set empresa_constructora = empresa where empresa_constructora is null and empresa is not null;
update public.profiles set rubro_principal = rubro where rubro_principal is null and rubro is not null;
update public.profiles set localidad = nacionalidad where localidad is null and nacionalidad is not null;

-- Refrescar la caché del esquema de PostgREST (clave para que reconozca
-- las columnas nuevas al instante y desaparezca el error de "schema cache")
notify pgrst, 'reload schema';
