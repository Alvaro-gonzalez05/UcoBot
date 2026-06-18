-- Promociones con descuento real sobre productos.
-- Re-agrega los campos de descuento que la migración 033 había quitado, más el
-- destino del descuento (todo / productos específicos / categoría).
-- max_uses, current_uses, start_date, end_date, is_active ya existen en la tabla.

ALTER TABLE public.promotions
  ADD COLUMN IF NOT EXISTS discount_type       text CHECK (discount_type IN ('percentage','fixed_amount')),
  ADD COLUMN IF NOT EXISTS discount_value      numeric(10,2),
  ADD COLUMN IF NOT EXISTS max_discount_amount numeric(10,2),  -- tope del descuento por producto (ej: 20% pero máximo $10.000)
  ADD COLUMN IF NOT EXISTS applies_to          text DEFAULT 'all' CHECK (applies_to IN ('all','products','category')),
  ADD COLUMN IF NOT EXISTS product_ids         uuid[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS category             text;

-- Incremento atómico de usos (lo llaman el POS y el bot al usar una promo).
-- Solo incrementa si la promo sigue teniendo cupo; devuelve true si pudo.
CREATE OR REPLACE FUNCTION public.increment_promotion_use(p_id uuid)
RETURNS boolean AS $$
DECLARE
  ok boolean;
BEGIN
  UPDATE public.promotions
     SET current_uses = COALESCE(current_uses, 0) + 1,
         updated_at = timezone('utc'::text, now())
   WHERE id = p_id
     AND (max_uses IS NULL OR COALESCE(current_uses, 0) < max_uses)
  RETURNING true INTO ok;
  RETURN COALESCE(ok, false);
END;
$$ LANGUAGE plpgsql;
