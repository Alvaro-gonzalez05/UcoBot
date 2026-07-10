-- Opciones/modificadores de producto (ej: "Tipo de bebida" -> Coca, Coca Zero...)
-- Aplicada via MCP el 2026-07-10 - este archivo es solo registro.
create table if not exists public.product_option_groups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  required boolean not null default false,   -- obligatorio u opcional
  multi boolean not null default false,      -- permite elegir varias opciones
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.product_option_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  group_id uuid not null references public.product_option_groups(id) on delete cascade,
  name text not null,
  price_delta numeric(12,2) not null default 0,  -- suma (o no) al precio del producto
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.product_option_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  group_id uuid not null references public.product_option_groups(id) on delete cascade,
  unique (product_id, group_id)
);

create index if not exists idx_option_items_group on public.product_option_items(group_id);
create index if not exists idx_option_links_product on public.product_option_links(product_id);
create index if not exists idx_option_links_group on public.product_option_links(group_id);
create index if not exists idx_option_groups_user on public.product_option_groups(user_id);

alter table public.product_option_groups enable row level security;
alter table public.product_option_items enable row level security;
alter table public.product_option_links enable row level security;

create policy member_all_option_groups on public.product_option_groups
  for all using (user_id = account_owner_id()) with check (user_id = account_owner_id());
create policy member_all_option_items on public.product_option_items
  for all using (user_id = account_owner_id()) with check (user_id = account_owner_id());
create policy member_all_option_links on public.product_option_links
  for all using (user_id = account_owner_id()) with check (user_id = account_owner_id());
