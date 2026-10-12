-- ============================================================
-- GADU SaaS v20 · Blindaje de licencias (RLS a nivel de columna)
--   1) Trigger blindar_perfil: usuarios normales NO pueden tocar
--      rol / plan_id / subscription_status / estado_cuenta /
--      trial_end / trial_ends_at / paid_until.
--   2) RPC canjear_codigo (security definer): canje server-side,
--      con bandera que el trigger respeta.
-- EJECUTAR SOBRE LA v19. (Idempotente.)
-- ============================================================

-- 1) Trigger de protección de columnas sensibles
create or replace function public.blindar_perfil()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;  -- sin JWT (service/management)
  if current_setting('gadu.canje_autorizado', true) = 'true' then return new; end if;  -- canje RPC
  if coalesce((select rol from public.profiles where user_id = auth.uid()), '') in ('admin', 'super_admin') then return new; end if;

  -- Usuario normal: revierte cualquier intento de modificar estas columnas
  new.rol := old.rol;
  new.plan_id := old.plan_id;
  new.subscription_status := old.subscription_status;
  new.estado_cuenta := old.estado_cuenta;
  new.trial_end := old.trial_end;
  new.trial_ends_at := old.trial_ends_at;
  new.paid_until := old.paid_until;
  return new;
end $$;

drop trigger if exists profiles_blindar_licencia on public.profiles;
create trigger profiles_blindar_licencia before update on public.profiles
for each row execute function public.blindar_perfil();

-- 2) RPC de canje: valida el código en el servidor y extiende 90 días
create or replace function public.canjear_codigo(p_codigo text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_nueva timestamptz := now() + interval '90 days';
  v_codigo text := upper(trim(coalesce(p_codigo, '')));
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'Sin sesión activa');
  end if;

  if v_codigo not like 'GADU90-%' and v_codigo not like 'GADU-90D-%' then
    return jsonb_build_object('ok', false, 'error', 'Código incorrecto o vencido');
  end if;

  perform set_config('gadu.canje_autorizado', 'true', true);
  update public.profiles
    set trial_ends_at = v_nueva,
        trial_end = v_nueva,
        paid_until = v_nueva,
        subscription_status = 'active',
        estado_cuenta = 'activo'
    where user_id = v_uid;
  perform set_config('gadu.canje_autorizado', 'false', true);

  return jsonb_build_object('ok', true, 'vencimiento', v_nueva);
end $$;

grant execute on function public.canjear_codigo(text) to authenticated;
notify pgrst, 'reload schema';
