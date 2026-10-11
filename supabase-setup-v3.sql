-- ============================================================
-- GADU SaaS v3 · Suscripciones, Planes, Admin y Auditoría
-- EJECUTAR SOBRE LA v2 (ya tenés profiles + app_data creados).
-- Supabase → SQL Editor → pegar TODO → Run.
-- ============================================================

-- 1) Catálogo de planes de suscripción
create table if not exists public.planes (
  id text primary key,
  nombre text not null,
  precio_mensual numeric default 0,
  precio_anual numeric default 0,
  limite_obras_activas int default 1,
  limite_empleados int default 3,
  caracteristicas jsonb default '[]',
  activo boolean default true,
  orden int default 0
);

insert into public.planes (id, nombre, precio_mensual, precio_anual, limite_obras_activas, limite_empleados, caracteristicas, orden) values
  ('free',    'Free',    0,      0,       1,   3,   '["1 obra activa","3 empleados","Herramientas y seguros","Respaldos locales"]', 1),
  ('pro',     'Pro',     5000,   50000,   10,  20,  '["10 obras activas","20 empleados","Sincronización en la nube","Soporte por WhatsApp"]', 2),
  ('empresa', 'Empresa', 15000,  150000,  999, 999, '["Obras ilimitadas","Empleados ilimitados","Roles de equipo","Soporte prioritario"]', 3)
on conflict (id) do update set
  nombre = excluded.nombre, precio_mensual = excluded.precio_mensual, precio_anual = excluded.precio_anual,
  limite_obras_activas = excluded.limite_obras_activas, limite_empleados = excluded.limite_empleados,
  caracteristicas = excluded.caracteristicas, orden = excluded.orden;

-- 2) Ampliar profiles (usuarios/empresas) con roles, plan y cobranza
alter table public.profiles
  add column if not exists rol text not null default 'gestor_obra',
  add column if not exists plan_id text references public.planes(id) default 'free',
  add column if not exists subscription_status text not null default 'trialing',
  add column if not exists subscription_end_date timestamptz,
  add column if not exists gateway_customer_id text,
  add column if not exists estado_cuenta text not null default 'activo',
  add column if not exists empresa text,
  add column if not exists ultima_conexion timestamptz;

-- 3) Historial de pagos / facturación
create table if not exists public.pagos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  plan_id text,
  fecha timestamptz default now(),
  monto numeric default 0,
  comprobante text,
  estado text default 'pagado',
  created_at timestamptz default now()
);

-- 4) Auditoría del sistema
create table if not exists public.auditoria (
  id bigserial primary key,
  user_id uuid,
  accion text not null,
  detalle text,
  fecha timestamptz default now()
);

-- 5) Configuración general del negocio
create table if not exists public.negocio (
  id int primary key default 1,
  nombre text default 'GADU Construye',
  telefono text default '',
  direccion text default '',
  datos_fiscales text default '',
  moneda text default 'ARS',
  updated_at timestamptz default now()
);
insert into public.negocio (id) values (1) on conflict do nothing;

-- 6) Función: ¿el usuario actual es administrador?
create or replace function public.es_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid() and p.rol in ('super_admin','admin')
  );
$$;

-- 7) Seguridad (RLS)
alter table public.planes enable row level security;
create policy "planes_lectura" on public.planes for select using (true);

alter table public.profiles enable row level security;
drop policy if exists "perfil_propio" on public.profiles;
create policy "perfil_select" on public.profiles for select using (user_id = auth.uid() or es_admin());
create policy "perfil_update_propio" on public.profiles for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "perfil_admin_update" on public.profiles for update using (es_admin()) with check (es_admin());
create policy "perfil_insert" on public.profiles for insert with check (user_id = auth.uid() or es_admin());
create policy "perfil_admin_delete" on public.profiles for delete using (es_admin());

alter table public.pagos enable row level security;
create policy "pagos_select" on public.pagos for select using (user_id = auth.uid() or es_admin());
create policy "pagos_insert" on public.pagos for insert with check (user_id = auth.uid() or es_admin());

alter table public.auditoria enable row level security;
create policy "auditoria_select" on public.auditoria for select using (es_admin() or user_id = auth.uid());
create policy "auditoria_insert" on public.auditoria for insert with check (es_admin());

alter table public.negocio enable row level security;
create policy "negocio_select" on public.negocio for select using (true);
create policy "negocio_admin" on public.negocio for update using (es_admin());

-- app_data: el admin puede leer todas las filas (para métricas)
drop policy if exists "datos_propios_select" on public.app_data;
create policy "datos_propios_select" on public.app_data for select using (user_id = auth.uid() or es_admin());

-- 8) Métricas del sistema (RPC para el panel admin)
create or replace function public.metricas()
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'mrr', coalesce((select sum(p.precio_mensual) from public.profiles u join public.planes p on p.id = u.plan_id
                     where u.estado_cuenta = 'activo' and u.subscription_status in ('active','trialing')), 0),
    'usuarios', (select count(*) from public.profiles),
    'activos', (select count(*) from public.profiles where estado_cuenta = 'activo'),
    'past_due', (select count(*) from public.profiles where subscription_status = 'past_due' or estado_cuenta = 'suspendido'),
    'obras', (select coalesce(sum(jsonb_array_length(a.data->'works')), 0) from public.app_data a),
    'por_plan', (select coalesce(jsonb_object_agg(s.nombre, s.cnt), '{}'::jsonb)
                 from (select coalesce(p2.nombre, 'Free') as nombre, count(u.user_id) as cnt
                       from public.profiles u left join public.planes p2 on p2.id = u.plan_id
                       group by p2.nombre) s)
  );
$$;

-- Actualizar última conexión al leer el perfil (helper, lo llama la app)
create or replace function public.touch_conexion()
returns void language sql security definer set search_path = public as $$
  update public.profiles set ultima_conexion = now() where user_id = auth.uid();
$$;
