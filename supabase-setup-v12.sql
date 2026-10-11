-- ============================================================
-- GADU SaaS v12 · Registro completo y robusto
-- - Añade columnas nombre/apellido al perfil
-- - handle_new_user captura: nombre, apellido, telefono, direccion,
--   latitud, longitud, localidad y tipo de usuario (perfil_tipo)
-- - Bloque EXCEPTION de respaldo + permisos
-- EJECUTAR SOBRE LA v11. Supabase → SQL Editor → pegar TODO → Run.
-- ============================================================

alter table public.profiles
  add column if not exists nombre text,
  add column if not exists apellido text;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_rol text; v_plan text; v_empresa text; v_trial_dias int;
  v_nombre text; v_apellido text; v_telefono text; v_direccion text;
  v_latitud text; v_longitud text; v_localidad text; v_perfil_tipo text;
begin
  select i.rol, i.plan_id, i.empresa
    into v_rol, v_plan, v_empresa
    from public.invitaciones i
    where lower(i.email) = lower(new.email)
    order by i.created_at desc
    limit 1;

  v_trial_dias := 45;
  begin
    select trial_dias into v_trial_dias
      from public.negocio where id = 1 and trial_dias is not null;
  exception when others then v_trial_dias := 45;
  end;
  if v_trial_dias is null or v_trial_dias < 1 then v_trial_dias := 45; end if;

  -- Nombre/apellido: nunca NULL (full_name → name → parte del email)
  v_nombre := coalesce(
    nullif(trim(new.raw_user_meta_data->>'nombre'), ''),
    nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
    nullif(trim(new.raw_user_meta_data->>'name'), ''),
    split_part(new.email, '@', 1)
  );
  v_apellido := coalesce(nullif(trim(new.raw_user_meta_data->>'apellido'), ''), '');
  v_telefono := nullif(trim(new.raw_user_meta_data->>'telefono'), '');
  v_direccion := nullif(trim(new.raw_user_meta_data->>'direccion'), '');
  v_latitud := nullif(trim(new.raw_user_meta_data->>'latitud'), '');
  v_longitud := nullif(trim(new.raw_user_meta_data->>'longitud'), '');
  v_localidad := nullif(trim(new.raw_user_meta_data->>'localidad'), '');
  v_perfil_tipo := coalesce(nullif(trim(new.raw_user_meta_data->>'perfil_tipo'), ''), 'Contratista');

  begin
    insert into public.profiles
      (user_id, email, nombre, apellido, rol, plan_id, empresa, telefono, direccion,
       latitud, longitud, localidad, perfil_tipo, subscription_status, estado_cuenta, trial_end, trial_ends_at)
    values (
      new.id, new.email, v_nombre, v_apellido,
      coalesce(v_rol, 'gestor_obra'), coalesce(v_plan, 'free'),
      coalesce(nullif(trim(v_empresa), ''), v_nombre, ''),
      v_telefono, v_direccion, v_latitud, v_longitud, v_localidad, v_perfil_tipo,
      'trialing', 'activo',
      now() + make_interval(days => v_trial_dias),
      now() + make_interval(days => v_trial_dias)
    )
    on conflict (user_id) do nothing;
  exception when others then
    -- Respaldo mínimo: nunca bloquear el alta del usuario
    insert into public.profiles
      (user_id, email, nombre, apellido, rol, plan_id, empresa, subscription_status, estado_cuenta, trial_end, trial_ends_at)
    values (new.id, new.email, v_nombre, v_apellido, 'gestor_obra', 'free', coalesce(v_nombre, ''),
            'trialing', 'activo', now() + interval '45 days', now() + interval '45 days')
    on conflict (user_id) do nothing;
  end;

  delete from public.invitaciones where lower(email) = lower(new.email);
  return new;
end $$;

grant execute on function public.handle_new_user() to service_role, postgres, authenticated;
notify pgrst, 'reload schema';
