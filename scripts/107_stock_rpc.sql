-- Punto único de descuento/reposición de stock por orden (POS, panel de pedidos y bot).
-- p_direction = -1 descuenta (venta), +1 repone (cancelación). Idempotente vía orders.stock_applied.
-- Aplicada via MCP el 2026-07-20 - este archivo es solo registro.
create or replace function public.apply_order_stock(p_order_id uuid, p_direction int)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order record;
  v_item jsonb;
  v_product_id uuid;
  v_qty numeric;
  v_reason text;
  v_recipe record;
  v_track boolean;
begin
  if p_direction not in (-1, 1) then
    raise exception 'p_direction debe ser -1 (venta) o 1 (reposición)';
  end if;

  select id, user_id, items, coalesce(stock_applied, false) as stock_applied
    into v_order
    from orders
    where id = p_order_id
    for update;

  if not found then
    return;
  end if;

  -- Usuarios autenticados solo pueden tocar órdenes de su propia cuenta
  -- (el service role del webhook llama sin auth.uid() y pasa directo)
  if auth.uid() is not null and v_order.user_id <> account_owner_id() then
    raise exception 'Orden de otra cuenta';
  end if;

  -- Idempotencia: no descontar dos veces ni reponer lo que nunca se descontó
  if p_direction = -1 and v_order.stock_applied then return; end if;
  if p_direction = 1 and not v_order.stock_applied then return; end if;

  v_reason := case when p_direction = -1 then 'sale' else 'cancel_restock' end;

  for v_item in select * from jsonb_array_elements(coalesce(v_order.items, '[]'::jsonb))
  loop
    -- Marcadores "-N" de edición: no son productos reales
    if coalesce((v_item->>'removed')::boolean, false) then continue; end if;
    v_product_id := nullif(v_item->>'product_id', '')::uuid;
    if v_product_id is null then continue; end if;
    v_qty := coalesce(nullif(v_item->>'quantity', '')::numeric, 1);
    if v_qty <= 0 then continue; end if;

    -- Receta: descuenta/repone insumos (cantidad vendida x cantidad por unidad)
    for v_recipe in
      select ps.supply_id, ps.quantity as per_unit
      from product_supplies ps
      where ps.product_id = v_product_id
    loop
      update supplies
        set stock_quantity = stock_quantity + (p_direction * v_qty * v_recipe.per_unit),
            updated_at = now()
        where id = v_recipe.supply_id;
      insert into stock_movements (user_id, supply_id, order_id, quantity, reason)
        values (v_order.user_id, v_recipe.supply_id, p_order_id, p_direction * v_qty * v_recipe.per_unit, v_reason);
    end loop;

    -- Stock directo del producto (bebidas / items comprados)
    select track_stock into v_track from products where id = v_product_id;
    if coalesce(v_track, false) then
      update products
        set stock_quantity = coalesce(stock_quantity, 0) + (p_direction * v_qty)
        where id = v_product_id;
      insert into stock_movements (user_id, product_id, order_id, quantity, reason)
        values (v_order.user_id, v_product_id, p_order_id, p_direction * v_qty, v_reason);
    end if;
  end loop;

  update orders set stock_applied = (p_direction = -1) where id = p_order_id;
end;
$$;

revoke all on function public.apply_order_stock(uuid, int) from public;
grant execute on function public.apply_order_stock(uuid, int) to authenticated, service_role;
