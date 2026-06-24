-- Cada usuario nuevo arranca con 14 días de prueba (antes quedaba sin estado y,
-- con el bloqueo por suscripción, se cortaba al instante).
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.user_profiles (id, business_name, business_info, subscription_status, trial_ends_at)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'business_name', 'Mi Negocio'),
    '{}'::jsonb,
    'trial',
    now() + interval '14 days'
  )
  on conflict (id) do nothing;

  return new;
end;
$function$;
