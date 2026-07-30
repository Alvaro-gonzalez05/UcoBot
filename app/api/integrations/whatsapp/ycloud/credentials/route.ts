import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { listYCloudPhoneNumbers, ensureYCloudWebhook } from '@/lib/whatsapp/ycloud'

/**
 * Guarda la API key de la cuenta de YCloud del cliente, sin vincular ningún número.
 *
 * POR QUÉ EXISTE (30/07/2026): al principio la credencial se guardaba únicamente
 * dentro del alta de un número. Eso deja sin salida el caso más común al migrar a
 * cuenta propia: pegás la key de una cuenta recién creada que TODAVÍA no tiene
 * números, la lista sale vacía, no hay nada que vincular y la clave se pierde al
 * cerrar el diálogo. Guardar la credencial y vincular un número son dos pasos
 * distintos y ahora se pueden hacer por separado.
 *
 * De paso deja el webhook configurado, así cuando el número aparezca ya entra todo.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const body = await request.json()
    const apiKey = typeof body.api_key === 'string' ? body.api_key.trim() : ''
    if (!apiKey) return NextResponse.json({ error: 'Falta la API key' }, { status: 400 })

    // Validar la credencial contra YCloud ANTES de guardarla: si es inválida esto
    // tira y el catch devuelve el motivo. No queremos dejar guardada una key que
    // no sirve y que después falle recién al intentar enviar un mensaje.
    const numbers = await listYCloudPhoneNumbers(apiKey)

    const origin = (process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin).replace(/\/+$/, '')
    const webhook = await ensureYCloudWebhook(apiKey, `${origin}/api/whatsapp/ycloud/webhook`)
    if (webhook.error) {
      console.warn('[YCloud credenciales] webhook no configurado:', webhook.error)
    }

    const admin = createAdminClient()
    const { data: existing } = await admin
      .from('integrations')
      .select('id, config, is_active')
      .eq('user_id', user.id)
      .eq('platform', 'whatsapp')
      .maybeSingle()

    const config = {
      ...((existing?.config as any) || {}),
      provider: 'ycloud',
      ycloud_api_key: apiKey,
      ...(webhook.secret ? { ycloud_webhook_secret: webhook.secret } : {}),
    }

    const { error } = await admin.from('integrations').upsert(
      {
        user_id: user.id,
        platform: 'whatsapp',
        config,
        // Guardar la credencial NO conecta el número. Si la integración ya estaba
        // activa se respeta; si es nueva queda inactiva hasta vincular uno.
        is_active: existing?.is_active ?? false,
      },
      { onConflict: 'user_id,platform' },
    )

    if (error) {
      console.error('[YCloud credenciales] no se pudo guardar:', error)
      return NextResponse.json({ error: 'No se pudo guardar la credencial' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      numbers_found: numbers.length,
      webhook_ok: !webhook.error,
      webhook_error: webhook.error,
      webhook_secret_missing: !webhook.error && !webhook.secret && !webhook.created,
    })
  } catch (error: any) {
    console.error('[YCloud credenciales] error:', error)
    return NextResponse.json(
      { error: error?.message || 'Esa API key no funcionó contra YCloud' },
      { status: 400 },
    )
  }
}
