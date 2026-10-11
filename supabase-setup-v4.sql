-- ============================================================
-- GADU SaaS v4 · Invitaciones/pre-registro + alta robusta de usuarios
-- EJECUTAR SOBRE LA v3. Supabase → SQL Editor → pegar TODO → Run.
-- Resuelve:
--   1) Asignación automática de rol/plan al primer ingreso (Google).
--   2) Pre-registro de invitados por email (antes de que inicien sesión).
-- ============================================================

-- 1) Invitaciones pendientes (un admin las crea antes del primer login)
create table if not exists public.invitaciones (
  email text primary key,
  rol text not null default 'gestor_obra',
  plan_id text default 'free',
  empresa text,
  estado text not null default 'pendiente',
  created_at timestamptz default now()
);

-- 2) Solo administradores ven/gestionan invitaciones
alter table public.invitaciones enable row level security;
create policy "invitaciones_admin_select" on public.invitaciones for select using (es_admin());
create policy "invitaciones_admin_insert" on public.invitaciones for insert with check (es_admin());
create policy "invitaciones_admin_update" on public.invitaciones for update using (es_admin()) with check (es_admin());
create policy "invitaciones_admin_delete" on public.invitaciones for delete using (es_admin());

-- 3) Hook de primer ingreso (reemplaza al de la v2):
--    - Crea el perfil con rol/plan por defecto.
--    - Si existía una invitación para ese email, usa el rol/plan/empresa pre-asignados.
--    - Elimina la invitación consumida.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_rol text; v_plan text; v_empresa text;
begin
  select i.rol, i.plan_id, i.empresa
    into v_rol, v_plan, v_empresa
    from public.invitaciones i
    where lower(i.email) = lower(new.email)
    order by i.created_at desc
    limit 1;

  insert into public.profiles (user_id, email, rol, plan_id, empresa, subscription_status, estado_cuenta)
  values (
    new.id,
    new.email,
    coalesce(v_rol, 'gestor_obra'),
    coalesce(v_plan, 'free'),
    coalesce(v_empresa, ''),
    'trialing',
    'activo'
  )
  on conflict (user_id) do nothing;

  delete from public.invitaciones where lower(email) = lower(new.email);
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 4) Asegurar que los usuarios YA existentes tengan plan/rol por defecto
--    (migración de datos, solo si quedaron vacíos)
update public.profiles set rol = 'gestor_obra' where rol is null;
update public.profiles set plan_id = 'free' where plan_id is null;
update public.profiles set subscription_status = 'trialing' where subscription_status is null;
update public.profiles set estado_cuenta = 'activo' where estado_cuenta is null;
