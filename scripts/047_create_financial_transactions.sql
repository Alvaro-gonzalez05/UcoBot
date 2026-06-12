-- Sección Finanzas: movimientos manuales de ingresos/gastos + origen de ventas en orders
-- (Aplicada en producción el 2026-06-11 vía MCP de Supabase)

CREATE TABLE IF NOT EXISTS public.financial_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  category TEXT NOT NULL DEFAULT 'otros',
  description TEXT,
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_method TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_financial_tx_user_date
  ON public.financial_transactions (user_id, transaction_date DESC);

ALTER TABLE public.financial_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "financial_tx_select_own" ON public.financial_transactions
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "financial_tx_insert_own" ON public.financial_transactions
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "financial_tx_update_own" ON public.financial_transactions
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "financial_tx_delete_own" ON public.financial_transactions
  FOR DELETE USING (auth.uid() = user_id);

-- Origen de la venta: bot (pedido por chatbot) o pos (punto de venta)
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'bot'
  CHECK (source IN ('bot', 'pos'));

-- Backfill: los pedidos sin conversación asociada vinieron del punto de venta
UPDATE public.orders SET source = 'pos' WHERE conversation_id IS NULL;
