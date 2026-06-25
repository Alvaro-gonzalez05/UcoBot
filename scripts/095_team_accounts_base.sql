-- Cuentas de equipo: un empleado pertenece a un dueño (cliente) y opera SUS datos.

-- 1) Vínculo empleado → dueño. NULL = es dueño (cuenta normal).
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS parent_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS user_profiles_parent_idx ON public.user_profiles(parent_user_id) WHERE parent_user_id IS NOT NULL;

-- 2) "id de la cuenta": si soy empleado devuelve el id del dueño; si soy dueño, el mío.
CREATE OR REPLACE FUNCTION public.account_owner_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT parent_user_id FROM public.user_profiles WHERE id = auth.uid()),
    auth.uid()
  );
$$;

-- 3) ¿La cuenta logueada es un empleado? (para gates)
CREATE OR REPLACE FUNCTION public.is_team_member()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND parent_user_id IS NOT NULL);
$$;
