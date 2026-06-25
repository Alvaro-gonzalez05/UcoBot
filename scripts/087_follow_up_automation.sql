-- Automatización de SEGUIMIENTO (follow_up): mensaje a clientes que hablaron y no
-- cerraron, antes de que venza la ventana de 24 hs.

-- 1) Permitir el nuevo trigger_type 'follow_up' (y mantener los existentes).
ALTER TABLE public.automations DROP CONSTRAINT IF EXISTS automations_trigger_type_check;
ALTER TABLE public.automations ADD CONSTRAINT automations_trigger_type_check
CHECK (trigger_type IN (
  'birthday', 'inactive_client', 'new_promotion', 'welcome',
  'new_order', 'order_ready', 'reservation_reminder', 'comment_reply', 'follow_up'
));

-- 2) Marca para no mandar el seguimiento dos veces a la misma conversación.
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS follow_up_sent_at TIMESTAMPTZ;
