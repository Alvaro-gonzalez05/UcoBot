import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getEvolutionConfig } from '@/lib/whatsapp/provider'
import { storeMediaBuffer } from '@/lib/meta/store-media'

/**
 * Webhook de Evolution API (Baileys).
 *
 * Estrategia: NO duplicar el pipeline. Este endpoint TRADUCE el payload de
 * Evolution (messages.upsert) a la forma exacta del webhook de Meta y lo
 * reinyecta en /api/whatsapp/webhook. Así conversaciones, debounce, IA,
 * duplicados y ventana de 24h funcionan idénticos sin tocar una línea.
 *
 * La integración Evolution guarda config.phone_number_id = nombre de instancia,
 * que es la clave con la que el pipeline resuelve integraciones.
 *
 * Eventos:
 *  - messages.upsert    → traducir y reinyectar
 *  - connection.update  → actualizar estado de conexión en la integración
 *  - qrcode.updated     → guardar el último QR (la UI lo pollea)
 *  - resto              → log y 200
 */

function phoneFromJid(jid?: string | null): string | null {
  if (!jid) return null
  if (!jid.endsWith('@s.whatsapp.net')) return null // grupos (@g.us) y otros: fuera
  return jid.split('@')[0].replace(/\D/g, '') || null
}

/**
 * Descarga la media de un mensaje de Evolution (base64) y la sube al bucket
 * chat-media. Devuelve la URL pública, o null si falla.
 *
 * Clave del piloto: sólo pasamos la URL (string corto) por el pipeline, NUNCA el
 * base64 — un audio pesa varios MB y volvería a disparar el 413 de Vercel.
 */
async function fetchAndStoreEvolutionMedia(
  instance: string,
  item: any,
  userId: string,
  kind: string,
): Promise<string | null> {
  const evo = getEvolutionConfig()
  if (!evo) return null
  try {
    const res = await fetch(
      `${evo.baseUrl}/chat/getBase64FromMediaMessage/${encodeURIComponent(instance)}`,
      {
        method: 'POST',
        headers: { apikey: evo.apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: { key: item.key }, convertToMp4: false }),
      },
    )
    if (!res.ok) {
      console.error('[Evolution media] getBase64 falló:', res.status)
      return null
    }
    const data = await res.json().catch(() => ({}))
    const base64: string | undefined = data?.base64 || data?.media || data?.buffer
    const mime: string = data?.mimetype || data?.mimeType || 'application/octet-stream'
    if (!base64) return null
    const buffer = Buffer.from(base64, 'base64')
    return await storeMediaBuffer({ buffer, contentType: mime, userId, kind })
  } catch (e) {
    console.error('[Evolution media] error:', e)
    return null
  }
}

/** Extrae { type, text, caption } del objeto message de Baileys. */
function extractContent(msg: any): { type: string; text: string } {
  if (!msg) return { type: 'text', text: '' }
  if (typeof msg.conversation === 'string') return { type: 'text', text: msg.conversation }
  if (msg.extendedTextMessage?.text) return { type: 'text', text: msg.extendedTextMessage.text }
  if (msg.imageMessage) return { type: 'image', text: msg.imageMessage.caption || '' }
  if (msg.videoMessage) return { type: 'video', text: msg.videoMessage.caption || '' }
  if (msg.audioMessage) return { type: 'audio', text: '' }
  if (msg.documentMessage) return { type: 'document', text: msg.documentMessage.caption || '' }
  if (msg.locationMessage) return { type: 'location', text: '' }
  if (msg.stickerMessage) return { type: 'sticker', text: '' }
  return { type: 'text', text: '' }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const event: string = body?.event || ''
    const instance: string = body?.instance || ''
    const data = body?.data

    if (!instance) return NextResponse.json({ ok: true })

    const admin = createAdminClient()

    if (event === 'connection.update' || event === 'qrcode.updated') {
      // Estado de conexión / QR: se guarda en la config de la integración para
      // que la UI lo muestre sin pegarle a Evolution directamente.
      const { data: integration } = await admin
        .from('integrations')
        .select('id, config')
        .eq('platform', 'whatsapp')
        .eq('config->>phone_number_id', instance)
        .maybeSingle()

      if (integration) {
        const patch: Record<string, any> = { ...integration.config }
        if (event === 'connection.update') {
          patch.evolution_state = data?.state || data?.connection || 'unknown'
          if (patch.evolution_state === 'open') patch.evolution_qr = null
        } else {
          patch.evolution_qr = data?.qrcode?.base64 || data?.base64 || null
        }
        await admin
          .from('integrations')
          .update({
            config: patch,
            ...(patch.evolution_state === 'open'
              ? { is_verified: true, webhook_verified_at: new Date().toISOString() }
              : {}),
          })
          .eq('id', integration.id)
      }
      return NextResponse.json({ ok: true })
    }

    if (event !== 'messages.upsert') {
      return NextResponse.json({ ok: true })
    }

    // messages.upsert puede venir como objeto único o array
    const items: any[] = Array.isArray(data) ? data : [data]
    const metaMessages: any[] = []
    const metaContacts: any[] = []
    const echoes: any[] = [] // fromMe: salientes propios (celular o app)

    // user_id de la integración (para el path del bucket al guardar media)
    const admin0 = createAdminClient()
    const { data: integration0 } = await admin0
      .from('integrations')
      .select('user_id')
      .eq('platform', 'whatsapp')
      .eq('config->>phone_number_id', instance)
      .maybeSingle()
    const ownerUserId: string | null = integration0?.user_id || null

    for (const item of items) {
      const key = item?.key
      if (!key) continue
      // fromMe = lo mandé YO (desde el celular o desde la app). No es entrante:
      // se maneja aparte (handover), no se reinyecta al pipeline de la IA.
      if (key.fromMe) {
        echoes.push(item)
        continue
      }
      const phone = phoneFromJid(key.remoteJid)
      if (!phone) continue

      const { type, text } = extractContent(item.message)

      // Media entrante (imagen/audio/video/documento): la descargamos de Evolution
      // y la subimos al bucket. Pasamos SOLO la URL (stored_url) por el pipeline;
      // la IA la baja de ahí. Nunca el base64 (pesa MB → 413).
      let storedUrl: string | null = null
      if (ownerUserId && ['image', 'audio', 'video', 'document'].includes(type)) {
        storedUrl = await fetchAndStoreEvolutionMedia(instance, item, ownerUserId, type)
      }

      // Forma Meta: el pipeline actual entiende exactamente esto.
      const m: any = {
        id: key.id,
        from: phone,
        timestamp: String(item.messageTimestamp || Math.floor(Date.now() / 1000)),
        type,
      }
      if (type === 'text') m.text = { body: text }
      // `stored_url` lo consume el pipeline (gateado): persiste sin Graph y lo
      // pasa a la IA para que vea la imagen / transcriba el audio.
      if (type === 'image') m.image = { caption: text, stored_url: storedUrl }
      if (type === 'video') m.video = { caption: text, stored_url: storedUrl }
      if (type === 'audio') m.audio = { stored_url: storedUrl }
      if (type === 'document') m.document = { caption: text, stored_url: storedUrl }
      if (type === 'sticker') m.sticker = {}
      if (type === 'location' && item.message?.locationMessage) {
        m.location = {
          latitude: item.message.locationMessage.degreesLatitude,
          longitude: item.message.locationMessage.degreesLongitude,
          name: item.message.locationMessage.name,
          address: item.message.locationMessage.address,
        }
      }

      metaMessages.push(m)
      metaContacts.push({ profile: { name: item.pushName || phone }, wa_id: phone })
    }

    // Handover: mensajes que mandé yo (celular o app). Se guardan como salientes
    // y, si vinieron del celular, pausan la IA de esa conversación.
    if (echoes.length > 0) {
      await handlePhoneEchoes(instance, echoes).catch((e) =>
        console.error('[Evolution] error procesando echoes:', e),
      )
    }

    if (metaMessages.length === 0) return NextResponse.json({ ok: true })

    const metaBody = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: instance,
          changes: [
            {
              field: 'messages',
              value: {
                messaging_product: 'whatsapp',
                metadata: { phone_number_id: instance, display_phone_number: instance },
                contacts: metaContacts,
                messages: metaMessages,
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
      console.error('[Evolution] reinyección falló:', res.status)
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[Evolution webhook] error:', error)
    // 200 igual: Evolution reintenta agresivo ante 5xx y no queremos tormenta
    return NextResponse.json({ ok: true })
  }
}

/**
 * Procesa los mensajes fromMe (echoes) de una instancia Evolution.
 *
 * Tres orígenes posibles, y hay que distinguirlos:
 *  - App (sendText de UcoBot): el mensaje YA está guardado con su whatsapp_message_id.
 *    Se deduplica por key.id y se descarta el echo (ni se guarda ni pausa).
 *  - Celular del dueño: es un handover humano real. Se guarda como saliente y se
 *    PAUSA la IA de esa conversación (el humano tomó la charla).
 *  - IA respondiendo por la app: cae en el primer caso (ya guardado) → no pausa.
 */
async function handlePhoneEchoes(instance: string, echoes: any[]) {
  const admin = createAdminClient()

  const { data: integration } = await admin
    .from('integrations')
    .select('user_id, config')
    .eq('platform', 'whatsapp')
    .eq('config->>phone_number_id', instance)
    .maybeSingle()
  if (!integration) return

  const { data: bot } = await admin
    .from('bots')
    .select('id, feature_config')
    .eq('user_id', integration.user_id)
    .contains('platforms', ['whatsapp'])
    .eq('is_active', true)
    .limit(1)
    .maybeSingle()
  if (!bot) return

  for (const item of echoes) {
    try {
      const key = item?.key
      const clientPhone = phoneFromJid(key?.remoteJid) // el destinatario = el cliente
      if (!clientPhone) continue

      // Dedup 1 (rápido): mismo whatsapp_message_id ya guardado = lo mandó la app
      // manualmente. No duplicar ni pausar.
      const { data: dup } = await admin
        .from('messages')
        .select('id')
        .eq('metadata->>whatsapp_message_id', key.id)
        .maybeSingle()
      if (dup) continue

      const { type, text } = extractContent(item.message)

      // Conversación por bot + teléfono del cliente (variantes 549)
      const variants = [clientPhone]
      if (clientPhone.startsWith('549')) variants.push(clientPhone.substring(3), '54' + clientPhone.substring(3))
      const { data: conversation } = await admin
        .from('conversations')
        .select('id')
        .eq('bot_id', bot.id)
        .in('client_phone', variants)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      // Dedup 2 (por contenido): la respuesta de la IA y los envíos de la app se
      // guardan SIN whatsapp_message_id, así que el dedup por id no los agarra.
      // Si hay un saliente reciente (<2 min) con el mismo texto en esta charla,
      // este echo es de UcoBot, no del celular: no duplicar ni pausar.
      if (conversation?.id && text) {
        const since = new Date(Date.now() - 2 * 60 * 1000).toISOString()
        const { data: recent } = await admin
          .from('messages')
          .select('id')
          .eq('conversation_id', conversation.id)
          .eq('sender_type', 'bot')
          .eq('content', text)
          .gte('created_at', since)
          .limit(1)
          .maybeSingle()
        if (recent) continue
      }

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
      if (!conversationId) continue

      // Media saliente (imagen/audio/etc. que mandé desde el celular): la
      // descargamos y subimos al bucket para que se VEA en /chat, igual que la
      // entrante. Si no, quedaría como [imagen]/[audio].
      let storedUrl: string | null = null
      if (['image', 'audio', 'video', 'document'].includes(type)) {
        storedUrl = await fetchAndStoreEvolutionMedia(instance, item, integration.user_id, type)
      }

      // Guardar como saliente (para que se vea en /chat)
      const internalType = ['image', 'audio', 'document', 'video', 'location'].includes(type) ? type : 'text'
      await admin.from('messages').insert({
        conversation_id: conversationId,
        content: text || `[${type}]`,
        sender_type: 'bot',
        message_type: internalType,
        metadata: {
          whatsapp_message_id: key.id,
          sent_by: 'phone', // lo mandó el dueño desde su celular
          is_handover: true,
          original_type: type,
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
            reactivateHours > 0 ? new Date(Date.now() + reactivateHours * 3600 * 1000).toISOString() : null,
          last_message_at: new Date().toISOString(),
        })
        .eq('id', conversationId)
    } catch (e) {
      console.error('[Evolution echo] error en item:', e)
    }
  }
}
