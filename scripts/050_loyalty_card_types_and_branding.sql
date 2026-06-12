-- Fidelización v2: dos tipos de tarjeta (puntos / sellos) + personalización visual
-- (Aplicada en producción el 2026-06-12 vía MCP de Supabase)

ALTER TABLE public.loyalty_settings
  ADD COLUMN IF NOT EXISTS card_type TEXT NOT NULL DEFAULT 'points' CHECK (card_type IN ('points', 'stamps')),
  ADD COLUMN IF NOT EXISTS stamps_required INTEGER NOT NULL DEFAULT 10 CHECK (stamps_required > 0),
  ADD COLUMN IF NOT EXISTS stamp_reward TEXT,
  ADD COLUMN IF NOT EXISTS card_color TEXT NOT NULL DEFAULT '#D1F366',
  ADD COLUMN IF NOT EXISTS logo_url TEXT,
  ADD COLUMN IF NOT EXISTS cover_image_url TEXT;

-- Contador de sellos del ciclo actual de cada cliente final
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS stamps INTEGER NOT NULL DEFAULT 0;
