-- Stock: insumos, recetas (producto -> insumos) y movimientos de auditoría.
-- Aplicada via MCP el 2026-07-20 - este archivo es solo registro.
create table if not exists public.supplies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  unit text not null default 'un',   -- un, kg, g, l, ml
  stock_quantity numeric(12,3) not null default 0,
  low_stock_threshold numeric(12,3),  -- null = sin alerta
  cost numeric(12,2),                 -- costo por unidad (opcional)
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.product_supplies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  supply_id uuid not null references public.supplies(id) on delete cascade,
  quantity numeric(12,3) not null,
  unique (product_id, supply_id)
);

create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  supply_id uuid references public.supplies(id) on delete cascade,
  product_id uuid references public.products(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  quantity numeric(12,3) not null,   -- negativo = consumo, positivo = reposición/ajuste
  reason text not null check (reason in ('sale','cancel_restock','manual_adjust','purchase','waste')),
  notes text,
  created_at timestamptz not null default now()
);

alter table public.products
  add column if not exists track_stock boolean not null default false,
  add column if not exists stock_quantity numeric(12,3),
  add column if not exists low_stock_threshold numeric(12,3);

alter table public.orders add column if not exists stock_applied boolean not null default false;

create index if not exists idx_supplies_user on public.supplies(user_id);
create index if not exists idx_product_supplies_product on public.product_supplies(product_id);
create index if not exists idx_product_supplies_supply on public.product_supplies(supply_id);
create index if not exists idx_stock_movements_user on public.stock_movements(user_id, created_at desc);
create index if not exists idx_stock_movements_order on public.stock_movements(order_id);

alter table public.supplies enable row level security;
alter table public.product_supplies enable row level security;
alter table public.stock_movements enable row level security;

create policy member_all_supplies on public.supplies
  for all using (user_id = account_owner_id()) with check (user_id = account_owner_id());
create policy member_all_product_supplies on public.product_supplies
  for all using (user_id = account_owner_id()) with check (user_id = account_owner_id());
create policy member_all_stock_movements on public.stock_movements
  for all using (user_id = account_owner_id()) with check (user_id = account_owner_id());
