-- Arregla la recursión infinita en la RLS de company_members.
--
-- La policy vieja (company_members_select_same_company) hacía un subquery sobre
-- la MISMA tabla company_members. Con RLS activa eso se auto-referencia y Postgres
-- tira "infinite recursion detected in policy for relation company_members":
-- cualquier SELECT autenticado sobre la tabla falla.
--
-- Solución: mover el "de qué empresas soy miembro" a una función SECURITY DEFINER
-- (bypassa RLS al ejecutarse), y usarla en la policy en vez del subquery directo.

create or replace function public.my_company_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select company_id from company_members where user_id = account_owner_id();
$$;

drop policy if exists "company_members_select_same_company" on company_members;
create policy "company_members_select_same_company" on company_members
  for select using (company_id in (select public.my_company_ids()));
