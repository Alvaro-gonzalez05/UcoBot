-- Faltaban en la 109: el admin de empresa no podía leer los movimientos de stock
-- ni las recetas de sus sucursales (la sección Stock salía vacía al "entrar").
-- Aplicada via MCP el 2026-07-23 - este archivo es solo registro.
drop policy if exists "stock_movements_select_company" on public.stock_movements;
create policy "stock_movements_select_company" on public.stock_movements
  for select using (user_id in (select company_visible_account_ids()));

drop policy if exists "product_supplies_select_company" on public.product_supplies;
create policy "product_supplies_select_company" on public.product_supplies
  for select using (user_id in (select company_visible_account_ids()));
