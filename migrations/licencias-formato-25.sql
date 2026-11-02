-- ============================================================
-- GADU · Códigos de licencia de 25 caracteres (mixto + símbolos)
-- La generación pasa a 25 chars con charset mixto y CSPRNG (admin.js).
-- La validación deja de normalizar a mayúsculas para que el código
-- mixto coincida exactamente (case-sensitive). Los códigos viejos
-- (GADU-XXXXXX en mayúsculas) siguen funcionando mientras se tipeen igual.
-- ============================================================

create or replace function public.canjear_licencia(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_code text := trim(coalesce(p_code, ''));
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

-- Verificación: el código debe coincidir exacto (case-sensitive).
-- SELECT code, plan_id, is_used FROM public.license_codes ORDER BY created_at DESC LIMIT 5;
