-- Cron del seguimiento: cada 30 minutos revisa conversaciones por vencer la ventana.
-- ⚠️ Cambiá el dominio por el de TU producción si es distinto.
CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.unschedule('check-follow-up') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'check-follow-up'
);

SELECT cron.schedule(
  'check-follow-up',
  '*/30 * * * *',  -- cada 30 minutos
  $$
  SELECT net.http_post(
    'https://chatbot-sass-eight.vercel.app/api/automations/scheduled',
    '{"Content-Type": "application/json"}'::jsonb,
    '{"type": "follow_up.check"}'::text
  );
  $$
);
