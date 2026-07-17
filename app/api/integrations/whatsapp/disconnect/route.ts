import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getEvolutionConfig } from '@/lib/whatsapp/provider'

/**
 * Desconecta la integración de WhatsApp de la cuenta, sea cual sea el método
 * (cloud / manual / evolution). Deja la fila en la tabla pero inactiva, así se
 * puede reconectar sin perder historial de conversaciones.
 *
 * Para Evolution además hace logout de la instancia en el servidor Evolution
 * (cierra la sesión de WhatsApp Web).
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const admin = createAdminClient()
    const { data: integration } = await admin
      .from('integrations')
      .select('id, config')
      .eq('user_id', user.id)
      .eq('platform', 'whatsapp')
      .maybeSingle()

    if (!integration) {
      return NextResponse.json({ error: 'No hay WhatsApp conectado' }, { status: 404 })
    }

    // Evolution: cerrar la sesión de WhatsApp Web en el servidor Evolution
    if (integration.config?.provider === 'evolution') {
      const evo = getEvolutionConfig()
      const instance = integration.config?.evolution_instance || integration.config?.phone_number_id
      if (evo && instance) {
        await fetch(`${evo.baseUrl}/instance/logout/${encodeURIComponent(instance)}`, {
          method: 'DELETE',
          headers: { apikey: evo.apiKey },
        }).catch((e) => console.error('[WA disconnect] evolution logout failed:', e))
      }
    }

    const { error } = await admin
      .from('integrations')
      .update({ is_active: false, is_verified: false })
      .eq('id', integration.id)

    if (error) {
      console.error('[WA disconnect] update error:', error)
      return NextResponse.json({ error: 'No se pudo desconectar' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[WA disconnect] error:', error)
    return NextResponse.json({ error: 'Error desconectando WhatsApp' }, { status: 500 })
  }
}
