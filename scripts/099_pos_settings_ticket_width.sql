-- Ancho del papel del ticket por negocio (58mm o 80mm). Default 80mm.
-- El navegador no expone el ancho real de la impresora, así que lo elige el negocio.
ALTER TABLE public.pos_settings
  ADD COLUMN IF NOT EXISTS ticket_width SMALLINT NOT NULL DEFAULT 80
  CHECK (ticket_width IN (58, 80));
