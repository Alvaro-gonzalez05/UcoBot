-- Cajas del punto de venta: apertura/cierre con arqueo, encadenadas por previous_session_id.
-- Aplicada via MCP el 2026-07-20 - este archivo es solo registro.
create table if not exists public.cash_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  previous_session_id uuid references public.cash_sessions(id),
  opened_by text not null,
  opened_at timestamptz not null default now(),
  opening_amount numeric(12,2) not null default 0,
  closed_at timestamptz,
  closed_by text,
  status text not null default 'open' check (status in ('open','closed')),
  expected_totals jsonb,   -- {cash: n, card: n, ...} calculado al cerrar
  counted_totals jsonb,    -- arqueo declarado por el responsable
  difference numeric(12,2),          -- efectivo contado - esperado
  closing_amount numeric(12,2),      -- efectivo final contado; sugerido como apertura de la próxima
  notes text
);

alter table public.orders add column if not exists cash_session_id uuid references public.cash_sessions(id);

create index if not exists idx_orders_cash_session on public.orders(cash_session_id);
create index if not exists idx_cash_sessions_user_status on public.cash_sessions(user_id, status);
-- Una sola caja abierta por cuenta
create unique index if not exists uniq_open_cash_session on public.cash_sessions(user_id) where status = 'open';

alter table public.cash_sessions enable row level security;
create policy member_all_cash_sessions on public.cash_sessions
  for all using (user_id = account_owner_id()) with check (user_id = account_owner_id());
