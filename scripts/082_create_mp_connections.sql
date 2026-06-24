-- Conexión de Mercado Pago de cada cliente (Parte B: cobrar a SUS clientes).
-- Tokens accesibles SOLO desde el servidor (RLS activo sin policies = solo service role).
CREATE TABLE IF NOT EXISTS public.mp_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  mp_user_id TEXT,                 -- id del vendedor en Mercado Pago
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  public_key TEXT,
  expires_at TIMESTAMPTZ,          -- vencimiento del access_token (~6 meses)
  connected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.mp_connections ENABLE ROW LEVEL SECURITY;
-- Sin policies: ningún cliente puede leer los tokens. Todo acceso es server-side (service role).
