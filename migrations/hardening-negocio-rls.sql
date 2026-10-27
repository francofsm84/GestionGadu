-- ============================================================
-- GADU · Hardening RLS — Auditoría de seguridad
-- Hallazgo: `negocio` usaba `for select using (true)`, lo que
-- exponía datos fiscales y de configuración a CUALQUIER llamador,
-- incluso sin sesión (con la anon key embebida en el frontend).
-- Corrección: restringir la lectura a usuarios autenticados.
-- ============================================================

alter table public.negocio enable row level security;

drop policy if exists "negocio_select" on public.negocio;
create policy "negocio_select_auth" on public.negocio
  for select
  using (auth.uid() is not null);

-- La escritura ya estaba protegida por es_admin(): se mantiene intacta.
