import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

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

    for (const item of items) {
      const key = item?.key
      if (!key || key.fromMe) continue // salientes propios: no reinyectar
      const phone = phoneFromJid(key.remoteJid)
      if (!phone) continue

      const { type, text } = extractContent(item.message)

      // Forma Meta: el pipeline actual entiende exactamente esto.
      const m: any = {
        id: key.id,
        from: phone,
        timestamp: String(item.messageTimestamp || Math.floor(Date.now() / 1000)),
        type,
      }
      if (type === 'text') m.text = { body: text }
      if (type === 'image') m.image = { caption: text } // sin media_id: el pipeline no persiste media de Evolution (limitación del piloto)
      if (type === 'video') m.video = { caption: text }
      if (type === 'audio') m.audio = {}
      if (type === 'document') m.document = { caption: text }
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
