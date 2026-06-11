import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getGraphVersion } from '@/lib/meta/credentials'

/**
 * Configuración manual de WhatsApp Cloud API (alternativa a Embedded Signup).
 *
 * El cliente crea su propia app en developers.facebook.com, agrega el producto
 * WhatsApp y nos pasa:
 *  - waba_id:          WhatsApp Business Account ID
 *  - phone_number_id:  ID del número de teléfono (no el número en sí)
 *  - access_token:     Token permanente de System User de SU Business Manager
 *                      (permisos: whatsapp_business_messaging + whatsapp_business_management)
 *
 * Este endpoint valida el token contra la Graph API, intenta suscribir la app
 * del cliente a los webhooks del WABA, y guarda la integración con un
 * verify_token propio que el cliente debe pegar en la configuración de
 * webhooks de su app de Meta.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const body = await request.json()
    const waba_id = String(body.waba_id || '').trim()
    const phone_number_id = String(body.phone_number_id || '').trim()
    const access_token = String(body.access_token || '').trim()

    if (!waba_id || !phone_number_id || !access_token) {
      return NextResponse.json(
        { error: 'Faltan campos requeridos: waba_id, phone_number_id, access_token' },
        { status: 400 }
      )
    }

    if (!/^\d+$/.test(waba_id) || !/^\d+$/.test(phone_number_id)) {
      return NextResponse.json(
        { error: 'El WABA ID y el Phone Number ID deben ser numéricos. Revisá que no estés pegando el número de teléfono.' },
        { status: 400 }
      )
    }

    const graphVersion = getGraphVersion()

    // 1. Validar que el token tiene acceso al número
    const verifyRes = await fetch(
      `https://graph.facebook.com/${graphVersion}/${phone_number_id}?fields=verified_name,display_phone_number,quality_rating`,
      { headers: { Authorization: `Bearer ${access_token}` } }
    )

    if (!verifyRes.ok) {
      const err = await verifyRes.json().catch(() => ({}))
      console.error('Manual WhatsApp setup: token validation failed:', err)
      return NextResponse.json(
        {
          error: 'El token no tiene acceso a ese Phone Number ID. Verificá que el token sea permanente y tenga los permisos whatsapp_business_messaging y whatsapp_business_management.',
          details: err.error?.message,
        },
        { status: 400 }
      )
    }

    const phoneData = await verifyRes.json()

    // 2. Validar que el WABA pertenece al token y que phone_number_id está dentro del WABA
    const wabaPhonesRes = await fetch(
      `https://graph.facebook.com/${graphVersion}/${waba_id}/phone_numbers?fields=id`,
      { headers: { Authorization: `Bearer ${access_token}` } }
    )

    if (wabaPhonesRes.ok) {
      const wabaPhones = await wabaPhonesRes.json()
      const ids: string[] = (wabaPhones.data || []).map((p: any) => String(p.id))
      if (ids.length > 0 && !ids.includes(phone_number_id)) {
        return NextResponse.json(
          { error: 'El Phone Number ID no pertenece a ese WABA ID. Revisá los datos en Meta for Developers → WhatsApp → Configuración de la API.' },
          { status: 400 }
        )
      }
    }

    // 3. Suscribir la app del cliente a los webhooks del WABA.
    //    Con el token del cliente, esto suscribe SU app (la que generó el token).
    //    El cliente igual debe configurar la URL del webhook en su app.
    const subscribeRes = await fetch(
      `https://graph.facebook.com/${graphVersion}/${waba_id}/subscribed_apps`,
      { method: 'POST', headers: { Authorization: `Bearer ${access_token}` } }
    )

    if (!subscribeRes.ok) {
      const err = await subscribeRes.json().catch(() => ({}))
      console.error('Manual WhatsApp setup: subscribed_apps failed (non-fatal):', err)
    }

    const admin = createAdminClient()

    // Reusar el verify_token si ya existía una integración manual previa,
    // para no romper un webhook ya verificado en Meta.
    const { data: existing } = await admin
      .from('integrations')
      .select('config')
      .eq('user_id', user.id)
      .eq('platform', 'whatsapp')
      .maybeSingle()

    const verify_token: string =
      existing?.config?.verify_token || randomBytes(24).toString('hex')

    const config = {
      phone_number_id,
      waba_id,
      business_id: null,
      access_token,
      verify_token,
      display_phone_number: phoneData.display_phone_number || null,
      verified_name: phoneData.verified_name || null,
      connection_method: 'manual',
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
      console.error('Error upserting manual WhatsApp integration:', upsertError)
      return NextResponse.json({ error: 'No se pudo guardar la integración' }, { status: 500 })
    }

    const webhook_url = `${request.nextUrl.origin}/api/whatsapp/webhook`

    return NextResponse.json({
      success: true,
      integration: {
        platform: 'whatsapp',
        phone_number_id,
        display_phone_number: phoneData.display_phone_number,
        verified_name: phoneData.verified_name,
      },
      webhook: {
        url: webhook_url,
        verify_token,
      },
    })
  } catch (error) {
    console.error('Error in manual WhatsApp setup:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * Devuelve los datos de webhook de una integración manual existente,
 * para que el cliente pueda volver a ver la URL y el verify token.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const admin = createAdminClient()
    const { data: integration } = await admin
      .from('integrations')
      .select('config')
      .eq('user_id', user.id)
      .eq('platform', 'whatsapp')
      .maybeSingle()

    if (!integration || integration.config?.connection_method !== 'manual') {
      return NextResponse.json({ manual: false })
    }

    return NextResponse.json({
      manual: true,
      webhook: {
        url: `${request.nextUrl.origin}/api/whatsapp/webhook`,
        verify_token: integration.config?.verify_token || null,
      },
      integration: {
        phone_number_id: integration.config?.phone_number_id || null,
        waba_id: integration.config?.waba_id || null,
        display_phone_number: integration.config?.display_phone_number || null,
        verified_name: integration.config?.verified_name || null,
      },
    })
  } catch (error) {
    console.error('Error in manual WhatsApp setup GET:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
