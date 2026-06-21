-- La tabla notifications tenía RLS para SELECT/UPDATE/INSERT pero NO para DELETE.
-- Con RLS activo y sin política de DELETE, los borrados se bloquean en silencio:
-- la UI los saca con el update optimista pero la BD nunca los elimina, así que
-- al refrescar reaparecen. Esta política permite que cada usuario borre las suyas.
CREATE POLICY "Users can delete their own notifications"
ON public.notifications FOR DELETE
USING (auth.uid() = user_id);
