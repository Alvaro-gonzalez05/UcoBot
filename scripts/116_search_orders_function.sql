-- Búsqueda de pedidos por ID visible, cliente y notas, ignorando acentos y mayúsculas.
-- Aplicada via MCP el 2026-07-24 - este archivo es solo registro.
--
-- Antes: la búsqueda solo miraba `delivery_phone` (walk-in/teléfono) y el nombre del
-- cliente registrado, con ilike (sensible a acentos). No se podía buscar por el ID
-- que se muestra en la tarjeta (#5CCBFDCD) ni por el contenido de las notas.

create extension if not exists unaccent with schema extensions;

create or replace function public.search_orders(p_term text, p_limit int default 50)
returns setof public.orders
language sql
stable
security invoker
set search_path = public, extensions
as $$
  with t as (
    select
      extensions.unaccent(trim(coalesce(p_term, ''))) as term,
      -- para el id se ignoran guiones: permite buscar "5CCBFDCD" o "5ccb-fdcd"
      replace(lower(trim(coalesce(p_term, ''))), '-', '') as id_term
  )
  select o.*
  from public.orders o
  left join public.clients c on c.id = o.client_id
  cross join t
  where o.user_id = (select auth.uid())
    and t.term <> ''
    and (
      replace(o.id::text, '-', '') ilike '%' || t.id_term || '%'
      or extensions.unaccent(coalesce(c.name, '')) ilike '%' || t.term || '%'
      or extensions.unaccent(coalesce(o.delivery_phone, '')) ilike '%' || t.term || '%'
      or extensions.unaccent(coalesce(o.customer_notes, '')) ilike '%' || t.term || '%'
    )
  order by o.created_at desc
  limit p_limit;
$$;
