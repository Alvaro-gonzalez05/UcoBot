-- Unicidad real de mensajes de WhatsApp, garantizada por la base.
--
-- MOTIVO (29/07/2026): YCloud REENVÍA el historial de coexistencia. En el alta
-- del 28/07 llegaron tres tandas: la inicial (23:00-23:20) y dos reenvíos
-- (23:35 y 00:35) que cubrían el MISMO rango de mensajes, con los mismos wamids.
-- Durante la avalancha inicial la base se saturó, parte de los eventos no se
-- llegaron a estacionar y YCloud los reintentó más tarde. Hay que asumir que va
-- a volver a pasar en cada alta.
--
-- Encima el procesador toma lotes en paralelo: dos corridas del cron pueden
-- traer mensajes de la misma conversación y ninguna ve lo que insertó la otra.
--
-- El dedup en memoria (leer los wamids conocidos y filtrar antes de insertar) no
-- cubre ninguno de los dos casos: es un read-modify-write sin garantía. Dejó
-- ~1.400 mensajes repetidos. Esto sí lo cubre, y hace la importación idempotente
-- por más veces que YCloud reenvíe.

-- Columna generada (no trigger) para poder indexarla y que PostgREST la pueda
-- nombrar en ON CONFLICT — un índice sobre la expresión JSON no se puede nombrar.
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS wa_message_id TEXT
  GENERATED ALWAYS AS (metadata->>'whatsapp_message_id') STORED;

-- Índice ÚNICO y NO parcial: en Postgres dos NULL nunca colisionan, así que los
-- mensajes sin wamid (los que manda el operador desde el panel) conviven sin
-- problema. Parcial no serviría: ON CONFLICT exige que la especificación incluya
-- el WHERE del índice, y PostgREST no lo manda.
CREATE UNIQUE INDEX IF NOT EXISTS messages_conversation_wa_message_id_key
  ON messages (conversation_id, wa_message_id);

COMMENT ON COLUMN messages.wa_message_id IS
  'wamid extraído de metadata. Existe para sostener el índice único que hace idempotente la importación de historial.';

-- Limpieza de los repetidos que dejó el dedup en memoria. Conserva la copia con
-- MÁS información: la que bajó la media al bucket, después la que tiene contenido
-- real en vez de un placeholder tipo "[audio]", y recién ahí la más antigua.
-- (Correr ANTES de crear el índice si la tabla todavía tiene duplicados.)
WITH sobrantes AS (
  SELECT id FROM (
    SELECT id,
      row_number() OVER (
        PARTITION BY conversation_id, metadata->>'whatsapp_message_id'
        ORDER BY
          (metadata ? 'stored_url') DESC,
          (content IS NOT NULL AND content <> '' AND content NOT LIKE '[%') DESC,
          length(coalesce(content, '')) DESC,
          created_at ASC,
          id ASC
      ) AS rn
    FROM messages
    WHERE metadata->>'whatsapp_message_id' IS NOT NULL
  ) t WHERE rn > 1
)
DELETE FROM messages m USING sobrantes s WHERE m.id = s.id;
