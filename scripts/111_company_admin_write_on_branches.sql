-- El admin de la empresa pasa a poder OPERAR sus sucursales, no solo mirarlas:
-- cobrar pedidos, cargar productos, registrar gastos, mover caja y ajustar stock.
-- Reusa company_visible_account_ids(), que ya devuelve la cuenta propia + las
-- sucursales SOLO si quien pregunta es company_admin.
-- Aplicada via MCP el 2026-07-23 - este archivo es solo registro.
do $$
declare
  t text;
begin
  foreach t in array array[
    'orders', 'products', 'financial_transactions', 'supplies',
    'cash_sessions', 'stock_movements', 'product_supplies',
    'product_option_groups', 'product_option_items', 'product_option_links',
    'pos_settings', 'clients'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', t || '_company_write', t);
    execute format(
      'create policy %I on public.%I for all
         using (user_id in (select company_visible_account_ids()))
         with check (user_id in (select company_visible_account_ids()))',
      t || '_company_write', t
    );
  end loop;
end $$;
