-- ============================================================
-- COSL "My Bids" — agendador (Supabase pg_cron)
--
-- RODAR DEPOIS do deploy na Vercel, quando /api/cron/cosl-my-bids
-- ja estiver publicado. Ate la o coletor e testado localmente com
-- ?force=1 / ?dry=1 (ver o route handler).
--
-- Substitua os dois placeholders abaixo:
--   <APP_URL>      -> ex. https://iron.vercel.app  (sem barra final)
--   <CRON_SECRET>  -> o mesmo valor de CRON_SECRET nas env vars da Vercel
--
-- O pg_cron dispara de hora em hora em UTC, 24/7. A janela real
-- (08:00-17:00 Central Time, todos os dias, com horario de verao)
-- e aplicada DENTRO da route; fora dela a chamada retorna
-- { skipped: true } sem tocar no banco.
-- ============================================================

-- 1. Extensoes (idempotente)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 2. (Re)agenda o job
SELECT cron.unschedule('cosl-my-bids-hourly')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cosl-my-bids-hourly');

SELECT cron.schedule(
  'cosl-my-bids-hourly',
  '0 * * * *',
  $$
    SELECT net.http_post(
      url     := '<APP_URL>/api/cron/cosl-my-bids',
      headers := '{"Content-Type": "application/json", "x-cron-secret": "<CRON_SECRET>"}'::jsonb,
      timeout_milliseconds := 60000
    );
  $$
);

-- 3. Conferir
-- SELECT jobid, jobname, schedule, active FROM cron.job WHERE jobname = 'cosl-my-bids-hourly';
-- SELECT * FROM cron.job_run_details WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname='cosl-my-bids-hourly') ORDER BY start_time DESC LIMIT 5;
-- SELECT id, created, status_code FROM net._http_response ORDER BY created DESC LIMIT 5;

-- Para remover:
-- SELECT cron.unschedule('cosl-my-bids-hourly');
