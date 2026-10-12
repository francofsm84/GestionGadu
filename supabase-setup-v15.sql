-- ============================================================
-- GADU SaaS v15 · Crear tabla "invitaciones" (faltante)
-- Causa raíz: el trigger handle_new_user consulta public.invitaciones,
-- que NO existía (la v4 nunca se ejecutó) → "Database error saving new user".
-- EJECUTAR SOBRE LA v14. (Idempotente.)
-- ============================================================

create table if not exists public.invitaciones (
  email text primary key,
  rol text not null default 'gestor_obra',
  plan_id text default 'free',
  empresa text,
  estado text not null default 'pendiente',
  created_at timestamptz default now()
);

alter table public.invitaciones enable row level security;

drop policy if exists "invitaciones_admin_select" on public.invitaciones;
create policy "invitaciones_admin_select" on public.invitaciones for select using (es_admin());
drop policy if exists "invitaciones_admin_insert" on public.invitaciones;
create policy "invitaciones_admin_insert" on public.invitaciones for insert with check (es_admin());
drop policy if exists "invitaciones_admin_update" on public.invitaciones;
create policy "invitaciones_admin_update" on public.invitaciones for update using (es_admin()) with check (es_admin());
drop policy if exists "invitaciones_admin_delete" on public.invitaciones;
create policy "invitaciones_admin_delete" on public.invitaciones for delete using (es_admin());

-- Re-asegurar permisos del trigger
grant execute on function public.handle_new_user() to service_role, postgres, authenticated;

notify pgrst, 'reload schema';
