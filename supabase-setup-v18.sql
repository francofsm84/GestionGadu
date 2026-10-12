-- ============================================================
-- GADU SaaS v18 · Hardening final (observaciones de auditoría)
--   1) Política DELETE para app_data (borrado de cuenta)
--   2) Política UPDATE para la tabla legacy "pagos"
--   3) Blindar handle_new_user ante fallos en invitaciones
-- EJECUTAR SOBRE LA v17. (Idempotente.)
-- ============================================================

-- 1) Permitir que un usuario (o admin) borre su propio documento de datos
drop policy if exists "datos_propios_delete" on public.app_data;
create policy "datos_propios_delete" on public.app_data
  for delete using (user_id = auth.uid() or es_admin());

-- 2) Permitir actualizar pagos (propio o admin)
drop policy if exists "pagos_update" on public.pagos;
create policy "pagos_update" on public.pagos
  for update using (user_id = auth.uid() or es_admin()) with check (user_id = auth.uid() or es_admin());

-- 3) handle_new_user blindado: nunca aborta el alta por problemas con invitaciones
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
  -- Invitación pre-asignada (si la tabla no existe, se ignora sin romper)
  begin
    select i.rol, i.plan_id, i.empresa
      into v_rol, v_plan, v_empresa
      from public.invitaciones i
      where lower(i.email) = lower(new.email)
      order by i.created_at desc
      limit 1;
  exception when others then
    v_rol := null; v_plan := null; v_empresa := null;
  end;

  v_trial_dias := 45;
  begin
    select trial_dias into v_trial_dias
      from public.negocio where id = 1 and trial_dias is not null;
  exception when others then v_trial_dias := 45;
  end;
  if v_trial_dias is null or v_trial_dias < 1 then v_trial_dias := 45; end if;

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
    insert into public.profiles
      (user_id, email, nombre, apellido, rol, plan_id, empresa, subscription_status, estado_cuenta, trial_end, trial_ends_at)
    values (new.id, new.email, v_nombre, v_apellido, 'gestor_obra', 'free', coalesce(v_nombre, ''),
            'trialing', 'activo', now() + interval '45 days', now() + interval '45 days')
    on conflict (user_id) do nothing;
  end;

  -- Consumir la invitación (si falla, no debe abortar el alta)
  begin
    delete from public.invitaciones where lower(email) = lower(new.email);
  exception when others then null;
  end;

  return new;
end $$;

grant execute on function public.handle_new_user() to service_role, postgres, authenticated;
notify pgrst, 'reload schema';
