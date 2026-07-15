-- Finanzas: feed de movimientos paginado en la base + totales con SUM.
-- Antes el cliente traía TODAS las ventas del período para armar la lista y los
-- totales. Con esto: los totales salen de un SUM y la lista se pagina de a 10
-- (scroll infinito), sin sobrecargar la consulta.
-- Ambas con SECURITY INVOKER → respetan las RLS del usuario que llama.

CREATE OR REPLACE FUNCTION public.finance_movements(
  p_from timestamptz,
  p_to timestamptz,
  p_limit int DEFAULT 10,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  key text,
  kind text,
  type text,
  title text,
  subtitle text,
  meta text,
  amount numeric,
  occurred_at timestamptz,
  ref_id uuid
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT * FROM (
    SELECT
      'order-' || o.id::text AS key,
      'sale'::text AS kind,
      'income'::text AS type,
      (CASE WHEN o.source = 'bot' THEN 'Venta por el bot' ELSE 'Venta en el punto de venta' END)::text AS title,
      ''::text AS subtitle,
      (CASE WHEN o.source = 'bot' THEN 'Bot' ELSE 'Punto de venta' END)::text AS meta,
      o.total_amount::numeric AS amount,
      o.created_at AS occurred_at,
      o.id AS ref_id
    FROM public.orders o
    WHERE o.user_id = (SELECT auth.uid())
      AND o.status <> 'cancelled'
      AND o.created_at >= p_from
      AND o.created_at <= p_to

    UNION ALL

    SELECT
      'tx-' || t.id::text,
      'manual'::text,
      t.type::text,
      t.category::text,
      COALESCE(t.description, '')::text,
      COALESCE(t.payment_method, '')::text,
      t.amount::numeric,
      -- transaction_date es DATE (sin hora): día = el que eligió el usuario,
      -- hora = cuando lo registró (created_at). Si no, el feed mostraría 00:00.
      (t.transaction_date::timestamp + COALESCE(t.created_at, now())::time) AT TIME ZONE 'UTC',
      t.id
    FROM public.financial_transactions t
    WHERE t.user_id = (SELECT auth.uid())
      AND t.transaction_date >= p_from::date
      AND t.transaction_date <= p_to::date
  ) m
  ORDER BY m.occurred_at DESC, m.key DESC
  LIMIT p_limit OFFSET p_offset;
$$;

CREATE OR REPLACE FUNCTION public.finance_totals(
  p_from timestamptz,
  p_to timestamptz
)
RETURNS TABLE (
  ventas_bot numeric,
  ventas_pos numeric,
  ingresos_manuales numeric,
  gastos numeric,
  cant_ventas bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    COALESCE((SELECT SUM(o.total_amount) FROM public.orders o
      WHERE o.user_id = (SELECT auth.uid()) AND o.status <> 'cancelled' AND o.source = 'bot'
        AND o.created_at >= p_from AND o.created_at <= p_to), 0)::numeric,
    COALESCE((SELECT SUM(o.total_amount) FROM public.orders o
      WHERE o.user_id = (SELECT auth.uid()) AND o.status <> 'cancelled' AND o.source = 'pos'
        AND o.created_at >= p_from AND o.created_at <= p_to), 0)::numeric,
    COALESCE((SELECT SUM(t.amount) FROM public.financial_transactions t
      WHERE t.user_id = (SELECT auth.uid()) AND t.type = 'income'
        AND t.transaction_date >= p_from::date AND t.transaction_date <= p_to::date), 0)::numeric,
    COALESCE((SELECT SUM(t.amount) FROM public.financial_transactions t
      WHERE t.user_id = (SELECT auth.uid()) AND t.type = 'expense'
        AND t.transaction_date >= p_from::date AND t.transaction_date <= p_to::date), 0)::numeric,
    COALESCE((SELECT COUNT(*) FROM public.orders o
      WHERE o.user_id = (SELECT auth.uid()) AND o.status <> 'cancelled'
        AND o.created_at >= p_from AND o.created_at <= p_to), 0)::bigint;
$$;
