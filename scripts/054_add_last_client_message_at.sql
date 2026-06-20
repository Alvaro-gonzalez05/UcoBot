-- Timestamp del último mensaje ENTRANTE del cliente, para saber con exactitud
-- si la ventana de 24 hs de WhatsApp está abierta o cerrada.
-- (Aplicada en producción el 2026-06-14 vía MCP de Supabase)
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS last_client_message_at TIMESTAMP WITH TIME ZONE;

UPDATE public.conversations c
SET last_client_message_at = sub.max_at
FROM (
  SELECT conversation_id, MAX(created_at) AS max_at
  FROM public.messages
  WHERE sender_type = 'client'
  GROUP BY conversation_id
) sub
WHERE sub.conversation_id = c.id;
