-- Estado de entrega de los mensajes que MANDAMOS (tilde / doble tilde / azul),
-- más el tipo y el estado del último mensaje en la vista previa de la lista.
--
-- Los estados llegan por el webhook `whatsapp.message.updated` de YCloud, al que
-- la cuenta ya estaba suscrita: los eventos entraban y el webhook los descartaba
-- junto con todo lo que no fuera un mensaje entrante.
--
-- OJO: `is_read` es otra cosa y no se toca. Ese dice "el operador ya leyó el
-- mensaje del cliente" (lo que apaga el globito azul en la lista). Esto dice "el
-- cliente leyó lo que le mandamos".

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS delivery_status TEXT
  CHECK (delivery_status IN ('accepted', 'sent', 'delivered', 'read', 'failed'));

-- Para encontrar el mensaje por su id de WhatsApp cuando llega el estado. El
-- índice único que ya existe es (conversation_id, wa_message_id) y no sirve para
-- buscar solo por el segundo.
CREATE INDEX IF NOT EXISTS idx_messages_wa_message_id
  ON messages (wa_message_id)
  WHERE wa_message_id IS NOT NULL;

COMMENT ON COLUMN messages.delivery_status IS
  'Estado de entrega de un mensaje saliente segun WhatsApp. NULL = todavia sin confirmacion.';

-- Aplica un estado sin dejar que retroceda.
--
-- Los eventos NO llegan ordenados: un "delivered" demorado puede caer después de
-- un "read" y borraría el visto. Se comparan por rango y solo se avanza. 'failed'
-- es la excepción: siempre gana, porque es información que el operador necesita
-- ver aunque llegue tarde.
CREATE OR REPLACE FUNCTION apply_whatsapp_delivery_status(
  p_wamid TEXT,
  p_status TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rank INTEGER;
  v_count INTEGER;
BEGIN
  v_rank := CASE p_status
    WHEN 'accepted' THEN 1
    WHEN 'sent' THEN 2
    WHEN 'delivered' THEN 3
    WHEN 'read' THEN 4
    ELSE 0
  END;

  WITH updated AS (
    UPDATE messages m
    SET delivery_status = p_status
    WHERE m.wa_message_id = p_wamid
      AND m.sender_type = 'bot'
      AND (
        p_status = 'failed'
        OR m.delivery_status IS NULL
        OR CASE m.delivery_status
             WHEN 'accepted' THEN 1
             WHEN 'sent' THEN 2
             WHEN 'delivered' THEN 3
             WHEN 'read' THEN 4
             ELSE 0
           END < v_rank
      )
    RETURNING m.id
  )
  SELECT count(*) INTO v_count FROM updated;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION apply_whatsapp_delivery_status(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION apply_whatsapp_delivery_status(TEXT, TEXT) TO service_role;

-- Vista previa de la lista de chats: además del texto, el TIPO y el ESTADO del
-- último mensaje.
--
-- El tipo hace falta porque el `content` de lo que no es texto guarda un
-- placeholder escrito a mano, y con los años se acumularon variantes de todos los
-- colores: "[audio]", "[Audio message]", "[Audio]", "[image]", "[Image]",
-- "[document]", "[sticker]"… Con el tipo real el front dibuja un ícono y una
-- etiqueta consistente en vez de mostrar corchetes.
CREATE OR REPLACE FUNCTION list_conversations_with_preview(
  p_user_id UUID,
  p_limit INTEGER DEFAULT 15,
  p_offset INTEGER DEFAULT 0
)
RETURNS SETOF JSONB
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT to_jsonb(c) || jsonb_build_object(
    'last_message', COALESCE(lm.content, ''),
    'last_message_kind', COALESCE(
      CASE WHEN lm.metadata->>'is_sticker' = 'true' THEN 'sticker' END,
      lm.metadata->>'original_type',
      lm.message_type
    ),
    'last_message_from', lm.sender_type,
    'last_message_status', lm.delivery_status,
    'last_message_at_real', lm.created_at,
    'unread_count', COALESCE(uc.n, 0)
  )
  FROM conversations c
  LEFT JOIN LATERAL (
    SELECT m.content, m.message_type, m.metadata, m.sender_type,
           m.delivery_status, m.created_at
    FROM messages m
    WHERE m.conversation_id = c.id
    ORDER BY m.created_at DESC
    LIMIT 1
  ) lm ON TRUE
  LEFT JOIN LATERAL (
    SELECT count(*) AS n
    FROM messages m
    WHERE m.conversation_id = c.id
      AND m.sender_type = 'client'
      AND m.is_read IS NOT TRUE
  ) uc ON TRUE
  WHERE c.user_id = p_user_id
  ORDER BY c.last_message_at DESC NULLS LAST
  LIMIT p_limit
  OFFSET p_offset;
$$;

GRANT EXECUTE ON FUNCTION list_conversations_with_preview(UUID, INTEGER, INTEGER) TO authenticated, service_role;
