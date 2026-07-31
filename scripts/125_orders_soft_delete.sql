-- Borrado lógico de pedidos.
--
-- MOTIVO (30/07/2026): eliminar un pedido hacía un DELETE real. El registro
-- desaparecía y con él toda posibilidad de auditarlo: el cierre de caja no podía
-- informar cuántos pedidos se borraron durante el turno ni por cuánta plata, que
-- es justo el dato que un dueño quiere ver al arquear (un pedido borrado a mano
-- después de cobrado es plata que salió del sistema sin dejar rastro).
--
-- Ahora se marca la fila. La lista de pedidos filtra por deleted_at IS NULL, así
-- que para el operador no cambia nada: el pedido sigue desapareciendo de su vista.
--
-- OJO al agregar consultas nuevas sobre `orders`: todo lo que sea FACTURACIÓN
-- (finanzas, resumen del negocio) tiene que filtrar `deleted_at IS NULL`, o va a
-- contar como ingreso pedidos que se eliminaron.
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- La lista de pedidos filtra SIEMPRE por esto, y es la consulta más frecuente de
-- la pantalla: índice parcial para no pagar el filtro en cada carga.
CREATE INDEX IF NOT EXISTS idx_orders_not_deleted
  ON orders (user_id, created_at DESC)
  WHERE deleted_at IS NULL;

COMMENT ON COLUMN orders.deleted_at IS
  'Borrado lógico. NULL = pedido vigente. Se conserva la fila para poder auditar el turno en el cierre de caja.';
