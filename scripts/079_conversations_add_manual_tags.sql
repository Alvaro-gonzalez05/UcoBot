-- manual_tags: subconjunto de lead_tags que asignó un humano a mano.
-- La IA nunca toca estas; solo puede reemplazar las que ella misma sumó.
-- lead_tags sigue siendo el conjunto completo que se muestra/filtra (manual + IA).
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS manual_tags TEXT[] NOT NULL DEFAULT '{}';
