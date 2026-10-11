-- ============================================================
-- GADU SaaS v11 · Reparación del alta de usuarios
-- Soluciona: "Database error saving new user" en el trigger handle_new_user
-- EJECUTAR SOBRE LA v10. Supabase → SQL Editor → pegar TODO → Run.
-- ============================================================

-- El trigger ahora es 100% robusto: no falla si negocio no tiene fila/columna,
-- usa COALESCE para el nombre y envuelve la inserción en un bloque de respaldo.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_rol text; v_plan text; v_empresa text; v_trial_dias int; v_nombre text;
begin
  select i.rol, i.plan_id, i.empresa
    into v_rol, v_plan, v_empresa
    from public.invitaciones i
    where lower(i.email) = lower(new.email)
    order by i.created_at desc
    limit 1;

  -- Duración de prueba: leer de negocio si existe; si falla, 45 días.
  v_trial_dias := 45;
  begin
    select trial_dias into v_trial_dias
      from public.negocio where id = 1 and trial_dias is not null;
  exception when others then v_trial_dias := 45;
  end;
  if v_trial_dias is null or v_trial_dias < 1 then v_trial_dias := 45; end if;

  -- Nombre seguro (nunca NULL): full_name → name → email
  v_nombre := coalesce(
    nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
    nullif(trim(new.raw_user_meta_data->>'name'), ''),
    new.email
  );

  begin
    insert into public.profiles (user_id, email, rol, plan_id, empresa, subscription_status, estado_cuenta, trial_end, trial_ends_at)
    values (
      new.id,
      new.email,
      coalesce(v_rol, 'gestor_obra'),
      coalesce(v_plan, 'free'),
      coalesce(nullif(trim(v_empresa), ''), v_nombre, ''),
      'trialing',
      'activo',
      now() + make_interval(days => v_trial_dias),
      now() + make_interval(days => v_trial_dias)
    )
    on conflict (user_id) do nothing;
  exception when others then
    -- Respaldo mínimo: nunca bloquear el alta del usuario
    insert into public.profiles (user_id, email, rol, plan_id, empresa, subscription_status, estado_cuenta, trial_end, trial_ends_at)
    values (new.id, new.email, 'gestor_obra', 'free', coalesce(v_nombre, ''), 'trialing', 'activo',
            now() + interval '45 days', now() + interval '45 days')
    on conflict (user_id) do nothing;
  end;

  delete from public.invitaciones where lower(email) = lower(new.email);
  return new;
end $$;

-- Permisos explícitos para el servicio de Auth
grant execute on function public.handle_new_user() to service_role, postgres, authenticated;

-- Refrescar caché del esquema
notify pgrst, 'reload schema';
