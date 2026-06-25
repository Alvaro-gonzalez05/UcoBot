-- Acceso de empleados a los datos del DUEÑO. Políticas ADITIVAS (no tocan las del dueño):
-- conceden acceso a las filas cuyo user_id sea el de la cuenta (account_owner_id()).
-- Para un dueño, account_owner_id() = su propio id, así que es inofensivo/redundante.

-- Tablas con columna user_id directa
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['bots','conversations','clients','orders','reservations','products','staff','delivery_settings','pos_settings','loyalty_settings','rewards','points_transactions']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS member_all_%1$s ON public.%1$s;', t);
    EXECUTE format(
      'CREATE POLICY member_all_%1$s ON public.%1$s FOR ALL
         USING (user_id = public.account_owner_id())
         WITH CHECK (user_id = public.account_owner_id());', t);
  END LOOP;
END $$;

-- messages: no tiene user_id; se valida por la conversación.
DROP POLICY IF EXISTS member_all_messages ON public.messages;
CREATE POLICY member_all_messages ON public.messages FOR ALL
  USING (EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = messages.conversation_id AND c.user_id = public.account_owner_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = messages.conversation_id AND c.user_id = public.account_owner_id()));
