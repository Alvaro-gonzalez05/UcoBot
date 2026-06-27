# Plan de Desarrollo — Kit Transportistas (UcoBot)

> Automatización de **MIC/DTA** y **CRT** en el Sistema MALVINA, sobre la base de UcoBot.
> Documento vivo de planificación técnica. Acompaña a [`propuesta-kit-transportistas.html`](propuesta-kit-transportistas.html) (visión de negocio) y a [`../scripts/098_transport_kit_schema.sql`](../scripts/098_transport_kit_schema.sql) (esquema de datos).

---

## 1. Objetivo

Que un transportista **suba el permiso de embarque (y la factura si el cliente es nuevo)** y el sistema arme el viaje completo, lo valide, y lo **vuelque al MALVINA** vía una extensión de Chrome, dejando solo la revisión y oficialización al humano.

**Principio rector:** cuando se abre MALVINA, el viaje ya está 100% armado y validado. MALVINA es el "último centímetro".

---

## 2. Stack técnico

| Capa | Tecnología | Estado |
|---|---|---|
| Frontend / CRM | Next.js 14 (App Router) — UcoBot existente | ♻️ Reusar |
| Base de datos | Supabase (Postgres + RLS) | ✅ Esquema aplicado (`transport_*`) |
| Extracción IA | Gemini 2.5 Flash (ya usado en `/demo`) | ♻️ Reusar |
| Storage | Supabase Storage (PDFs permiso/factura) | ♻️ Reusar patrón |
| Volcado a MALVINA | **Extensión Chrome MV3** (content script) | 🆕 Nuevo |
| Entrada opcional | WhatsApp (infra de bots existente) | ♻️ Fase posterior |

---

## 3. Arquitectura

```
┌─────────────────────────────────────────────┐
│  CRM UcoBot (Next.js + Supabase)             │
│                                              │
│  Maestros: flota, choferes, transportistas,  │
│            corredores, clientes, catálogos   │
│                                              │
│  Subir PDF(s) ──► Extracción IA (Gemini) ──► │
│            permiso + ítems + match/create    │
│            cliente                           │
│                                              │
│  Armado del viaje ──► inferencia corredor,   │
│            validaciones, CRT(s)              │
│            => "Viaje" estructurado (JSON)    │
└───────────────┬──────────────────────────────┘
                │  API autenticada (lee el viaje)
                ▼
┌─────────────────────────────────────────────┐
│  Extensión Chrome (content script)           │
│  Vuelca pestaña por pestaña en MALVINA:      │
│  Carátula → Países de Paso → CRT → Permiso → │
│  Contenedores → Precintos → Bultos           │
│  Dispara "Validar CNRT". SE DETIENE antes    │
│  de oficializar (lo confirma el humano).     │
└─────────────────────────────────────────────┘
```

---

## 4. Estado actual (hecho)

- ✅ Análisis completo de MIC/DTA y CRT (normativa ATIT + instructivo AFIP v10).
- ✅ Validación contra un permiso de embarque real (OM-1993 SIM).
- ✅ Confirmado: **no hay webservice de carretera** → la extensión es la vía correcta.
- ✅ **Esquema de base de datos aplicado** (16 tablas `transport_*`, RLS + policies, catálogos seed).
- ✅ Propuesta de negocio en HTML para el socio.

---

## 5. Modelo de datos (resumen)

Todas las tablas con prefijo `transport_`, scope `user_id = auth.uid()`, RLS activo. Detalle en `scripts/098_transport_kit_schema.sql`.

**Maestros:** `transport_carriers`, `transport_vehicles`, `transport_drivers`, `transport_clients` (con match-or-create por id tributaria), `transport_corridors`, `transport_catalogs` (global), `transport_settings`.

**Documentos/IA:** `transport_documents`, `transport_shipping_permits`, `transport_permit_items` (multi-ítem).

**Operación:** `transport_trips` (MIC/DTA), `transport_crts`, `transport_containers`, `transport_seals`, `transport_packages`, `transport_trip_events` (trazabilidad).

---

## 6. Fases de desarrollo

Esfuerzo orientativo: **S** (1-2 días) · **M** (3-5 días) · **L** (1-2 semanas).

### Fase 0 — Fundaciones del módulo · *S*
- [ ] Flag de vertical "transporte" (en `user_profiles.business_info` o `sidebar_config`).
- [ ] Sección/navegación "Transporte" en el CRM (rutas `/transporte/*`).
- [ ] Seed completo de catálogos (aduanas, ciudades, países, embalajes) — ampliar el seed mínimo actual.
- [ ] Generar tipos TypeScript desde Supabase (`supabase gen types`).
- **Entregable:** módulo navegable, vacío pero con datos de referencia.

### Fase 1 — Maestros (CRUD) · *M*
- [ ] CRUD de **flota** (tractores/semis) con póliza y vencimientos.
- [ ] CRUD de **choferes**, **transportistas** (con campo CNRT), **propietario**.
- [ ] CRUD de **corredores** (plantillas de ruta editables) con claves de inferencia.
- [ ] **Settings del kit** (camión/chofer por defecto, `single_truck_mode`, usuario MALVINA).
- **Entregable:** un transportista puede cargar toda su operación base una vez.

### Fase 2 — Extracción IA (el corazón) · *L*
- [ ] Subida de PDF (permiso + factura opcional) a Storage + registro en `transport_documents`.
- [ ] Pipeline de extracción con Gemini: PDF → texto → JSON estructurado (prompt + schema).
  - Permiso → `transport_shipping_permits` + `transport_permit_items` (multi-ítem).
  - Factura → consignatario/destinatario.
- [ ] **Match-or-create de clientes** por id tributaria (upsert sobre índice único).
- [ ] Pantalla de **revisión** de lo extraído (editar antes de confirmar).
- [ ] Cruce de validación factura vs permiso (FOB, pesos, cantidades).
- **Entregable:** subo un PDF y veo el viaje pre-armado y editable.
- ⚠️ Riesgo principal: variabilidad de formato del PDF → prompt robusto + nº permiso como ancla.

### Fase 3 — Armado y validación del viaje · *M*
- [ ] **Inferencia de corredor** desde aduana de partida + país destino del permiso.
- [ ] Generación de **CRT(s)** a partir del permiso e ítems (descripción agregada).
- [ ] Lógica **consolidado** (varios CRT en un MIC) y **fraccionado** (primera/última fracción).
- [ ] **Motor de validaciones** previo (CUIT/RUT, pesos coherentes, póliza vigente, embalaje vs precumplido, obligatorios) → escribe `validation_errors`.
- [ ] Asignación de camión/chofer (o auto desde `single_truck_mode`).
- **Entregable:** "Viaje" en estado `listo`, validado, con su(s) CRT.

### Fase 4 — Extensión Chrome (volcado a MALVINA) · *L*
- [ ] Scaffold de extensión MV3 + auth contra el CRM (token).
- [ ] **Mapa de campos** por pestaña (extraer `name`/`id` reales con F12 en una sesión).
- [ ] Volcado secuencial: Carátula → Países de Paso → CRT → Permiso → Contenedores → Precintos → Bultos.
- [ ] Manejo de AJAX/eventos (`change`), botón **"Validar CNRT"**, dropdowns dependientes.
- [ ] Iteración de **N CRT** en consolidado.
- [ ] **Freno antes de oficializar** + panel de revisión.
- [ ] Devolver el **Nº de MIC** oficializado al CRM (`transport_trips.mic_clave`).
- **Entregable:** de "Viaje listo" en el CRM a formulario MALVINA cargado en ~1-2 min.
- ⚠️ Riesgo: DOM legacy / framesets → mapa de campos versionado y monitoreado.

### Fase 5 — Trazabilidad, alertas y reportes · *M*
- [ ] Historial de viajes (`transport_trip_events`) y estados.
- [ ] **Alertas de vencimiento** (pólizas, permiso internacional) — reusar cron/notifications del CRM.
- [ ] Reportes: viajes por período, por cliente, por camión.
- **Entregable:** panel operativo + avisos proactivos.

### Fase 6 — Entrada por WhatsApp (opcional) · *M*
- [ ] Recepción del permiso por WhatsApp → dispara Fase 2 → responde por chat.
- **Entregable:** "subir y listo" sin entrar al CRM.

---

## 7. MVP (primer entregable demostrable)

**Fases 0 → 1 → 2 → 3** + un **volcado manual asistido** (la Fase 4 mínima sobre la pestaña Carátula y CRT). Es decir: un transportista carga su flota una vez, sube un permiso, y obtiene un viaje validado que la extensión empieza a volcar. Demostrable end-to-end con el caso real de Peñaflor.

---

## 8. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Formato variable del permiso PDF | Extracción con LLM (no plantilla) + nº permiso como ancla + pantalla de revisión |
| DOM legacy del MALVINA cambia | Mapa de campos en config versionada; tests de humo; monitoreo |
| Responsabilidad legal (DDJJ) | La extensión nunca oficializa ni toca credenciales; humano confirma |
| Datos del cliente del exterior no en el permiso | Vienen de la factura + match-or-create; se piden 1 sola vez |
| Calidad de extracción en números sensibles | Validación cruzada factura/permiso + revisión humana obligatoria |

---

## 9. Pendientes a confirmar con el socio/despachante

1. ¿Cargan ellos el MIC/DTA o un despachante/ATA? (afecta perfiles/UX)
2. Frecuencia real de consolidado y fraccionado.
3. Cuántos corredores/pasos usan (cantidad de plantillas).
4. ¿La factura comercial llega siempre con el cliente del exterior?
5. Errores de rechazo más frecuentes (priorizar validaciones).
6. Volumen de MIC/DTA por mes (dimensionar ahorro y modelo de cobro).

---

## 10. Cronograma orientativo

| Bloque | Fases | Duración aprox. |
|---|---|---|
| Base + maestros | 0, 1 | ~1 semana |
| Extracción IA + armado | 2, 3 | ~2-3 semanas |
| Extensión Chrome | 4 | ~2 semanas |
| Trazabilidad/alertas | 5 | ~1 semana |
| WhatsApp (opcional) | 6 | ~1 semana |

> Estimación para un dev enfocado. El camino crítico es **Fase 2 (extracción) + Fase 4 (extensión)**.

---

## 11. Próximo paso inmediato

Arrancar **Fase 0 + Fase 1** (maestros), que no dependen de nada externo y dejan el módulo listo para cargar la operación real del socio mientras se construye la extracción IA.
