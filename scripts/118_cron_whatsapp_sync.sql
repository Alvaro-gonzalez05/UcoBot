-- Cron que procesa el historial de coexistencia estacionado por el webhook.
--
-- Corre cada minuto: la carga inicial llega en varias tandas seguidas apenas se
-- completa el alta, así que conviene vaciar la cola rápido. Cuando no hay nada
-- pendiente el endpoint devuelve en milisegundos, así que no molesta.

SELECT cron.unschedule('process-whatsapp-sync')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-whatsapp-sync');

SELECT cron.schedule(
  'process-whatsapp-sync',
  '* * * * *',
  $$
  SELECT net.http_post(
    'https://chatbot-sass-eight.vercel.app/api/whatsapp/ycloud/sync/process',
    '{"Content-Type": "application/json"}'::jsonb,
    '{}'::text
  );
  $$
);

SELECT jobid, schedule, command, active
FROM cron.job
WHERE jobname = 'process-whatsapp-sync';
