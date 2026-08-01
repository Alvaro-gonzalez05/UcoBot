-- Tiempo de entrega según la carga real de trabajo.
--
-- MOTIVO (31/07/2026): el tiempo era un texto fijo ("20-25 minutos") y el bot lo
-- repetía igual con la cocina vacía que con quince pedidos encima. En una pizzería
-- un viernes a la noche eso es prometer algo que no se va a cumplir, y el reclamo
-- llega igual aunque el bot solo haya repetido lo que estaba configurado.
--
-- El cálculo se piensa como lo piensa un cocinero: "puedo hacer N pedidos a la vez
-- y cada tanda me lleva M minutos". Cada tanda por delante suma su tiempo.
-- Ver lib/delivery-time.ts.
ALTER TABLE delivery_settings
  ADD COLUMN IF NOT EXISTS kitchen_capacity INTEGER,
  ADD COLUMN IF NOT EXISTS batch_minutes INTEGER,
  ADD COLUMN IF NOT EXISTS max_extra_minutes INTEGER;

COMMENT ON COLUMN delivery_settings.kitchen_capacity IS
  'Pedidos que se preparan en paralelo. NULL = no se ajusta el tiempo por demanda.';
COMMENT ON COLUMN delivery_settings.batch_minutes IS
  'Minutos que suma cada tanda de pedidos por delante.';
COMMENT ON COLUMN delivery_settings.max_extra_minutes IS
  'Tope de minutos extra que puede sumar la demanda.';
