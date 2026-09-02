-- ============================================================
-- COSL "List View" -> import de Auctions — agendador (Supabase pg_cron)
--
-- RODAR DEPOIS do deploy, quando /api/cron/cosl-listings-import
-- estiver publicado. Substitua:
--   <APP_URL>      -> https://app.ironcladgroup.org   (sem barra final)
--   <CRON_SECRET>  -> o mesmo valor de CRON_SECRET nas env vars da Vercel
--
-- 1x por dia. '0 12 * * *' UTC ~= 07:00 Central (CDT) / 06:00 (CST).
-- O catalogo COSL adiciona lotes de manha (~06:00 Central); rodar as
-- 07:00 Central pega a leva do dia. Sem gate de horario (import diario).
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.unschedule('cosl-listings-import-daily')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cosl-listings-import-daily');

SELECT cron.schedule(
  'cosl-listings-import-daily',
  '0 12 * * *',
  $$
    SELECT net.http_post(
      url     := '<APP_URL>/api/cron/cosl-listings-import',
      headers := '{"Content-Type": "application/json", "x-cron-secret": "<CRON_SECRET>"}'::jsonb,
      timeout_milliseconds := 60000
    );
  $$
);

-- Conferir:
-- SELECT jobid, jobname, schedule, active FROM cron.job WHERE jobname = 'cosl-listings-import-daily';
-- SELECT status, last_run_at, inserted, skipped_existing, skipped_no_county, skipped_counties, message FROM cosl_listing_sync_meta;
-- SELECT * FROM cron.job_run_details WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname='cosl-listings-import-daily') ORDER BY start_time DESC LIMIT 5;

-- Remover:
-- SELECT cron.unschedule('cosl-listings-import-daily');
