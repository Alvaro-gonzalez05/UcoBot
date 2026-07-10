-- Performance RLS: envolver auth.uid()/auth.role()/auth.jwt()/auth.email() en
-- (select ...) dentro de las policies. Sin esto, Postgres re-evalúa la función
-- por CADA fila (initplan); envuelto, la evalúa una sola vez por query.
-- Cambio mecánico, NO altera la lógica de permisos.
-- Idempotente (case-insensitive): re-correrlo no vuelve a envolver lo ya envuelto.
DO $$
DECLARE
  r record;
  new_qual text;
  new_check text;
  stmt text;
BEGIN
  FOR r IN
    SELECT tablename, policyname, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (
        (qual IS NOT NULL AND qual ~* 'auth\.(uid|role|jwt|email)\(\)' AND qual !~* '\(\s*select\s+auth\.')
        OR (with_check IS NOT NULL AND with_check ~* 'auth\.(uid|role|jwt|email)\(\)' AND with_check !~* '\(\s*select\s+auth\.')
      )
  LOOP
    new_qual := CASE WHEN r.qual IS NOT NULL
      THEN regexp_replace(r.qual, '(auth\.(uid|role|jwt|email)\(\))', '(select \1)', 'g') END;
    new_check := CASE WHEN r.with_check IS NOT NULL
      THEN regexp_replace(r.with_check, '(auth\.(uid|role|jwt|email)\(\))', '(select \1)', 'g') END;

    stmt := format('ALTER POLICY %I ON public.%I', r.policyname, r.tablename);
    IF new_qual IS NOT NULL THEN stmt := stmt || format(' USING (%s)', new_qual); END IF;
    IF new_check IS NOT NULL THEN stmt := stmt || format(' WITH CHECK (%s)', new_check); END IF;

    EXECUTE stmt;
  END LOOP;
END $$;
