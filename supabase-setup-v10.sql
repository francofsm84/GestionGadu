-- ============================================================
-- GADU SaaS v10 · Configuración dinámica + conversión + cobro
-- EJECUTAR SOBRE LA v9. Supabase → SQL Editor → pegar TODO → Run.
-- ============================================================

-- 1) Configuración SaaS ampliada (cerebro del sistema)
alter table public.negocio
  add column if not exists trial_dias int not null default 45,
  add column if not exists modo_mantenimiento boolean not null default false,
  add column if not exists banner_global text;

-- 2) Credenciales de cobro (Mercado Pago) — SOLO administradores
create table if not exists public.credenciales_pago (
  id int primary key default 1,
  mp_public_key text,
  mp_access_token text,
  updated_at timestamptz default now()
);
insert into public.credenciales_pago (id) values (1) on conflict do nothing;

alter table public.credenciales_pago enable row level security;
drop policy if exists "cp_admin_select" on public.credenciales_pago;
create policy "cp_admin_select" on public.credenciales_pago for select using (es_admin());
drop policy if exists "cp_admin_write" on public.credenciales_pago;
create policy "cp_admin_write" on public.credenciales_pago for update using (es_admin()) with check (es_admin());
drop policy if exists "cp_admin_insert" on public.credenciales_pago;
create policy "cp_admin_insert" on public.credenciales_pago for insert with check (es_admin());

-- 3) Hook de primer ingreso: usa la duración de trial configurable
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_rol text; v_plan text; v_empresa text; v_trial_dias int;
begin
  select i.rol, i.plan_id, i.empresa
    into v_rol, v_plan, v_empresa
    from public.invitaciones i
    where lower(i.email) = lower(new.email)
    order by i.created_at desc
    limit 1;

  select coalesce(trial_dias, 45) into v_trial_dias from public.negocio where id = 1;

  insert into public.profiles (user_id, email, rol, plan_id, empresa, subscription_status, estado_cuenta, trial_end, trial_ends_at)
  values (
    new.id, new.email,
    coalesce(v_rol, 'gestor_obra'),
    coalesce(v_plan, 'free'),
    coalesce(v_empresa, ''),
    'trialing', 'activo',
    now() + make_interval(days => v_trial_dias),
    now() + make_interval(days => v_trial_dias)
  )
  on conflict (user_id) do nothing;

  delete from public.invitaciones where lower(email) = lower(new.email);
  return new;
end $$;

-- 4) Métricas: agregar % de conversión trial → pago
create or replace function public.metricas()
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'mrr', coalesce((select sum(p.precio_mensual) from public.profiles u join public.planes p on p.id = u.plan_id
                     where u.estado_cuenta = 'activo' and u.subscription_status in ('active','trialing')), 0),
    'arr', coalesce((select sum(p.precio_anual) from public.profiles u join public.planes p on p.id = u.plan_id
                     where u.estado_cuenta = 'activo' and u.subscription_status in ('active','trialing')), 0),
    'usuarios', (select count(*) from public.profiles),
    'activos', (select count(*) from public.profiles where estado_cuenta = 'activo'),
    'past_due', (select count(*) from public.profiles where subscription_status = 'past_due' or estado_cuenta = 'suspendido'),
    'obras', (select coalesce(sum(jsonb_array_length(a.data->'works')), 0) from public.app_data a),
    'conversion', (
      select round(100.0 * count(*) filter (where subscription_status = 'active')
        / nullif(count(*) filter (where subscription_status in ('active','trialing','past_due','canceled')), 0), 1)
      from public.profiles
    ),
    'por_plan', (
      select coalesce(jsonb_object_agg(p.nombre, coalesce(c.cnt, 0)), '{}'::jsonb)
      from public.planes p
      left join (select plan_id, count(*) as cnt from public.profiles group by plan_id) c on c.plan_id = p.id
    )
  );
$$;

notify pgrst, 'reload schema';
