-- ============================================================
-- GADU SaaS v21 · Códigos de licencia REALES (tabla)
--   Reemplaza la validación por prefijo (mock) por una tabla
--   de códigos emitidos, de un solo uso, con expiración.
--   El RPC canjear_codigo ahora valida contra esta tabla.
-- EJECUTAR SOBRE LA v20. (Idempotente.)
-- ============================================================

-- 1) Tabla de códigos de licencia (solo admin)
create table if not exists public.codigos_licencia (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  dias int not null default 90,
  activo boolean not null default true,
  usado_por uuid,
  usado_en timestamptz,
  creado_en timestamptz not null default now()
);

alter table public.codigos_licencia enable row level security;
drop policy if exists "codigos_admin_all" on public.codigos_licencia;
create policy "codigos_admin_all" on public.codigos_licencia
  for all using (es_admin()) with check (es_admin());

-- 2) Códigos de prueba iniciales (idempotente)
insert into public.codigos_licencia (codigo, dias) values
  ('GADU90-PRUEBA', 90),
  ('GADU90-TEST', 90),
  ('GADU90-DEMO', 90),
  ('GADU-90D-2026', 90)
on conflict (codigo) do nothing;

-- 3) RPC canjear_codigo: valida contra la tabla (un solo uso)
create or replace function public.canjear_codigo(p_codigo text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_codigo text := upper(trim(coalesce(p_codigo, '')));
  v_dias int;
  v_nueva timestamptz;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'Sin sesión activa');
  end if;

  -- Buscar código activo y sin usar (bloquea la fila contra canjes simultáneos)
  select dias into v_dias
    from public.codigos_licencia
    where codigo = v_codigo and activo = true and usado_por is null
    for update;

  if v_dias is null or v_dias < 1 then
    return jsonb_build_object('ok', false, 'error', 'Código incorrecto o vencido');
  end if;

  v_nueva := now() + make_interval(days => v_dias);

  perform set_config('gadu.canje_autorizado', 'true', true);
  update public.profiles
    set trial_ends_at = v_nueva,
        trial_end = v_nueva,
        paid_until = v_nueva,
        subscription_status = 'active',
        estado_cuenta = 'activo'
    where user_id = v_uid;
  perform set_config('gadu.canje_autorizado', 'false', true);

  -- Marcar el código como usado (no se puede reutilizar)
  update public.codigos_licencia
    set usado_por = v_uid, usado_en = now()
    where codigo = v_codigo;

  return jsonb_build_object('ok', true, 'vencimiento', v_nueva, 'dias', v_dias);
end $$;

grant execute on function public.canjear_codigo(text) to authenticated;
notify pgrst, 'reload schema';
