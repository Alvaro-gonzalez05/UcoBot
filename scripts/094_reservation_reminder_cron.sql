-- Cron del recordatorio de reservas/turnos: cada 30 min revisa los próximos.
-- ⚠️ Cambiá el dominio por el de TU producción.
CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.unschedule('check-reservation-reminders') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'check-reservation-reminders'
);

SELECT cron.schedule(
  'check-reservation-reminders',
  '*/30 * * * *',
  $$
  SELECT net.http_post(
    'https://TU-DOMINIO-REAL/api/automations/scheduled',
    '{"Content-Type": "application/json"}'::jsonb,
    '{"type": "reservation_reminder.check"}'::text
  );
  $$
);
