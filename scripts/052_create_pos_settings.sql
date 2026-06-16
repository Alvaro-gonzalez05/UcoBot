-- Configuración del Punto de Venta por negocio: medios de pago aceptados y propina
-- (Aplicada en producción el 2026-06-14 vía MCP de Supabase)
CREATE TABLE IF NOT EXISTS public.pos_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  payment_methods TEXT[] NOT NULL DEFAULT '{cash,card,transfer,link}',
  tip_enabled BOOLEAN NOT NULL DEFAULT false,
  tip_percent NUMERIC(5,2) NOT NULL DEFAULT 10 CHECK (tip_percent >= 0 AND tip_percent <= 100),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.pos_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pos_settings_select_own" ON public.pos_settings
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "pos_settings_insert_own" ON public.pos_settings
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "pos_settings_update_own" ON public.pos_settings
  FOR UPDATE USING (auth.uid() = user_id);
