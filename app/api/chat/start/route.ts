import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getAccountContext } from '@/lib/account'

/**
 * Arranca (o reabre) una conversación de WhatsApp con un cliente del CRM.
 *
 * Es lo que usa "Nuevo chat": los contactos importados no tienen conversación, así
 * que sin esto no aparecen en /chat y no se les puede escribir.
 *
 * OJO: crear la conversación NO habilita a mandar un mensaje libre. Si el cliente
 * no escribió en las últimas 24 hs, Meta solo permite plantillas aprobadas; de eso
 * se encarga la UI, que detecta la ventana cerrada y ofrece el selector.
 */

function digitsOnly(phone: string): string {
  return String(phone || '').replace(/\D/g, '')
}

/** Variantes del móvil argentino (con y sin el 9) para no duplicar conversaciones. */
function phoneVariants(phone: string): string[] {
  const d = digitsOnly(phone)
  const out = [d]
  if (d.startsWith('549')) out.push(d.substring(3), '54' + d.substring(3))
  else if (d.startsWith('54')) out.push('549' + d.substring(2))
  return Array.from(new Set(out.filter(Boolean)))
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const ctx = await getAccountContext()
    const ownerId = ctx?.ownerId || user.id

    const body = await request.json()
    const phone = digitsOnly(body.phone || '')
    const name = String(body.name || '').trim() || phone

    if (!phone) {
      return NextResponse.json({ error: 'Falta el teléfono del cliente' }, { status: 400 })
    }

    const admin = createAdminClient()

    // Un solo bot de WhatsApp por cuenta (mismo criterio que el pipeline).
    const { data: bot } = await admin
      .from('bots')
      .select('id')
      .eq('user_id', ownerId)
      .contains('platforms', ['whatsapp'])
      .eq('is_active', true)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (!bot) {
      return NextResponse.json(
        { error: 'No tenés un bot de WhatsApp activo. Creá uno antes de iniciar chats.' },
        { status: 400 }
      )
    }

    // ¿Ya existe la conversación? (buscando por todas las variantes del número)
    const { data: existing } = await admin
      .from('conversations')
      .select('id')
      .eq('bot_id', bot.id)
      .in('client_phone', phoneVariants(phone))
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle()

    if (existing?.id) {
      return NextResponse.json({ success: true, conversationId: existing.id, created: false })
    }

    // El cliente puede existir en el CRM: lo enlazamos para no duplicar la ficha.
    const { data: client } = await admin
      .from('clients')
      .select('id, name')
      .eq('user_id', ownerId)
      .in('phone', phoneVariants(phone))
      .limit(1)
      .maybeSingle()

    const { data: created, error } = await admin
      .from('conversations')
      .insert({
        user_id: ownerId,
        bot_id: bot.id,
        client_id: client?.id ?? null,
        client_phone: phone,
        client_name: client?.name || name,
        platform: 'whatsapp',
        status: 'active',
        needs_attention: false,
      })
      .select('id')
      .single()

    if (error || !created) {
      console.error('[chat/start] no se pudo crear la conversación:', error)
      return NextResponse.json({ error: 'No se pudo iniciar la conversación' }, { status: 500 })
    }

    return NextResponse.json({ success: true, conversationId: created.id, created: true })
  } catch (error) {
    console.error('[chat/start] error:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
