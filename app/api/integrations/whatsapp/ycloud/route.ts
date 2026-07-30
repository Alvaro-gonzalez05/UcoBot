import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import {
  listYCloudPhoneNumbers,
  getYCloudOnboardingUrl,
  registerYCloudPhoneNumber,
  ensureYCloudWebhook,
  getYCloudKey,
  digitsOnly,
} from '@/lib/whatsapp/ycloud'

/**
 * Alta de WhatsApp vía YCloud (BSP oficial).
 *
 * Flujo: el cliente hace el Embedded Signup en la consola white-label (popup,
 * dominio propio). Su número queda registrado en NUESTRA cuenta de YCloud.
 * Después vuelve a UcoBot y acá le preguntamos a YCloud qué números hay para
 * vincular el suyo.
 *
 * GET  → números disponibles (los que no reclamó otra cuenta) + URL del popup
 * POST → vincula un número a la cuenta del usuario
 */

/**
 * Números ya reclamados por integraciones ycloud ACTIVAS, con su dueño.
 *
 * El filtro por is_active es clave: al desconectar, la fila queda inactiva (para
 * no perder el historial de conversaciones). Sin este filtro el número seguía
 * figurando como reclamado y no se podía volver a vincular nunca más.
 */
async function claimedNumbers(): Promise<Map<string, string>> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('integrations')
    .select('user_id, config')
    .eq('platform', 'whatsapp')
    .eq('config->>provider', 'ycloud')
    .eq('is_active', true)

  const map = new Map<string, string>()
  for (const row of data || []) {
    const key = (row.config as any)?.phone_number_id
    if (key) map.set(String(key), row.user_id)
  }
  return map
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    // Credencial única de la plataforma (ver getIntegrationKey): se volvió a este
    // modelo porque con una key por cliente el listado de números venía vacío.
    const apiKey = getYCloudKey()

    if (!apiKey) {
      return NextResponse.json(
        { error: 'YCloud no está configurado en el servidor (YCLOUD_API_KEY)' },
        { status: 500 },
      )
    }

    // Con la de plataforma se listan igual sus números (las conexiones viejas
    // siguen saliendo de ahí), pero se sigue ofreciendo cargar una propia.
    const [numbers, claimed] = await Promise.all([
      listYCloudPhoneNumbers(apiKey).catch(() => [] as any[]),
      claimedNumbers(),
    ])

    const available = numbers
      .map((n) => {
        const key = digitsOnly(n.phoneNumber)
        const owner = claimed.get(key)
        return {
          phone_number: n.phoneNumber,
          key,
          waba_id: n.wabaId,
          verified_name: n.verifiedName,
          quality_rating: n.qualityRating,
          status: n.status,
          // 'free' = sin dueño, 'mine' = ya vinculado a esta cuenta
          state: !owner ? 'free' : owner === user.id ? 'mine' : 'taken',
        }
      })
      .filter((n) => n.state !== 'taken')

    return NextResponse.json({
      onboarding_url: getYCloudOnboardingUrl(),
      numbers: available,
    })
  } catch (error: any) {
    console.error('[YCloud integraciones GET] error:', error)
    return NextResponse.json(
      { error: error?.message || 'No se pudieron listar los números' },
      { status: 500 },
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const body = await request.json()
    const requested = digitsOnly(String(body.phone_number || ''))
    if (!requested) {
      return NextResponse.json({ error: 'Falta el número a vincular' }, { status: 400 })
    }

    const apiKey = getYCloudKey()
    if (!apiKey) {
      return NextResponse.json(
        { error: 'YCloud no está configurado en el servidor (YCLOUD_API_KEY)' },
        { status: 500 },
      )
    }

    // Validar contra YCloud: nunca confiar en el número que manda el cliente.
    // De paso valida la key: si es inválida, esto tira error acá y no se guarda nada.
    const numbers = await listYCloudPhoneNumbers(apiKey)
    const match = numbers.find((n) => digitsOnly(n.phoneNumber) === requested)
    if (!match) {
      return NextResponse.json(
        { error: 'Ese número no figura en la cuenta de YCloud. ¿Terminaste el alta en el popup?' },
        { status: 400 },
      )
    }

    // Y que no lo haya reclamado otra cuenta de UcoBot.
    const claimed = await claimedNumbers()
    const owner = claimed.get(requested)
    if (owner && owner !== user.id) {
      return NextResponse.json(
        { error: 'Ese número ya está vinculado a otra cuenta' },
        { status: 409 },
      )
    }

    const admin = createAdminClient()

    // El webhook se configura por API en la cuenta del cliente. Es el paso que más
    // se rompe a mano y el que produce el síntoma más confuso (envía pero no
    // recibe), así que no se deja librado a que lo pegue bien en la consola.
    const origin = (process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin).replace(/\/+$/, '')
    const webhook = await ensureYCloudWebhook(apiKey, `${origin}/api/whatsapp/ycloud/webhook`)
    if (webhook.error) {
      console.warn('[YCloud] no se pudo configurar el webhook:', webhook.error)
    }

    const config = {
      provider: 'ycloud',
      // El pipeline resuelve la integración por phone_number_id: para YCloud es
      // el número del negocio en dígitos (mismo criterio que usa el traductor).
      phone_number_id: requested,
      ycloud_from: match.phoneNumber.startsWith('+') ? match.phoneNumber : `+${requested}`,
      ycloud_phone_id: match.id,
      waba_id: match.wabaId,
      display_phone_number: match.phoneNumber,
      verified_name: match.verifiedName,
      connection_method: 'ycloud',
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
        { onConflict: 'user_id,platform' },
      )

    if (upsertError) {
      console.error('[YCloud integraciones POST] upsert falló:', upsertError)
      return NextResponse.json({ error: 'No se pudo guardar la integración' }, { status: 500 })
    }

    // REGISTRO contra la Cloud API. Sin este paso el número recibe pero NO envía:
    // Meta responde `133010 - Account not registered`. En el alta por coexistencia
    // debería pasar solo, pero no siempre ocurre, así que lo forzamos al vincular.
    // Es idempotente y no bloquea: si falla, la integración queda igual y se puede
    // reintentar desde /api/integrations/whatsapp/ycloud/register.
    const registration = await registerYCloudPhoneNumber(
      match.wabaId,
      [match.id, match.phoneNumber, requested],
      apiKey,
    )
    if (!registration.ok) {
      console.warn('[YCloud] número vinculado pero SIN registrar:', registration.error)
    }

    return NextResponse.json({
      success: true,
      webhook_ok: !webhook.error,
      webhook_error: webhook.error,
      // Cuando el endpoint ya existía, YCloud no devuelve el secret al listarlo:
      // hay que copiarlo de la consola para poder validar la firma.
      webhook_secret_missing: !webhook.error && !webhook.secret && !webhook.created,
      registered: registration.ok,
      registration_error: registration.ok ? undefined : registration.error,
      integration: {
        platform: 'whatsapp',
        provider: 'ycloud',
        display_phone_number: match.phoneNumber,
        verified_name: match.verifiedName,
        waba_id: match.wabaId,
      },
    })
  } catch (error: any) {
    console.error('[YCloud integraciones POST] error:', error)
    return NextResponse.json(
      { error: error?.message || 'No se pudo vincular el número' },
      { status: 500 },
    )
  }
}
