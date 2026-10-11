-- ============================================================
-- GADU SaaS v2 · Usuarios con login y datos separados
-- Cómo usarlo:
--   1) Supabase → SQL Editor → New query → pegá TODO esto → Run.
--   2) En Authentication → Providers → Email: desactivá
--      "Confirm email" (para que el registro sea inmediato).
--   3) Para activar un cliente (cobro manual): Table Editor →
--      tabla "profiles" → fila del usuario → plan = 'pro',
--      paid_until = fecha del próximo vencimiento.
--      Planes: 'prueba' (14 días) · 'pro' · 'suspendido'
-- ============================================================

-- Borra la tabla vieja de sincronización (v1, sin usuarios)
drop table if exists public.app_data;

-- Perfil de cada usuario: plan y vencimientos
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  plan text not null default 'prueba',
  trial_start timestamptz default now(),
  trial_end timestamptz default (now() + interval '14 days'),
  paid_until timestamptz,
  created_at timestamptz default now()
);

-- Datos de la app: UNA fila por usuario (todo el JSON de su gestión)
create table if not exists public.app_data (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz default now(),
  unique (user_id)
);

create index if not exists app_data_user_idx on public.app_data (user_id);

-- ============================================================
-- SEGURIDAD: cada usuario solo ve y escribe SUS filas
-- ============================================================
alter table public.profiles enable row level security;
alter table public.app_data enable row level security;

create policy "perfil_propio" on public.profiles
  for select using (user_id = auth.uid());

create policy "datos_propios_select" on public.app_data
  for select using (user_id = auth.uid());
create policy "datos_propios_insert" on public.app_data
  for insert with check (user_id = auth.uid());
create policy "datos_propios_update" on public.app_data
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ============================================================
-- Crear el perfil automáticamente cuando alguien se registra
-- ============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (user_id, email)
  values (new.id, new.email)
  on conflict (user_id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- Utilidad para el administrador: ver clientes y estados
-- ============================================================
create or replace view public.v_clientes as
select
  p.user_id, p.email, p.plan,
  p.trial_end, p.paid_until, p.created_at,
  a.updated_at as ultima_sincronizacion
from public.profiles p
left join public.app_data a on a.user_id = p.user_id;

-- (La vista v_clientes la ves en Table Editor → v_clientes,
--  o consultala con: select * from public.v_clientes;)
