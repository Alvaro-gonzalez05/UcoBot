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
 *
 * OJO CON EL PROGRESO (28/07/2026): antes se calculaba sobre los chunks recibidos
 * en los últimos 60 minutos. Cuando la importación es grande y dura horas, esa
 * ventana iba dejando afuera los chunks YA PROCESADOS mientras seguían entrando
 * nuevos, así que la barra llegaba a 100% y volvía a 0. Ahora se cuenta sobre TODA
 * la cola de la cuenta, con `count` exacto en vez de traerse las filas.
 */

// Cuánto tiempo se sigue avisando que terminó (para la animación de cierre).
const JUST_FINISHED_MINUTES = 3

/** Chunks tomados por una corrida del cron: siguen siendo trabajo pendiente. */
const IN_FLIGHT = ['pending', 'processing']

export async function GET(_request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    // Empleados miran la importación de la cuenta del dueño, no la propia.
    const ctx = await getAccountContext()
    const accountId = ctx?.ownerId || user.id

    const admin = createAdminClient()
    const base = () =>
      admin
        .from('whatsapp_sync_chunks')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', accountId)

    const [total, remaining, done, chats, contacts] = await Promise.all([
      base(),
      base().in('status', IN_FLIGHT),
      base().eq('status', 'done'),
      base().eq('event_type', 'history'),
      base().eq('event_type', 'app_state_sync'),
    ])

    const totalCount = total.count ?? 0
    if (totalCount === 0) {
      return NextResponse.json({ active: false, justFinished: false })
    }

    const remainingCount = remaining.count ?? 0
    const doneCount = done.count ?? 0
    const active = remainingCount > 0

    // Terminó recién: seguimos avisando un ratito para la animación de cierre.
    let justFinished = false
    if (!active) {
      const { data: last } = await admin
        .from('whatsapp_sync_chunks')
        .select('processed_at')
        .eq('user_id', accountId)
        .not('processed_at', 'is', null)
        .order('processed_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (last?.processed_at) {
        const ageMin = (Date.now() - new Date(last.processed_at).getTime()) / 60000
        justFinished = ageMin <= JUST_FINISHED_MINUTES
      }
    }

    const progress = Math.min(100, Math.round((doneCount / totalCount) * 100))

    return NextResponse.json({
      active,
      justFinished,
      // Nunca 100% mientras quede algo: la barra llena con trabajo pendiente
      // es justamente lo que hacía que pareciera que se reiniciaba.
      progress: active ? Math.min(progress, 99) : 100,
      done: doneCount,
      total: totalCount,
      remaining: remainingCount,
      chats: chats.count ?? 0,
      contacts: contacts.count ?? 0,
    })
  } catch (error) {
    console.error('[YCloud sync status] error:', error)
    // Nunca romper el chat por esto: si falla, simplemente no se muestra la barra.
    return NextResponse.json({ active: false, justFinished: false })
  }
}
