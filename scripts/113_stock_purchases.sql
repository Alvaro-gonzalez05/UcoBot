-- Compras / reposiciones de stock. Registrar una compra:
--   1) sube el stock de cada insumo/producto,
--   2) fija su costo al ÚLTIMO PRECIO PAGADO,
--   3) deja un movimiento de stock (reason 'purchase'),
--   4) genera automáticamente el GASTO en finanzas (category mercaderia),
--      enlazado por financial_transaction_id.
-- Se puede registrar desde Stock o desde Finanzas (misma tabla/RPC).
-- Aplicada via MCP el 2026-07-23 - este archivo es solo registro.
create table if not exists public.purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  supplier text,
  note text,
  total numeric(12,2) not null default 0,
  purchased_at date not null default current_date,
  payment_method text not null default 'cash',
  -- items: [{supply_id?, product_id?, name, quantity, unit_cost, subtotal}]
  items jsonb not null default '[]'::jsonb,
  financial_transaction_id uuid references public.financial_transactions(id) on delete set null,
  applied boolean not null default false,
  source text not null default 'manual',   -- 'manual' | 'ticket' (foto)
  created_at timestamptz not null default now()
);

create index if not exists idx_purchases_user on public.purchases(user_id, created_at desc);

alter table public.purchases enable row level security;

drop policy if exists "purchases_all_own" on public.purchases;
create policy "purchases_all_own" on public.purchases
  for all using (user_id = account_owner_id()) with check (user_id = account_owner_id());

drop policy if exists "purchases_all_company" on public.purchases;
create policy "purchases_all_company" on public.purchases
  for all using (user_id in (select company_visible_account_ids()))
             with check (user_id in (select company_visible_account_ids()));

create or replace function public.apply_purchase(p_purchase_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pur record;
  v_item jsonb;
  v_supply uuid;
  v_product uuid;
  v_qty numeric;
  v_cost numeric;
  v_tx uuid;
begin
  select * into v_pur from purchases where id = p_purchase_id for update;
  if not found then return; end if;

  if auth.uid() is not null and v_pur.user_id not in (select company_visible_account_ids()) then
    raise exception 'Compra de otra cuenta';
  end if;

  if v_pur.applied then return; end if;

  for v_item in select * from jsonb_array_elements(coalesce(v_pur.items, '[]'::jsonb))
  loop
    v_qty := coalesce(nullif(v_item->>'quantity','')::numeric, 0);
    if v_qty <= 0 then continue; end if;
    v_cost := nullif(v_item->>'unit_cost','')::numeric;
    v_supply := nullif(v_item->>'supply_id','')::uuid;
    v_product := nullif(v_item->>'product_id','')::uuid;

    if v_supply is not null then
      update supplies
        set stock_quantity = stock_quantity + v_qty,
            cost = coalesce(v_cost, cost),   -- último precio pagado
            updated_at = now()
        where id = v_supply and user_id = v_pur.user_id;
      insert into stock_movements (user_id, supply_id, quantity, reason, notes)
        values (v_pur.user_id, v_supply, v_qty, 'purchase',
                nullif(trim(coalesce(v_pur.supplier,'')), ''));
    elsif v_product is not null then
      update products
        set stock_quantity = coalesce(stock_quantity, 0) + v_qty
        where id = v_product and user_id = v_pur.user_id;
      insert into stock_movements (user_id, product_id, quantity, reason, notes)
        values (v_pur.user_id, v_product, v_qty, 'purchase',
                nullif(trim(coalesce(v_pur.supplier,'')), ''));
    end if;
  end loop;

  if v_pur.financial_transaction_id is null and coalesce(v_pur.total,0) > 0 then
    insert into financial_transactions (user_id, type, category, description, amount, transaction_date, payment_method)
    values (v_pur.user_id, 'expense', 'mercaderia',
            'Compra de stock' || case when v_pur.supplier is not null and v_pur.supplier <> '' then ' · ' || v_pur.supplier else '' end,
            v_pur.total, v_pur.purchased_at, v_pur.payment_method)
    returning id into v_tx;
    update purchases set financial_transaction_id = v_tx where id = p_purchase_id;
  end if;

  update purchases set applied = true where id = p_purchase_id;
end;
$$;

revoke all on function public.apply_purchase(uuid) from public;
grant execute on function public.apply_purchase(uuid) to authenticated, service_role;
