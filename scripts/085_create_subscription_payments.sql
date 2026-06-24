-- Registro de cada cobro real de la suscripción de UcoBot (vía Mercado Pago).
-- Sirve para que el admin vea cuánto se recaudó de verdad.
CREATE TABLE IF NOT EXISTS public.subscription_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  mp_payment_id text UNIQUE,
  amount numeric NOT NULL DEFAULT 0,
  currency text DEFAULT 'ARS',
  status text,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.subscription_payments ENABLE ROW LEVEL SECURITY;

-- Los admins pueden ver todos los pagos (mismo patrón que el resto del admin).
CREATE POLICY "admin_select_subscription_payments"
  ON public.subscription_payments FOR SELECT USING (is_admin());

CREATE INDEX IF NOT EXISTS subscription_payments_paid_at_idx
  ON public.subscription_payments(paid_at DESC);
CREATE INDEX IF NOT EXISTS subscription_payments_user_idx
  ON public.subscription_payments(user_id);
