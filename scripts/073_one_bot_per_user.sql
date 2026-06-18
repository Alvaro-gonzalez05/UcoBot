-- 1 bot por usuario — SIN tocar a los que ya tienen 2.
--
-- Un índice único en bots.user_id no sirve acá: no se puede crear mientras existan
-- duplicados, y obligaría a borrar bots (y sus conversaciones en cascada).
--
-- En su lugar usamos un TRIGGER que impide CREAR un bot nuevo si el usuario ya tiene
-- al menos uno. Resultado:
--   • Usuarios que hoy tienen 2 bots → quedan intactos (no se borra nada).
--   • De ahora en más → nadie puede pasar de 1 bot (ni 1→2, ni 2→3).

CREATE OR REPLACE FUNCTION public.enforce_one_bot_per_user()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.bots WHERE user_id = NEW.user_id) THEN
    RAISE EXCEPTION 'Este usuario ya tiene un bot (límite: 1 bot por cuenta).'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS one_bot_per_user ON public.bots;
CREATE TRIGGER one_bot_per_user
  BEFORE INSERT ON public.bots
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_one_bot_per_user();
