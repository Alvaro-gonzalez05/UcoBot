-- Equipos/sucursales activable + lectura cross-sucursal de caja/stock/finanzas.
-- Aplicada via MCP el 2026-07-23 - este archivo es solo registro.

-- 1) Equipos/sucursales como función activable por cuenta (como el resto de features).
alter table public.user_profiles
  add column if not exists team_enabled boolean not null default false;

-- Las cuentas que YA tienen sucursales o empleados quedan con la función activada.
update public.user_profiles p
set team_enabled = true
where p.team_enabled = false
  and (
    exists (select 1 from company_members cm where cm.user_id = p.id)
    or exists (select 1 from user_profiles e where e.parent_user_id = p.id)
  );

-- 2) Lectura cross-sucursal para el admin de empresa (solo SELECT, aditiva).
--    Reusa company_visible_account_ids() de la migración 102.
drop policy if exists "cash_sessions_select_company" on public.cash_sessions;
create policy "cash_sessions_select_company" on public.cash_sessions
  for select using (user_id in (select company_visible_account_ids()));

drop policy if exists "products_select_company" on public.products;
create policy "products_select_company" on public.products
  for select using (user_id in (select company_visible_account_ids()));

drop policy if exists "supplies_select_company" on public.supplies;
create policy "supplies_select_company" on public.supplies
  for select using (user_id in (select company_visible_account_ids()));

drop policy if exists "financial_transactions_select_company" on public.financial_transactions;
create policy "financial_transactions_select_company" on public.financial_transactions
  for select using (user_id in (select company_visible_account_ids()));
