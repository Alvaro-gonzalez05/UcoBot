-- Notificación de stock bajo: se dispara al CRUZAR el umbral y lista TODO lo que
-- falta en esa cuenta. Si la cuenta es una sucursal, el admin de la empresa
-- recibe una copia con el nombre del local y un link directo a su stock.
-- Aplicada via MCP el 2026-07-23 - este archivo es solo registro.
create or replace function public.notify_low_stock(
  p_user_id uuid, p_item_id uuid, p_name text, p_qty numeric, p_unit text
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_company uuid; v_admin uuid; v_branch_name text; v_list text; v_count int;
begin
  -- Anti-spam: si ya se avisó por este item en las últimas 12 h, no repetir
  if exists (select 1 from notifications
             where metadata->>'stock_item_id' = p_item_id::text
               and created_at > now() - interval '12 hours') then
    return;
  end if;

  with faltantes as (
    select s.name, s.stock_quantity as qty, coalesce(s.unit,'un') as unit
    from supplies s
    where s.user_id = p_user_id and s.is_active
      and s.low_stock_threshold is not null
      and s.stock_quantity <= s.low_stock_threshold
    union all
    select p.name, coalesce(p.stock_quantity,0), 'un'
    from products p
    where p.user_id = p_user_id and coalesce(p.track_stock,false)
      and p.low_stock_threshold is not null
      and coalesce(p.stock_quantity,0) <= p.low_stock_threshold
  )
  select count(*),
         string_agg(
           name || ': ' ||
           case when qty <= 0 then 'sin stock'
                -- rtrim del '.' que deja to_char cuando el número es entero
                else rtrim(rtrim(to_char(qty,'FM999999990.999'), '0'), '.') || ' ' || unit end,
           ' · ' order by qty)
    into v_count, v_list
  from faltantes;

  if v_count = 0 then return; end if;

  insert into notifications (user_id, title, message, type, link, metadata)
  values (p_user_id,
    case when v_count = 1 then 'Stock bajo: 1 producto' else 'Stock bajo: ' || v_count || ' productos' end,
    v_list, 'warning', '/dashboard/stock',
    jsonb_build_object('stock_item_id', p_item_id, 'kind','low_stock','count',v_count));

  select cm.company_id, cm.branch_name into v_company, v_branch_name
  from company_members cm where cm.user_id = p_user_id;
  if v_company is null then return; end if;

  select cm.user_id into v_admin from company_members cm
  where cm.company_id = v_company and cm.role = 'company_admin' limit 1;
  if v_admin is null or v_admin = p_user_id then return; end if;

  insert into notifications (user_id, title, message, type, link, metadata)
  values (v_admin,
    coalesce(v_branch_name,'Sucursal') || ': ' || v_count ||
      case when v_count = 1 then ' producto por reponer' else ' productos por reponer' end,
    v_list, 'warning', '/dashboard/stock?sucursal=' || p_user_id::text,
    jsonb_build_object('stock_item_id',p_item_id,'kind','low_stock','branch_id',p_user_id,'count',v_count));
end; $$;

-- Triggers: se disparan al cambiar la cantidad en stock
create or replace function public.trg_supplies_low_stock()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.low_stock_threshold is null then return new; end if;
  if new.stock_quantity > new.low_stock_threshold then return new; end if;
  if old.stock_quantity is not null and old.low_stock_threshold is not null
     and old.stock_quantity <= old.low_stock_threshold then
    return new;
  end if;
  perform notify_low_stock(new.user_id, new.id, new.name, new.stock_quantity, new.unit);
  return new;
end $$;

drop trigger if exists supplies_low_stock on public.supplies;
create trigger supplies_low_stock
  after update of stock_quantity on public.supplies
  for each row execute function public.trg_supplies_low_stock();

create or replace function public.trg_products_low_stock()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not coalesce(new.track_stock, false) or new.low_stock_threshold is null then return new; end if;
  if coalesce(new.stock_quantity, 0) > new.low_stock_threshold then return new; end if;
  if old.stock_quantity is not null and old.low_stock_threshold is not null
     and old.stock_quantity <= old.low_stock_threshold then
    return new;
  end if;
  perform notify_low_stock(new.user_id, new.id, new.name, coalesce(new.stock_quantity, 0), 'un');
  return new;
end $$;

drop trigger if exists products_low_stock on public.products;
create trigger products_low_stock
  after update of stock_quantity on public.products
  for each row execute function public.trg_products_low_stock();
