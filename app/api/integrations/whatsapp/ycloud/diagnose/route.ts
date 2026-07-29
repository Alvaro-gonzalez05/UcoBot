import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import {
  listYCloudPhoneNumbers,
  listYCloudWebhookEndpoints,
  getIntegrationKey,
  businessPhoneVariants,
  digitsOnly,
} from '@/lib/whatsapp/ycloud'

/**
 * Diagnóstico de la conexión de WhatsApp por YCloud.
 *
 * Existe por un caso concreto: después de desvincular y volver a vincular el
 * número, el ENVÍO seguía funcionando pero no entraba NADA (ni mensajes, ni
 * echoes del celular, ni historial). Cuando pasa eso el problema nunca está en
 * la fila de `integrations` — está en el lado de YCloud: la WABA se recreó y el
 * endpoint de webhook quedó apuntando a otro lado, deshabilitado, o sin los
 * eventos tildados.
 *
 * Este endpoint compara las tres fuentes de verdad (lo guardado, lo que dice la
 * API de YCloud, y lo último que realmente entró) y devuelve el veredicto.
 */

/** Eventos sin los cuales el chatbot queda mudo o a medias. */
const REQUIRED_EVENTS = ['whatsapp.inbound_message.received']
const COEXISTENCE_EVENTS = [
  'whatsapp.smb.message.echoes',
  'whatsapp.smb.history',
  'whatsapp.smb.app.state.sync',
]

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const admin = createAdminClient()
    const { data: integration } = await admin
      .from('integrations')
      .select('id, is_active, is_verified, config, updated_at')
      .eq('user_id', user.id)
      .eq('platform', 'whatsapp')
      .maybeSingle()

    const cfg = (integration?.config as any) || {}
    const savedPhone = digitsOnly(cfg.phone_number_id || '')

    // Credencial de la cuenta de YCloud de ESTE cliente.
    const apiKey = getIntegrationKey(integration)
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Esta cuenta todavía no tiene una API key de YCloud cargada' },
        { status: 400 },
      )
    }

    // Lo que dice YCloud hoy sobre la cuenta.
    const [numbers, endpoints] = await Promise.all([
      listYCloudPhoneNumbers(apiKey).catch((e) => ({ error: e?.message } as any)),
      listYCloudWebhookEndpoints(apiKey).catch((e) => ({ error: e?.message } as any)),
    ])

    const numberList = Array.isArray(numbers) ? numbers : []
    const endpointList = Array.isArray(endpoints) ? endpoints : []

    // El número guardado, buscado por variantes AR (con y sin el 9): si aparece
    // en el otro formato eso YA es el bug, y hay que verlo, no ocultarlo.
    const variants = businessPhoneVariants(savedPhone)
    const match = numberList.find((n) => variants.includes(digitsOnly(n.phoneNumber)))
    const exactMatch = match && digitsOnly(match.phoneNumber) === savedPhone

    const expectedUrl = `${request.nextUrl.origin}/api/whatsapp/ycloud/webhook`
    const ours = endpointList.filter((e: any) =>
      String(e?.url || '').includes('/api/whatsapp/ycloud/webhook'),
    )
    const enabledOurs = ours.filter((e: any) => (e?.status || e?.enabled) !== 'disabled' && e?.enabled !== false)
    const subscribedEvents: string[] = [
      ...new Set(enabledOurs.flatMap((e: any) => e?.events || e?.enabledEvents || [])),
    ] as string[]

    // Última señal REAL de entrada, que es lo que destapa el problema.
    const { data: lastInbound } = await admin
      .from('messages')
      .select('created_at, conversations!inner(user_id)')
      .eq('conversations.user_id', user.id)
      .eq('sender_type', 'client')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const { data: lastChunk } = await admin
      .from('whatsapp_sync_chunks')
      .select('received_at')
      .eq('user_id', user.id)
      .order('received_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const problems: string[] = []
    if (!integration) problems.push('No hay integración de WhatsApp guardada.')
    else if (!integration.is_active) problems.push('La integración está desconectada (is_active = false).')
    if (cfg.provider !== 'ycloud') problems.push(`El proveedor guardado es "${cfg.provider || 'cloud'}", no ycloud.`)
    if (!match) {
      problems.push(
        `El número ${savedPhone} NO figura en la cuenta de YCloud. Hay que volver a hacer el alta en el popup.`,
      )
    } else {
      if (!exactMatch) {
        problems.push(
          `YCloud reporta el número como ${match.phoneNumber} pero está guardado como ${savedPhone}. ` +
            'Reconectá el número para que la config quede en el formato nuevo.',
        )
      }
      if (cfg.waba_id && match.wabaId && cfg.waba_id !== match.wabaId) {
        problems.push(
          `Cambió la WABA: guardada ${cfg.waba_id}, actual ${match.wabaId}. ` +
            'Es lo que pasa al desvincular y volver a vincular; hay que reconectar el número en UcoBot.',
        )
      }
      if (match.status && String(match.status).toLowerCase() !== 'connected') {
        problems.push(`El número está en estado "${match.status}" en YCloud.`)
      }
    }
    if (ours.length === 0) {
      problems.push(
        `Ningún webhook de YCloud apunta a ${expectedUrl}. Sin eso el envío anda pero no entra nada.`,
      )
    } else if (enabledOurs.length === 0) {
      problems.push('El webhook que apunta a UcoBot está DESHABILITADO en YCloud.')
    } else {
      const missing = REQUIRED_EVENTS.filter((e) => !subscribedEvents.includes(e))
      if (missing.length > 0) {
        problems.push(`Al webhook le faltan eventos obligatorios: ${missing.join(', ')}`)
      }
      const missingCoex = COEXISTENCE_EVENTS.filter((e) => !subscribedEvents.includes(e))
      if (missingCoex.length > 0) {
        problems.push(
          `Sin eventos de coexistencia (${missingCoex.join(', ')}): no se ve lo que se contesta desde el celular.`,
        )
      }
    }

    return NextResponse.json({
      ok: problems.length === 0,
      problems,
      saved: {
        is_active: integration?.is_active ?? null,
        is_verified: integration?.is_verified ?? null,
        provider: cfg.provider ?? null,
        phone_number_id: savedPhone || null,
        ycloud_from: cfg.ycloud_from ?? null,
        waba_id: cfg.waba_id ?? null,
        connected_at: cfg.connected_at ?? null,
        updated_at: integration?.updated_at ?? null,
      },
      ycloud: {
        number: match
          ? {
              phone_number: match.phoneNumber,
              waba_id: match.wabaId,
              status: match.status,
              quality_rating: match.qualityRating,
              verified_name: match.verifiedName,
            }
          : null,
        numbers_in_account: numberList.length,
        expected_webhook_url: expectedUrl,
        webhooks: endpointList.map((e: any) => ({
          url: e?.url,
          enabled: e?.enabled ?? e?.status ?? null,
          events: e?.events ?? e?.enabledEvents ?? [],
          points_to_ucobot: String(e?.url || '').includes('/api/whatsapp/ycloud/webhook'),
        })),
        api_errors: [
          ...(Array.isArray(numbers) ? [] : [`phoneNumbers: ${(numbers as any)?.error}`]),
          ...(Array.isArray(endpoints) ? [] : [`webhookEndpoints: ${(endpoints as any)?.error}`]),
        ],
      },
      last_activity: {
        last_inbound_message: lastInbound?.created_at ?? null,
        last_sync_chunk: lastChunk?.received_at ?? null,
      },
    })
  } catch (error: any) {
    console.error('[YCloud diagnose] error:', error)
    return NextResponse.json(
      { error: error?.message || 'No se pudo diagnosticar' },
      { status: 500 },
    )
  }
}
