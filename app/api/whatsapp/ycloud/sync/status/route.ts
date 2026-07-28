import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getAccountContext } from '@/lib/account'

/**
 * Estado de la importación inicial de coexistencia, para la barra de progreso
 * del chat.
 *
 * Devuelve `active` mientras queden tandas por procesar, y `justFinished` durante
 * un rato corto después de terminar, para que la UI pueda mostrar la animación de
 * "listo" antes de desaparecer.
 */

// Ventana en la que consideramos que una importación es "de ahora".
const RECENT_MINUTES = 60
// Cuánto tiempo se sigue avisando que terminó (para la animación de cierre).
const JUST_FINISHED_MINUTES = 3

export async function GET(_request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    // Empleados miran la importación de la cuenta del dueño, no la propia.
    const ctx = await getAccountContext()
    const accountId = ctx?.ownerId || user.id

    const admin = createAdminClient()
    const since = new Date(Date.now() - RECENT_MINUTES * 60 * 1000).toISOString()

    const { data: chunks } = await admin
      .from('whatsapp_sync_chunks')
      .select('event_type, status, progress, received_at, processed_at')
      .eq('user_id', accountId)
      .gte('received_at', since)
      .order('received_at', { ascending: false })
      .limit(200)

    if (!chunks || chunks.length === 0) {
      return NextResponse.json({ active: false, justFinished: false })
    }

    const pending = chunks.filter((c) => c.status === 'pending').length
    const history = chunks.filter((c) => c.event_type === 'history')
    const contacts = chunks.filter((c) => c.event_type === 'app_state_sync')

    // Meta manda el % en el metadata de cada tanda; nos quedamos con el más alto.
    const reported = history
      .map((c) => Number(c.progress))
      .filter((n) => Number.isFinite(n))
    const maxReported = reported.length > 0 ? Math.max(...reported) : 0

    // Si no vino progreso, lo estimamos por tandas procesadas.
    const processedRatio =
      chunks.length > 0 ? ((chunks.length - pending) / chunks.length) * 100 : 0

    const progress = Math.min(
      100,
      Math.round(maxReported > 0 ? maxReported : processedRatio),
    )

    const active = pending > 0

    // Terminó recién: seguimos avisando un ratito para la animación de cierre.
    let justFinished = false
    if (!active) {
      const lastProcessed = chunks
        .map((c) => c.processed_at)
        .filter(Boolean)
        .sort()
        .pop()
      if (lastProcessed) {
        const ageMin = (Date.now() - new Date(lastProcessed).getTime()) / 60000
        justFinished = ageMin <= JUST_FINISHED_MINUTES
      }
    }

    return NextResponse.json({
      active,
      justFinished,
      progress: active ? Math.min(progress, 99) : 100,
      chats: history.length,
      contacts: contacts.length,
    })
  } catch (error) {
    console.error('[YCloud sync status] error:', error)
    // Nunca romper el chat por esto: si falla, simplemente no se muestra la barra.
    return NextResponse.json({ active: false, justFinished: false })
  }
}
