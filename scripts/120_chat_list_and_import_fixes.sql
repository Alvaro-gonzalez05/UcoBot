-- Arreglos de la lista de chats después de importar el historial de coexistencia.
--
-- SÍNTOMAS (28/07/2026, con ~13.000 mensajes importados):
--   - chats que decían "Sin mensajes" pero con un badge de 26 no leídos
--   - el badge no se limpiaba al abrir el chat: bajaba y volvía a subir
--   - charlas tituladas con el número aunque el contacto estuviera agendado
--
-- Las tres tienen la misma raíz: la lista traía cada conversación con TODOS sus
-- mensajes embebidos para calcular el último y los no leídos en el navegador. Con
-- una charla de 3.600 mensajes y 15 por página, PostgREST corta la respuesta y los
-- dos campos salían mal. Ahora los calcula la base.

-- 1) Lista de conversaciones con último mensaje y no leídos.
--    SECURITY INVOKER a propósito: las RLS de conversations y messages se aplican
--    igual que cuando la consulta la hacía el cliente.
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
    'unread_count', COALESCE(uc.n, 0)
  )
  FROM conversations c
  -- Un solo mensaje por conversación, servido por idx_messages_conversation_id_created_at.
  LEFT JOIN LATERAL (
    SELECT m.content
    FROM messages m
    WHERE m.conversation_id = c.id
    ORDER BY m.created_at DESC
    LIMIT 1
  ) lm ON TRUE
  -- Un count, servido por messages_is_read_idx.
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

-- 2) Nombres de la agenda sobre las conversaciones ya creadas.
--    Los eventos de contactos y los de historial llegan en cualquier orden, así que
--    una charla puede haberse creado antes de conocerse el nombre.
--    Una sola sentencia: una agenda real trae miles de contactos y el N+1 es lo que
--    hizo que la importación tardara horas.
CREATE OR REPLACE FUNCTION apply_contact_names_to_conversations(
  p_user_id UUID,
  p_contacts JSONB
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  WITH updated AS (
    UPDATE conversations c
    SET client_name = x.name
    FROM jsonb_to_recordset(p_contacts) AS x(phone TEXT, name TEXT)
    WHERE c.user_id = p_user_id
      AND regexp_replace(c.client_phone, '\D', '', 'g') IN (
        x.phone,
        CASE WHEN x.phone LIKE '54%' THEN '549' || substring(x.phone FROM 3) END
      )
      AND x.name IS NOT NULL
      AND regexp_replace(x.name, '\D', '', 'g') <> x.name
      -- Un nombre cargado a mano en el CRM manda sobre el de la agenda del celular.
      AND (
        c.client_name IS NULL
        OR regexp_replace(c.client_name, '\D', '', 'g') = c.client_name
      )
    RETURNING c.id
  )
  SELECT count(*) INTO v_count FROM updated;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION apply_contact_names_to_conversations(UUID, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION apply_contact_names_to_conversations(UUID, JSONB) TO service_role;

-- 3) Backfill de lo que ya se había importado mal (idempotente).
--    El historial es contenido que el dueño YA vio en su celular: marcarlo como no
--    leído llenaba la bandeja de badges falsos.
UPDATE messages
SET is_read = true
WHERE metadata->>'imported' = 'true' AND is_read IS NOT TRUE;

--    last_message_at alineado con el último mensaje real, que es por lo que se
--    ordena la lista de chats.
UPDATE conversations c
SET last_message_at = t.real_last
FROM (SELECT conversation_id, max(created_at) AS real_last FROM messages GROUP BY 1) t
WHERE t.conversation_id = c.id
  AND (c.last_message_at IS NULL
       OR abs(extract(epoch FROM (c.last_message_at - t.real_last))) > 60);
