import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { digitsOnly } from '@/lib/whatsapp/ycloud'

/**
 * Procesa los chunks de la carga inicial de coexistencia que estacionó el webhook.
 *
 * Lo invoca pg_cron cada minuto (ver scripts/118_cron_whatsapp_sync.sql).
 *
 * Reglas del import, acordadas con el negocio:
 *  - La IA NUNCA se dispara con esto: son mensajes viejos. Solo se guardan.
 *  - Las conversaciones importadas quedan ACTIVAS (si no, el bot no contestaría
 *    cuando ese cliente vuelva a escribir) pero sin needs_attention: son charlas
 *    viejas ya vistas, no consultas pendientes.
 *  - `last_message_at` toma la fecha REAL del último mensaje importado, así quedan
 *    ordenadas como lo que son: charlas del pasado, al fondo de la lista.
 *  - Los contactos se importan TODOS a `clients`.
 */

export const maxDuration = 300

/** Variantes de un teléfono argentino para buscar conversaciones existentes. */
function phoneVariants(phone: string): string[] {
  const d = digitsOnly(phone)
  const out = [d]
  if (d.startsWith('549')) out.push(d.substring(3), '54' + d.substring(3))
  else if (d.startsWith('54') && !d.startsWith('549')) out.push('549' + d.substring(2))
  return Array.from(new Set(out.filter(Boolean)))
}

/** Texto legible de un mensaje del historial, según su tipo. */
function historyText(m: any): string {
  const t = m?.type || 'text'
  if (t === 'text') return m.text?.body || ''
  const payload = m?.[t] || {}
  if (payload.caption) return payload.caption
  if (t === 'location') {
    const place = [payload.name, payload.address].filter(Boolean).join(' - ')
    return place ? `📍 ${place}` : '📍 Ubicación'
  }
  return `[${t}]`
}

const STORABLE_TYPES = ['image', 'audio', 'document', 'video', 'location']

async function processHistoryChunk(admin: any, chunk: any) {
  const body = chunk.payload
  const businessPhone = chunk.phone_number_id

  // FORMA REAL: YCloud manda UN mensaje por evento, con la misma estructura que
  // un mensaje normal — `whatsappInboundMessage` si lo mandó el cliente,
  // `whatsappMessage` si lo mandó el negocio desde el celular. La doc de Meta
  // describe tandas con `threads[]`, pero eso es el webhook crudo, no el de YCloud.
  // Se arma un "hilo" de un solo mensaje para reusar la misma lógica de abajo.
  const inbound = body?.whatsappInboundMessage
  const outbound = body?.whatsappMessage
  const single = inbound || outbound
  if (!single) throw new Error('Evento de historial sin mensaje reconocible')

  const threads: any[] = [
    {
      id: inbound ? single.from : single.to, // el cliente, en ambos sentidos
      messages: [{ ...single, __outgoing: !inbound }],
    },
  ]

  // Un solo bot por cuenta (mismo criterio que el resto del pipeline).
  const { data: bot } = await admin
    .from('bots')
    .select('id')
    .eq('user_id', chunk.user_id)
    .contains('platforms', ['whatsapp'])
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!bot) throw new Error('La cuenta no tiene un bot de WhatsApp activo')

  for (const thread of threads) {
    const clientPhone = digitsOnly(thread.id || thread.phoneNumber || thread.from || '')
    if (!clientPhone || clientPhone === businessPhone) continue

    const messages: any[] = thread.messages || thread.chat || []
    if (messages.length === 0) continue

    // Conversación existente (cualquier variante del 9) o nueva.
    const { data: existing } = await admin
      .from('conversations')
      .select('id, context, last_message_at')
      .eq('bot_id', bot.id)
      .in('client_phone', phoneVariants(clientPhone))
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    let conversationId: string | undefined = existing?.id

    if (!conversationId) {
      const { data: created } = await admin
        .from('conversations')
        .insert({
          user_id: chunk.user_id,
          bot_id: bot.id,
          client_phone: clientPhone,
          client_name: clientPhone,
          platform: 'whatsapp',
          // ACTIVA a propósito: es una charla vieja, pero si el cliente escribe
          // de nuevo el bot tiene que poder responder con normalidad.
          status: 'active',
          needs_attention: false,
          context: { imported: true, imported_at: new Date().toISOString() },
        })
        .select('id')
        .single()
      conversationId = created?.id
    }
    if (!conversationId) continue

    // Dedup contra lo que ya haya entrado en vivo o en un chunk anterior.
    // Se traen los ids ya guardados de la conversación y se filtra en memoria:
    // filtrar por un path de JSON con una lista larga de wamids (que traen puntos
    // e "=") es frágil en PostgREST.
    const { data: known } = await admin
      .from('messages')
      .select('metadata')
      .eq('conversation_id', conversationId)
      .not('metadata->>whatsapp_message_id', 'is', null)
      .limit(5000)

    const seen = new Set(
      (known || []).map((r: any) => r.metadata?.whatsapp_message_id).filter(Boolean),
    )

    const rows: any[] = []
    let newest: string | null = null

    for (const m of messages) {
      const wamid = m.wamid || m.id
      if (wamid && seen.has(wamid)) continue

      const outgoing = m.__outgoing ?? digitsOnly(m.from || '') === businessPhone
      const type = m.type || 'text'
      const internalType = STORABLE_TYPES.includes(type) ? type : 'text'

      // `sendTime` viene ISO ("2026-05-16T16:16:41.000Z"); el `timestamp` en
      // segundos es del formato crudo de Meta. Se aceptan los dos.
      const ts = m.sendTime
        ? new Date(m.sendTime).toISOString()
        : m.timestamp
          ? new Date(Number(m.timestamp) * 1000).toISOString()
          : new Date().toISOString()
      if (!newest || ts > newest) newest = ts

      rows.push({
        conversation_id: conversationId,
        content: historyText(m),
        sender_type: outgoing ? 'bot' : 'client',
        message_type: internalType,
        created_at: ts, // fecha REAL del mensaje, no la de la importación
        metadata: {
          whatsapp_message_id: wamid,
          original_type: type,
          imported: true,
          ...(outgoing ? { sent_by: 'phone' } : {}),
          // La media de más de 14 días no la comparte Meta: queda solo el texto.
          ...(m[type] && typeof m[type] === 'object' ? { [type]: m[type] } : {}),
        },
      })
    }

    if (rows.length > 0) {
      await admin.from('messages').insert(rows)
    }

    // La conversación se ordena por su última actividad REAL, así las charlas
    // viejas caen al fondo en vez de aparecer como recientes.
    if (newest && (!existing?.last_message_at || newest > existing.last_message_at)) {
      await admin
        .from('conversations')
        .update({ last_message_at: newest })
        .eq('id', conversationId)
    }
  }
}

async function processContactsChunk(admin: any, chunk: any) {
  const body = chunk.payload
  const data = body?.whatsappSmbAppStateSync ?? body?.appStateSync ?? {}

  // Forma REAL del payload (verificada contra los datos que mandó YCloud):
  //   whatsappSmbAppStateSync.stateSync[] = {
  //     action: 'add' | 'remove',
  //     contact: { userId, fullName, phoneNumber },
  //     timestamp
  //   }
  // La doc hablaba de un array `contacts` con los campos planos, así que se
  // aceptan las dos formas por si cambia.
  const entries: any[] = data.stateSync || data.contacts || []

  for (const entry of entries) {
    const c = entry.contact ?? entry
    const phone = digitsOnly(c.phoneNumber || c.phone_number || '')
    if (!phone) continue

    // 'remove' = lo borró de la agenda del celular. No borramos el cliente del CRM
    // (puede tener pedidos e historial): solo ignoramos la baja.
    const action = (entry.action || c.action || 'add').toLowerCase()
    if (action === 'remove') continue

    const name =
      c.fullName || c.full_name || c.firstName || c.first_name || phone

    const { data: existing } = await admin
      .from('clients')
      .select('id, name')
      .eq('user_id', chunk.user_id)
      .in('phone', phoneVariants(phone))
      .limit(1)
      .maybeSingle()

    if (existing) {
      // Solo completamos el nombre si el que tenemos es el teléfono pelado.
      if (name && existing.name && digitsOnly(existing.name) === existing.name) {
        await admin.from('clients').update({ name }).eq('id', existing.id)
      }
      continue
    }

    await admin.from('clients').insert({
      user_id: chunk.user_id,
      name,
      phone,
    })
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = createAdminClient()

    // Tanda acotada: el cron corre seguido, no hace falta vaciar todo de una.
    const { data: chunks } = await admin
      .from('whatsapp_sync_chunks')
      .select('*')
      .eq('status', 'pending')
      .lt('attempts', 5)
      .order('received_at', { ascending: true })
      .order('chunk_order', { ascending: true, nullsFirst: true })
      .limit(10)

    if (!chunks || chunks.length === 0) {
      return NextResponse.json({ ok: true, processed: 0 })
    }

    let done = 0
    let failed = 0

    for (const chunk of chunks) {
      try {
        if (chunk.event_type === 'history') await processHistoryChunk(admin, chunk)
        else await processContactsChunk(admin, chunk)

        await admin
          .from('whatsapp_sync_chunks')
          .update({ status: 'done', processed_at: new Date().toISOString() })
          .eq('id', chunk.id)
        done++
      } catch (e: any) {
        console.error('[YCloud sync] error procesando chunk', chunk.id, e)
        const attempts = (chunk.attempts || 0) + 1
        await admin
          .from('whatsapp_sync_chunks')
          .update({
            attempts,
            last_error: String(e?.message || e).slice(0, 500),
            // A los 5 intentos se deja de reintentar y queda para revisar a mano.
            status: attempts >= 5 ? 'error' : 'pending',
          })
          .eq('id', chunk.id)
        failed++
      }
    }

    return NextResponse.json({ ok: true, processed: done, failed })
  } catch (error: any) {
    console.error('[YCloud sync] error general:', error)
    return NextResponse.json({ error: error?.message || 'Error' }, { status: 500 })
  }
}
