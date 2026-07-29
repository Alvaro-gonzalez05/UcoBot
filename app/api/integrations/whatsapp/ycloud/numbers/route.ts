import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { listYCloudPhoneNumbers, digitsOnly } from '@/lib/whatsapp/ycloud'

/**
 * Números de una cuenta de YCloud, a partir de una API key todavía sin guardar.
 *
 * Existe porque el listado principal (GET /api/integrations/whatsapp/ycloud) usa
 * la credencial YA guardada, y en un alta nueva no hay ninguna: el cliente acaba
 * de pegar la suya y hace falta probarla antes de vincular nada.
 *
 * Es POST y no GET a propósito: una API key no viaja nunca en la URL, donde
 * quedaría en los registros del servidor y en el historial del navegador.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const body = await request.json()
    const apiKey = typeof body.api_key === 'string' ? body.api_key.trim() : ''
    if (!apiKey) {
      return NextResponse.json({ error: 'Falta la API key' }, { status: 400 })
    }

    // Si la key es inválida, esto tira y el catch devuelve el motivo de YCloud.
    const numbers = await listYCloudPhoneNumbers(apiKey)

    // Un número ya vinculado a OTRA cuenta de UcoBot no se puede ofrecer.
    const admin = createAdminClient()
    const { data: rows } = await admin
      .from('integrations')
      .select('user_id, config')
      .eq('platform', 'whatsapp')
      .eq('config->>provider', 'ycloud')
      .eq('is_active', true)

    const claimed = new Map<string, string>()
    for (const row of rows || []) {
      const key = (row.config as any)?.phone_number_id
      if (key) claimed.set(String(key), row.user_id)
    }

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
          state: !owner ? 'free' : owner === user.id ? 'mine' : 'taken',
        }
      })
      .filter((n) => n.state !== 'taken')

    return NextResponse.json({ numbers: available })
  } catch (error: any) {
    console.error('[YCloud numbers] error:', error)
    return NextResponse.json(
      { error: error?.message || 'No se pudieron listar los números con esa API key' },
      { status: 400 },
    )
  }
}
