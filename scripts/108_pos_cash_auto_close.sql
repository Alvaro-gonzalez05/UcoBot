-- Cierre automático de caja: configurable por negocio desde la config del POS.
--  'off'   = nunca se cierra sola (la cierra el cajero)
--  'hours' = se cierra tras N horas abierta
--  'daily' = se cierra todos los días a una hora fija
-- Aplicada via MCP el 2026-07-23 - este archivo es solo registro.
-- Se ejecuta con pg_cron cada 15 min (job 'auto-close-cash-sessions').
alter table public.pos_settings
  add column if not exists cash_auto_close_mode text not null default 'off'
    check (cash_auto_close_mode in ('off','hours','daily')),
  add column if not exists cash_auto_close_hours int not null default 12,
  add column if not exists cash_auto_close_time time not null default '23:59';

-- Cierra las cajas vencidas según la config de cada negocio.
-- El arqueo queda en el esperado (nadie contó): diferencia 0 y nota aclaratoria.
create or replace function public.auto_close_stale_cash_sessions()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session record;
  v_expected jsonb;
  v_cash numeric;
  v_closed int := 0;
begin
  for v_session in
    select cs.*, ps.cash_auto_close_mode, ps.cash_auto_close_hours, ps.cash_auto_close_time
    from cash_sessions cs
    join pos_settings ps on ps.user_id = cs.user_id
    where cs.status = 'open'
      and ps.cash_auto_close_mode <> 'off'
      and (
        (ps.cash_auto_close_mode = 'hours'
          and cs.opened_at <= now() - (ps.cash_auto_close_hours || ' hours')::interval)
        or
        -- Diario: ya pasó la hora de corte de algún día posterior a la apertura
        (ps.cash_auto_close_mode = 'daily'
          and now() >= (date_trunc('day', cs.opened_at) + ps.cash_auto_close_time::interval)
          and now() > cs.opened_at)
      )
  loop
    -- Totales por método de la sesión (mismo criterio que el cierre manual)
    select coalesce(jsonb_object_agg(method, total), '{}'::jsonb)
      into v_expected
    from (
      select p->>'method' as method, sum((p->>'amount')::numeric) as total
      from orders o, jsonb_array_elements(coalesce(o.payments, '[]'::jsonb)) p
      where o.cash_session_id = v_session.id and o.status <> 'cancelled'
      group by p->>'method'
    ) t;

    v_cash := coalesce((v_expected->>'cash')::numeric, 0) + coalesce(v_session.opening_amount, 0);

    update cash_sessions
      set status = 'closed',
          closed_at = now(),
          closed_by = coalesce(closed_by, opened_by),
          expected_totals = v_expected || jsonb_build_object('_expected_cash', v_cash),
          counted_totals = jsonb_build_object('cash', v_cash),
          difference = 0,
          closing_amount = v_cash,
          notes = coalesce(nullif(notes, ''), 'Cierre automático (sin arqueo manual)')
      where id = v_session.id;

    v_closed := v_closed + 1;
  end loop;

  return v_closed;
end;
$$;

revoke all on function public.auto_close_stale_cash_sessions() from public;
grant execute on function public.auto_close_stale_cash_sessions() to service_role;

-- select cron.schedule('auto-close-cash-sessions', '*/15 * * * *',
--   $$select public.auto_close_stale_cash_sessions();$$);
