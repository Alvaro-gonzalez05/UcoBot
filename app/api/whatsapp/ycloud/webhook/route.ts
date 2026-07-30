import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { storeMediaBuffer } from '@/lib/meta/store-media'
import { businessPhoneVariants, digitsOnly, verifyYCloudSignature } from '@/lib/whatsapp/ycloud'

/**
 * Webhook de YCloud (BSP oficial).
 *
 * Misma estrategia que el de Evolution: NO duplicar el pipeline. Traduce el
 * payload de YCloud a la forma exacta del webhook de Meta y lo reinyecta en
 * /api/whatsapp/webhook, así conversaciones, debounce, IA, duplicados y ventana
 * de 24 h funcionan idénticos.
 *
 * Como TODOS los WABAs cuelgan de una sola cuenta de YCloud, este endpoint es
 * único para todos los clientes: la integración se resuelve por el número del
 * negocio (`to`), que se guarda en config.phone_number_id (solo dígitos).
 *
 * Eventos:
 *  - whatsapp.inbound_message.received → traducir y reinyectar
 *  - resto (whatsapp.message.updated, etc.) → 200 sin hacer nada
 */

/** Tipos de media que bajamos al bucket antes de pasar al pipeline. */
const MEDIA_TYPES = ['image', 'video', 'audio', 'document', 'sticker'] as const

/**
 * Busca la integración ACTIVA dueña de un número de negocio.
 *
 * Compara contra las variantes AR (con y sin el 9) en vez de literal: al recrear
 * la WABA, Meta puede empezar a reportar el mismo número en el otro formato y el
 * `eq` exacto dejaba de matchear, con el efecto de que todo lo entrante se
 * descartaba en silencio mientras el envío seguía andando.
 *
 * `is_active` es parte del filtro: una integración desconectada no debe recibir.
 * Y `limit(1)` evita que un número que quedó en dos filas (histórico de otra
 * cuenta) haga fallar el `maybeSingle` y se pierda el mensaje.
 */
/**
 * Cliente admin compartido entre invocaciones tibias de la misma lambda.
 *
 * Crear uno por evento era gratis con tráfico normal, pero la importación inicial
 * de coexistencia manda MILES de eventos por minuto (medido: 2.083 en un minuto).
 * Ahí cada objeto nuevo se paga.
 */
let sharedAdmin: ReturnType<typeof createAdminClient> | null = null
function getSharedAdmin() {
  if (!sharedAdmin) sharedAdmin = createAdminClient()
  return sharedAdmin
}

/**
 * Resolución de integración cacheada en memoria.
 *
 * POR QUÉ: cada evento de historial hacía DOS viajes a la base — resolver la
 * integración (con un filtro sobre un campo JSON, sin índice) y recién después el
 * insert. En la ráfaga eso duplicaba la carga y las entregas empezaron a fallar
 * (se vio en los registros de YCloud: todas las tandas en rojo).
 *
 * El número del negocio no cambia entre eventos, así que se resuelve una vez y se
 * reusa. TTL corto para que una reconexión se note sin reiniciar nada.
 */
type ResolvedIntegration = { userId: string; storedPhone: string }
const INTEGRATION_TTL_MS = 5 * 60 * 1000
const integrationCache = new Map<string, { value: ResolvedIntegration | null; at: number }>()

async function resolveIntegrationCached(
  admin: any,
  businessPhone: string,
): Promise<ResolvedIntegration | null> {
  const hit = integrationCache.get(businessPhone)
  if (hit && Date.now() - hit.at < INTEGRATION_TTL_MS) return hit.value

  const integration = await findIntegrationByBusinessPhone(admin, businessPhone)
  const value: ResolvedIntegration | null = integration
    ? {
        userId: integration.user_id,
        storedPhone:
          String((integration.config as any)?.phone_number_id || '') || businessPhone,
      }
    : null

  integrationCache.set(businessPhone, { value, at: Date.now() })
  return value
}

async function findIntegrationByBusinessPhone(admin: any, businessPhone: string) {
  const variants = businessPhoneVariants(businessPhone)
  if (variants.length === 0) return null

  const { data } = await admin
    .from('integrations')
    .select('user_id, config')
    .eq('platform', 'whatsapp')
    .eq('is_active', true)
    .or(variants.map((v) => `config->>phone_number_id.eq.${v}`).join(','))
    .limit(1)
    .maybeSingle()

  return data ?? null
}

/**
 * Texto visible de un mensaje de YCloud, según su tipo.
 *
 * Sin esto, los echos que no eran texto ni media quedaban como "[button]" o
 * "[interactive]" en el chat, sin decir qué se había apretado.
 */
function contentOf(msg: any): string {
  const t: string = msg?.type || 'text'
  const payload = msg?.[t] || {}

  if (t === 'text') return msg.text?.body || ''
  if (t === 'button') return payload.text || ''
  if (t === 'interactive') {
    return payload.button_reply?.title || payload.list_reply?.title || ''
  }
  if (t === 'reaction') {
    return payload.emoji ? `Reaccionó con ${payload.emoji}` : 'Quitó su reacción'
  }
  if (t === 'location') {
    const place = [payload.name, payload.address].filter(Boolean).join(' - ')
    return place ? `📍 ${place}` : '📍 Ubicación'
  }
  if (t === 'template') {
    // Plantilla enviada desde el celular: al menos dejamos el nombre.
    return payload.name ? `Plantilla enviada: ${payload.name}` : 'Plantilla enviada'
  }
  return payload.caption || ''
}

/**
 * YCloud entrega la media como link directo (sin base64 ni descarga por ID,
 * a diferencia de Meta y Evolution). Igual la bajamos al bucket propio porque
 * ese link es temporal.
 */
async function storeYCloudMedia(
  link: string,
  userId: string,
  kind: string,
): Promise<string | null> {
  try {
    const res = await fetch(link)
    if (!res.ok) {
      console.error('[YCloud media] descarga falló:', res.status)
      return null
    }
    const contentType = res.headers.get('content-type') || 'application/octet-stream'
    const buffer = Buffer.from(await res.arrayBuffer())
    return await storeMediaBuffer({ buffer, contentType, userId, kind })
  } catch (e) {
    console.error('[YCloud media] error:', e)
    return null
  }
}

export async function POST(request: NextRequest) {
  try {
    // Hay que leer el body crudo para poder validar la firma HMAC.
    const rawBody = await request.text()

    // El body se PARSEA antes de validar, porque con una cuenta de YCloud por
    // cliente el secreto depende de a quién pertenece el evento y eso solo se
    // sabe leyéndolo. Es seguro mientras no se ACTÚE sobre estos datos antes de
    // la validación de abajo: acá solo se usan para elegir con qué secreto
    // verificar la firma.
    const body = JSON.parse(rawBody || '{}')
    const type: string = body?.type || ''

    // Un solo secreto, el del entorno: se volvió al modelo de cuenta única de
    // YCloud para toda la plataforma (ver getIntegrationWebhookSecret).
    const secret = process.env.YCLOUD_WEBHOOK_SECRET?.trim() || null
    if (secret) {
      const ok = verifyYCloudSignature(rawBody, request.headers.get('ycloud-signature'), secret)
      if (!ok) {
        console.error('[YCloud webhook] firma inválida')
        return NextResponse.json({ error: 'invalid signature' }, { status: 401 })
      }
    } else {
      // Sin secreto configurado no se puede validar. Se acepta igual para no
      // bloquear la puesta en marcha, pero conviene configurarlo en producción.
      console.warn('[YCloud webhook] sin secreto para esta cuenta: firma sin verificar')
    }

    // COEXISTENCIA — CARGA INICIAL: historial de chats y agenda de contactos.
    // Llegan UNA SOLA VEZ, a los minutos del alta por coexistencia, y el historial
    // viene en tandas grandes. Acá solo se estacionan y se responde 200 al toque:
    // procesarlos en línea haría que YCloud reintente por timeout.
    // El HISTORIAL ya no se maneja acá: tiene su propio endpoint en edge runtime
    // (/api/whatsapp/ycloud/history). Convivir con esta ruta hacía que la ráfaga
    // de miles de eventos consumiera los slots de concurrencia de Node y tirara
    // abajo el resto de la app. Si igual llega alguno (endpoint viejo todavía
    // suscrito), se acepta para no perderlo.
    if (type === 'whatsapp.smb.history') {
      try {
        await stageSyncChunk(type, body)
      } catch (e) {
        console.error('[YCloud sync] historial por la ruta vieja, falló:', e)
        return NextResponse.json({ error: 'staging failed' }, { status: 500 })
      }
      return NextResponse.json({ ok: true })
    }

    // Contactos: volumen bajo (unas pocas tandas por alta) y además llega cada vez
    // que el dueño toca la agenda del celular. Se queda acá.
    if (type === 'whatsapp.smb.app.state.sync') {
      try {
        await stageSyncChunk(type, body)
      } catch (e) {
        console.error('[YCloud sync] no se pudo estacionar la tanda de contactos:', e)
        return NextResponse.json({ error: 'staging failed' }, { status: 500 })
      }
      return NextResponse.json({ ok: true })
    }

    // COEXISTENCIA: el dueño contestó desde la app de WhatsApp de su celular.
    // A diferencia de Evolution, acá no hay que adivinar con `fromMe`: este evento
    // se dispara SOLO para lo que sale del celular o de un dispositivo vinculado,
    // nunca para lo que manda UcoBot por API.
    if (type === 'whatsapp.smb.message.echoes') {
      await handlePhoneEcho(body.whatsappMessage).catch((e) =>
        console.error('[YCloud echo] error:', e),
      )
      return NextResponse.json({ ok: true })
    }

    // ESTADO DE ENTREGA: el tilde / doble tilde / doble tilde azul de lo que
    // mandamos nosotros. La cuenta ya estaba suscrita a este evento; hasta ahora
    // se descartaba junto con el resto.
    if (type === 'whatsapp.message.updated') {
      await handleStatusUpdate(body.whatsappMessage).catch((e) =>
        console.error('[YCloud status] error:', e),
      )
      return NextResponse.json({ ok: true })
    }

    if (type !== 'whatsapp.inbound_message.received') {
      return NextResponse.json({ ok: true })
    }

    const msg = body.whatsappInboundMessage
    if (!msg) return NextResponse.json({ ok: true })

    const businessPhone = digitsOnly(msg.to)       // número del negocio (nuestro cliente)
    const customerPhone = digitsOnly(msg.from)     // número de quien escribe
    if (!businessPhone || !customerPhone) return NextResponse.json({ ok: true })

    // Dueño de la integración: lo necesitamos para el path del bucket de media.
    const admin = createAdminClient()
    const integration = await findIntegrationByBusinessPhone(admin, businessPhone)

    if (!integration) {
      console.error(
        '[YCloud webhook] sin integración ACTIVA para el número del negocio:',
        businessPhone,
        '| variantes probadas:',
        businessPhoneVariants(businessPhone).join(', '),
      )
      return NextResponse.json({ ok: true })
    }
    const ownerUserId: string = integration.user_id

    // El pipeline de Meta resuelve por `config.phone_number_id` con igualdad
    // exacta. Reinyectamos con el valor GUARDADO (no con el que vino en el
    // webhook) para que un cambio de formato del lado de Meta no lo rompa.
    const storedPhoneNumberId: string =
      String((integration.config as any)?.phone_number_id || '') || businessPhone

    const msgType: string = msg.type || 'text'

    // NO se descarta ningún tipo: `unsupported` (contenido que Meta no puede
    // entregar) y `system` (avisos de cambio de número) también se reinyectan, para
    // que el operador vea en el chat que algo llegó. El pipeline los guarda con un
    // texto explicativo y NO dispara la IA con ellos (ver shouldProcessAI).

    // Forma Meta: el pipeline actual entiende exactamente esto.
    const m: any = {
      id: msg.wamid || msg.id,
      from: customerPhone,
      timestamp: String(
        msg.sendTime ? Math.floor(new Date(msg.sendTime).getTime() / 1000) : Math.floor(Date.now() / 1000),
      ),
      type: msgType,
    }

    if (msg.context?.id) {
      m.context = { id: msg.context.id, from: digitsOnly(msg.context.from || '') }
    }

    if (msgType === 'text') {
      m.text = { body: msg.text?.body || '' }
    } else if ((MEDIA_TYPES as readonly string[]).includes(msgType)) {
      const payload = msg[msgType] || {}
      const storedUrl = payload.link
        ? await storeYCloudMedia(payload.link, ownerUserId, msgType)
        : null
      // `stored_url` lo consume el pipeline: persiste sin Graph y se lo pasa a
      // la IA para que vea la imagen / transcriba el audio.
      m[msgType] = {
        ...(payload.caption ? { caption: payload.caption } : {}),
        ...(payload.mime_type ? { mime_type: payload.mime_type } : {}),
        stored_url: storedUrl,
      }
    } else {
      // interactive, location, button, reaction, order, contacts: YCloud replica
      // la estructura de Meta, así que pasan tal cual.
      m[msgType] = msg[msgType] ?? {}
    }

    const metaBody = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: msg.wabaId || businessPhone,
          changes: [
            {
              field: 'messages',
              value: {
                messaging_product: 'whatsapp',
                metadata: {
                  phone_number_id: storedPhoneNumberId,
                  display_phone_number: storedPhoneNumberId,
                },
                contacts: [
                  {
                    profile: { name: msg.customerProfile?.name || customerPhone },
                    wa_id: customerPhone,
                  },
                ],
                messages: [m],
              },
            },
          ],
        },
      ],
    }

    // Reinyección al pipeline existente (mismo host)
    const origin = request.nextUrl.origin.replace('https://localhost', 'http://localhost')
    const res = await fetch(`${origin}/api/whatsapp/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(metaBody),
    })

    if (!res.ok) {
      console.error('[YCloud] reinyección falló:', res.status)
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[YCloud webhook] error:', error)
    // 200 igual: YCloud reintenta ante 5xx y no queremos tormenta de reintentos.
    return NextResponse.json({ ok: true })
  }
}

/**
 * Estaciona un chunk de la carga inicial de coexistencia para que lo procese el cron.
 *
 * El número del negocio hay que sacarlo del propio payload, porque estos eventos no
 * tienen la forma de un mensaje suelto: en `history` viene en los mensajes de cada
 * hilo, y en `app_state_sync` en el metadata.
 */
async function stageSyncChunk(type: string, body: any) {
  const isHistory = type === 'whatsapp.smb.history'
  const data = isHistory ? body : body.whatsappSmbAppStateSync ?? body.appStateSync

  // FORMA REAL (verificada contra los logs de entrega de YCloud):
  //  - history: UN mensaje por evento, con la misma forma que un mensaje normal.
  //    `whatsappInboundMessage` si lo mandó el cliente, `whatsappMessage` si lo
  //    mandó el negocio. NO viene en tandas con threads/progress, como decía la
  //    documentación de Meta.
  //  - app_state_sync: un objeto con `phoneNumber` y el array `stateSync`.
  let businessPhone = ''
  if (isHistory) {
    const inbound = body.whatsappInboundMessage
    const outbound = body.whatsappMessage
    const m = inbound || outbound
    // En un entrante el negocio es el destinatario; en un saliente, el remitente.
    businessPhone = digitsOnly((inbound ? m?.to : m?.from) || '')
  } else {
    businessPhone = digitsOnly(data?.phoneNumber || data?.metadata?.display_phone_number || '')
  }

  const admin = getSharedAdmin()

  // Sin número no podemos saber de qué cuenta es: guardamos igual con el payload
  // completo para no perderlo, pero queda en error para revisarlo a mano.
  let userId: string | null = null
  let storedPhone = businessPhone
  if (businessPhone) {
    const resolved = await resolveIntegrationCached(admin, businessPhone)
    userId = resolved?.userId ?? null
    // Se estaciona con el número tal como está en la integración, así el cron que
    // procesa las tandas lo resuelve igual que el resto del pipeline.
    storedPhone = resolved?.storedPhone || businessPhone
  }

  if (!userId) {
    console.error('[YCloud sync] chunk sin integración conocida. phone:', businessPhone, 'type:', type)
    return
  }

  // YCloud no manda phase/chunk_order/progress (eso es del webhook crudo de Meta).
  // Se dejan las columnas por si aparecen, pero el progreso de la UI se calcula
  // por tandas procesadas.
  const meta = { ...(data || {}), ...(data?.metadata || {}) } as any

  const { error } = await admin.from('whatsapp_sync_chunks').insert({
    user_id: userId,
    phone_number_id: storedPhone,
    event_type: isHistory ? 'history' : 'app_state_sync',
    payload: body,
    phase: meta.phase ?? null,
    chunk_order: meta.chunk_order ?? meta.chunkOrder ?? null,
    progress: meta.progress ?? null,
  })

  // Si el insert falla hay que propagarlo: devolver 200 haría que YCloud dé el
  // evento por entregado y ese mensaje del historial se pierde para siempre.
  if (error) throw new Error(`insert de chunk falló: ${error.message}`)

  // El historial NO se loguea por evento: en la ráfaga eran miles de líneas por
  // minuto, y escribir logs a ese ritmo es parte de lo que hacía fallar la entrega.
  if (!isHistory) {
    console.log('[YCloud sync] tanda de contactos estacionada')
  }
}

/**
 * Coexistencia: mensaje que el dueño mandó desde la app de WhatsApp del celular
 * (o un dispositivo vinculado) al mismo número que usa el bot.
 *
 * Se guarda como saliente para que se vea en /chat y se PAUSA la IA de esa
 * conversación: si el humano tomó la charla, el bot no debe seguir contestando.
 * Es el mismo handover que ya hace Evolution, pero sin heurísticas — acá el
 * propio evento garantiza que salió del celular y no de UcoBot.
 */
async function handlePhoneEcho(msg: any) {
  if (!msg) return

  const businessPhone = digitsOnly(msg.from) // el número del negocio
  const clientPhone = digitsOnly(msg.to)     // el cliente al que le escribió
  const wamid: string | null = msg.wamid || msg.id || null
  if (!businessPhone || !clientPhone) return

  const admin = createAdminClient()

  const integration = await findIntegrationByBusinessPhone(admin, businessPhone)
  if (!integration) {
    console.error('[YCloud echo] sin integración ACTIVA para el número:', businessPhone)
    return
  }

  const { data: bot } = await admin
    .from('bots')
    .select('id, feature_config')
    .eq('user_id', integration.user_id)
    .contains('platforms', ['whatsapp'])
    .eq('is_active', true)
    // Mismo bot siempre (ver webhook de Cloud API): sin ORDER BY, una cuenta con
    // varios bots duplicaba la conversación del mismo cliente.
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (!bot) return

  // Idempotencia: YCloud reintenta ante fallos, no queremos duplicar ni
  // re-pausar una conversación que el dueño ya reactivó a mano.
  if (wamid) {
    const { data: dup } = await admin
      .from('messages')
      .select('id')
      .eq('metadata->>whatsapp_message_id', wamid)
      .maybeSingle()
    if (dup) return
  }

  // Conversación por bot + teléfono del cliente (variantes 549)
  const variants = [clientPhone]
  if (clientPhone.startsWith('549')) {
    variants.push(clientPhone.substring(3), '54' + clientPhone.substring(3))
  }
  const { data: conversation } = await admin
    .from('conversations')
    .select('id')
    .eq('bot_id', bot.id)
    .in('client_phone', variants)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  let conversationId = conversation?.id
  if (!conversationId) {
    const { data: created } = await admin
      .from('conversations')
      .insert({
        user_id: integration.user_id,
        bot_id: bot.id,
        client_phone: clientPhone,
        client_name: clientPhone,
        platform: 'whatsapp',
        status: 'active',
      })
      .select('id')
      .single()
    conversationId = created?.id
  }
  if (!conversationId) return

  const msgType: string = msg.type || 'text'
  const text = contentOf(msg)

  // Media saliente mandada desde el celular: la bajamos al bucket para que se
  // VEA en /chat. Si no, quedaría como [imagen] / [audio].
  let storedUrl: string | null = null
  if ((MEDIA_TYPES as readonly string[]).includes(msgType)) {
    const link = msg?.[msgType]?.link
    if (link) storedUrl = await storeYCloudMedia(link, integration.user_id, msgType)
  }

  // OJO: el chat renderiza la media SOLO si existe `metadata.<tipo>`
  // (ver chat-view.tsx: `message_type === 'image' && metadata?.image`). Con
  // `stored_url` suelto no alcanza: se ve el texto "[image]" en vez de la foto.
  // Por eso replicamos acá la misma forma que arma el pipeline entrante.
  const extra: Record<string, any> = {}
  const isMedia = (MEDIA_TYPES as readonly string[]).includes(msgType)

  if (isMedia) {
    extra[msgType] = {
      ...(text ? { caption: text } : {}),
      ...(msg?.[msgType]?.mime_type ? { mime_type: msg[msgType].mime_type } : {}),
      ...(storedUrl ? { stored_url: storedUrl } : {}),
    }
    // Los stickers se guardan como 'image' (CHECK-safe) y se distinguen por is_sticker.
    if (msgType === 'sticker') extra.is_sticker = true
  } else if (msg?.[msgType]) {
    // location, contacts, interactive, order, reaction: pasan tal cual, que es
    // lo que espera la UI (ej. metadata.location.latitude para el mapa).
    extra[msgType] = msg[msgType]
  }

  const internalType =
    msgType === 'sticker'
      ? 'image'
      : ['image', 'audio', 'document', 'video', 'location'].includes(msgType)
        ? msgType
        : 'text'

  await admin.from('messages').insert({
    conversation_id: conversationId,
    // Para media el contenido es el epígrafe (o vacío), igual que en el pipeline
    // entrante. Poner "[image]" acá hacía que se viera ese texto en el globo.
    content: isMedia || msgType === 'location' ? text || '' : text || `[${msgType}]`,
    sender_type: 'bot',
    message_type: internalType,
    metadata: {
      whatsapp_message_id: wamid,
      sent_by: 'phone', // lo mandó el dueño desde su celular
      is_handover: true,
      original_type: msgType,
      ...extra,
      ...(storedUrl ? { stored_url: storedUrl } : {}),
    },
  })

  // Handover: pausar la IA. Mismo criterio que el resto del sistema:
  // auto_reactivate_hours > 0 vence sola; si no, queda hasta reactivar a mano.
  const reactivateHours = Number((bot.feature_config as any)?.auto_reactivate_hours) || 0
  await admin
    .from('conversations')
    .update({
      // Solo pausa la IA. NO marcamos needs_attention: el dueño ya está
      // atendiendo desde su celular, no necesita que se lo señalen como pendiente.
      status: 'paused',
      paused_until:
        reactivateHours > 0
          ? new Date(Date.now() + reactivateHours * 3600 * 1000).toISOString()
          : null,
      last_message_at: new Date().toISOString(),
    })
    .eq('id', conversationId)
}

/**
 * Estado de entrega de un mensaje que mandamos nosotros: el tilde, el doble
 * tilde y el doble tilde azul.
 *
 * Estados de YCloud: accepted → sent → delivered → read, más `failed`.
 *
 * Se busca por los DOS identificadores porque no siempre guardamos el mismo: lo
 * que manda UcoBot por API queda con el id de YCloud, y lo que sale del celular
 * (coexistencia) con el wamid de WhatsApp.
 *
 * El orden de llegada NO está garantizado, así que el avance lo resuelve
 * apply_whatsapp_delivery_status comparando rangos: un `delivered` demorado no
 * puede pisar un `read` que ya llegó.
 */
async function handleStatusUpdate(msg: any) {
  const status: string | null = msg?.status || null
  if (!status) return

  // 'accepted' es solo el acuse de YCloud de que tomó el pedido; no dice nada
  // sobre WhatsApp todavía y haría parpadear el tilde sin motivo.
  if (status === 'accepted') return

  const ids = [msg?.id, msg?.wamid].filter(Boolean) as string[]
  if (ids.length === 0) {
    console.error('[YCloud status] evento sin id ni wamid, se descarta:', status)
    return
  }

  const admin = createAdminClient()

  const applyOnce = async (): Promise<number> => {
    for (const id of ids) {
      const { data, error } = await admin.rpc('apply_whatsapp_delivery_status', {
        p_wamid: id,
        p_status: status,
      })
      if (error) {
        // Antes se cortaba acá y el estado se perdía sin dejar rastro claro.
        console.error(`[YCloud status] RPC falló para ${id} (${status}):`, error.message)
        continue
      }
      if ((data as number) > 0) return data as number
    }
    return 0
  }

  let applied = await applyOnce()

  // CARRERA: WhatsApp puede confirmar el estado ANTES de que terminemos de guardar
  // el mensaje que acabamos de mandar. En ese caso el UPDATE no encuentra la fila
  // y el tilde queda para siempre en "reloj". Se reintenta una vez, corto.
  if (applied === 0) {
    await new Promise((r) => setTimeout(r, 1500))
    applied = await applyOnce()
  }

  if (applied === 0) {
    // Si igual no matchea es un mensaje que no mandamos nosotros (o se borró):
    // se loguea con el id para poder rastrearlo, nunca se descarta en silencio.
    console.warn(
      `[YCloud status] "${status}" sin mensaje que actualizar. ids probados: ${ids.join(', ')}`,
    )
    return
  }

  console.log(`[YCloud status] ${status} aplicado (${applied} mensaje/s)`)

  // GUARDAR EL WAMID de lo que enviamos por API.
  //
  // Lo que mandamos queda con el id INTERNO de YCloud (ej: 6a6987e3ad8c...), pero
  // cuando el cliente responde, WhatsApp cita el WAMID (wamid.HBgN...). Sin
  // guardarlo, la respuesta citada no encuentra el original y en el chat aparece
  // "Mensaje no disponible". El evento de estado es la única vez que YCloud nos
  // da los dos identificadores juntos, así que se aprovecha para vincularlos.
  if (msg?.wamid && msg?.id && msg.wamid !== msg.id) {
    const { data: row } = await admin
      .from('messages')
      .select('id, metadata')
      .eq('wa_message_id', msg.id)
      .maybeSingle()

    if (row && !(row.metadata as any)?.whatsapp_wamid) {
      await admin
        .from('messages')
        .update({ metadata: { ...(row.metadata as any), whatsapp_wamid: msg.wamid } })
        .eq('id', row.id)
    }
  }
}
