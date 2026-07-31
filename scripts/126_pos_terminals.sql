-- Terminales (computadoras) de un punto de venta.
--
-- MOTIVO (30/07/2026): una sucursal es UNA cuenta, pero puede tener varias
-- computadoras usándola al mismo tiempo. Hasta ahora eran indistinguibles: no se
-- podía saber desde qué caja se hizo una venta ni qué máquina abrió el turno.
--
-- El navegador no expone ningún identificador estable de la máquina (por
-- privacidad), así que la terminal se identifica con un UUID que genera el propio
-- navegador y guarda en localStorage (ver hooks/use-terminal.ts). Consecuencias:
--   - Es por navegador y por perfil: Chrome y Edge en la misma PC son dos
--     terminales distintas.
--   - Si borran los datos del sitio, la PC vuelve a aparecer como nueva y hay que
--     renombrarla.
-- No hay forma de evitarlo desde una web; alcanza de sobra para el uso real.
CREATE TABLE IF NOT EXISTS pos_terminals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT 'Terminal sin nombre',
  user_agent TEXT,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, device_id)
);

CREATE INDEX IF NOT EXISTS idx_pos_terminals_user ON pos_terminals (user_id, last_seen_at DESC);

ALTER TABLE pos_terminals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS member_all_pos_terminals ON pos_terminals;
CREATE POLICY member_all_pos_terminals ON pos_terminals
  FOR ALL USING (user_id = account_owner_id()) WITH CHECK (user_id = account_owner_id());

-- Desde qué terminal se abrió el turno y se hizo cada venta.
ALTER TABLE cash_sessions ADD COLUMN IF NOT EXISTS terminal_id UUID REFERENCES pos_terminals(id) ON DELETE SET NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS terminal_id UUID REFERENCES pos_terminals(id) ON DELETE SET NULL;

COMMENT ON TABLE pos_terminals IS
  'Computadoras que usan el punto de venta de una cuenta. Se identifican por un UUID guardado en localStorage del navegador.';
