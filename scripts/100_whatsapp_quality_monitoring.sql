-- Monitoreo de calidad de números de WhatsApp.
--
-- Meta evalúa cada número por tasa de bloqueos/reportes y expone el resultado por
-- dos vías: el webhook `phone_number_quality_update` (evento FLAGGED/UNFLAGGED +
-- límite de mensajería) y el campo `quality_rating` del Graph API (GREEN/YELLOW/RED).
-- Guardamos ambas y cortamos los envíos automáticos cuando la calidad baja.

-- Estado actual por número.
create table if not exists whatsapp_number_quality (
  phone_number_id       text primary key,
  user_id               uuid references auth.users(id) on delete cascade,
  waba_id               text,
  display_phone_number  text,

  -- GREEN | YELLOW | RED | UNKNOWN
  quality_rating        text not null default 'UNKNOWN',
  -- TIER_50 | TIER_250 | TIER_1K | TIER_10K | TIER_100K | TIER_UNLIMITED
  messaging_limit       text,
  is_flagged            boolean not null default false,

  -- Corte de envíos. Lo setea el webhook al degradarse la calidad y lo lee el
  -- gate de envío. `sends_blocked_manual` permite a un admin forzar el corte
  -- sin que el webhook lo pise al llegar un UNFLAGGED.
  sends_blocked         boolean not null default false,
  sends_blocked_manual  boolean not null default false,
  blocked_reason        text,
  blocked_at            timestamptz,

  last_event_at         timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

comment on table whatsapp_number_quality is
  'Estado de calidad por número de WhatsApp. Fuente: webhook phone_number_quality_update + Graph API.';
comment on column whatsapp_number_quality.sends_blocked is
  'Si es true, el gate de envío rechaza plantillas de marketing para este número.';

-- Histórico de transiciones. Es la evidencia auditable de que el monitoreo
-- funciona: sirve para el ticket de soporte de Meta y para post-mortems.
create table if not exists whatsapp_quality_events (
  id                    uuid primary key default gen_random_uuid(),
  phone_number_id       text not null,
  user_id               uuid references auth.users(id) on delete cascade,
  waba_id               text,

  -- FLAGGED | UNFLAGGED | ONBOARDING | POLL (lectura periódica del Graph API)
  event                 text not null,
  quality_rating        text,
  previous_quality      text,
  messaging_limit       text,

  -- Payload crudo de Meta, sin tocar. Meta cambia el shape de estos eventos
  -- sin avisar; guardarlo entero evita perder datos por un parseo desactualizado.
  raw                   jsonb,
  created_at            timestamptz not null default now()
);

create index if not exists idx_wa_quality_events_phone_created
  on whatsapp_quality_events (phone_number_id, created_at desc);
create index if not exists idx_wa_quality_events_user
  on whatsapp_quality_events (user_id);
create index if not exists idx_wa_number_quality_user
  on whatsapp_number_quality (user_id);

-- RLS: escribe el webhook con service role (bypassea RLS); el usuario solo lee lo suyo.
alter table whatsapp_number_quality enable row level security;
alter table whatsapp_quality_events enable row level security;

drop policy if exists "wa_number_quality_select_own" on whatsapp_number_quality;
create policy "wa_number_quality_select_own" on whatsapp_number_quality
  for select using ((select auth.uid()) = user_id);

drop policy if exists "wa_quality_events_select_own" on whatsapp_quality_events;
create policy "wa_quality_events_select_own" on whatsapp_quality_events
  for select using ((select auth.uid()) = user_id);

create or replace function touch_whatsapp_number_quality()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_touch_wa_number_quality on whatsapp_number_quality;
create trigger trg_touch_wa_number_quality
  before update on whatsapp_number_quality
  for each row execute function touch_whatsapp_number_quality();
