-- Marca de "pedido editado por el cliente".
--
-- MOTIVO (30/07/2026): un cliente puede modificar su pedido por WhatsApp mientras
-- esté en pending o confirmed, y hasta ahora la única señal era un texto dentro de
-- customer_notes. Eso es fácil de pasar por alto — sobre todo cuando la comanda ya
-- se imprimió con los items viejos y en la cocina siguen preparando eso.
--
-- La lista de pedidos muestra un aviso ámbar cuando edited_at no es NULL.
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ,
  -- 'client' = lo cambió por WhatsApp; queda lugar para 'staff' si algún día se
  -- marca también la edición desde el panel.
  ADD COLUMN IF NOT EXISTS edited_by TEXT;

COMMENT ON COLUMN orders.edited_at IS
  'Cuándo se modificó el pedido después de creado. NULL = nunca se tocó.';
COMMENT ON COLUMN orders.edited_by IS
  'Quién lo modificó: client (por WhatsApp) o staff (desde el panel).';
