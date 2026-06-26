-- Sucursal y caja (POS) de Mercado Pago del vendedor, para el QR interoperable.
ALTER TABLE public.mp_connections ADD COLUMN IF NOT EXISTS store_id TEXT;
ALTER TABLE public.mp_connections ADD COLUMN IF NOT EXISTS pos_external_id TEXT;
