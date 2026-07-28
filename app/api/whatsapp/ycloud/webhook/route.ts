import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { storeMediaBuffer } from '@/lib/meta/store-media'
import { digitsOnly, verifyYCloudSignature } from '@/lib/whatsapp/ycloud'

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

/** Texto visible de un mensaje de YCloud, según su tipo. */
function contentOf(msg: any): string {
  const t: string = msg?.type || 'text'
  if (t === 'text') return msg.text?.body || ''
  const payload = msg?.[t] || {}
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

    const secret = process.env.YCLOUD_WEBHOOK_SECRET?.trim()
    if (secret) {
      const ok = verifyYCloudSignature(rawBody, request.headers.get('ycloud-signature'), secret)
      if (!ok) {
        console.error('[YCloud webhook] firma inválida')
        return NextResponse.json({ error: 'invalid signature' }, { status: 401 })
      }
    } else {
      // Sin secreto configurado no se puede validar. Se acepta igual para no
      // bloquear la puesta en marcha, pero conviene configurarlo en producción.
      console.warn('[YCloud webhook] YCLOUD_WEBHOOK_SECRET no configurado: firma sin verificar')
    }

    const body = JSON.parse(rawBody || '{}')
    const type: string = body?.type || ''

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
    const { data: integration } = await admin
      .from('integrations')
      .select('user_id')
      .eq('platform', 'whatsapp')
      .eq('config->>phone_number_id', businessPhone)
      .maybeSingle()

    if (!integration) {
      console.log('[YCloud webhook] sin integración para el número:', businessPhone)
      return NextResponse.json({ ok: true })
    }
    const ownerUserId: string = integration.user_id

    const msgType: string = msg.type || 'text'

    // YCloud manda `unsupported` cuando Meta no pudo entregar el contenido
    // (mensajes editados, encuestas, formatos nuevos) y `system` para avisos de
    // cambio de número. No aportan nada al chat y le meten ruido a la IA:
    // se descartan antes de reinyectar.
    if (msgType === 'unsupported' || msgType === 'system') {
      console.log('[YCloud webhook] tipo ignorado:', msgType)
      return NextResponse.json({ ok: true })
    }

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
                  phone_number_id: businessPhone,
                  display_phone_number: businessPhone,
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

  const { data: integration } = await admin
    .from('integrations')
    .select('user_id, config')
    .eq('platform', 'whatsapp')
    .eq('config->>phone_number_id', businessPhone)
    .maybeSingle()
  if (!integration) return

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
