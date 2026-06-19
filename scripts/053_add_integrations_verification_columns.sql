-- El código (conexión manual, callbacks de Meta y /api/integrations/status) usa
-- estas columnas pero nunca se habían creado en la tabla integrations.
-- (Aplicada en producción el 2026-06-14 vía MCP de Supabase)
ALTER TABLE public.integrations
  ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS webhook_verified_at TIMESTAMP WITH TIME ZONE;

-- Las integraciones ya activas se consideran verificadas para no perder conexiones existentes
UPDATE public.integrations SET is_verified = true WHERE is_active = true AND is_verified = false;
