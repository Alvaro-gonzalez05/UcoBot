-- Turnero: empleados/profesionales y servicios (para peluquerías, barberías, consultorios, etc.)

-- Servicios (corte, barba, color...) con duración y precio
CREATE TABLE IF NOT EXISTS public.services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  duration_min integer NOT NULL DEFAULT 30,
  price numeric,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Empleados / profesionales
CREATE TABLE IF NOT EXISTS public.staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  service_ids uuid[] NOT NULL DEFAULT '{}',          -- qué servicios hace (vacío = todos)
  working_hours jsonb NOT NULL DEFAULT '{}'::jsonb,  -- horarios por día (para la agenda)
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS services_user_idx ON public.services(user_id);
CREATE INDEX IF NOT EXISTS staff_user_idx ON public.staff(user_id);

ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;

-- El dueño gestiona los suyos; el admin ve todo.
CREATE POLICY "owner_all_services" ON public.services
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "admin_all_services" ON public.services
  FOR ALL USING (is_admin());

CREATE POLICY "owner_all_staff" ON public.staff
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "admin_all_staff" ON public.staff
  FOR ALL USING (is_admin());
