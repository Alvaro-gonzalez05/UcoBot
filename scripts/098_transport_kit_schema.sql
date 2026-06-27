-- ============================================================================
-- 098_transport_kit_schema.sql
-- KIT TRANSPORTISTAS — Esquema para automatizar MIC/DTA y CRT (Sistema MALVINA)
--
-- Convenciones del proyecto:
--   id uuid pk default gen_random_uuid()
--   user_id uuid references auth.users(id) on delete cascade  (= tenant/cuenta)
--   RLS habilitado + policy owner_all (auth.uid() = user_id) + admin_all (is_admin())
--   timestamptz default now(); updated_at vía trigger
-- Todas las tablas usan el prefijo transport_ para no colisionar con el CRM base.
-- Migración ADITIVA: no toca tablas ni datos existentes. Reversible con DROP.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0) Helper: trigger updated_at
-- ----------------------------------------------------------------------------
create or replace function public.transport_touch_updated_at()
returns trigger language plpgsql
set search_path = ''   -- hardening: evita search_path mutable (advisor 0011)
as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ============================================================================
-- A) MAESTROS (se cargan una vez y se reutilizan)
-- ============================================================================

-- A.1) Transportistas (el tenant suele ser uno, pero puede haber convencional +
--      subcontratado). Datos que MALVINA autocompleta al "Validar CNRT".
create table if not exists public.transport_carriers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  cnrt_number text,                       -- Nro Registro CNRT
  intl_permit_number text,                -- Nro Permiso Internacional (habilita el recorrido)
  cuit text,                              -- CUIT empresa transportista
  apoderado_cuit text,
  razon_social text not null,
  domicilio text,
  pais_code text,                         -- catálogo país (200=AR, 208=CL...)
  tipo text not null default 'regular',   -- regular | ocasional
  is_default boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A.2) Flota (tractores y semirremolques en una sola tabla por "kind").
--      Incluye propietario (puede diferir por leasing/subcontratación) y póliza.
create table if not exists public.transport_vehicles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  carrier_id uuid references public.transport_carriers(id) on delete set null,
  kind text not null default 'tractor',   -- tractor | semirremolque
  pais_code text,                         -- país de la patente
  patente text not null,
  -- chasis (solo tractor)
  marca text,
  chasis_numero text,
  modelo text,
  anio integer,
  capacidad_traccion_ton numeric,
  -- póliza de seguro (con vencimiento -> alertas)
  poliza_numero text,
  poliza_vencimiento date,
  -- propietario del vehículo (si difiere del transportista)
  owner_cuit text,
  owner_razon_social text,
  owner_domicilio text,
  owner_pais_code text,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A.3) Conductores
create table if not exists public.transport_drivers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  nombre text not null,
  tipo_documento text,                    -- DNI | Pasaporte | Cedula | LC | LE
  numero_documento text,
  pais_code text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A.4) Clientes / partes comerciales (exportador, consignatario, destinatario,
--      notificar). Se arma solo con la lógica MACHEAR-O-CREAR por id tributaria.
create table if not exists public.transport_clients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tax_id text,                            -- CUIT / RUT / RUC / etc.
  tax_id_type text,                       -- CUIT | RUT | RUC | OTRO
  tax_id_country text,                    -- país de la identificación tributaria
  razon_social text not null,
  domicilio text,
  pais_code text,
  roles text[] not null default '{}',     -- {exportador, consignatario, destinatario, notificar}
  source text not null default 'manual',  -- manual | factura | permiso
  needs_review boolean not null default false, -- true cuando lo creó la IA y falta confirmar 1 vez
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- clave para MACHEAR-O-CREAR (upsert) por id tributaria dentro de la cuenta
create unique index if not exists transport_clients_taxid_uidx
  on public.transport_clients(user_id, tax_id_country, tax_id)
  where tax_id is not null;

-- A.5) Corredores / plantillas de ruta (editables; los corredores cambian).
--      Permiten INFERIR la ruta desde el origen+destino del permiso.
create table if not exists public.transport_corridors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,                     -- "Mendoza – Los Libertadores – Chile"
  -- claves de inferencia
  match_aduana_partida text,              -- p.ej. 038
  match_pais_destino text,                -- p.ej. 208 (Chile)
  -- puntos de la ruta informática
  partida_pais text, partida_aduana text, partida_ciudad text, partida_lugar_operativo text,
  salida_aduana text, salida_ciudad text, salida_lugar_operativo text,
  entrada_aduana text, entrada_ciudad text, entrada_lugar_operativo text,
  destino_pais text, destino_aduana text, destino_ciudad text, destino_lugar_operativo text,
  paises_paso jsonb not null default '[]'::jsonb, -- [{orden, pais, aduana_entrada, aduana_salida, ciudad}]
  default_plazo_transporte_horas integer,
  default_plazo_interno_dias integer,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A.6) Catálogos de códigos (GLOBAL, no por cuenta): países, aduanas, ciudades,
--      embalaje, divisa, condición de venta, tipo documento. Lectura para todos.
create table if not exists public.transport_catalogs (
  id uuid primary key default gen_random_uuid(),
  catalog_type text not null,             -- pais | aduana | ciudad | embalaje | divisa | cond_venta | tipo_doc
  code text not null,
  label text not null,
  extra jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists transport_catalogs_type_code_uidx
  on public.transport_catalogs(catalog_type, code);

-- A.7) Configuración del kit por cuenta (incl. modo "subir y listo").
create table if not exists public.transport_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  default_carrier_id uuid references public.transport_carriers(id) on delete set null,
  default_tractor_id uuid references public.transport_vehicles(id) on delete set null,
  default_semi_id uuid references public.transport_vehicles(id) on delete set null,
  default_driver_id uuid references public.transport_drivers(id) on delete set null,
  default_corridor_id uuid references public.transport_corridors(id) on delete set null,
  single_truck_mode boolean not null default false, -- saltea el paso "elegir camión"
  malvina_username text,                  -- SOLO usuario (NUNCA password)
  preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================================
-- B) DOCUMENTOS + EXTRACCIÓN IA
-- ============================================================================

-- B.1) Archivos subidos (permiso de embarque, factura comercial, otros)
create table if not exists public.transport_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,                     -- permiso | factura | otro
  storage_path text,                      -- ruta en Supabase Storage
  file_name text,
  mime_type text,
  status text not null default 'uploaded',-- uploaded | extracting | extracted | error
  raw_text text,                          -- texto crudo extraído del PDF
  parsed jsonb not null default '{}'::jsonb, -- salida estructurada de la IA
  model text,                             -- modelo usado (ej. gemini-2.5-flash)
  confidence numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- B.2) Permiso de embarque (OM-1993 SIM). Cabecera.
create table if not exists public.transport_shipping_permits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  document_id uuid references public.transport_documents(id) on delete set null,
  permit_number text not null,            -- 26038EG01001192P
  aduana_code text,                       -- 038
  subregimen text,
  -- exportador / remitente
  exporter_client_id uuid references public.transport_clients(id) on delete set null,
  exporter_cuit text,
  exporter_razon_social text,
  exporter_domicilio text,
  -- intervinientes
  despachante_nombre text,
  despachante_cuit text,
  ata_razon_social text,
  ata_cuit text,
  -- transporte / destino
  via text,                               -- CAMION
  pais_destino_code text,                 -- destino ADUANERO (Chile 208)
  puerto_embarque text,                   -- paso fronterizo
  aduana_salida text,
  -- comerciales (cabecera)
  cond_venta text,                        -- FOB | CPT | CIF ...
  fob_total numeric,
  fob_divisa text,
  flete_total numeric,
  flete_divisa text,
  seguro_total numeric,
  seguro_divisa text,
  cotizacion numeric,
  -- carga (cabecera)
  embalaje_code text,
  total_bultos integer,
  peso_bruto numeric,
  peso_neto numeric,
  vto_embarque date,
  oficializado_at timestamptz,
  nro_proforma text,
  status text not null default 'extracted', -- extracted | reviewed | used
  raw_extraction jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists transport_permits_number_uidx
  on public.transport_shipping_permits(user_id, permit_number);

-- B.3) Ítems del permiso (un permiso = N ítems, cada uno con su NCM/peso/FOB)
create table if not exists public.transport_permit_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  permit_id uuid not null references public.transport_shipping_permits(id) on delete cascade,
  item_number integer,                    -- 1, 2, 3...
  ncm_position text,                      -- 2204.21.00.200F
  descripcion text,
  estado text,                            -- NUEVO SIN USO ARGENTINO
  kg_neto numeric,
  unidad text,                            -- LITRO, UNIDAD...
  cantidad numeric,
  fob_unitario numeric,
  fob_total_divisa numeric,
  fob_total_usd numeric,
  pais_destino_comercial text,            -- destino comercial final del ítem (puede != aduanero)
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists transport_permit_items_permit_idx
  on public.transport_permit_items(permit_id);

-- ============================================================================
-- C) OPERACIÓN — MIC/DTA y CRT
-- ============================================================================

-- C.1) Viaje = MIC/DTA (cabecera). 1 vehículo + 1 viaje.
create table if not exists public.transport_trips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- asignación de transporte (snapshot por si luego cambian los maestros)
  carrier_id uuid references public.transport_carriers(id) on delete set null,
  tractor_id uuid references public.transport_vehicles(id) on delete set null,
  semi_id uuid references public.transport_vehicles(id) on delete set null,
  driver_id uuid references public.transport_drivers(id) on delete set null,
  driver2_id uuid references public.transport_drivers(id) on delete set null,
  corridor_id uuid references public.transport_corridors(id) on delete set null,
  -- cabecera MIC/DTA
  en_lastre boolean not null default false,
  via_transporte integer not null default 4, -- 4 = CAMION
  fecha_emision date,
  plazo_transporte_horas integer,
  plazo_interno_dias integer,
  consolidado boolean not null default false, -- 1 MIC -> varios CRT
  fraccionado boolean not null default false, -- 1 CRT -> varios MIC
  -- estado del viaje en NUESTRO sistema
  estado text not null default 'borrador',  -- borrador | listo | volcado | oficializado | anulado
  validated boolean not null default false,
  validation_errors jsonb not null default '[]'::jsonb,
  -- clave del manifiesto (se completa tras oficializar en MALVINA)
  mic_anio text, mic_pais text, mic_numero text, mic_letra text,
  mic_clave text,                          -- 26-AR-253535-K
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists transport_trips_user_idx on public.transport_trips(user_id);
create index if not exists transport_trips_estado_idx on public.transport_trips(user_id, estado);

-- C.2) Cartas de Porte (CRT). Un viaje puede tener 1..N (consolidado).
create table if not exists public.transport_crts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  trip_id uuid not null references public.transport_trips(id) on delete cascade,
  permit_id uuid references public.transport_shipping_permits(id) on delete set null,
  crt_number text,
  -- partes (machear-o-crear)
  remitente_client_id uuid references public.transport_clients(id) on delete set null,
  consignatario_client_id uuid references public.transport_clients(id) on delete set null,
  destinatario_client_id uuid references public.transport_clients(id) on delete set null,
  notificar_client_id uuid references public.transport_clients(id) on delete set null,
  -- ruta del CRT
  partida_pais text, partida_ciudad text, partida_aduana text, partida_lugar_operativo text,
  destino_pais text, destino_ciudad text, destino_aduana text, destino_lugar_operativo text,
  transbordo_pais text, transbordo_ciudad text, transbordo_aduana text, transbordo_lugar_operativo text,
  -- carga
  embalaje_code text,
  cantidad numeric,
  peso_bruto numeric,
  peso_neto numeric,
  volumen_m3 numeric,
  peso_bruto_total numeric,               -- para fraccionados/consolidados (suma)
  -- consolidado / fraccionado
  consolidado boolean not null default false,
  fraccion boolean not null default false,
  fraccion_tipo text not null default 'none', -- none | primera | intermedia | ultima
  fraccion_mic_primera text,              -- nro MIC de la 1ra fracción
  registro_adicional_envase boolean not null default false,
  -- comerciales
  fob numeric,
  fob_fraccionados numeric,
  valor_venta numeric,
  cond_venta text,
  divisa text,
  flete_externo numeric,
  monto_reembolso numeric,
  -- gastos a pagar (quién paga)
  flete_pago_por text,                    -- remitente | destinatario
  flete_monto numeric,
  flete_divisa text,
  seguro_monto numeric,
  seguro_divisa text,
  -- descripción + lugares/fechas
  descripcion_mercaderia text,
  descripcion_fraccionados text,
  lugar_emision_crt text,
  fecha_entrega_porteador date,
  pais_entrega_porteador text,
  ciudad_entrega_porteador text,
  fecha_llegada_tentativa date,
  comentarios jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists transport_crts_trip_idx on public.transport_crts(trip_id);

-- C.3) Contenedores
create table if not exists public.transport_containers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  trip_id uuid not null references public.transport_trips(id) on delete cascade,
  crt_id uuid references public.transport_crts(id) on delete set null,
  container_code text,                    -- TCNU225277-4
  tipo text,
  tara numeric,
  is_empty boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists transport_containers_trip_idx on public.transport_containers(trip_id);

-- C.4) Precintos (de contenedor o de carga suelta: container_id null)
create table if not exists public.transport_seals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  trip_id uuid not null references public.transport_trips(id) on delete cascade,
  container_id uuid references public.transport_containers(id) on delete cascade,
  seal_number text not null,
  created_at timestamptz not null default now()
);

-- C.5) Bultos (por contenedor / CRT)
create table if not exists public.transport_packages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  trip_id uuid not null references public.transport_trips(id) on delete cascade,
  container_id uuid references public.transport_containers(id) on delete cascade,
  crt_id uuid references public.transport_crts(id) on delete set null,
  embalaje_tipo text,
  cantidad numeric,
  created_at timestamptz not null default now()
);

-- C.6) Eventos del viaje (trazabilidad: cambios de estado, oficializado, etc.)
create table if not exists public.transport_trip_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  trip_id uuid not null references public.transport_trips(id) on delete cascade,
  event_type text not null,               -- creado | extraido | validado | volcado | oficializado | error | nota
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists transport_trip_events_trip_idx on public.transport_trip_events(trip_id);

-- ============================================================================
-- ÍNDICES por user_id (multi-tenant)
-- ============================================================================
create index if not exists transport_carriers_user_idx on public.transport_carriers(user_id);
create index if not exists transport_vehicles_user_idx on public.transport_vehicles(user_id);
create index if not exists transport_drivers_user_idx on public.transport_drivers(user_id);
create index if not exists transport_clients_user_idx on public.transport_clients(user_id);
create index if not exists transport_corridors_user_idx on public.transport_corridors(user_id);
create index if not exists transport_documents_user_idx on public.transport_documents(user_id);
create index if not exists transport_permits_user_idx on public.transport_shipping_permits(user_id);
create index if not exists transport_crts_user_idx on public.transport_crts(user_id);

-- ============================================================================
-- TRIGGERS updated_at
-- ============================================================================
do $$
declare t text;
begin
  foreach t in array array[
    'transport_carriers','transport_vehicles','transport_drivers','transport_clients',
    'transport_corridors','transport_settings','transport_documents',
    'transport_shipping_permits','transport_trips','transport_crts'
  ] loop
    execute format(
      'drop trigger if exists trg_%1$s_touch on public.%1$s;
       create trigger trg_%1$s_touch before update on public.%1$s
       for each row execute function public.transport_touch_updated_at();', t);
  end loop;
end $$;

-- ============================================================================
-- RLS — habilitar + policies owner_all / admin_all (estilo del proyecto)
-- ============================================================================
do $$
declare t text;
begin
  foreach t in array array[
    'transport_carriers','transport_vehicles','transport_drivers','transport_clients',
    'transport_corridors','transport_settings','transport_documents',
    'transport_shipping_permits','transport_permit_items','transport_trips',
    'transport_crts','transport_containers','transport_seals','transport_packages',
    'transport_trip_events'
  ] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists owner_all_%1$s on public.%1$s;', t);
    execute format(
      'create policy owner_all_%1$s on public.%1$s
         for all using (auth.uid() = user_id) with check (auth.uid() = user_id);', t);
    execute format('drop policy if exists admin_all_%1$s on public.%1$s;', t);
    execute format('create policy admin_all_%1$s on public.%1$s for all using (is_admin());', t);
  end loop;
end $$;

-- Catálogos: GLOBAL. RLS on; lectura para autenticados; escritura solo admin.
alter table public.transport_catalogs enable row level security;
drop policy if exists read_catalogs on public.transport_catalogs;
create policy read_catalogs on public.transport_catalogs
  for select to authenticated using (true);
drop policy if exists admin_catalogs on public.transport_catalogs;
create policy admin_catalogs on public.transport_catalogs for all using (is_admin());

-- ============================================================================
-- SEED mínimo de catálogos (el resto se carga luego). Países ATIT + básicos.
-- ============================================================================
insert into public.transport_catalogs(catalog_type, code, label) values
  ('pais','200','ARGENTINA'),
  ('pais','208','CHILE'),
  ('pais','202','BOLIVIA'),
  ('pais','203','BRASIL'),
  ('pais','221','PARAGUAY'),
  ('pais','222','PERU'),
  ('pais','225','URUGUAY'),
  ('cond_venta','FOB','LIBRE A BORDO'),
  ('cond_venta','FOE','LIBRE PUESTA A BORDO'),
  ('cond_venta','CPT','TRANSPORTE PAGADO HASTA'),
  ('cond_venta','CIF','COSTO SEGURO Y FLETE'),
  ('divisa','DOL','DOLAR ESTADOUNIDENSE'),
  ('embalaje','05','CONTENEDOR'),
  ('embalaje','99','BULTOS'),
  ('tipo_doc','DNI','DOCUMENTO NACIONAL DE IDENTIDAD'),
  ('tipo_doc','PAS','PASAPORTE'),
  ('tipo_doc','CI','CEDULA DE IDENTIDAD')
on conflict (catalog_type, code) do nothing;

-- ============================================================================
-- FIN. Rollback: drop table public.transport_* cascade; (todas son aditivas)
-- ============================================================================
