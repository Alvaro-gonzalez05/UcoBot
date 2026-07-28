-- Procesamiento por lotes del historial de coexistencia.
--
-- MOTIVO (28/07/2026): con el alta de coexistencia real, YCloud mandó ~8.400
-- eventos de historial en pocos minutos (UN mensaje por evento). El cron los
-- procesaba de a 10 por minuto y cada uno costaba ~5 consultas — incluida una
-- lectura de hasta 5.000 mensajes solo para deduplicar UNA fila. A ese ritmo la
-- cola necesitaba ~14 horas y crecía más rápido de lo que se vaciaba, mientras
-- la barra de progreso del chat retrocedía a 0 cada vez que entraba una tanda.
--
-- Dos cambios para poder procesar de a cientos:
--   1) estado 'processing' + claimed_at → cada corrida RECLAMA su lote, así dos
--      corridas superpuestas del cron no trabajan sobre los mismos chunks.
--   2) índice para levantar el lote y para recuperar los reclamos huérfanos
--      (una corrida que se murió a mitad deja chunks en 'processing').

ALTER TABLE whatsapp_sync_chunks
  DROP CONSTRAINT IF EXISTS whatsapp_sync_chunks_status_check;

ALTER TABLE whatsapp_sync_chunks
  ADD CONSTRAINT whatsapp_sync_chunks_status_check
  CHECK (status IN ('pending', 'processing', 'done', 'error'));

-- Cuándo se reclamó el chunk. Si sigue 'processing' pasado un rato, la corrida
-- que lo tomó murió y hay que devolverlo a la cola.
ALTER TABLE whatsapp_sync_chunks
  ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_wa_sync_chunks_claimed
  ON whatsapp_sync_chunks (status, claimed_at)
  WHERE status = 'processing';

COMMENT ON COLUMN whatsapp_sync_chunks.claimed_at IS
  'Momento en que una corrida del cron tomó el chunk. Si quedó en processing y está vencido, se devuelve a pending.';

-- Reclamo atómico de un lote.
--
-- Se hace en Postgres y no desde el cliente por dos motivos:
--   1) FOR UPDATE SKIP LOCKED da exclusión real entre corridas superpuestas del
--      cron, sin depender de un UPDATE condicional desde la app.
--   2) mandar 800 UUIDs en un filtro `in.(...)` arma una URL de ~30 KB que
--      PostgREST rechaza; acá no viaja ninguna lista.
--
-- El `p_claimed_at` funciona como token del lote: para cerrarlo alcanza con
-- filtrar por ese timestamp, sin volver a enumerar los ids.
CREATE OR REPLACE FUNCTION claim_whatsapp_sync_chunks(
  p_limit INTEGER,
  p_claimed_at TIMESTAMPTZ
)
RETURNS SETOF whatsapp_sync_chunks
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE whatsapp_sync_chunks
  SET status = 'processing', claimed_at = p_claimed_at
  WHERE id IN (
    SELECT id FROM whatsapp_sync_chunks
    WHERE status = 'pending' AND attempts < 5
    ORDER BY received_at, chunk_order NULLS FIRST
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
$$;

-- Solo el service role (el cron pasa por el endpoint, que usa la admin key).
REVOKE ALL ON FUNCTION claim_whatsapp_sync_chunks(INTEGER, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION claim_whatsapp_sync_chunks(INTEGER, TIMESTAMPTZ) TO service_role;
