import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Devuelve el estado de conexión de las integraciones del usuario logueado.
 * GET /api/integrations/status?platform=whatsapp|instagram
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const platform = new URL(request.url).searchParams.get('platform')

    let query = supabase
      .from('integrations')
      .select('platform, is_active, is_verified, config, webhook_verified_at')
      .eq('user_id', user.id)

    if (platform) {
      query = query.eq('platform', platform)
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching integrations:', error)
      return NextResponse.json({ error: 'No se pudieron obtener las integraciones' }, { status: 500 })
    }

    const result = (data || []).map(int => ({
      platform: int.platform,
      connected: int.is_active && int.is_verified,
      display_name: int.config?.display_phone_number || int.config?.page_name || int.config?.verified_name || null,
      connection_method: int.config?.connection_method || 'manual',
      connected_at: int.config?.connected_at || int.webhook_verified_at || null,
    }))

    return NextResponse.json({ integrations: result })
  } catch (error) {
    console.error('Error in /api/integrations/status:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
