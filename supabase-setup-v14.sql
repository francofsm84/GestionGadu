-- ============================================================
-- GADU SaaS v14 · Columnas de perfil faltantes (v7) + backfill
-- Diagnóstico: la v7 no se ejecutó → el INSERT principal del trigger
-- fallaba por columnas inexistentes (latitud, longitud, localidad, perfil_tipo).
-- EJECUTAR SOBRE LA v13. (Idempotente.)
-- ============================================================

alter table public.profiles
  add column if not exists latitud text,
  add column if not exists longitud text,
  add column if not exists localidad text,
  add column if not exists empresa_constructora text,
  add column if not exists rubro_principal text,
  add column if not exists perfil_tipo text,
  add column if not exists obras_simultaneas int,
  add column if not exists tamano_equipo text;

-- Backfill nombre para usuarios existentes (desde metadata de Google o email)
update public.profiles p
set nombre = coalesce(
  nullif(trim(u.raw_user_meta_data->>'full_name'), ''),
  nullif(trim(u.raw_user_meta_data->>'name'), ''),
  split_part(p.email, '@', 1)
)
from auth.users u
where p.user_id = u.id and p.nombre is null;

-- Migrar datos viejos a las columnas nuevas
update public.profiles set empresa_constructora = empresa where empresa_constructora is null and empresa is not null;
update public.profiles set rubro_principal = rubro where rubro_principal is null and rubro is not null;
update public.profiles set localidad = nacionalidad where localidad is null and nacionalidad is not null;

notify pgrst, 'reload schema';
