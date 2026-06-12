import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

/**
 * Importación de chats exportados de WhatsApp (.txt).
 *
 * Recibe las conversaciones ya parseadas en el navegador y por cada una:
 *  1. Busca o crea el cliente (match por variaciones del teléfono)
 *  2. Busca o crea la conversación de WhatsApp del bot del usuario
 *  3. Inserta los mensajes con su fecha original (metadata.imported = true)
 */

const MAX_MESSAGES_PER_CHAT = 5000
const BATCH_SIZE = 500

interface ImportMessage {
  sender: 'client' | 'business'
  text: string
  timestamp: string
}

interface ImportConversation {
  client_name: string
  client_phone: string
  messages: ImportMessage[]
}

function phoneVariations(phone: string): string[] {
  const digits = phone.replace(/\D/g, '')
  const variations = new Set<string>([digits])
  // Variantes argentinas: 549..., 54..., y el número local pelado
  if (digits.startsWith('549')) {
    variations.add(digits.substring(3))
    variations.add('54' + digits.substring(3))
  } else if (digits.startsWith('54')) {
    variations.add(digits.substring(2))
    variations.add('549' + digits.substring(2))
  } else {
    variations.add('54' + digits)
    variations.add('549' + digits)
  }
  return Array.from(variations).filter(Boolean)
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const body = await request.json()
    const conversations: ImportConversation[] = Array.isArray(body.conversations) ? body.conversations : []

    if (conversations.length === 0) {
      return NextResponse.json({ error: 'No hay conversaciones para importar' }, { status: 400 })
    }
    if (conversations.length > 50) {
      return NextResponse.json({ error: 'Máximo 50 chats por importación' }, { status: 400 })
    }

    const admin = createAdminClient()

    // Bot de WhatsApp del usuario (la conversación necesita un bot asociado)
    let { data: bot } = await admin
      .from('bots')
      .select('id, name')
      .eq('user_id', user.id)
      .contains('platforms', ['whatsapp'])
      .limit(1)
      .maybeSingle()

    if (!bot) {
      const { data: anyBot } = await admin
        .from('bots')
        .select('id, name')
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle()
      bot = anyBot
    }

    if (!bot) {
      return NextResponse.json(
        { error: 'Necesitás tener al menos un bot creado para importar chats. Creá uno en la sección Chatbots.' },
        { status: 400 }
      )
    }

    const results: { client_name: string; messages_imported: number; client_created: boolean; error?: string }[] = []

    for (const conv of conversations) {
      try {
        const clientName = String(conv.client_name || '').trim() || 'Cliente importado'
        const phone = String(conv.client_phone || '').replace(/\D/g, '')
        const messages = (conv.messages || []).slice(0, MAX_MESSAGES_PER_CHAT)

        if (messages.length === 0) {
          results.push({ client_name: clientName, messages_imported: 0, client_created: false, error: 'Sin mensajes válidos' })
          continue
        }

        // 1. Cliente: buscar por teléfono, crear si no existe
        let clientId: string | null = null
        let clientCreated = false

        if (phone) {
          const { data: existingClient } = await admin
            .from('clients')
            .select('id, name')
            .eq('user_id', user.id)
            .in('phone', phoneVariations(phone))
            .limit(1)
            .maybeSingle()
          if (existingClient) clientId = existingClient.id
        }

        if (!clientId) {
          const { data: newClient, error: clientError } = await admin
            .from('clients')
            .insert({
              user_id: user.id,
              name: clientName,
              phone: phone || null,
              points: 0,
            })
            .select('id')
            .single()

          if (clientError) throw clientError
          clientId = newClient.id
          clientCreated = true
        }

        // 2. Conversación: reusar la existente del mismo teléfono/cliente o crear una
        let conversationId: string | null = null

        if (phone) {
          const { data: existingConv } = await admin
            .from('conversations')
            .select('id')
            .eq('user_id', user.id)
            .eq('platform', 'whatsapp')
            .in('client_phone', phoneVariations(phone))
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()
          if (existingConv) conversationId = existingConv.id
        }

        const lastTimestamp = messages[messages.length - 1].timestamp

        if (!conversationId) {
          const { data: newConv, error: convError } = await admin
            .from('conversations')
            .insert({
              user_id: user.id,
              bot_id: bot.id,
              client_id: clientId,
              client_phone: phone || null,
              client_name: clientName,
              platform: 'whatsapp',
              status: 'active',
              last_message_at: lastTimestamp,
            })
            .select('id')
            .single()

          if (convError) throw convError
          conversationId = newConv.id
        } else {
          await admin
            .from('conversations')
            .update({ client_id: clientId })
            .eq('id', conversationId)
            .is('client_id', null)
        }

        // 3. Mensajes en lotes, con su fecha original
        let inserted = 0
        for (let i = 0; i < messages.length; i += BATCH_SIZE) {
          const batch = messages.slice(i, i + BATCH_SIZE).map((msg) => ({
            conversation_id: conversationId,
            content: msg.text,
            sender_type: msg.sender === 'client' ? 'client' : 'bot',
            message_type: 'text',
            created_at: msg.timestamp,
            metadata: {
              imported: true,
              import_source: 'whatsapp_export',
              ...(msg.sender === 'business' ? { sent_by: 'business_history' } : {}),
            },
          }))

          const { error: msgError } = await admin.from('messages').insert(batch)
          if (msgError) throw msgError
          inserted += batch.length
        }

        results.push({ client_name: clientName, messages_imported: inserted, client_created: clientCreated })
      } catch (convError: any) {
        console.error('Error importing conversation:', convError)
        results.push({
          client_name: conv.client_name || 'Desconocido',
          messages_imported: 0,
          client_created: false,
          error: convError?.message || 'Error al importar',
        })
      }
    }

    return NextResponse.json({
      success: true,
      bot_name: bot.name,
      results,
      total_messages: results.reduce((sum, r) => sum + r.messages_imported, 0),
      total_clients_created: results.filter((r) => r.client_created).length,
    })
  } catch (error) {
    console.error('Error in chat import:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
