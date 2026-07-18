-- Lectura cross-sucursal para bots y automations (complementa la migración 102,
-- que ya cubrió clients/conversations/messages/orders/reservations).
--
-- Sin esto, el dashboard agregado del dueño (company_admin) contaría los bots y
-- automatizaciones de las sucursales como vacíos. SOLO SELECT, aditivo: escribir
-- sigue siendo únicamente sobre la cuenta propia.

drop policy if exists "bots_select_company" on bots;
create policy "bots_select_company" on bots
  for select using (user_id in (select company_visible_account_ids()));

drop policy if exists "automations_select_company" on automations;
create policy "automations_select_company" on automations
  for select using (user_id in (select company_visible_account_ids()));
