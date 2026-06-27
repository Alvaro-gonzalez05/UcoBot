-- 099_transport_vertical_flag.sql
-- Vertical EXCLUSIVO de la cuenta: 'general' (negocios actuales) | 'transporte' (kit transportistas).
-- Una empresa de transporte NO es un restaurante ni otro negocio: el vertical cambia
-- por completo las secciones visibles del sistema.

alter table public.user_profiles
  add column if not exists vertical text not null default 'general';

comment on column public.user_profiles.vertical is
  'general | transporte — vertical exclusivo de la cuenta';

-- Para convertir una cuenta de prueba en transportista:
--   update public.user_profiles set vertical = 'transporte' where id = '<auth_user_id>';
