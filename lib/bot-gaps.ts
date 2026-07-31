/**
 * Detección de conversaciones donde el bot NO resolvió.
 *
 * La gracia es que las señales YA existen en los datos, sin gastar un peso en IA:
 * el humano tuvo que tomar la charla desde el celular, la conversación quedó
 * marcada para atención, o el propio bot respondió que no sabía. La IA se usa
 * después y SOLO sobre esas charlas, para agruparlas por tema.
 *
 * LA DETECCIÓN VIVE EN SQL (ver find_problem_conversations). La primera versión la
 * hacía acá: traía todos los mensajes de las últimas 200 charlas y filtraba en
 * JavaScript. Con ~4.800 mensajes semanales eso choca contra el tope de filas de
 * PostgREST — llegaban muchas menos, las conversaciones quedaban sin mensajes y se
 * descartaban como si estuvieran bien. El análisis devolvía cero sugerencias sin
 * un solo error a la vista.
 */

export type ProblemReason = 'humano_tomo_la_charla' | 'pidio_atencion' | 'bot_no_supo'

export interface ProblemConversation {
  id: string
  clientName: string | null
  reason: ProblemReason
  createdAt: string
  transcript: string
}

export const REASON_LABELS: Record<ProblemReason, string> = {
  humano_tomo_la_charla: 'Un humano tuvo que responder',
  pidio_atencion: 'Quedó marcada para atención',
  bot_no_supo: 'El bot dijo que no sabía',
}

/** Charlas problemáticas de una cuenta, con su transcripción para el análisis. */
export async function findProblemConversations(
  supabase: any,
  userId: string,
  sinceDays = 7,
  limit = 40,
): Promise<ProblemConversation[]> {
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString()

  const { data: rows, error } = await supabase.rpc('find_problem_conversations', {
    p_user_id: userId,
    p_since: since,
    p_limit: limit,
  })

  if (error) {
    console.error('[bot-gaps] no se pudieron detectar las charlas:', error.message)
    return []
  }
  if (!rows || rows.length === 0) return []

  const out: ProblemConversation[] = []

  // La transcripción se pide POR CONVERSACIÓN. Son pocas (tope 40) y así cada una
  // trae sus últimos mensajes de verdad, sin competir por un límite compartido.
  for (const row of rows) {
    const { data: messages } = await supabase
      .from('messages')
      .select('sender_type, content, metadata')
      .eq('conversation_id', row.id)
      .order('created_at', { ascending: false })
      .limit(14)

    const live = (messages || []).filter(
      (m: any) => m.metadata?.imported !== true && m.metadata?.imported !== 'true',
    )
    if (live.length === 0) continue

    const transcript = live
      .reverse()
      .map(
        (m: any) =>
          `${m.sender_type === 'client' ? 'Cliente' : 'Bot'}: ${String(m.content || '').slice(0, 300)}`,
      )
      .join('\n')

    out.push({
      id: row.id,
      clientName: row.client_name,
      reason: row.reason as ProblemReason,
      createdAt: row.created_at,
      transcript,
    })
  }

  return out
}
