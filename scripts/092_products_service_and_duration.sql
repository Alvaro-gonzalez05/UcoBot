-- Distinguir productos de servicios + duración del servicio (para la agenda de turnos).
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS is_service boolean NOT NULL DEFAULT false;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS duration_min integer; -- minutos; null = default 30 al usar
