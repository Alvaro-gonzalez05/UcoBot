-- Alcance del tope de descuento: por producto (default) o sobre el total de la compra.
ALTER TABLE public.promotions
  ADD COLUMN IF NOT EXISTS max_discount_scope text DEFAULT 'product'
    CHECK (max_discount_scope IN ('product','total'));
