-- ============================================================
-- GADU · Configuración de Supabase para la sincronización
-- Cómo usarlo:
--   1) Entrá a https://supabase.com/dashboard y abrí tu proyecto.
--   2) Andá a "SQL Editor" → "New query".
--   3) Pegá TODO este archivo y tocá "Run".
--   4) Listo: la app ya puede sincronizar con tu proyecto.
-- ============================================================

-- Tabla donde se guarda una fila por "código de sincronización"
create table if not exists public.app_data (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz default now()
);

-- Índice para que la consulta por fecha sea rápida
create index if not exists app_data_updated_idx on public.app_data (updated_at desc);

-- Acceso desde la app (sin login): la fila queda protegida porque
-- su "id" incluye el código de sincronización que solo vos conocés.
-- (La anon public key es pública por diseño; no se usa para guardar secretos.)
alter table public.app_data disable row level security;

-- Alternativa más estricta (opcional): en vez de la línea anterior,
-- podés dejar RLS activado y crear una política abierta así:
--   alter table public.app_data enable row level security;
--   create policy "acceso_con_codigo" on public.app_data
--     for all using (true) with check (true);
