-- Personalización del ticket impreso.
--
-- Hasta ahora el ticket salía siempre igual: el nombre del negocio del perfil y
-- un "¡Gracias por su compra!" fijo escrito en el código. El local no podía
-- ponerle su logo, cambiar el cierre, ni sumar un QR para que el cliente lo
-- escanee (calificaciones, redes, carta).
--
-- Vive en pos_settings y no en user_profiles porque es configuración del punto de
-- venta, y es donde ya está `ticket_width`, que es su par natural.
--
-- Lo consumen las DOS vías de impresión (punto de venta y pedidos) a través de
-- lib/ticket-branding.ts, así el comprobante sale igual desde donde se imprima.
ALTER TABLE pos_settings
  -- Encabezado. NULL = se usa el nombre del negocio del perfil, que es el
  -- comportamiento que ya existía.
  ADD COLUMN IF NOT EXISTS ticket_business_name TEXT,
  -- Logo del local (PNG/JPG). Se imprime arriba de todo, en escala de grises por
  -- la naturaleza de las térmicas.
  ADD COLUMN IF NOT EXISTS ticket_logo_url TEXT,
  -- Cierre del ticket. NULL = "¡Gracias por su compra!" (el default de siempre).
  ADD COLUMN IF NOT EXISTS ticket_footer_text TEXT,
  -- QR al pie: a dónde lleva y qué dice arriba ("¡Calificanos!", "Seguinos", …).
  ADD COLUMN IF NOT EXISTS ticket_qr_url TEXT,
  ADD COLUMN IF NOT EXISTS ticket_qr_label TEXT;

COMMENT ON COLUMN pos_settings.ticket_business_name IS
  'Encabezado del ticket. NULL = nombre del negocio del perfil.';
COMMENT ON COLUMN pos_settings.ticket_footer_text IS
  'Texto de cierre. NULL = "Gracias por su compra".';
COMMENT ON COLUMN pos_settings.ticket_qr_url IS
  'Link del QR impreso al pie. NULL o vacío = sin QR.';

-- NOTA sobre el logo: se sube al bucket `product-images` bajo `<uid>/ticket-logo.<ext>`.
-- El orden importa — la policy de INSERT del bucket exige que la PRIMERA carpeta
-- del path sea el uid: (storage.foldername(name))[1] = auth.uid()::text.
