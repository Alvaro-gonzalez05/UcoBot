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

-- ---------------------------------------------------------------------------
-- Detección de charlas problemáticas EN LA BASE.
--
-- POR QUÉ ACÁ Y NO EN LA APP (31/07/2026): la primera versión traía todos los
-- mensajes de las últimas 200 charlas y filtraba en JavaScript. Con ~4.800
-- mensajes en una semana eso choca contra el tope de filas de PostgREST: llegaban
-- muchas menos, las conversaciones quedaban sin mensajes y se descartaban como si
-- no tuvieran problema. El análisis devolvía cero sin ningún error a la vista.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION find_problem_conversations(
  p_user_id UUID,
  p_since TIMESTAMPTZ,
  p_limit INTEGER DEFAULT 40
)
RETURNS TABLE (id UUID, client_name TEXT, created_at TIMESTAMPTZ, reason TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  WITH live AS (
    -- El historial importado NO cuenta: en coexistencia TODOS sus mensajes
    -- salientes figuran como enviados desde el celular, así que cada charla vieja
    -- parecería un handover.
    SELECT m.conversation_id, m.sender_type, m.content, m.metadata
    FROM messages m
    JOIN conversations c ON c.id = m.conversation_id
    WHERE c.user_id = p_user_id
      AND c.created_at >= p_since
      AND (m.metadata->>'imported') IS DISTINCT FROM 'true'
  )
  SELECT c.id, c.client_name, c.created_at,
    CASE
      WHEN EXISTS (SELECT 1 FROM live l WHERE l.conversation_id = c.id
                   AND l.sender_type = 'bot' AND l.metadata->>'sent_by' = 'phone')
        THEN 'humano_tomo_la_charla'
      WHEN c.needs_attention THEN 'pidio_atencion'
      WHEN EXISTS (SELECT 1 FROM live l WHERE l.conversation_id = c.id AND l.sender_type = 'bot'
                   AND (l.content ILIKE '%no entiendo%' OR l.content ILIKE '%no puedo ayudar%'
                        OR l.content ILIKE '%problema%interno%' OR l.content ILIKE '%no tengo esa%'))
        THEN 'bot_no_supo'
    END AS reason
  FROM conversations c
  WHERE c.user_id = p_user_id
    AND c.created_at >= p_since
    AND EXISTS (SELECT 1 FROM live l WHERE l.conversation_id = c.id AND l.sender_type = 'bot')
    AND (
      EXISTS (SELECT 1 FROM live l WHERE l.conversation_id = c.id AND l.sender_type = 'bot'
              AND l.metadata->>'sent_by' = 'phone')
      OR c.needs_attention
      OR EXISTS (SELECT 1 FROM live l WHERE l.conversation_id = c.id AND l.sender_type = 'bot'
                 AND (l.content ILIKE '%no entiendo%' OR l.content ILIKE '%no puedo ayudar%'
                      OR l.content ILIKE '%problema%interno%' OR l.content ILIKE '%no tengo esa%'))
    )
  ORDER BY c.created_at DESC
  LIMIT p_limit;
$fn$;

REVOKE ALL ON FUNCTION find_problem_conversations(UUID, TIMESTAMPTZ, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION find_problem_conversations(UUID, TIMESTAMPTZ, INTEGER) TO service_role, authenticated;
