import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getAccountContext } from '@/lib/account'
import { registerYCloudPhoneNumber, getIntegrationKey } from '@/lib/whatsapp/ycloud'

/**
 * Fuerza el registro del número contra la Cloud API.
 *
 * Cuándo hace falta: el número figura "Conectado" en YCloud y RECIBE mensajes,
 * pero al enviar Meta responde `133010 - Account not registered`. Eso pasa cuando
 * el alta por coexistencia no completó el paso de registro. Recibir no lo necesita
 * (Meta empuja los entrantes al webhook igual), enviar sí.
 *
 * Es idempotente: si ya estaba registrado, YCloud lo responde sin romper nada.
 */
export async function POST(_request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const ctx = await getAccountContext()
    const ownerId = ctx?.ownerId || user.id

    const admin = createAdminClient()
    const { data: integration } = await admin
      .from('integrations')
      .select('config')
      .eq('user_id', ownerId)
      .eq('platform', 'whatsapp')
      .maybeSingle()

    const config = (integration?.config as any) || {}
    if (config.provider !== 'ycloud') {
      return NextResponse.json(
        { error: 'Esta cuenta no está conectada por YCloud' },
        { status: 400 },
      )
    }

    const wabaId = config.waba_id
    if (!wabaId) {
      return NextResponse.json({ error: 'La integración no tiene WABA guardada' }, { status: 400 })
    }

    const apiKey = getIntegrationKey(integration)
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Esta cuenta no tiene una API key de YCloud cargada' },
        { status: 400 },
      )
    }

    // YCloud acepta su id interno del número o el E.164: se prueban ambos.
    const result = await registerYCloudPhoneNumber(
      wabaId,
      [config.ycloud_phone_id, config.ycloud_from, config.phone_number_id],
      apiKey,
    )

    if (!result.ok) {
      console.error('[YCloud register] falló:', result.error)
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    console.log(`[YCloud register] número registrado (id usado: ${result.usedId})`)
    return NextResponse.json({ success: true, used_id: result.usedId })
  } catch (error: any) {
    console.error('[YCloud register] error:', error)
    return NextResponse.json({ error: error?.message || 'Error interno' }, { status: 500 })
  }
}
