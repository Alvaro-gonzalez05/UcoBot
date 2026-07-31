-- Sugerencias de mejora del prompt, detectadas a partir de las conversaciones
-- donde el bot NO resolvió.
--
-- IDEA: el bot ya deja rastro de sus fallas — cuando el humano tiene que tomar la
-- charla desde el celular, cuando la conversación queda marcada para atención, o
-- cuando el propio bot responde "no entiendo". Un cron semanal junta esas charlas,
-- las agrupa POR PATRÓN (con IA) y propone qué agregarle al prompt.
--
-- LO IMPORTANTE ES AGRUPAR: una alerta por conversación sería ruido insoportable
-- (28 en 30 días solo entre 3 cuentas) y terminaría apagada. Una alerta por patrón
-- repetido ("12 preguntaron por envíos y no supo") es accionable.
CREATE TABLE IF NOT EXISTS bot_improvement_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bot_id UUID REFERENCES bots(id) ON DELETE CASCADE,

  topic TEXT NOT NULL,
  rationale TEXT,
  suggested_text TEXT NOT NULL,

  occurrences INTEGER NOT NULL DEFAULT 1,
  example_conversation_ids UUID[] NOT NULL DEFAULT '{}',

  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'applied', 'dismissed')),

  analyzed_from TIMESTAMPTZ,
  analyzed_to TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_bot_suggestions_pending
  ON bot_improvement_suggestions (user_id, created_at DESC)
  WHERE status = 'pending';

ALTER TABLE bot_improvement_suggestions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS member_all_bot_suggestions ON bot_improvement_suggestions;
CREATE POLICY member_all_bot_suggestions ON bot_improvement_suggestions
  FOR ALL USING (user_id = account_owner_id()) WITH CHECK (user_id = account_owner_id());

COMMENT ON TABLE bot_improvement_suggestions IS
  'Mejoras propuestas para el prompt del bot, deducidas de las charlas que no resolvió.';

-- Cron semanal: lunes 9:07 (off-hour a propósito, los :00 concentran carga).
SELECT cron.unschedule('analyze-bot-gaps')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'analyze-bot-gaps');

SELECT cron.schedule(
  'analyze-bot-gaps',
  '7 9 * * 1',
  $$
  SELECT net.http_post(
    'https://chatbot-sass-eight.vercel.app/api/bots/analyze-gaps',
    '{}'::jsonb,
    '{}'::jsonb,
    '{"Content-Type": "application/json"}'::jsonb
  );
  $$
);
