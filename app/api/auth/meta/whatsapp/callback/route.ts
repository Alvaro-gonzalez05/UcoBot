import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getGraphVersion } from '@/lib/meta/credentials'

/**
 * WhatsApp Embedded Signup callback.
 *
 * Lo invoca el frontend de UcoBot después de que el cliente completa el flujo
 * de Embedded Signup de Meta en el popup. Meta devuelve por el evento JS:
 *   { phone_number_id, waba_id, business_id }
 * y opcionalmente un `code` de OAuth.
 *
 * Este endpoint:
 *  1. Verifica que el usuario esté autenticado en UcoBot
 *  2. (Opcional) intercambia el code por un token de usuario para confirmar
 *  3. Verifica que el System Token tenga acceso al WABA recién conectado
 *  4. Upserts la integración en la tabla `integrations`
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const body = await request.json()
    const { waba_id, phone_number_id, business_id, code } = body

    if (!waba_id || !phone_number_id) {
      return NextResponse.json(
        { error: 'Faltan campos requeridos: waba_id, phone_number_id' },
        { status: 400 }
      )
    }

    const systemToken = process.env.WHATSAPP_SYSTEM_TOKEN
    if (!systemToken) {
      return NextResponse.json(
        { error: 'Servidor sin WHATSAPP_SYSTEM_TOKEN configurado' },
        { status: 500 }
      )
    }

    // Validar que el System Token efectivamente puede ver el phone number
    // (esto confirma que el cliente nos dio acceso vía Embedded Signup)
    const graphVersion = getGraphVersion()
    const verifyRes = await fetch(
      `https://graph.facebook.com/${graphVersion}/${phone_number_id}?fields=verified_name,display_phone_number,quality_rating`,
      { headers: { Authorization: `Bearer ${systemToken}` } }
    )

    if (!verifyRes.ok) {
      const err = await verifyRes.json().catch(() => ({}))
      console.error('Failed to verify WABA access:', err)
      return NextResponse.json(
        {
          error: 'No se pudo verificar el acceso al número. Asegurate de completar el flujo de Embedded Signup.',
          details: err.error?.message
        },
        { status: 400 }
      )
    }

    const phoneData = await verifyRes.json()

    // Suscribir nuestra app a los webhooks del WABA del cliente.
    // Sin esto Meta no nos manda los mensajes entrantes de ese cliente.
    const subscribeRes = await fetch(
      `https://graph.facebook.com/${graphVersion}/${waba_id}/subscribed_apps`,
      { method: 'POST', headers: { Authorization: `Bearer ${systemToken}` } }
    )

    if (!subscribeRes.ok) {
      const err = await subscribeRes.json().catch(() => ({}))
      console.error('Failed to subscribe app to WABA:', err)
      // No fallamos: igual guardamos la integración. El cliente puede reintentar.
    }

    const admin = createAdminClient()

    const config = {
      phone_number_id,
      waba_id,
      business_id: business_id || null,
      display_phone_number: phoneData.display_phone_number || null,
      verified_name: phoneData.verified_name || null,
      connection_method: 'embedded_signup',
      connected_at: new Date().toISOString(),
    }

    const { error: upsertError } = await admin
      .from('integrations')
      .upsert(
        {
          user_id: user.id,
          platform: 'whatsapp',
          config,
          is_active: true,
          is_verified: true,
          webhook_verified_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,platform' }
      )

    if (upsertError) {
      console.error('Error upserting integration:', upsertError)
      return NextResponse.json({ error: 'No se pudo guardar la integración' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      integration: {
        platform: 'whatsapp',
        phone_number_id,
        display_phone_number: phoneData.display_phone_number,
        verified_name: phoneData.verified_name,
      },
    })
  } catch (error) {
    console.error('Error in WhatsApp Embedded Signup callback:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
