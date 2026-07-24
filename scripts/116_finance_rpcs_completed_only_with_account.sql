-- Fix 115 aplicado también a las firmas con p_account (las que usa la app hoy).
-- Aplicada via MCP el 2026-07-24 - este archivo es solo registro.
--
-- BUG encontrado en testing: la migración 115 corrigió finance_movements/finance_totals
-- para contar SOLO ventas cobradas (status='completed'), pero la aplicó a las firmas
-- VIEJAS de 2/4 argumentos. La app, desde que se agregó la vista por sucursal, llama a
-- las firmas con p_account (uuid), que seguían con `status <> 'cancelled'`. Resultado:
-- el fix no tenía efecto y un pedido revertido a pendiente seguía figurando como ingreso.
--
-- FIX: recrear finance_movements(...,p_account) y finance_totals(...,p_account) con
-- `o.status = 'completed'` en las ventas.
CREATE OR REPLACE FUNCTION public.finance_movements(
  p_from timestamptz, p_to timestamptz, p_limit int DEFAULT 10, p_offset int DEFAULT 0, p_account uuid DEFAULT NULL
)
RETURNS TABLE (key text, kind text, type text, title text, subtitle text, meta text, amount numeric, occurred_at timestamptz, ref_id uuid)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$
  SELECT * FROM (
    SELECT
      'order-' || o.id::text, 'sale'::text, 'income'::text,
      (CASE WHEN o.source = 'bot' THEN 'Venta por el bot' ELSE 'Venta en el punto de venta' END)::text,
      ''::text,
      (CASE WHEN o.source = 'bot' THEN 'Bot' ELSE 'Punto de venta' END)::text,
      o.total_amount::numeric, o.created_at, o.id
    FROM public.orders o
    WHERE o.user_id = COALESCE(p_account, (SELECT auth.uid()))
      AND o.status = 'completed'
      AND o.created_at >= p_from AND o.created_at <= p_to
    UNION ALL
    SELECT
      'tx-' || t.id::text, 'manual'::text, t.type::text, t.category::text,
      COALESCE(t.description, '')::text, COALESCE(t.payment_method, '')::text, t.amount::numeric,
      (t.transaction_date::timestamp + COALESCE(t.created_at, now())::time) AT TIME ZONE 'UTC', t.id
    FROM public.financial_transactions t
    WHERE t.user_id = COALESCE(p_account, (SELECT auth.uid()))
      AND t.transaction_date >= p_from::date AND t.transaction_date <= p_to::date
  ) m(key, kind, type, title, subtitle, meta, amount, occurred_at, ref_id)
  ORDER BY m.occurred_at DESC, m.key DESC
  LIMIT p_limit OFFSET p_offset;
$$;

CREATE OR REPLACE FUNCTION public.finance_totals(
  p_from timestamptz, p_to timestamptz, p_account uuid DEFAULT NULL
)
RETURNS TABLE (ventas_bot numeric, ventas_pos numeric, ingresos_manuales numeric, gastos numeric, cant_ventas bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$
  SELECT
    COALESCE((SELECT SUM(o.total_amount) FROM public.orders o
      WHERE o.user_id = COALESCE(p_account, (SELECT auth.uid())) AND o.status = 'completed' AND o.source = 'bot'
        AND o.created_at >= p_from AND o.created_at <= p_to), 0)::numeric,
    COALESCE((SELECT SUM(o.total_amount) FROM public.orders o
      WHERE o.user_id = COALESCE(p_account, (SELECT auth.uid())) AND o.status = 'completed' AND o.source = 'pos'
        AND o.created_at >= p_from AND o.created_at <= p_to), 0)::numeric,
    COALESCE((SELECT SUM(t.amount) FROM public.financial_transactions t
      WHERE t.user_id = COALESCE(p_account, (SELECT auth.uid())) AND t.type = 'income'
        AND t.transaction_date >= p_from::date AND t.transaction_date <= p_to::date), 0)::numeric,
    COALESCE((SELECT SUM(t.amount) FROM public.financial_transactions t
      WHERE t.user_id = COALESCE(p_account, (SELECT auth.uid())) AND t.type = 'expense'
        AND t.transaction_date >= p_from::date AND t.transaction_date <= p_to::date), 0)::numeric,
    COALESCE((SELECT COUNT(*) FROM public.orders o
      WHERE o.user_id = COALESCE(p_account, (SELECT auth.uid())) AND o.status = 'completed'
        AND o.created_at >= p_from AND o.created_at <= p_to), 0)::bigint;
$$;
