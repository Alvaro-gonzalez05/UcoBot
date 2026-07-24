-- Fix del cierre automático de caja en modo 'daily'.
-- Aplicada via MCP el 2026-07-23 - este archivo es solo registro.
--
-- BUG: la versión anterior cerraba con
--   now() >= date_trunc('day', opened_at) + cash_auto_close_time
-- Eso apunta a la hora de corte EL MISMO DÍA que se abrió la caja, en UTC. Si la
-- hora de corte (ej: 00:00) es anterior a la hora de apertura, el umbral ya pasó
-- y la caja se cerraba sola en la siguiente corrida del cron (≤15 min). Además
-- usaba UTC, no la hora local del negocio.
--
-- FIX: el umbral pasa a ser la PRÓXIMA ocurrencia de la hora de corte DESPUÉS de
-- la apertura, calculada en hora Argentina (America/Argentina/Buenos_Aires).
-- Así 00:00 = medianoche de esta noche, no la de esta mañana.

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
    select * from (
      select cs.*,
        case
          when ps.cash_auto_close_mode = 'hours'
            then cs.opened_at + (ps.cash_auto_close_hours || ' hours')::interval
          when ps.cash_auto_close_mode = 'daily' then
            (
              (date_trunc('day', cs.opened_at at time zone 'America/Argentina/Buenos_Aires') + ps.cash_auto_close_time)
              + case
                  when (date_trunc('day', cs.opened_at at time zone 'America/Argentina/Buenos_Aires') + ps.cash_auto_close_time)
                       > (cs.opened_at at time zone 'America/Argentina/Buenos_Aires')
                  then interval '0'
                  else interval '1 day'
                end
            ) at time zone 'America/Argentina/Buenos_Aires'
          else null
        end as close_threshold
      from cash_sessions cs
      join pos_settings ps on ps.user_id = cs.user_id
      where cs.status = 'open' and ps.cash_auto_close_mode <> 'off'
    ) s
    where s.close_threshold is not null and now() >= s.close_threshold
  loop
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
