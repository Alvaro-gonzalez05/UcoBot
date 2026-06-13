-- Ajustes visuales de la tarjeta: posición vertical de la portada y encaje del logo
-- (Aplicada en producción el 2026-06-12 vía MCP de Supabase)
ALTER TABLE public.loyalty_settings
  ADD COLUMN IF NOT EXISTS cover_position INTEGER NOT NULL DEFAULT 50 CHECK (cover_position BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS logo_fit TEXT NOT NULL DEFAULT 'cover' CHECK (logo_fit IN ('cover', 'contain'));
