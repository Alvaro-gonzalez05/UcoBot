-- Recordatorio de reserva/turno: marca para no enviar el recordatorio dos veces.
ALTER TABLE public.reservations ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;
