-- Agregar 'messenger' como plataforma soportada en todas las tablas con check de platform
-- (Aplicada en producción el 2026-06-11 vía MCP de Supabase)

ALTER TABLE public.integrations DROP CONSTRAINT IF EXISTS integrations_platform_check;
ALTER TABLE public.integrations ADD CONSTRAINT integrations_platform_check
  CHECK (platform::text IN ('whatsapp', 'instagram', 'gmail', 'messenger'));

ALTER TABLE public.bots DROP CONSTRAINT IF EXISTS bots_platform_check;
ALTER TABLE public.bots ADD CONSTRAINT bots_platform_check
  CHECK (platform IN ('whatsapp', 'instagram', 'email', 'messenger'));

ALTER TABLE public.conversations DROP CONSTRAINT IF EXISTS conversations_platform_check;
ALTER TABLE public.conversations ADD CONSTRAINT conversations_platform_check
  CHECK (platform IN ('whatsapp', 'instagram', 'email', 'test', 'messenger'));

ALTER TABLE public.templates DROP CONSTRAINT IF EXISTS templates_platform_check;
ALTER TABLE public.templates ADD CONSTRAINT templates_platform_check
  CHECK (platform IN ('whatsapp', 'instagram', 'gmail', 'messenger'));

ALTER TABLE public.scheduled_messages DROP CONSTRAINT IF EXISTS scheduled_messages_platform_check;
ALTER TABLE public.scheduled_messages ADD CONSTRAINT scheduled_messages_platform_check
  CHECK (platform IN ('whatsapp', 'instagram', 'email', 'messenger'));

ALTER TABLE public.automation_logs DROP CONSTRAINT IF EXISTS automation_logs_platform_check;
ALTER TABLE public.automation_logs ADD CONSTRAINT automation_logs_platform_check
  CHECK (platform IN ('whatsapp', 'instagram', 'email', 'messenger'));

-- PSID (Page-Scoped ID) del usuario de Messenger en la conversación
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS client_messenger_id TEXT;
CREATE INDEX IF NOT EXISTS idx_conversations_client_messenger_id
  ON public.conversations (client_messenger_id)
  WHERE client_messenger_id IS NOT NULL;
