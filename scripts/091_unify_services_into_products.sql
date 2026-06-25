-- Unificamos: un "servicio" es un PRODUCTO (lo que vende el cliente). Evita dos catálogos.
-- (La tabla services recién creada no tenía datos, así que la eliminamos.)

-- 1) La reserva apunta al PRODUCTO-servicio (antes apuntaba a services).
ALTER TABLE public.reservations DROP CONSTRAINT IF EXISTS reservations_service_id_fkey;

-- 2) Eliminamos la tabla services (CASCADE quita cualquier FK colgante).
DROP TABLE IF EXISTS public.services CASCADE;

-- 3) Repunteamos service_id de reservations a products.
ALTER TABLE public.reservations
  ADD CONSTRAINT reservations_service_product_fkey
  FOREIGN KEY (service_id) REFERENCES public.products(id) ON DELETE SET NULL;

-- Nota: staff.service_ids (uuid[]) ahora guarda IDs de PRODUCTOS que hace cada profesional.
