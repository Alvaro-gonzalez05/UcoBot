-- Sistema de fidelización: tarjeta digital con QR + reglas de acumulación
-- (Aplicada en producción el 2026-06-11 vía MCP de Supabase)

-- Código único por cliente final para su tarjeta pública /tarjeta/[code]
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS loyalty_code UUID DEFAULT gen_random_uuid();
UPDATE public.clients SET loyalty_code = gen_random_uuid() WHERE loyalty_code IS NULL;
ALTER TABLE public.clients ALTER COLUMN loyalty_code SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_loyalty_code ON public.clients (loyalty_code);

-- Regla de acumulación por negocio: X puntos por cada $Y de compra
CREATE TABLE IF NOT EXISTS public.loyalty_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  points_per_unit INTEGER NOT NULL DEFAULT 1 CHECK (points_per_unit >= 0),
  unit_amount NUMERIC(12,2) NOT NULL DEFAULT 100 CHECK (unit_amount > 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.loyalty_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "loyalty_settings_select_own" ON public.loyalty_settings
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "loyalty_settings_insert_own" ON public.loyalty_settings
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "loyalty_settings_update_own" ON public.loyalty_settings
  FOR UPDATE USING (auth.uid() = user_id);
