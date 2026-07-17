-- Empresas y sucursales (modelo "sucursal = cuenta").
--
-- Diseño: NO se toca UNIQUE(user_id, platform) ni el one-bot-per-user.
-- Cada sucursal es una cuenta normal de UcoBot (su bot, su WhatsApp, su CRM).
-- Lo nuevo es una capa fina arriba:
--   companies         : la empresa (grupo de sucursales)
--   company_members   : qué cuentas pertenecen a la empresa y con qué rol
--                       ('branch' = sucursal; 'company_admin' = ve todas)
--
-- IMPORTANTE: user_profiles.role = 'admin' es el admin de PLATAFORMA
-- (desarrolladores de UcoBot). Acá NO se usa ese rol: el admin de empresa es
-- un rol de company_members, otra cosa distinta.
--
-- Las políticas nuevas son SOLO de SELECT y aditivas: dan lectura
-- cross-sucursal al company_admin sin cambiar nada de lo existente.

create table if not exists companies (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists company_members (
  company_id  uuid not null references companies(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  branch_name text,
  role        text not null default 'branch' check (role in ('branch', 'company_admin')),
  created_at  timestamptz not null default now(),
  primary key (company_id, user_id)
);

-- Una cuenta pertenece a lo sumo a UNA empresa (mantiene el modelo simple).
create unique index if not exists company_members_user_unique
  on company_members (user_id);

alter table companies enable row level security;
alter table company_members enable row level security;

-- Cuentas cuyos datos puede LEER el usuario logueado:
--  - la propia (o la del dueño si es empleado, via account_owner_id() ya existente)
--  - todas las sucursales de su empresa, si es company_admin
create or replace function public.company_visible_account_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select account_owner_id()
  union
  select cm2.user_id
  from company_members cm1
  join company_members cm2 on cm2.company_id = cm1.company_id
  where cm1.user_id = account_owner_id()
    and cm1.role = 'company_admin';
$$;

-- Policies de las tablas nuevas
drop policy if exists "companies_select_member" on companies;
create policy "companies_select_member" on companies
  for select using (
    id in (select company_id from company_members where user_id = account_owner_id())
  );

drop policy if exists "company_members_select_same_company" on company_members;
create policy "company_members_select_same_company" on company_members
  for select using (
    company_id in (select company_id from company_members where user_id = account_owner_id())
  );

-- Alta/gestión de empresas: por ahora solo el admin de PLATAFORMA (nosotros)
-- crea empresas y asigna miembros, desde el panel admin. Los clientes no
-- autogestionan esto todavía (etapa 2 si hace falta).
drop policy if exists "companies_admin_all" on companies;
create policy "companies_admin_all" on companies
  for all using (
    (select role from user_profiles where id = auth.uid()) = 'admin'
  );

drop policy if exists "company_members_admin_all" on company_members;
create policy "company_members_admin_all" on company_members
  for all using (
    (select role from user_profiles where id = auth.uid()) = 'admin'
  );

-- Lectura cross-sucursal para el company_admin en las tablas núcleo del negocio.
-- SOLO SELECT: escribir sigue siendo únicamente sobre la cuenta propia.
drop policy if exists "clients_select_company" on clients;
create policy "clients_select_company" on clients
  for select using (user_id in (select company_visible_account_ids()));

drop policy if exists "conversations_select_company" on conversations;
create policy "conversations_select_company" on conversations
  for select using (user_id in (select company_visible_account_ids()));

drop policy if exists "messages_select_company" on messages;
create policy "messages_select_company" on messages
  for select using (
    conversation_id in (
      select id from conversations where user_id in (select company_visible_account_ids())
    )
  );

drop policy if exists "orders_select_company" on orders;
create policy "orders_select_company" on orders
  for select using (user_id in (select company_visible_account_ids()));

drop policy if exists "reservations_select_company" on reservations;
create policy "reservations_select_company" on reservations
  for select using (user_id in (select company_visible_account_ids()));
