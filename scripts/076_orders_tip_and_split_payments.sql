-- Propinas registradas + pagos divididos (varios métodos por pedido)
-- (Aplicada vía MCP el 2026-07-08 — este archivo es solo registro)
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS tip_amount numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payments jsonb DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.orders.tip_amount IS 'Propina/extra cobrada con la venta';
COMMENT ON COLUMN public.orders.payments IS 'Pagos registrados: [{method, amount, label?, items?}] — permite pago dividido con distintos métodos';
