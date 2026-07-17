import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getEvolutionConfig } from '@/lib/whatsapp/provider'

/**
 * Conexión de WhatsApp vía Evolution API (tercera opción, junto a Manual y
 * Embedded Signup).
 *
 * POST   → crea (o reusa) la instancia Evolution del usuario y devuelve el QR
 * GET    → estado de conexión (la UI pollea hasta 'open')
 * DELETE → logout de la instancia (desconecta el número)
 *
 * OJO: por el UNIQUE(user_id, platform), conectar Evolution REEMPLAZA la
 * integración de WhatsApp de esta cuenta. Es coherente con el modelo
 * "sucursal = cuenta = un número". La UI lo avisa antes.
 */

function instanceNameFor(userId: string): string {
  return `ucobot_${userId.replace(/-/g, '').slice(0, 12)}`
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const evo = getEvolutionConfig()
    if (!evo) {
      return NextResponse.json(
        { error: 'Evolution no está configurado en el servidor (EVOLUTION_API_URL / EVOLUTION_API_KEY)' },
        { status: 500 },
      )
    }

    const instance = instanceNameFor(user.id)
    const headers = { apikey: evo.apiKey, 'Content-Type': 'application/json' }

    // 1) Crear instancia (si ya existe, Evolution devuelve error: lo toleramos y conectamos)
    const createRes = await fetch(`${evo.baseUrl}/instance/create`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        instanceName: instance,
        integration: 'WHATSAPP-BAILEYS',
        qrcode: true,
      }),
    })
    const created = await createRes.json().catch(() => ({}))

    // 2) Pedir QR (connect devuelve base64 aun para instancias preexistentes)
    let qr: string | null = created?.qrcode?.base64 || null
    if (!qr) {
      const connectRes = await fetch(`${evo.baseUrl}/instance/connect/${encodeURIComponent(instance)}`, {
        method: 'GET',
        headers,
      })
      const connectData = await connectRes.json().catch(() => ({}))
      qr = connectData?.base64 || connectData?.qrcode?.base64 || null
    }

    // 3) Guardar/actualizar la integración con provider 'evolution'
    const admin = createAdminClient()
    const { error: upsertError } = await admin
      .from('integrations')
      .upsert(
        {
          user_id: user.id,
          platform: 'whatsapp',
          config: {
            provider: 'evolution',
            evolution_instance: instance,
            phone_number_id: instance, // clave de resolución del pipeline entrante
            evolution_state: 'connecting',
            evolution_qr: qr,
            connection_method: 'evolution',
            connected_at: new Date().toISOString(),
          },
          is_active: true,
          is_verified: false,
        },
        { onConflict: 'user_id,platform' },
      )

    if (upsertError) {
      console.error('[Evolution connect] upsert error:', upsertError)
      return NextResponse.json({ error: 'No se pudo guardar la integración' }, { status: 500 })
    }

    return NextResponse.json({ success: true, instance, qr })
  } catch (error) {
    console.error('[Evolution connect] error:', error)
    return NextResponse.json({ error: 'Error conectando con Evolution' }, { status: 500 })
  }
}

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const evo = getEvolutionConfig()
    if (!evo) return NextResponse.json({ error: 'Evolution no configurado' }, { status: 500 })

    const instance = instanceNameFor(user.id)
    const res = await fetch(
      `${evo.baseUrl}/instance/connectionState/${encodeURIComponent(instance)}`,
      { headers: { apikey: evo.apiKey } },
    )
    const data = await res.json().catch(() => ({}))
    const state = data?.instance?.state || data?.state || 'unknown'

    // Si ya está conectada, marcar verificada (idempotente)
    if (state === 'open') {
      const admin = createAdminClient()
      const { data: integration } = await admin
        .from('integrations')
        .select('id, config, is_verified')
        .eq('user_id', user.id)
        .eq('platform', 'whatsapp')
        .maybeSingle()
      if (integration && !integration.is_verified) {
        await admin
          .from('integrations')
          .update({
            is_verified: true,
            webhook_verified_at: new Date().toISOString(),
            config: { ...integration.config, evolution_state: 'open', evolution_qr: null },
          })
          .eq('id', integration.id)
      }
    }

    return NextResponse.json({ instance, state })
  } catch (error) {
    console.error('[Evolution state] error:', error)
    return NextResponse.json({ error: 'Error consultando estado' }, { status: 500 })
  }
}

export async function DELETE() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const evo = getEvolutionConfig()
    if (!evo) return NextResponse.json({ error: 'Evolution no configurado' }, { status: 500 })

    const instance = instanceNameFor(user.id)
    await fetch(`${evo.baseUrl}/instance/logout/${encodeURIComponent(instance)}`, {
      method: 'DELETE',
      headers: { apikey: evo.apiKey },
    }).catch(() => {})

    const admin = createAdminClient()
    await admin
      .from('integrations')
      .update({ is_active: false, is_verified: false })
      .eq('user_id', user.id)
      .eq('platform', 'whatsapp')
      .eq('config->>provider', 'evolution')

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Evolution disconnect] error:', error)
    return NextResponse.json({ error: 'Error desconectando' }, { status: 500 })
  }
}
