-- Estado "en revisión": un humano está revisando la conversación.
-- Igual que needs_attention (AYUDA), es un flag aparte del status.
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS in_review BOOLEAN NOT NULL DEFAULT false;
