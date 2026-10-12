-- ============================================================
-- GADU SaaS v16 · Corregir auditoría de usuarios
-- Hallazgo: auditoria_insert exigía es_admin(), por lo que las
-- acciones de usuarios normales no se registraban (403 silencioso).
-- Fix: permitir que cada usuario autenticado registre SUS acciones,
--       con user_id asignado por defecto a auth.uid().
-- EJECUTAR SOBRE LA v15. (Idempotente.)
-- ============================================================

alter table public.auditoria alter column user_id set default auth.uid();

drop policy if exists "auditoria_insert" on public.auditoria;
create policy "auditoria_insert" on public.auditoria
  for insert with check (user_id = auth.uid() or es_admin());

notify pgrst, 'reload schema';
