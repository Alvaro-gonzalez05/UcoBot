/**
 * Detección de conversaciones donde el bot NO resolvió.
 *
 * La gracia es que las señales YA existen en los datos, sin gastar un peso en IA:
 * el humano tuvo que tomar la charla desde el celular, la conversación quedó
 * marcada para atención, o el propio bot respondió que no sabía. La IA se usa
 * después y SOLO sobre esas charlas, para agruparlas por tema.
 */

/** Frases con las que el bot admite que no puede resolver. */
const FALLBACK_PATTERNS = [
  '%no entiendo%',
  '%no puedo ayudar%',
  '%no tengo esa información%',
  '%problema%interno%',
  '%no estoy seguro%',
]

export interface ProblemConversation {
  id: string
  clientName: string | null
  reason: 'humano_tomo_la_charla' | 'pidio_atencion' | 'bot_no_supo'
  createdAt: string
  transcript: string
}

/**
 * Charlas problemáticas de una cuenta en una ventana de tiempo.
 *
 * OJO con el historial importado: en coexistencia TODOS los mensajes salientes
 * figuran como enviados desde el celular, así que sin excluirlos cada charla vieja
 * parecería un handover. Con datos reales, filtrarlos bajó el conteo de 77 a 20.
 */
export async function findProblemConversations(
  supabase: any,
  userId: string,
  sinceDays = 7,
  limit = 40,
): Promise<ProblemConversation[]> {
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString()

  const { data: conversations } = await supabase
    .from('conversations')
    .select('id, client_name, needs_attention, created_at')
    .eq('user_id', userId)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(200)

  if (!conversations || conversations.length === 0) return []

  const ids = conversations.map((c: any) => c.id)

  // Todos los mensajes de esas charlas en una sola consulta: con 200 conversaciones
  // no vale la pena ir de a una.
  const { data: messages } = await supabase
    .from('messages')
    .select('conversation_id, sender_type, content, metadata, created_at')
    .in('conversation_id', ids)
    .order('created_at', { ascending: true })
    .limit(5000)

  const byConversation = new Map<string, any[]>()
  for (const m of messages || []) {
    const list = byConversation.get(m.conversation_id)
    if (list) list.push(m)
    else byConversation.set(m.conversation_id, [m])
  }

  const out: ProblemConversation[] = []

  for (const conv of conversations) {
    const msgs = byConversation.get(conv.id) || []
    // Solo lo que NO es historial importado: eso es de antes de que el bot existiera.
    const live = msgs.filter((m: any) => m.metadata?.imported !== true && m.metadata?.imported !== 'true')
    const botMsgs = live.filter((m: any) => m.sender_type === 'bot')

    // Si el bot nunca habló acá, no hay nada que evaluar.
    if (botMsgs.length === 0) continue

    let reason: ProblemConversation['reason'] | null = null

    if (botMsgs.some((m: any) => m.metadata?.sent_by === 'phone')) {
      reason = 'humano_tomo_la_charla'
    } else if (conv.needs_attention) {
      reason = 'pidio_atencion'
    } else if (
      botMsgs.some((m: any) => {
        const text = String(m.content || '').toLowerCase()
        return FALLBACK_PATTERNS.some((p) => text.includes(p.replace(/%/g, '')))
      })
    ) {
      reason = 'bot_no_supo'
    }

    if (!reason) continue

    // Transcripción acotada: las últimas 12 líneas alcanzan para entender qué pasó
    // y evita mandar conversaciones enteras de cientos de mensajes.
    const transcript = live
      .slice(-12)
      .map((m: any) => `${m.sender_type === 'client' ? 'Cliente' : 'Bot'}: ${String(m.content || '').slice(0, 300)}`)
      .join('\n')

    out.push({
      id: conv.id,
      clientName: conv.client_name,
      reason,
      createdAt: conv.created_at,
      transcript,
    })

    if (out.length >= limit) break
  }

  return out
}

export const REASON_LABELS: Record<ProblemConversation['reason'], string> = {
  humano_tomo_la_charla: 'Un humano tuvo que responder',
  pidio_atencion: 'Quedó marcada para atención',
  bot_no_supo: 'El bot dijo que no sabía',
}
