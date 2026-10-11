-- ============================================================
-- GADU SaaS v6 · Onboarding obligatorio (Plan Free) + datos de perfil
-- EJECUTAR SOBRE LA v5. Supabase → SQL Editor → pegar TODO → Run.
-- ============================================================

-- Campos de perfilamiento del usuario (se piden al primer ingreso Free)
alter table public.profiles
  add column if not exists telefono text,
  add column if not exists direccion text,
  add column if not exists nacionalidad text,
  add column if not exists rubro text,
  add column if not exists onboarding_completo boolean not null default false;
