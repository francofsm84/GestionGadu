-- ============================================================
-- GADU SaaS v5 · Planes editables, 4 planes oficiales y trial_ends_at
-- EJECUTAR SOBRE LA v4. Supabase → SQL Editor → pegar TODO → Run.
-- ============================================================

-- 1) CORRECCIÓN: permitir que los administradores editen los planes
--    (la v3 solo tenía política de lectura → el "Guardar" fallaba)
drop policy if exists "planes_admin_update" on public.planes;
create policy "planes_admin_update" on public.planes
  for update using (es_admin()) with check (es_admin());
drop policy if exists "planes_admin_insert" on public.planes;
create policy "planes_admin_insert" on public.planes
  for insert with check (es_admin());

-- 2) Los 4 planes oficiales (upsert idempotente)
insert into public.planes (id, nombre, precio_mensual, precio_anual, limite_obras_activas, limite_empleados, caracteristicas, orden) values
  ('free',    'Free',    0,      0,       1,   3,   '["1 obra activa","3 empleados","Herramientas y seguros","Respaldos locales"]', 1),
  ('pro',     'Pro',     5000,   50000,   2,   10,  '["2 obras activas","10 empleados","Sincronización en la nube","Soporte por WhatsApp"]', 2),
  ('pyme',    'Pyme',    20000,  200000,  5,   20,  '["5 obras activas","20 empleados","Roles de equipo","Soporte prioritario"]', 3),
  ('empresa', 'Empresa', 50000,  500000,  999, 999, '["Obras ilimitadas","Empleados ilimitados","Soporte dedicado"]', 4)
on conflict (id) do update set
  nombre = excluded.nombre,
  precio_mensual = excluded.precio_mensual,
  precio_anual = excluded.precio_anual,
  limite_obras_activas = excluded.limite_obras_activas,
  limite_empleados = excluded.limite_empleados,
  caracteristicas = excluded.caracteristicas,
  orden = excluded.orden;

-- 3) Periodo de prueba explícito en el usuario (trial_ends_at)
alter table public.profiles add column if not exists trial_ends_at timestamptz default (now() + interval '14 days');
update public.profiles set trial_ends_at = trial_end where trial_ends_at is null and trial_end is not null;
update public.profiles set trial_ends_at = now() + interval '14 days' where trial_ends_at is null;
