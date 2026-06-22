-- Pasamos de una etiqueta única (lead_tag TEXT) a varias (lead_tags TEXT[]).
-- Permite asignar más de una etiqueta por conversación (manual o por IA).
-- Mantenemos lead_tag por compatibilidad, pero la app ahora usa lead_tags.
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS lead_tags TEXT[] NOT NULL DEFAULT '{}';

-- Backfill: pasamos la etiqueta vieja (si tenía) al array nuevo.
UPDATE public.conversations
SET lead_tags = ARRAY[lead_tag]
WHERE lead_tag IS NOT NULL AND lead_tag <> '' AND (lead_tags = '{}' OR lead_tags IS NULL);

-- Índice GIN para filtrar eficiente por etiquetas dentro del array.
CREATE INDEX IF NOT EXISTS conversations_lead_tags_gin_idx
  ON public.conversations USING GIN (lead_tags);
