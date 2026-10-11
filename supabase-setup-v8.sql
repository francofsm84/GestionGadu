-- ============================================================
-- GADU SaaS v8 · Blindaje admin + trial de 45 días
-- EJECUTAR SOBRE LA v7. Supabase → SQL Editor → pegar TODO → Run.
-- ============================================================

-- 1) Blindaje absoluto: un trigger fuerza que las cuentas admin/super_admin
--    estén SIEMPRE activas, con plan máximo (Empresa) y sin prueba/trial.
create or replace function public.blindar_admin()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.rol in ('super_admin', 'admin') then
    new.plan_id := coalesce((select id from public.planes where nombre = 'Empresa' limit 1), 'empresa');
    new.subscription_status := 'active';
    new.estado_cuenta := 'activo';
    new.trial_end := null;
    new.trial_ends_at := null;
  end if;
  return new;
end $$;

drop trigger if exists profiles_blindar_admin on public.profiles;
create trigger profiles_blindar_admin
  before insert or update on public.profiles
  for each row execute function public.blindar_admin();

-- Corregir YA las cuentas admin existentes (por si quedaron mal)
update public.profiles
set subscription_status = 'active',
    estado_cuenta = 'activo',
    plan_id = coalesce((select id from public.planes where nombre = 'Empresa' limit 1), 'empresa'),
    trial_end = null,
    trial_ends_at = null
where rol in ('super_admin', 'admin');

-- 2) Período de prueba: 45 días (antes 14)
alter table public.profiles alter column trial_end set default (now() + interval '45 days');
alter table public.profiles alter column trial_ends_at set default (now() + interval '45 days');

-- 3) Hook de primer ingreso: trial de 45 días + admin hereda plan máximo activo
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

  insert into public.profiles (user_id, email, rol, plan_id, empresa, subscription_status, estado_cuenta, trial_end, trial_ends_at)
  values (
    new.id,
    new.email,
    coalesce(v_rol, 'gestor_obra'),
    coalesce(v_plan, 'free'),
    coalesce(v_empresa, ''),
    'trialing',
    'activo',
    now() + interval '45 days',
    now() + interval '45 days'
  )
  on conflict (user_id) do nothing;

  delete from public.invitaciones where lower(email) = lower(new.email);
  return new;
end $$;

-- Refrescar caché del esquema
notify pgrst, 'reload schema';
