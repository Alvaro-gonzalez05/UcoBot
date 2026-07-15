-- Registro de opt-in por contacto.
--
-- Meta exige consentimiento previo para escribirle a alguien fuera de la ventana
-- de 24 hs. Una plantilla aprobada NO reemplaza el opt-in: la aprobación valida
-- el contenido, no el permiso del destinatario.
--
-- Estados:
--   unknown  - contacto anterior al registro, o cargado sin consentimiento explícito
--   granted  - dio consentimiento explícito (formulario, checkbox, mensaje propio)
--   revoked  - pidió la baja. Nunca más marketing.

alter table clients
  add column if not exists optin_status text not null default 'unknown',
  add column if not exists optin_at     timestamptz,
  add column if not exists optin_source text,
  add column if not exists optout_at    timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'clients_optin_status_check'
  ) then
    alter table clients
      add constraint clients_optin_status_check
      check (optin_status in ('unknown', 'granted', 'revoked'));
  end if;
end $$;

comment on column clients.optin_status is
  'unknown | granted | revoked. Gate de marketing: revoked nunca recibe; unknown solo con interacción reciente.';
comment on column clients.optin_source is
  'De dónde salió el consentimiento: form, whatsapp_inbound, manual_import, loyalty, etc.';

-- Índice parcial: el gate solo consulta contactos que NO están revocados.
create index if not exists idx_clients_optin_status
  on clients (user_id, optin_status);

-- Trazabilidad. Es la evidencia auditable que Meta pide a un Tech Provider:
-- quién dio consentimiento, cuándo y por qué medio. Sin histórico, "tenemos
-- opt-in" es una afirmación sin respaldo.
create table if not exists contact_optin_events (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references clients(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,

  -- granted | revoked
  action      text not null check (action in ('granted', 'revoked')),
  source      text,
  -- Texto exacto que disparó la baja, o referencia del formulario de alta.
  evidence    text,
  created_at  timestamptz not null default now()
);

create index if not exists idx_contact_optin_events_client
  on contact_optin_events (client_id, created_at desc);
create index if not exists idx_contact_optin_events_user
  on contact_optin_events (user_id);

alter table contact_optin_events enable row level security;

drop policy if exists "contact_optin_events_select_own" on contact_optin_events;
create policy "contact_optin_events_select_own" on contact_optin_events
  for select using ((select auth.uid()) = user_id);
