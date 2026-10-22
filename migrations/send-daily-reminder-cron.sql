-- ============================================================
-- GADU · Cron diario del recordatorio de asistencia
-- 11:00 AM Argentina (UTC-3) = 14:00 UTC
-- Usa pg_cron + pg_net para llamar a la Edge Function send-daily-reminder
-- ============================================================

-- 1) Habilitar extensiones (ejecutar UNA sola vez)
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 2) Programar el recordatorio diario
--    cron: '0 14 * * *' = todos los días a las 14:00 UTC (11:00 ARG)
select cron.schedule(
  'gadu-recordatorio-asistencia',          -- nombre único del job
  '0 14 * * *',                            -- minuto hora dia mes dia-semana
  $$
  select net.http_post(
    url := 'https://kalqvykomlfwxmsdaipf.supabase.co/functions/v1/send-daily-reminder',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer gadu-cron-3f2a1c8e'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- ============================================================
-- Verificación / limpieza
-- ============================================================

-- Ver el job registrado
-- select * from cron.job where jobname = 'gadu-recordatorio-asistencia';

-- Ver las últimas ejecuciones (éxito/error)
-- select * from cron.job_run_details order by start_time desc limit 5;

-- Eliminar el job (si hay que reprogramar)
-- select cron.unschedule('gadu-recordatorio-asistencia');
