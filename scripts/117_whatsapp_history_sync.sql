-- Sincronización de historial de WhatsApp (coexistencia)
--
-- Cuando un número se da de alta por "Coexistencia de la APP de WhatsApp Business",
-- Meta manda UNA SOLA VEZ, a los minutos del alta:
--   - whatsapp.smb.history          → los chats anteriores, EN TANDAS (phase/chunk_order/progress)
--   - whatsapp.smb.app.state.sync   → los contactos de la agenda (y sus altas/bajas futuras)
--
-- El webhook NO procesa nada en el momento: estaciona el payload crudo acá y
-- responde 200 al instante. Motivo: las tandas de historial son grandes y un
-- procesamiento lento hace que YCloud reintente (ya nos pasó el 413 de Vercel con
-- el history-sync de Evolution). Un cron los procesa después, con reintentos.

CREATE TABLE IF NOT EXISTS whatsapp_sync_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Número del negocio (solo dígitos), igual que integrations.config->>phone_number_id
  phone_number_id TEXT NOT NULL,

  -- 'history' | 'app_state_sync'
  event_type TEXT NOT NULL CHECK (event_type IN ('history', 'app_state_sync')),

  payload JSONB NOT NULL,

  -- Metadata de la tanda (solo para history). Sirve para la barra de progreso.
  phase TEXT,
  chunk_order INTEGER,
  progress NUMERIC(5,2),

  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'error')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,

  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ
);

-- El cron levanta siempre los pendientes más viejos primero (respeta chunk_order
-- dentro de la misma tanda para no importar mensajes desordenados).
CREATE INDEX IF NOT EXISTS idx_wa_sync_chunks_pending
  ON whatsapp_sync_chunks (status, received_at, chunk_order)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_wa_sync_chunks_user
  ON whatsapp_sync_chunks (user_id, event_type, received_at DESC);

ALTER TABLE whatsapp_sync_chunks ENABLE ROW LEVEL SECURITY;

-- Solo lectura para el dueño de la cuenta (la UI muestra el progreso de la
-- importación). La escritura la hace el webhook con service role, que saltea RLS.
DROP POLICY IF EXISTS "Owner reads own sync chunks" ON whatsapp_sync_chunks;
CREATE POLICY "Owner reads own sync chunks" ON whatsapp_sync_chunks
  FOR SELECT USING (user_id = account_owner_id());

COMMENT ON TABLE whatsapp_sync_chunks IS
  'Staging de los webhooks de coexistencia (historial de chats y contactos). El webhook estaciona, el cron procesa.';
