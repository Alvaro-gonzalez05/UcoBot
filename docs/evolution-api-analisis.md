# Análisis: Tercer proveedor de WhatsApp (Evolution API) en UcoBot

> Documento de auditoría y diseño. **No se modificó ningún archivo de producción.**
> Objetivo: agregar Evolution API como tercera opción de conexión, conviviendo con
> las dos actuales (Manual y Embedded Signup / Cloud API), sin romper nada.

---

## 0. Resumen ejecutivo (leer esto primero)

- La arquitectura actual **solo conoce un proveedor**: WhatsApp Cloud API (Graph API de
  Meta). No existe ninguna capa de abstracción — la lógica de envío está **duplicada en
  4 lugares**, todos apuntando a `graph.facebook.com` a mano.
- Hay **un bloqueante estructural**: la tabla `integrations` tiene `UNIQUE (user_id,
  platform)`. Hoy **un usuario solo puede tener UN número de WhatsApp**. Esto choca de
  frente con (a) las 2 sucursales que se le están vendiendo a la pizzería, y (b) el
  multi-sesión de Evolution. Es la primera decisión a tomar, antes que cualquier código.
- **Riesgo alto que hay que decir de frente**: Evolution API usa Baileys = WhatsApp Web
  **no oficial**. Viola los Términos de Servicio de WhatsApp. Acabás de recibir una
  sanción de Meta; mover clientes a una API no oficial puede terminar en el baneo del
  **número personal del cliente** (no de una WABA recuperable). Esto no es un detalle
  técnico, es la decisión de negocio central de todo el proyecto. Ver §6 y §9.
- **Infra nueva obligatoria**: Evolution necesita un servidor persistente con Docker +
  almacenamiento de sesión. El stack actual (Vercel, serverless) **no puede correrlo**.
  Es un VPS nuevo, con su costo y su mantenimiento. Ver §2.3.
- La buena noticia: el diseño desacoplado es viable y **la mayor parte del sistema
  (chatbot, CRM, automatizaciones, conversaciones) no necesita cambiar** si se introduce
  bien la capa de proveedor. El trabajo real está concentrado en 3 puntos: envío,
  recepción (normalización del webhook) y el modelo de datos.

---

## 1. Arquitectura actual (Tarea 1)

### 1.1 Proveedor único, lógica duplicada

Todo el WhatsApp de hoy es Cloud API de Meta. La función de enviar un mensaje de texto
está **copiada 4 veces**, cada una con su propia normalización de teléfono y su fetch a
Graph:

| # | Archivo | Rol | Cómo envía |
|---|---------|-----|------------|
| 1 | `app/api/whatsapp/webhook/route.ts:640` | Respuesta automática de la IA | `sendWhatsAppMessage()` inline |
| 2 | `app/api/chat/send/route.ts:204` | Mensaje manual del agente | `sendWhatsAppMessage()` inline |
| 3 | `app/api/chat/send-template/route.ts:76` | Envío de plantillas | `fetch` directo a Graph |
| 4 | `app/api/automations/process-queue/route.ts:445` | Cola de automatizaciones (cron) | `sendWhatsAppMessage()` inline |

**Implicancia**: no hay un único punto de cambio. Para meter un segundo proveedor hay que
unificar estos 4 caminos detrás de una interfaz común (§3). `lib/meta/credentials.ts` sí
centraliza los tokens, pero solo para Meta.

### 1.2 Recepción de mensajes (webhook)

- Endpoint único: `app/api/whatsapp/webhook/route.ts`. `GET` = verificación (hub.challenge),
  `POST` = eventos.
- El payload es **100% forma Meta**: `body.entry[].changes[].value.messages[]`. Toda la
  lógica de parseo (tipos, media, contexto de reply) asume esa estructura.
- Resuelve la integración por `config->>phone_number_id`.
- Guarda la media persistente vía `storeWhatsAppMedia` (descarga de Graph con token y sube
  al bucket `chat-media`, porque Meta expira sus URLs).

**Implicancia**: Evolution manda un payload **completamente distinto** (`messages.upsert`,
formato Baileys). Necesita un endpoint webhook nuevo + un **traductor** que normalice ese
payload a la forma canónica interna, para reusar todo el pipeline posterior sin tocarlo.

### 1.3 Flujo de respuesta de la IA

```
webhook recibe mensaje
  → guarda mensaje + marca last_client_message_at (ventana 24h)
  → debounce configurable por bot (default 7s, feature_config.debounce_seconds)
  → si llegó un mensaje más nuevo, descarta (agrupa ráfagas)
  → POST interno a /api/chat/webhook  (genera respuesta con Gemini)
  → envía las partes con sendWhatsAppMessage (credenciales Meta inline)
  → loguea usage_logs
```

**Implicancia**: la generación (`/api/chat/webhook`) es agnóstica del proveedor — recibe
texto y devuelve texto. El único punto acoplado a Meta es el **envío final**. Si el envío
pasa por la interfaz de proveedor, la IA funciona igual con Evolution sin cambios.

### 1.4 Cola de automatizaciones

```
/api/automations/scheduled  (cron)  → genera y encola en scheduled_messages
/api/automations/process-queue (cron) → procesa la cola, envía, marca sent/failed
```

- `scheduled` **no envía**: solo encola. `process-queue` es el único que envía.
- `process-queue` tiene presupuesto de 55s (límite serverless de Vercel).
- Tipos reales de automatización: `birthday`, `inactive_client`, `follow_up`,
  `promotion_broadcast`, `reservation_reminder`.
- **Ya tiene el gate de calidad** que agregamos (bloquea marketing con calidad baja).

**Implicancia**: la cola es suficiente para Cloud API pero **insuficiente para Evolution**
en lo anti-ban (§6). No tiene delays aleatorios, ni límites por número, ni warming.

### 1.5 Modelo de datos relevante

| Tabla | Campos clave | Nota para Evolution |
|-------|--------------|---------------------|
| `integrations` | `platform`, `config` (jsonb), `is_active`, `user_id`. **`UNIQUE(user_id, platform)`** | ⚠️ Bloqueante: 1 WhatsApp por usuario |
| `bots` | `platforms` (array), `features`, `automations`, `feature_config` (jsonb) | Agnóstico, no cambia |
| `conversations` | `bot_id`, `client_phone`, `platform`, `status`, `paused_until`, `last_client_message_at` | Agnóstico |
| `messages` | `conversation_id`, `sender_type`, `message_type`, `content`, `metadata` (jsonb) | Agnóstico |
| `clients` | `phone`, `last_interaction_at`, `optin_*` | Agnóstico |
| `scheduled_messages` | cola de envíos | Sirve, hay que extender anti-ban |
| `whatsapp_number_quality` | calidad por número (Cloud) | No aplica a Evolution (no hay quality rating) |

---

## 2. Evolution API — hallazgos de la doc oficial (Tarea 2)

> Fuentes: repo oficial `evolution-foundation/evolution-api` y docs en
> `docs.evolutionfoundation.com.br`. **Advertencia de fuente**: la doc está en dos
> generaciones (v2 clásica en Node/Baileys y "Evolution Go") con rutas distintas. Las
> rutas de abajo hay que confirmarlas contra la versión exacta que se despliegue.

### 2.1 Qué es y cómo corre

- REST API open-source para WhatsApp. Motor por defecto: **Baileys** (WhatsApp Web no
  oficial). También puede envolver la Cloud API oficial, pero el sentido de usarlo acá es
  el modo no oficial (conexión por QR, sin Meta de por medio).
- Corre con Docker: `docker pull evoapicloud/evolution-api:latest`, expone `:8080`.
- **Multi-instancia**: una instalación maneja muchos números (instancias), cada uno con su
  sesión de WhatsApp Web activa.
- Auth por **API key**: una global + tokens por instancia.

### 2.2 Endpoints principales (confirmar según versión)

| Acción | Endpoint (aprox.) |
|--------|-------------------|
| Crear instancia | `POST /instances` (v2: `/instance/create`) |
| Conectar / obtener QR | `POST /instances/{id}/connect`, `GET /instances/{id}/qrcode` |
| Estado de conexión | `GET /instances/{id}/connection` |
| Enviar texto | `POST /instances/{id}/send/text` (v2: `/message/sendText/{instance}`) |
| Enviar media | `POST /instances/{id}/send/media` |
| Logout | `POST /instances/{id}/logout` |
| Configurar webhook | `POST /instances/{id}/webhook` |

### 2.3 Eventos de webhook

`messages.upsert` (entrante/nuevo), `connection.update` (cambios de estado),
`qrcode.updated` (refresco de QR), `send.message` (confirmación de saliente),
`messages.update` (estados). Se pueden configurar por instancia o global.

### 2.4 Infra que exige (esto es costo real, no opcional)

- **Servidor persistente 24/7** con Docker. Vercel no sirve — hay que levantar un VPS.
- **Almacenamiento de sesión** (Postgres/Redis): las sesiones de Baileys hay que
  persistirlas o el número se desconecta y pide QR de nuevo en cada reinicio.
- El QR y la reconexión son **stateful**: alguien tiene que escanear el QR con el celular
  del cliente, y si la sesión cae hay que rescanear. Esto no existe en Cloud API.

---

## 3. Diseño propuesto: interfaz común de proveedor (Tarea 3 y 7)

Introducir una interfaz que **todo el sistema consuma**, y dos implementaciones:

```
lib/whatsapp/
  provider.ts        # interfaz WhatsAppProvider + factory
  cloud-provider.ts  # envuelve la lógica Meta actual (sin cambiar comportamiento)
  evolution-provider.ts  # nuevo, habla REST con Evolution
  normalize.ts       # traduce webhooks de cada proveedor a la forma canónica interna
```

```ts
interface WhatsAppProvider {
  sendText(to: string, text: string, opts?): Promise<SendResult>
  sendMedia(to: string, media: MediaInput, opts?): Promise<SendResult>
  sendTemplate?(to: string, tpl: TemplateInput): Promise<SendResult> // solo Cloud; no-op en Evolution
  setTyping?(to: string, on: boolean): Promise<void>                 // solo Evolution
  disconnect?(): Promise<void>                                        // solo Evolution
}

// Se resuelve por un discriminador nuevo en integrations.config.provider
function getWhatsAppProvider(integration): WhatsAppProvider  // 'cloud' (default) | 'evolution'
```

**Regla de oro**: la lógica del chatbot, las automatizaciones y el CRM **nunca** ven el
proveedor. Solo llaman `provider.sendText(...)`. El webhook entrante normaliza a una forma
canónica y de ahí para adelante el pipeline es idéntico.

Diferencias que la interfaz debe absorber:
- **Plantillas**: existen solo en Cloud. En Evolution, `sendTemplate` degrada a `sendText`
  con el texto renderizado (no hay ventana de 24h ni categorías en el mundo no oficial).
- **Typing / presencia**: existe en Evolution, no en Cloud. Método opcional.
- **Media**: Cloud sube por `media_id`; Evolution recibe URL o base64. La interfaz recibe
  una `MediaInput` neutral y cada provider resuelve.

---

## 4. Compatibilidad de funcionalidades del chatbot (Tarea 4)

| Funcionalidad | Estado | Cómo se resuelve |
|---------------|--------|------------------|
| Recepción de texto | ✅ Compatible | Normalizar `messages.upsert` → forma interna |
| Envío de texto | ✅ Compatible | `EvolutionProvider.sendText` |
| Imágenes / video / documentos | ✅ Compatible | `send/media`; ajustar `storeMedia` (viene URL/base64, no media_id) |
| Audios / notas de voz | ⚠️ Con cambios | Evolution maneja audio; hay que mapear MIME y (opcional) transcripción |
| Ubicación | ✅ Compatible | Evento de location en el payload de Baileys |
| Contactos | ⚠️ Con cambios | Formato distinto; mapear si se usa |
| Botones / listas interactivas | ❌ No confiable | WhatsApp restringió botones en no oficial; asumir que **no** hay y degradar a texto numerado |
| Respuestas del bot (IA) | ✅ Compatible | La generación es agnóstica; solo cambia el envío |
| Automatizaciones / embudos / disparadores | ✅ Compatible | Corren igual; solo cambia el transporte |
| CRM / historial / etiquetas | ✅ Compatible | Capa de datos agnóstica |
| Plantillas | ⚠️ Con cambios | Degradan a texto plano (no hay plantillas en no oficial) |
| Persistencia de media | ⚠️ Con cambios | `storeWhatsAppMedia` asume Graph+token; hacer variante para URL directa |

Ningún ítem es "imposible". Los ⚠️ son trabajo de mapeo acotado.

---

## 5. Sistema de envío (Tarea 5)

El diseño actual (generar → `scheduled_messages` → cron `process-queue`) es **correcto y
suficiente para Cloud API**, porque Meta absorbe el rate limiting y la reputación.

Para Evolution **no alcanza**, porque un patrón de envío "de máquina" (ráfagas, horarios
fijos, todo igual) es exactamente lo que dispara el baneo en WhatsApp Web no oficial. La
cola necesita una capa anti-ban (§6) que hoy no tiene: delays, jitter, límites y warming.
Propuesta: mantener la cola, agregar campos y un "planificador" que espacie los envíos de
Evolution de forma humana.

---

## 6. Anti-ban (Tarea 6) — solo aplica a Evolution

> En Cloud API esto **no se implementa**: Meta ya gestiona rate y reputación, y meter
> delays propios solo empeora la latencia sin beneficio. Anti-ban es exclusivo del camino
> no oficial.

| Técnica | ¿Sirve? | Justificación |
|---------|---------|---------------|
| Delays aleatorios + jitter entre mensajes | ✅ Sí | El envío regular idéntico es la señal #1 de bot. Espaciar 3–15s con varianza imita a un humano. |
| Límite diario por número | ✅ Sí | Números nuevos con alto volumen = baneo. Tope duro por instancia. |
| Límite horario / ventana activa | ✅ Sí | Enviar 3am o 24h seguidas es señal de spam. Restringir a horario comercial. |
| Warming (calentamiento) de números nuevos | ✅ Sí | Número recién conectado arranca con tope bajo y sube gradual en días. Es lo que más reduce baneo temprano. |
| Prioridad a conversaciones ya abiertas | ✅ Sí | Responder a quien te escribió es tráfico sano; iniciar chats en frío es el riesgoso. La cola debe priorizar respuestas sobre aperturas. |
| Limitar apertura de chats nuevos | ✅ Sí | Cap separado y bajo para "primer contacto" vs. respuestas. |
| Pausa automática ante señales | ✅ Sí | Si Evolution reporta desconexión/errores en cadena, frenar envíos y alertar. |
| Backoff exponencial en errores | ✅ Sí | Reintentos inmediatos ante fallo agravan el problema. |
| Métricas de reputación por número | ✅ Sí | Sin `quality_rating` (no oficial), hay que inferir salud: % entregados, desconexiones, reportes. |
| "Detección de comportamiento sospechoso" genérica | ⚠️ Matizado | Útil como agregado de las señales de arriba, no como módulo mágico aparte. No implementar heurísticas vagas sin datos. |
| Simular typing antes de enviar | ✅ Sí (barato) | Evolution soporta presencia; `setTyping` unos segundos antes hace el patrón más humano. |

**Lo importante y honesto**: ninguna de estas técnicas te vuelve inmune. Reducen la
probabilidad, no la eliminan. Un número de WhatsApp Web no oficial **puede caer igual**,
y cuando cae, cae el número real del cliente. El anti-ban es mitigación, no garantía.

---

## 7. Compatibilidad y no duplicación (Tarea 7)

Cubierto por §3: una sola interfaz, el resto del sistema no sabe qué proveedor hay detrás.
La clave para no duplicar es **primero refactorizar** los 4 envíos actuales a un
`CloudApiProvider` único (sin cambiar comportamiento), y recién después sumar Evolution
como segunda implementación de la misma interfaz.

---

## 8. Cambios necesarios, modelo de datos, migración y rollback (Tarea 8)

### 8.1 Modelo de datos

1. **Resolver la multiplicidad** (el bloqueante). Hoy `UNIQUE(user_id, platform)`. Opciones:
   - **A (recomendada)**: quitar ese unique y pasar a `UNIQUE(user_id, platform, config->>'external_ref')` o una columna nueva `label`/`branch`. Permite N números por usuario (las 2 sucursales, y las instancias de Evolution).
   - **B**: tabla `whatsapp_numbers` separada colgando de `integrations`. Más limpio a largo plazo, más trabajo de migración.
2. Agregar discriminador `config.provider` (`'cloud'` | `'evolution'`), default `'cloud'`
   para no alterar lo existente.
3. Para Evolution: `config.evolution_instance_id`, `config.evolution_apikey`, estado de
   conexión, y guardar el último QR/estado.
4. Extender `scheduled_messages` (o tabla lateral) con los contadores/límites anti-ban por
   número: enviados hoy, ventana, nivel de warming.

### 8.2 Archivos afectados

- **Nuevos**: `lib/whatsapp/provider.ts`, `cloud-provider.ts`, `evolution-provider.ts`,
  `normalize.ts`; endpoint `app/api/whatsapp/evolution/webhook/route.ts`; endpoints de
  conexión Evolution (crear instancia, traer QR, estado); componente UI del 3er botón.
- **Refactor sin cambio de comportamiento**: los 4 puntos de envío (§1.1) pasan a usar la
  interfaz. `lib/meta/store-media.ts` gana una variante para URL directa.
- **No se toca**: `/api/chat/webhook` (generación IA), CRM, embudos, el webhook de Meta
  actual, las automatizaciones en su lógica.

### 8.3 Plan de migración (etapas chicas y seguras)

1. Agregar `config.provider` default `'cloud'`. Cero cambio de comportamiento. Verificar.
2. Refactor de los 4 envíos → `CloudApiProvider` único. Verificar **paridad exacta** con lo
   actual (mismo output, mismos logs) antes de seguir.
3. Introducir la interfaz + factory; los envíos pasan por factory (sigue solo cloud).
4. Resolver multiplicidad de `integrations` (§8.1). Migrar el dato existente.
5. Levantar infra Evolution (VPS + Docker + storage de sesión) en un entorno aparte.
6. `EvolutionProvider` + webhook normalizador + UI de conexión por QR. Detrás de flag.
7. Capa anti-ban en la cola, solo para envíos Evolution.
8. Rollout gradual: un número piloto (no el de un cliente que factura) antes de ofrecerlo.

### 8.4 Plan de rollback

El diseño es **aditivo**: proveedor default `'cloud'`, todo lo de Evolution son tablas,
columnas y endpoints nuevos. Rollback = ocultar el botón de Evolution y dejar de rutear al
`EvolutionProvider`. Nada del camino Cloud se tocó, así que los clientes actuales siguen
igual. El único paso con rollback no trivial es el §8.1 (cambio de constraint): se hace con
migración reversible y respaldo previo de `integrations`.

---

## 9. Recomendación honesta (no técnica, de negocio)

Tengo que decir esto claro porque es el contexto real: **acabás de ser sancionado por Meta
y estás evaluando mover clientes a una API que viola los ToS de WhatsApp.** Los dos hechos
juntos importan.

- Cloud API (oficial) baneó una WABA, que es recuperable y no afecta el número personal.
- Evolution/Baileys, si WhatsApp lo detecta, **banea el número de teléfono real** — el
  celular del cliente, su línea. Es un daño peor y sobre alguien que te paga.
- Para un negocio serio y a largo plazo, el camino correcto sigue siendo un **BSP oficial**
  (360dialog, etc.), que ya charlamos. Evolution es un **puente temporal** mientras se
  resuelve el Tech Provider, no un destino.

Mi recomendación: si se avanza con Evolution, que sea (a) consciente del riesgo, (b) con
warming y anti-ban desde el día uno, (c) empezando por un número propio de prueba, y (d)
con el plan de volver a oficial cuando se destrabe. Construir la abstracción de proveedor
igual **vale la pena** independientemente de Evolution, porque es lo que te deja enchufar un
BSP mañana sin reescribir nada.

---

## 10. Lo que falta confirmar antes de implementar

1. **Decisión de multiplicidad** (§8.1 A vs B) — es la que condiciona todo el resto.
2. **Infra**: ¿hay VPS disponible? ¿quién lo mantiene? Sin esto, Evolution no arranca.
3. **Versión exacta de Evolution** a desplegar, para fijar las rutas reales de la API.
4. **Alcance del piloto**: ¿un número de prueba propio primero? (fuertemente recomendado).
