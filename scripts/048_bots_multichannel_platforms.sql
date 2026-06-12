-- Bot multicanal: un bot puede atender varios canales a la vez.
-- `platforms` reemplaza gradualmente a `platform` (que queda por compatibilidad).
-- (Aplicada en producción el 2026-06-11 vía MCP de Supabase)

ALTER TABLE public.bots ADD COLUMN IF NOT EXISTS platforms TEXT[] NOT NULL DEFAULT '{}';

-- Backfill: cada bot existente atiende el canal que ya tenía
UPDATE public.bots SET platforms = ARRAY[platform] WHERE platforms = '{}' AND platform IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bots_platforms ON public.bots USING GIN (platforms);
