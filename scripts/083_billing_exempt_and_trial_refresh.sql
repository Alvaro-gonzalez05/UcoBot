-- Flag para cuentas que pagan por fuera (transferencia) o VIP: nunca se bloquean.
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS billing_exempt BOOLEAN NOT NULL DEFAULT false;

-- Renovamos el trial de las cuentas que ya están en trial pero sin fecha futura,
-- para que no se corten al activar el vencimiento de trials (14 días).
UPDATE public.user_profiles
SET trial_ends_at = now() + interval '14 days'
WHERE subscription_status IN ('trial', 'trialing')
  AND (trial_ends_at IS NULL OR trial_ends_at <= now());
