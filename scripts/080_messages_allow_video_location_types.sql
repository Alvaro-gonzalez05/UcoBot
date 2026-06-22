-- El CHECK de message_type no permitía 'video' ni 'location', así que esos mensajes
-- entrantes de WhatsApp fallaban al insertarse y se descartaban (ni llegaban al chat).
-- El webhook ya setea esos tipos y el chat ya sabe renderizarlos.
ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_message_type_check;
ALTER TABLE public.messages ADD CONSTRAINT messages_message_type_check
  CHECK (message_type = ANY (ARRAY['text','image','document','audio','video','location','system']));
