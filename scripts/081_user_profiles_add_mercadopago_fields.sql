-- Campos específicos de la suscripción por Mercado Pago (débito automático).
-- Reutilizamos subscription_status / subscription_start_date / subscription_end_date.
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS mp_preapproval_id TEXT;
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS mp_payer_email TEXT;
CREATE INDEX IF NOT EXISTS user_profiles_mp_preapproval_idx
  ON public.user_profiles(mp_preapproval_id) WHERE mp_preapproval_id IS NOT NULL;
