import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { parseSignedRequest } from '@/lib/meta/signed-request'

/**
 * Deauthorize Callback de Meta.
 *
 * Meta llama acá cuando un usuario revoca el acceso a UcoBot desde su
 * configuración de Facebook. Recibe un `signed_request` con el user_id
 * (que es el ID de Facebook del usuario, no el de UcoBot).
 *
 * Acción: marcar las integraciones asociadas como inactivas. No las borramos
 * para conservar el historial; la eliminación total va por /data-deletion.
 *
 * Meta espera un 200 OK.
 */
export async function POST(request: NextRequest) {
  try {
    const appSecret = process.env.META_APP_SECRET
    if (!appSecret) {
      console.error('META_APP_SECRET not configured')
      return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
    }

    const formData = await request.formData()
    const signedRequest = formData.get('signed_request') as string

    if (!signedRequest) {
      return NextResponse.json({ error: 'Missing signed_request' }, { status: 400 })
    }

    const payload = parseSignedRequest(signedRequest, appSecret)
    if (!payload || !payload.user_id) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
    }

    const fbUserId = payload.user_id

    const admin = createAdminClient()

    // Desactivamos cualquier integración cuyo config tenga este Facebook user_id
    // asociado. El campo no está estandarizado entre los flujos por lo que
    // miramos varios paths conocidos.
    await admin
      .from('integrations')
      .update({ is_active: false })
      .or(
        `config->>fb_user_id.eq.${fbUserId},config->>business_id.eq.${fbUserId},config->>page_id.eq.${fbUserId}`
      )

    console.log('✅ Deauthorize processed for FB user:', fbUserId)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in deauthorize callback:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
