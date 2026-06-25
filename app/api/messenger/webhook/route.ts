import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getGraphVersion } from '@/lib/meta/credentials'

/**
 * Webhook de Facebook Messenger.
 *
 * Meta envía los mensajes de las Pages conectadas (object === 'page').
 * El enrutamiento al cliente se hace por config->>page_id de la integración.
 */

// Webhook verification (GET request)
export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const mode = url.searchParams.get('hub.mode')
  const token = url.searchParams.get('hub.verify_token')
  const challenge = url.searchParams.get('hub.challenge')

  if (mode !== 'subscribe' || !token) {
    return new NextResponse('Bad request', { status: 400 })
  }

  const APP_VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN

  if (APP_VERIFY_TOKEN && token === APP_VERIFY_TOKEN) {
    console.log('✅ Messenger webhook verified via app-level token')
    return new NextResponse(challenge, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' }
    })
  }

  console.log('❌ Messenger webhook verification failed for token:', token)
  return new NextResponse('Verification failed', { status: 403 })
}

// Webhook event handler (POST request)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    console.log('💬 Messenger webhook received:', JSON.stringify(body, null, 2))

    if (body.object === 'page' && body.entry?.length > 0) {
      for (const entry of body.entry) {
        if (entry.messaging && entry.messaging.length > 0) {
          await processMessengerEntry(entry, request)
        }
      }
    }

    return NextResponse.json({ success: true }, { status: 200 })
  } catch (error) {
    console.error('Error processing Messenger webhook:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// Dedupe en memoria (además del check en DB) para eventos repetidos
const processedMessages = new Map<string, number>()
const MESSAGE_TTL = 60000 // 1 minuto

function cleanOldMessages() {
  const now = Date.now()
  for (const [key, timestamp] of processedMessages.entries()) {
    if (now - timestamp > MESSAGE_TTL) {
      processedMessages.delete(key)
    }
  }
}

// Obtener el nombre del usuario desde su PSID (requiere page token)
async function getMessengerUserName(psid: string, pageAccessToken: string): Promise<string | null> {
  try {
    const response = await fetch(
      `https://graph.facebook.com/${getGraphVersion()}/${psid}?fields=first_name,last_name&access_token=${pageAccessToken}`
    )
    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      console.error('❌ Messenger: error fetching user profile:', err)
      return null
    }
    const data = await response.json()
    const name = [data.first_name, data.last_name].filter(Boolean).join(' ')
    return name || null
  } catch (error) {
    console.error('❌ Messenger: error fetching user profile:', error)
    return null
  }
}

async function processMessengerEntry(entry: any, request: NextRequest) {
  const supabase = createAdminClient()
  const pageId = String(entry.id)

  for (const messaging of entry.messaging) {
    try {
      const senderPsid = messaging.sender?.id
      const recipientId = messaging.recipient?.id
      const timestamp = messaging.timestamp
      const message = messaging.message

      if (!message) {
        console.log('💬 No message content (postback/delivery/read), skipping...')
        continue
      }

      // Mensajes que envió la propia página (eco del bot o respuesta humana desde la página)
      if (message.is_echo) {
        console.log('💬 Skipping echo message from page')
        continue
      }

      const messageId = message.mid
      let textContent = (message.text || '').trim()

      if (!textContent && message.attachments && message.attachments.length > 0) {
        const attachmentType = message.attachments[0].type
        if (attachmentType === 'template' || attachmentType === 'fallback') {
          console.log(`💬 Skipping non-text attachment type: ${attachmentType}`)
          continue
        }
        textContent = `[Attachment: ${attachmentType}]`
      }

      if (!textContent) {
        console.log('💬 Empty message content, skipping...')
        continue
      }

      // Dedupe en memoria por mid
      cleanOldMessages()
      if (processedMessages.has(messageId)) {
        console.log('💬 Skipping already processed message (dedupe):', messageId)
        continue
      }
      processedMessages.set(messageId, Date.now())

      console.log('💬 Processing Messenger message:')
      console.log('- From PSID:', senderPsid)
      console.log('- Page:', pageId)
      console.log('- Text:', textContent)

      // Buscar integración por page_id + check de duplicado en DB en paralelo
      const integrationPromise = supabase
        .from('integrations')
        .select('*')
        .eq('platform', 'messenger')
        .eq('is_active', true)
        .eq('config->>page_id', pageId)
        .maybeSingle()

      const duplicateCheckPromise = supabase
        .from('messages')
        .select('id')
        .eq('metadata->>platform_message_id', messageId)
        .maybeSingle()

      const [integrationResult, duplicateResult] = await Promise.all([
        integrationPromise,
        duplicateCheckPromise,
      ])

      const integration = integrationResult.data
      const existingMessage = duplicateResult.data

      if (integrationResult.error || !integration) {
        console.log('❌ No active Messenger integration found for page:', pageId)
        continue
      }

      // Check user subscription status
      const { data: userProfile } = await supabase
        .from('user_profiles')
        .select('subscription_status')
        .eq('id', integration.user_id)
        .single()

      if (userProfile?.subscription_status === 'suspended') {
        console.log('⛔ User is suspended. Ignoring Messenger message for user:', integration.user_id)
        continue
      }

      if (existingMessage) {
        console.log('💬 Skipping duplicate message (DB check):', messageId)
        continue
      }

      // Bot activo de Messenger del usuario
      const { data: bot, error: botError } = await supabase
        .from('bots')
        .select('*')
        .contains('platforms', ['messenger'])
        .eq('user_id', integration.user_id)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle()

      if (botError || !bot) {
        console.error('No active Messenger bot found for user:', integration.user_id, botError)
        continue
      }

      console.log('💬 Found Messenger bot:', bot.name, 'with ID:', bot.id)

      // Buscar o crear conversación por PSID
      let conversation
      const { data: existingConversation } = await supabase
        .from('conversations')
        .select('*')
        .eq('bot_id', bot.id)
        .eq('client_messenger_id', senderPsid)
        .eq('platform', 'messenger')
        .maybeSingle()

      if (existingConversation) {
        conversation = existingConversation
        supabase
          .from('conversations')
          .update({ last_message_at: new Date(parseInt(timestamp)).toISOString() })
          .eq('id', existingConversation.id)
          .then(({ error }) => {
            if (error) console.error('Error updating conversation timestamp:', error)
          })
      } else {
        const { data: newConversation, error: createError } = await supabase
          .from('conversations')
          .insert({
            bot_id: bot.id,
            user_id: bot.user_id,
            client_messenger_id: senderPsid,
            client_name: `Messenger ${senderPsid.slice(-6)}`, // temporal hasta obtener el nombre real
            platform: 'messenger',
            status: 'active',
            last_message_at: new Date(parseInt(timestamp)).toISOString(),
          })
          .select()
          .single()

        if (createError) {
          console.error('Error creating Messenger conversation:', createError)
          continue
        }
        conversation = newConversation
      }

      // Obtener el nombre real del usuario en background si todavía no lo tenemos
      const needsName = !existingConversation || conversation.client_name?.startsWith('Messenger ')
      if (needsName) {
        getMessengerUserName(senderPsid, integration.config.access_token)
          .then(async (name) => {
            if (name) {
              await supabase
                .from('conversations')
                .update({ client_name: name })
                .eq('id', conversation.id)
              console.log('✅ Updated Messenger conversation with name:', name)
            }
          })
          .catch((err) => console.error('Error fetching Messenger name in background:', err))
      }

      // Guardar el mensaje entrante
      const { error: messageError } = await supabase
        .from('messages')
        .insert({
          conversation_id: conversation.id,
          content: textContent,
          sender_type: 'client',
          message_type: 'text',
          metadata: {
            platform_message_id: messageId,
            sender_messenger_psid: senderPsid,
            page_id: pageId,
          },
          created_at: new Date(parseInt(timestamp)).toISOString(),
        })

      if (messageError) {
        console.error('Error inserting Messenger message:', messageError)
        continue
      }

      // Marca el último mensaje entrante del cliente (ventana de 24 hs)
      await supabase
        .from('conversations')
        .update({ last_client_message_at: new Date().toISOString() })
        .eq('id', conversation.id)

      // Generar respuesta IA
      if (bot.is_active && textContent.trim()) {
        // Conversación pausada
        if (conversation.status === 'paused') {
          if (conversation.paused_until) {
            const pausedUntil = new Date(conversation.paused_until)
            if (new Date() > pausedUntil) {
              console.log('▶️ Pause expired, reactivating AI...')
              await supabase
                .from('conversations')
                .update({ status: 'active', paused_until: null })
                .eq('id', conversation.id)
            } else {
              console.log('⏸️ Conversation paused until ' + pausedUntil.toISOString() + ', skipping AI response')
              continue
            }
          } else {
            console.log('⏸️ Conversation paused indefinitely, skipping AI response')
            continue
          }
        }

        // DEBOUNCE: ventana de escucha configurable por bot (default 7s)
        const debounceMs = (Number(bot?.feature_config?.debounce_seconds) || 7) * 1000
        console.log(`⏳ Esperando ${debounceMs}ms (ventana de escucha)...`)
        await new Promise((resolve) => setTimeout(resolve, debounceMs))

        const { data: newerMessages } = await supabase
          .from('messages')
          .select('id')
          .eq('conversation_id', conversation.id)
          .gt('created_at', new Date(parseInt(timestamp)).toISOString())
          .limit(1)

        if (newerMessages && newerMessages.length > 0) {
          console.log('⏭️ Newer message detected, skipping response for this message')
          continue
        }

        console.log('⚡ No newer messages, generating response...')

        const host = request.headers.get('host') || 'localhost:3000'
        const protocol = request.headers.get('x-forwarded-proto') || 'http'
        const baseUrl = `${protocol}://${host}`

        const aiResponse = await fetch(`${baseUrl}/api/chat/webhook`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            botId: bot.id,
            message: textContent,
            conversationId: conversation.id,
            senderPhone: null,
            senderName: conversation.client_name,
            platform: 'messenger',
          }),
        })

        if (aiResponse.ok) {
          const aiResponseData = await aiResponse.json()

          if (aiResponseData.response) {
            // El mensaje del bot ya lo guarda /api/chat/webhook (una o varias partes).
            try {
              const parts: string[] = Array.isArray(aiResponseData.messages) && aiResponseData.messages.length > 0
                ? aiResponseData.messages
                : [aiResponseData.response]
              for (let i = 0; i < parts.length; i++) {
                await sendMessengerMessage(integration.config.access_token, pageId, senderPsid, parts[i])
                if (i < parts.length - 1) await new Promise((r) => setTimeout(r, 1200))
              }
              console.log('✅ Messenger message sent successfully!')

              await supabase.from('usage_logs').insert({
                user_id: integration.user_id,
                type: 'ai_response',
                amount: 1,
                description: `Respuesta IA a ${conversation.client_name || senderPsid} (Messenger)`,
              })
            } catch (error) {
              console.log('⚠️ Messenger message failed to send, but conversation was saved:', (error as Error).message)
            }
          }
        }
      }
    } catch (error) {
      console.error('Error processing individual Messenger message:', error)
    }
  }
}

async function sendMessengerMessage(
  pageAccessToken: string,
  pageId: string,
  recipientPsid: string,
  message: string
) {
  const response = await fetch(
    `https://graph.facebook.com/${getGraphVersion()}/${pageId}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${pageAccessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        recipient: { id: recipientPsid },
        messaging_type: 'RESPONSE',
        message: { text: message },
      }),
    }
  )

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    console.error('Messenger API Error:', errorData)
    throw new Error(errorData.error?.message || `Messenger send failed: ${response.status}`)
  }

  return response.json()
}
