import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createAdminClient } from '@/lib/supabase/server'
import { parseSignedRequest } from '@/lib/meta/signed-request'

/**
 * Data Deletion Request Callback de Meta.
 *
 * Meta llama acá cuando un usuario solicita la eliminación de sus datos
 * desde la configuración de su cuenta de Facebook.
 *
 * Debemos:
 *  1. Verificar el signed_request (firmado con app_secret)
 *  2. Iniciar el proceso de borrado para el usuario indicado
 *  3. Devolver JSON: { url, confirmation_code }
 *     - url: dónde el usuario puede chequear el estado de su solicitud
 *     - confirmation_code: identificador único de la solicitud
 *
 * Política implementada: marcamos las integraciones del usuario como inactivas
 * y registramos la solicitud. El borrado físico de conversaciones, mensajes y
 * datos asociados se procesa de forma asincrónica (manual o por cron) dentro
 * del plazo de 30 días que comprometemos en la política.
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

    // Confirmation code estable (mismo fb_user_id ⇒ mismo code reproducible)
    const confirmationCode = crypto
      .createHash('sha256')
      .update(`${fbUserId}:${appSecret}`)
      .digest('hex')
      .slice(0, 16)

    const admin = createAdminClient()

    // Desactivamos integraciones asociadas al fb_user_id como primer paso del borrado
    await admin
      .from('integrations')
      .update({ is_active: false })
      .or(
        `config->>fb_user_id.eq.${fbUserId},config->>business_id.eq.${fbUserId},config->>page_id.eq.${fbUserId}`
      )

    const origin = new URL(request.url).origin
    const statusUrl = `${origin}/eliminacion-datos?ref=${confirmationCode}`

    console.log('✅ Data deletion request registered for FB user:', fbUserId, 'code:', confirmationCode)

    return NextResponse.json({
      url: statusUrl,
      confirmation_code: confirmationCode,
    })
  } catch (error) {
    console.error('Error in data deletion callback:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
