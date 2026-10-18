-- ============================================================
-- GADU SaaS v22 · Planes 90 días + Free→Trial(45) + downgrade post-trial
--   1) Renombra 'free' → 'Trial (45 días)'.
--   2) Crea el plan 'free_basico' (Free Básico: 1 obra, 1 empleado).
--   3) Códigos de licencia por defecto 90 días.
--   4) canjear_licencia con fallback a 90 días.
--   5) Función de downgrade de trials vencidos.
-- EJECUTAR SOBRE LA v21. (Idempotente.)
-- ============================================================

-- 1) Free → Trial (45 días)
update public.planes set nombre = 'Trial (45 días)' where id = 'free';

-- 2) Plan "Free Básico" (post-trial): 1 obra, 1 empleado
insert into public.planes (id, nombre, precio_mensual, precio_anual, limite_obras_activas, limite_empleados, caracteristicas, orden)
values ('free_basico', 'Free Básico', 0, 0, 1, 1, '["1 obra activa","1 empleado","Respaldos locales"]', 0)
on conflict (id) do update set
  nombre = excluded.nombre,
  limite_obras_activas = excluded.limite_obras_activas,
  limite_empleados = excluded.limite_empleados,
  caracteristicas = excluded.caracteristicas;

-- 3) Códigos de licencia por defecto 90 días
alter table public.license_codes alter column duration_days set default 90;
update public.license_codes set duration_days = 90 where duration_days is null or duration_days < 1;

-- 4) canjear_licencia: duración 90 días por defecto (fallback)
create or replace function public.canjear_licencia(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_code text := upper(trim(coalesce(p_code, '')));
  v_plan text;
  v_days int;
  v_nueva timestamptz;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'Sin sesion activa');
  end if;

  select plan_id, duration_days into v_plan, v_days
    from public.license_codes
    where code = v_code and is_used = false
    for update;

  if v_plan is null then
    return jsonb_build_object('ok', false, 'error', 'Codigo invalido o ya utilizado');
  end if;

  -- Duración mínima garantizada: 90 días (si el código no trae días)
  if v_days is null or v_days < 1 then
    v_days := 90;
  end if;

  v_nueva := now() + make_interval(days => v_days);

  update public.profiles
    set plan_id = v_plan,
        trial_ends_at = v_nueva,
        trial_end = v_nueva,
        paid_until = v_nueva,
        subscription_status = 'active',
        estado_cuenta = 'activo'
    where user_id = v_uid;

  update public.license_codes
    set is_used = true, used_by_user_id = v_uid, used_at = now()
    where code = v_code;

  return jsonb_build_object('ok', true, 'plan_id', v_plan, 'vencimiento', v_nueva, 'dias', v_days);
end $$;

grant execute on function public.canjear_licencia(text) to authenticated;

-- 5) Downgrade de trials vencidos (45 días desde created_at o trial_ends_at)
create or replace function public.downgrade_trials_expired()
returns int language plpgsql security definer set search_path = public as $$
declare
  v_count int := 0;
begin
  update public.profiles
    set plan_id = 'free_basico',
        subscription_status = 'expired',
        estado_cuenta = 'activo'
    where subscription_status = 'trialing'
      and coalesce(trial_ends_at, created_at + interval '45 days') < now();
  get diagnostics v_count = row_count;
  return v_count;
end $$;

grant execute on function public.downgrade_trials_expired() to authenticated;
notify pgrst, 'reload schema';
