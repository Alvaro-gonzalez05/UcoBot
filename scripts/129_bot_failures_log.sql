-- Registro de fallos del bot, para diagnóstico del administrador.
--
-- MOTIVO (31/07/2026): cuando el bot no puede responder, el cliente recibe
-- "disculpá, tengo problemas técnicos" y ahí termina todo. El dueño se entera por
-- la notificación, pero quien tiene que ARREGLARLO (el admin de la plataforma) no
-- veía nada: había que entrar a los logs de Vercel y buscar a mano. Pasó
-- exactamente eso con un import roto — el bot pidió disculpas un rato largo sin
-- que nadie supiera por qué.
--
-- Se muestra en /dashboard/admin/salud.
CREATE TABLE IF NOT EXISTS bot_failures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  bot_id UUID REFERENCES bots(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,

  -- Categoría corta y estable, para poder agrupar ('ia_sin_respuesta',
  -- 'falta_api_key', 'respuesta_vacia', 'error_inesperado', 'total_mal_calculado').
  reason TEXT NOT NULL,
  -- Mensaje técnico completo: es lo que evita tener que ir a los logs.
  detail TEXT,
  -- Qué llegó a escribir el cliente, para poder reproducirlo.
  user_message TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bot_failures_recent ON bot_failures (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bot_failures_user ON bot_failures (user_id, created_at DESC);

ALTER TABLE bot_failures ENABLE ROW LEVEL SECURITY;

-- El admin de la plataforma ve TODOS los fallos: es quien los arregla.
DROP POLICY IF EXISTS admin_read_bot_failures ON bot_failures;
CREATE POLICY admin_read_bot_failures ON bot_failures
  FOR SELECT USING (is_admin());

-- Y cada cuenta ve los suyos.
DROP POLICY IF EXISTS owner_read_bot_failures ON bot_failures;
CREATE POLICY owner_read_bot_failures ON bot_failures
  FOR SELECT USING (user_id = account_owner_id());

COMMENT ON TABLE bot_failures IS
  'Fallos del bot al responder. Se escribe con service role desde el webhook; lo lee el panel de administración.';

-- NOTA sobre delivery_settings (mismo día): la pestaña de Configuración de la
-- sección Pedidos se eliminó. Todo lo de envío (costo, mínimo, modalidades,
-- tiempos) ahora lo escribe el dueño en las instrucciones del bot, y el ajuste por
-- demanda pasó a bots.feature_config.demand. Las columnas kitchen_capacity /
-- batch_minutes / max_extra_minutes de la migración 128 quedan sin uso; no se
-- borran por si se quiere volver atrás.
