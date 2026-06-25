-- Campos para usar reservas como TURNO/CITA (servicio + profesional + duración).
-- Son opcionales: las reservas de mesa (party_size) siguen funcionando igual.
ALTER TABLE public.reservations ADD COLUMN IF NOT EXISTS staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL;
ALTER TABLE public.reservations ADD COLUMN IF NOT EXISTS service_id uuid REFERENCES public.services(id) ON DELETE SET NULL;
ALTER TABLE public.reservations ADD COLUMN IF NOT EXISTS staff_name text;     -- denormalizado para mostrar/recordatorio
ALTER TABLE public.reservations ADD COLUMN IF NOT EXISTS service_name text;   -- idem
ALTER TABLE public.reservations ADD COLUMN IF NOT EXISTS duration_min integer;
ALTER TABLE public.reservations ADD COLUMN IF NOT EXISTS ends_at timestamptz; -- para chequear solapamientos (agenda)

-- Índice para buscar turnos de un profesional en una fecha (disponibilidad)
CREATE INDEX IF NOT EXISTS reservations_staff_date_idx
  ON public.reservations(staff_id, reservation_date)
  WHERE staff_id IS NOT NULL;
