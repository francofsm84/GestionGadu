-- ============================================================
-- GADU SaaS v9 · Métricas financieras (MRR/ARR) + distribución completa
-- EJECUTAR SOBRE LA v8. Supabase → SQL Editor → pegar TODO → Run.
-- ============================================================

create or replace function public.metricas()
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'mrr', coalesce((select sum(p.precio_mensual) from public.profiles u join public.planes p on p.id = u.plan_id
                     where u.estado_cuenta = 'activo' and u.subscription_status in ('active','trialing')), 0),
    'arr', coalesce((select sum(p.precio_anual) from public.profiles u join public.planes p on p.id = u.plan_id
                     where u.estado_cuenta = 'activo' and u.subscription_status in ('active','trialing')), 0),
    'usuarios', (select count(*) from public.profiles),
    'activos', (select count(*) from public.profiles where estado_cuenta = 'activo'),
    'past_due', (select count(*) from public.profiles where subscription_status = 'past_due' or estado_cuenta = 'suspendido'),
    'obras', (select coalesce(sum(jsonb_array_length(a.data->'works')), 0) from public.app_data a),
    'por_plan', (
      select coalesce(jsonb_object_agg(p.nombre, coalesce(c.cnt, 0)), '{}'::jsonb)
      from public.planes p
      left join (select plan_id, count(*) as cnt from public.profiles group by plan_id) c on c.plan_id = p.id
    )
  );
$$;

notify pgrst, 'reload schema';
