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
 *
 * POR QUÉ ESTÁ ESCRITO EN LOTES (28/07/2026): YCloud manda UN evento por mensaje,
 * y un alta real trajo ~8.400 de golpe. La versión anterior procesaba un chunk por
 * vez con ~5 consultas cada uno — incluida una lectura de hasta 5.000 mensajes solo
 * para deduplicar UNA fila — con un techo de 10 por minuto. Eso daba ~14 horas de
 * cola, creciendo más rápido de lo que se vaciaba. Ahora una corrida reclama cientos
 * de chunks, los agrupa por conversación y hace un puñado de consultas para todos.
 */

export const maxDuration = 300

/** Chunks que reclama cada corrida. Con el agrupado, esto son ~10 consultas. */
const BATCH_SIZE = 800

/** Un reclamo más viejo que esto quedó huérfano (la corrida se murió a mitad). */
const CLAIM_TIMEOUT_MINUTES = 10

/** Variantes de un teléfono argentino para buscar conversaciones existentes. */
function phoneVariants(phone: string): string[] {
  const d = digitsOnly(phone)
  const out = [d]
  if (d.startsWith('549')) out.push(d.substring(3), '54' + d.substring(3))
  else if (d.startsWith('54') && !d.startsWith('549')) out.push('549' + d.substring(2))
  return Array.from(new Set(out.filter(Boolean)))
}

/**
 * Clave de agrupado de un teléfono: la MISMA para todas sus variantes AR, así
 * 549261… y 54261… caen en la misma conversación en vez de duplicarla.
 */
function phoneKey(phone: string): string {
  const d = digitsOnly(phone)
  return d.startsWith('549') ? '54' + d.substring(3) : d
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

/** Un mensaje del historial ya extraído de su chunk. */
interface PendingMessage {
  clientPhone: string
  wamid: string | null
  outgoing: boolean
  type: string
  text: string
  ts: string
  raw: any
}

/**
 * Extrae el mensaje de un evento de historial.
 *
 * FORMA REAL: YCloud manda UN mensaje por evento, con la misma estructura que un
 * mensaje normal — `whatsappInboundMessage` si lo mandó el cliente,
 * `whatsappMessage` si lo mandó el negocio desde el celular. La doc de Meta
 * describe tandas con `threads[]`, pero eso es el webhook crudo, no el de YCloud.
 */
function extractHistoryMessage(chunk: any): PendingMessage | null {
  const body = chunk.payload
  const inbound = body?.whatsappInboundMessage
  const outbound = body?.whatsappMessage
  const m = inbound || outbound
  if (!m) return null

  // El cliente es el otro extremo, en ambos sentidos.
  const clientPhone = digitsOnly((inbound ? m.from : m.to) || '')
  if (!clientPhone || clientPhone === chunk.phone_number_id) return null

  const type = m.type || 'text'

  // `sendTime` viene ISO ("2026-05-16T16:16:41.000Z"); el `timestamp` en segundos
  // es del formato crudo de Meta. Se aceptan los dos.
  const ts = m.sendTime
    ? new Date(m.sendTime).toISOString()
    : m.timestamp
      ? new Date(Number(m.timestamp) * 1000).toISOString()
      : new Date().toISOString()

  return {
    clientPhone,
    wamid: m.wamid || m.id || null,
    outgoing: !inbound,
    type,
    text: historyText(m),
    ts,
    raw: m,
  }
}

/**
 * Importa TODOS los mensajes de historial del lote de una cuenta.
 *
 * Todo el trabajo se hace agrupado: una consulta para las conversaciones, una para
 * los wamids ya conocidos, un insert masivo y un update por conversación tocada.
 */
async function processHistoryBatch(admin: any, userId: string, chunks: any[]) {
  // Un solo bot por cuenta (mismo criterio que el resto del pipeline).
  const { data: bot } = await admin
    .from('bots')
    .select('id')
    .eq('user_id', userId)
    .contains('platforms', ['whatsapp'])
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!bot) throw new Error('La cuenta no tiene un bot de WhatsApp activo')

  // Agrupar los mensajes del lote por cliente.
  const byClient = new Map<string, PendingMessage[]>()
  for (const chunk of chunks) {
    const msg = extractHistoryMessage(chunk)
    if (!msg) continue
    const key = phoneKey(msg.clientPhone)
    const list = byClient.get(key)
    if (list) list.push(msg)
    else byClient.set(key, [msg])
  }
  if (byClient.size === 0) return

  // Conversaciones existentes de todos los clientes del lote, de una.
  const allVariants = [...byClient.keys()].flatMap((k) => phoneVariants(k))
  const { data: existing } = await admin
    .from('conversations')
    .select('id, client_phone, last_message_at')
    .eq('bot_id', bot.id)
    .in('client_phone', allVariants)
    .order('created_at', { ascending: false })

  const convByKey = new Map<string, { id: string; last_message_at: string | null }>()
  for (const c of existing || []) {
    const key = phoneKey(c.client_phone || '')
    // El order por created_at DESC deja primero la más nueva; nos quedamos con esa.
    if (!convByKey.has(key)) convByKey.set(key, { id: c.id, last_message_at: c.last_message_at })
  }

  // Crear de una sola vez las conversaciones que faltan.
  const missing = [...byClient.keys()].filter((k) => !convByKey.has(k))
  if (missing.length > 0) {
    // Nombre de la agenda, si el contacto ya se importó. Sin esto la charla queda
    // titulada con el número pelado aunque el contacto esté agendado, porque los
    // eventos de contactos y los de historial llegan en cualquier orden.
    const { data: known } = await admin
      .from('clients')
      .select('name, phone')
      .eq('user_id', userId)
      .in('phone', missing.flatMap((k) => phoneVariants(k)))

    const nameByKey = new Map<string, string>()
    for (const c of known || []) {
      // Un cliente cuyo "nombre" es el propio teléfono no aporta nada.
      if (c.name && digitsOnly(c.name) !== c.name) nameByKey.set(phoneKey(c.phone || ''), c.name)
    }

    const { data: created } = await admin
      .from('conversations')
      .insert(
        missing.map((key) => {
          // Se guarda el teléfono tal como vino en el primer mensaje, no la clave
          // normalizada: es el formato con el que WhatsApp lo va a mandar en vivo.
          const phone = byClient.get(key)![0].clientPhone
          return {
            user_id: userId,
            bot_id: bot.id,
            client_phone: phone,
            client_name: nameByKey.get(key) || phone,
            platform: 'whatsapp',
            // ACTIVA a propósito: es una charla vieja, pero si el cliente escribe
            // de nuevo el bot tiene que poder responder con normalidad.
            status: 'active',
            needs_attention: false,
            context: { imported: true, imported_at: new Date().toISOString() },
          }
        }),
      )
      .select('id, client_phone')

    for (const c of created || []) {
      convByKey.set(phoneKey(c.client_phone || ''), { id: c.id, last_message_at: null })
    }
  }

  const conversationIds = [...convByKey.values()].map((c) => c.id)

  // Dedup contra lo ya guardado (en vivo o en un lote anterior): UNA consulta para
  // todas las conversaciones tocadas, en vez de una por mensaje.
  const seen = new Set<string>()
  if (conversationIds.length > 0) {
    const { data: known } = await admin
      .from('messages')
      .select('metadata')
      .in('conversation_id', conversationIds)
      .not('metadata->>whatsapp_message_id', 'is', null)
      .limit(20000)

    for (const r of known || []) {
      const id = (r.metadata as any)?.whatsapp_message_id
      if (id) seen.add(id)
    }
  }

  const rows: any[] = []
  // Última fecha real por conversación, para reordenar la bandeja.
  const newestByConv = new Map<string, string>()

  for (const [key, messages] of byClient) {
    const conv = convByKey.get(key)
    if (!conv) continue

    for (const m of messages) {
      // El propio lote puede traer el mismo wamid repetido (reintentos de YCloud).
      if (m.wamid) {
        if (seen.has(m.wamid)) continue
        seen.add(m.wamid)
      }

      const internalType = STORABLE_TYPES.includes(m.type) ? m.type : 'text'
      const prev = newestByConv.get(conv.id)
      if (!prev || m.ts > prev) newestByConv.set(conv.id, m.ts)

      rows.push({
        conversation_id: conv.id,
        content: m.text,
        sender_type: m.outgoing ? 'bot' : 'client',
        message_type: internalType,
        created_at: m.ts, // fecha REAL del mensaje, no la de la importación
        // LEÍDO: es historial que el dueño ya vio en su celular. Sin esto cada
        // charla importada aparecía con decenas de "no leídos" y el borde azul de
        // mensaje nuevo, y volvían a aparecer cada vez que se recalculaba.
        is_read: true,
        metadata: {
          whatsapp_message_id: m.wamid,
          original_type: m.type,
          imported: true,
          ...(m.outgoing ? { sent_by: 'phone' } : {}),
          // La media de más de 14 días no la comparte Meta: queda solo el texto.
          ...(m.raw[m.type] && typeof m.raw[m.type] === 'object'
            ? { [m.type]: m.raw[m.type] }
            : {}),
        },
      })
    }
  }

  // Inserts de a 500: es el tamaño que PostgREST maneja cómodo en un request.
  //
  // upsert + ignoreDuplicates apoyado en messages_conversation_wa_message_id_key:
  // el Set de arriba filtra lo que YA estaba, pero no alcanza. YCloud REENVÍA el
  // historial (durante la carga inicial la base se saturó y reintentó las tandas
  // fallidas media hora después, con los mismos wamids), y encima dos corridas del
  // cron procesan lotes en paralelo sin verse entre sí. La única garantía real es
  // la de la base: acá los repetidos se descartan sin romper el lote.
  for (let i = 0; i < rows.length; i += 500) {
    const slice = rows.slice(i, i + 500)
    const { error } = await admin
      .from('messages')
      .upsert(slice, { onConflict: 'conversation_id,wa_message_id', ignoreDuplicates: true })
    if (error) throw new Error(`insert de mensajes: ${error.message}`)
  }

  // La conversación se ordena por su última actividad REAL, así las charlas viejas
  // caen al fondo en vez de aparecer como recientes.
  for (const [convId, newest] of newestByConv) {
    const prev = [...convByKey.values()].find((c) => c.id === convId)?.last_message_at
    if (!prev || newest > prev) {
      await admin.from('conversations').update({ last_message_at: newest }).eq('id', convId)
    }
  }
}

/**
 * Importa los contactos de la agenda del celular.
 *
 * Forma REAL del payload (verificada contra los datos que mandó YCloud):
 *   whatsappSmbAppStateSync.stateSync[] = {
 *     action: 'add' | 'remove',
 *     contact: { userId, fullName, phoneNumber },
 *     timestamp
 *   }
 * La doc hablaba de un array `contacts` con los campos planos, así que se aceptan
 * las dos formas por si cambia.
 */
async function processContactsBatch(admin: any, userId: string, chunks: any[]) {
  const wanted = new Map<string, string>() // phoneKey → nombre

  for (const chunk of chunks) {
    const data = chunk.payload?.whatsappSmbAppStateSync ?? chunk.payload?.appStateSync ?? {}
    const entries: any[] = data.stateSync || data.contacts || []

    for (const entry of entries) {
      const c = entry.contact ?? entry
      const phone = digitsOnly(c.phoneNumber || c.phone_number || '')
      if (!phone) continue

      // 'remove' = lo borró de la agenda del celular. No borramos el cliente del CRM
      // (puede tener pedidos e historial): solo ignoramos la baja.
      const action = (entry.action || c.action || 'add').toLowerCase()
      if (action === 'remove') continue

      wanted.set(phoneKey(phone), c.fullName || c.full_name || c.firstName || c.first_name || phone)
    }
  }
  if (wanted.size === 0) return

  const { data: existing } = await admin
    .from('clients')
    .select('id, name, phone')
    .eq('user_id', userId)
    .in('phone', [...wanted.keys()].flatMap((k) => phoneVariants(k)))

  const existingByKey = new Map<string, { id: string; name: string | null }>()
  for (const c of existing || []) {
    existingByKey.set(phoneKey(c.phone || ''), { id: c.id, name: c.name })
  }

  const toInsert: any[] = []
  for (const [key, name] of wanted) {
    const found = existingByKey.get(key)
    if (!found) {
      toInsert.push({ user_id: userId, name, phone: key })
      continue
    }
    // Solo completamos el nombre si el que tenemos es el teléfono pelado.
    if (name && found.name && digitsOnly(found.name) === found.name) {
      await admin.from('clients').update({ name }).eq('id', found.id)
    }
  }

  for (let i = 0; i < toInsert.length; i += 500) {
    await admin.from('clients').insert(toInsert.slice(i, i + 500))
  }

  // Los contactos y el historial llegan en cualquier orden: si la charla se creó
  // antes de conocerse el nombre, quedó titulada con el número. Se completa en una
  // sola sentencia (ver apply_contact_names_to_conversations); un update por
  // contacto sobre una agenda de miles sería el mismo N+1 de antes.
  const { error } = await admin.rpc('apply_contact_names_to_conversations', {
    p_user_id: userId,
    p_contacts: [...wanted].map(([phone, name]) => ({ phone, name })),
  })
  if (error) console.error('[YCloud sync] no se pudieron aplicar los nombres:', error.message)
}

export async function POST(_request: NextRequest) {
  try {
    const admin = createAdminClient()

    // Reclamos huérfanos: una corrida anterior murió a mitad y dejó chunks tomados.
    const staleBefore = new Date(Date.now() - CLAIM_TIMEOUT_MINUTES * 60 * 1000).toISOString()
    await admin
      .from('whatsapp_sync_chunks')
      .update({ status: 'pending', claimed_at: null })
      .eq('status', 'processing')
      .lt('claimed_at', staleBefore)

    // RECLAMO atómico (FOR UPDATE SKIP LOCKED del lado de Postgres): dos corridas
    // superpuestas del cron nunca agarran los mismos chunks. El timestamp hace de
    // token del lote — al cerrar se filtra por él y no hace falta enumerar 800 ids,
    // que armarían una URL que PostgREST rechaza.
    const claimedAt = new Date().toISOString()
    const { data: chunks, error: claimError } = await admin.rpc('claim_whatsapp_sync_chunks', {
      p_limit: BATCH_SIZE,
      p_claimed_at: claimedAt,
    })

    if (claimError) throw new Error(`no se pudo reclamar el lote: ${claimError.message}`)
    // PURGA: una vez volcado a `messages`, el payload crudo no sirve para nada y
    // se acumula rápido (llegó a 28.365 filas y 32 MB con una sola importación).
    // Se borran los ya procesados de más de 6 h; el margen deja tiempo para
    // diagnosticar si algo salió mal recién.
    await admin
      .from('whatsapp_sync_chunks')
      .delete()
      .eq('status', 'done')
      .lt('processed_at', new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString())

    if (!chunks || chunks.length === 0) {
      return NextResponse.json({ ok: true, processed: 0 })
    }

    // Agrupar por cuenta y tipo: cada grupo se resuelve con un puñado de consultas.
    const groups = new Map<string, any[]>()
    for (const chunk of chunks) {
      const key = `${chunk.user_id}|${chunk.event_type}`
      const list = groups.get(key)
      if (list) list.push(chunk)
      else groups.set(key, [chunk])
    }

    let done = 0
    let failed = 0

    for (const [key, groupChunks] of groups) {
      const [userId, eventType] = key.split('|')

      // El lote se cierra por (cuenta, tipo, token del reclamo). Nunca por lista
      // de ids: con cientos de UUIDs la URL de PostgREST se pasa de largo.
      try {
        if (eventType === 'history') await processHistoryBatch(admin, userId, groupChunks)
        else await processContactsBatch(admin, userId, groupChunks)

        await admin
          .from('whatsapp_sync_chunks')
          .update({ status: 'done', processed_at: new Date().toISOString(), claimed_at: null })
          .eq('claimed_at', claimedAt)
          .eq('user_id', userId)
          .eq('event_type', eventType)
        done += groupChunks.length
      } catch (e: any) {
        console.error('[YCloud sync] error procesando lote', key, e)
        // El lote entero vuelve a la cola con un intento más. A los 5 se abandona
        // y queda en 'error' para revisar a mano.
        const attempts = (groupChunks[0]?.attempts || 0) + 1
        await admin
          .from('whatsapp_sync_chunks')
          .update({
            attempts,
            last_error: String(e?.message || e).slice(0, 500),
            status: attempts >= 5 ? 'error' : 'pending',
            claimed_at: null,
          })
          .eq('claimed_at', claimedAt)
          .eq('user_id', userId)
          .eq('event_type', eventType)
        failed += groupChunks.length
      }
    }

    return NextResponse.json({ ok: true, processed: done, failed })
  } catch (error: any) {
    console.error('[YCloud sync] error general:', error)
    return NextResponse.json({ error: error?.message || 'Error' }, { status: 500 })
  }
}
