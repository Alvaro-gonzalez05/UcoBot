-- Add 'completed' to the allowed statuses for orders

-- 1. Drop the existing constraint
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_status_check;

-- 2. Add the updated constraint
ALTER TABLE public.orders ADD CONSTRAINT orders_status_check 
  CHECK (status IN ('pending', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled', 'completed'));
