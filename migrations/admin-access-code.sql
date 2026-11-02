-- ============================================================
-- GADU · Segundo factor para /admin (llave de acceso de 25 chars)
-- Guarda el hash SHA-256 de la llave (nunca en texto plano) y expone
-- un RPC SECURITY DEFINER que la valida del lado del servidor.
-- El cliente solo recibe { ok: true/false }.
--
-- NOTA Supabase: pgcrypto se instala en el schema `extensions`, no en
-- `public`. Por eso las llamadas usan `extensions.digest(...)` explícito
-- (el search_path de la función es `public`).
-- ============================================================

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.admin_config (
  id int primary key default 1,
  access_code_hash text,
  updated_at timestamptz default now()
);

alter table public.admin_config enable row level security;

-- Solo admin/super_admin puede leer/escribir la config
drop policy if exists admin_config_all on public.admin_config;
create policy admin_config_all on public.admin_config
  for all using (public.es_admin()) with check (public.es_admin());

insert into public.admin_config (id) values (1) on conflict (id) do nothing;

-- RPC de verificación (server-side): valida rol + hash del código
create or replace function public.verify_admin_code(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_rol text;
  v_hash text;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'Sin sesion activa');
  end if;
  select rol into v_rol from public.profiles where user_id = v_uid;
  if v_rol not in ('admin', 'super_admin') then
    return jsonb_build_object('ok', false, 'error', 'Acceso restringido');
  end if;
  select access_code_hash into v_hash from public.admin_config where id = 1;
  if v_hash is null or v_hash = '' then
    return jsonb_build_object('ok', false, 'error', 'Llave no configurada');
  end if;
  if encode(extensions.digest(trim(coalesce(p_code, '')), 'sha256'), 'hex') = v_hash then
    return jsonb_build_object('ok', true);
  end if;
  return jsonb_build_object('ok', false, 'error', 'Llave incorrecta');
end $$;

grant execute on function public.verify_admin_code(text) to authenticated;

-- ─────────────────────────────────────────────────────────────
-- CONFIGURAR LA LLAVE (hash SHA-256 de 25 caracteres).
-- La de ejemplo A7#k9-Xm2P!qZ8#v4Lw-3Yx$p ya tiene su hash calculado:
--
-- update public.admin_config
--   set access_code_hash = '7b744a81011d3838c24284fa25fcc8bdbefa9cb827d2ac1b900d10167ae233c4',
--       updated_at = now()
--   where id = 1;
--
-- Para otra llave, calculá el hash con:
--   select encode(extensions.digest('TU-LLAVE-DE-25-CHARS', 'sha256'), 'hex');
-- ─────────────────────────────────────────────────────────────
