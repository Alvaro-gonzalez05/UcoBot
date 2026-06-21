import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'

// Webhook verification (GET request)
export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const mode = url.searchParams.get('hub.mode')
  const token = url.searchParams.get('hub.verify_token')
  const challenge = url.searchParams.get('hub.challenge')

  if (mode !== 'subscribe' || !token) {
    return new NextResponse('Bad request', { status: 400 })
  }

  try {
    const APP_VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN

    if (APP_VERIFY_TOKEN && token === APP_VERIFY_TOKEN) {
      console.log('✅ WhatsApp webhook verified via app-level token (Embedded Signup mode)')
      return new NextResponse(challenge, {
        status: 200,
        headers: { 'Content-Type': 'text/plain' }
      })
    }

    // Configuración manual: cada integración manual tiene su propio verify_token
    // generado por UcoBot, que el cliente pega en la config de webhooks de su app de Meta.
    const supabase = createAdminClient()
    const { data: manualIntegration } = await supabase
      .from('integrations')
      .select('id')
      .eq('platform', 'whatsapp')
      .eq('config->>verify_token', token)
      .maybeSingle()

    if (manualIntegration) {
      console.log('✅ WhatsApp webhook verified via per-integration token (manual mode):', manualIntegration.id)
      return new NextResponse(challenge, {
        status: 200,
        headers: { 'Content-Type': 'text/plain' }
      })
    }

    // Legacy: per-bot verify token (token = bot ID). Mantener compatibilidad con clientes
    // configurados antes de la migración a Embedded Signup.
    const { data: bot } = await supabase
      .from('bots')
      .select('id')
      .contains('platforms', ['whatsapp'])
      .eq('id', token)
      .single()

    if (bot) {
      console.log('✅ WhatsApp webhook verified via legacy per-bot token, bot:', bot.id)
      return new NextResponse(challenge, {
        status: 200,
        headers: { 'Content-Type': 'text/plain' }
      })
    }

    console.log('❌ WhatsApp webhook verification failed for token:', token)
    return new NextResponse('Verification failed', { status: 403 })
  } catch (error) {
    console.error('Error during webhook verification:', error)
    return new NextResponse('Verification error', { status: 500 })
  }
}

// Webhook event handler (POST request)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const origin = request.nextUrl.origin
    console.log('WhatsApp Webhook Event:', JSON.stringify(body, null, 2))

    // Verify webhook signature (recommended for production)
    // const signature = request.headers.get('x-hub-signature-256')
    // TODO: Implement signature verification

    // Process webhook events
    if (body.entry && body.entry.length > 0) {
      for (const entry of body.entry) {
        if (entry.changes && entry.changes.length > 0) {
          for (const change of entry.changes) {
            if (change.field === 'messages') {
              await processWhatsAppMessage(change.value, origin)
            }
          }
        }
      }
    }

    return NextResponse.json({ success: true }, { status: 200 })
  } catch (error) {
    console.error('Error processing WhatsApp webhook:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

async function processWhatsAppMessage(messageData: any, origin: string) {
  if (!messageData.messages || messageData.messages.length === 0) {
    return
  }

  const supabase = createAdminClient()

  // Extract contact information if available
  const contacts = messageData.contacts || []
  const contactInfo = contacts.length > 0 ? contacts[0] : null
  const senderName = contactInfo?.profile?.name || null

  for (const message of messageData.messages) {
    try {
      // Extract message details
      const {
        id: whatsappMessageId,
        from: senderPhone,
        timestamp,
        type: messageType,
        text,
        image,
        document,
        audio,
        video,
        location,
        sticker,
        context // Extract context for replies
      } = message

      const recipientPhone = messageData.metadata?.phone_number_id || messageData.metadata?.display_phone_number

      // OPTIMIZATION: Filter directly in DB instead of fetching all integrations
      const { data: integration, error: integrationError } = await supabase
        .from('integrations')
        .select('*')
        .eq('platform', 'whatsapp')
        .eq('is_active', true)
        .eq('config->>phone_number_id', messageData.metadata?.phone_number_id)
        .maybeSingle()

      if (integrationError || !integration) {
        console.log('No active WhatsApp integration found for phone number:', messageData.metadata?.phone_number_id)
        continue
      }

      // Get the bot for this user and platform
      // We can do this in parallel with checking for duplicate messages
      const botPromise = supabase
        .from('bots')
        .select('*')
        .eq('user_id', integration.user_id)
        .contains('platforms', ['whatsapp'])
        .eq('is_active', true)
        .limit(1)
        .maybeSingle()

      // Check user subscription status
      const userProfilePromise = supabase
        .from('user_profiles')
        .select('subscription_status')
        .eq('id', integration.user_id)
        .single()

      // Check for duplicate messages (check metadata for whatsapp_message_id)
      const duplicateCheckPromise = supabase
        .from('messages')
        .select('id')
        .eq('metadata->>whatsapp_message_id', whatsappMessageId)
        .maybeSingle()

      const [botResult, userProfileResult, duplicateResult] = await Promise.all([botPromise, userProfilePromise, duplicateCheckPromise])
      
      const bot = botResult.data
      const botError = botResult.error
      const userProfile = userProfileResult.data
      const existingMessage = duplicateResult.data

      if (userProfile?.subscription_status === 'suspended') {
        console.log('⛔ User is suspended. Ignoring WhatsApp message for user:', integration.user_id)
        continue
      }

      if (botError || !bot) {
        console.error('No active WhatsApp bot found for user:', integration.user_id, botError)
        continue
      }

      if (existingMessage) {
        console.log('Skipping duplicate message:', whatsappMessageId)
        continue 
      }

      console.log('🔍 Found bot:', bot.name, 'with ID:', bot.id)

      // Mark integration as verified if this is the first successful webhook
      if (!integration.is_verified) {
        const updatedIntegrations = {
          ...integration,
          is_verified: true,
          webhook_verified_at: new Date().toISOString()
        }
        
        await supabase
          .from('bots')
          .update({ integrations: updatedIntegrations })
          .eq('id', bot.id)
      }

      // Extract message content based on type
      let messageContent: any = { type: messageType }
      let textContent = ''

      switch (messageType) {
        case 'text':
          textContent = text?.body || ''
          messageContent = { ...messageContent, text: text?.body }
          break
        case 'image':
          messageContent = { ...messageContent, image }
          textContent = image?.caption || '[Image]'
          break
        case 'document':
          messageContent = { ...messageContent, document }
          textContent = document?.caption || `[Document: ${document?.filename}]`
          break
        case 'audio':
          messageContent = { ...messageContent, audio }
          textContent = '[Audio message]'
          break
        case 'sticker':
          // Guardamos el objeto sticker y marcamos is_sticker para renderizarlo
          // sin globo. Se almacena como 'image' para respetar el CHECK de message_type.
          messageContent = { ...messageContent, sticker, is_sticker: true }
          textContent = '[Sticker]'
          break
        case 'video':
          messageContent = { ...messageContent, video }
          textContent = video?.caption || '[Video]'
          break
        case 'location':
          messageContent = { ...messageContent, location }
          textContent = location.name || location.address ? `📍 ${location.name || ''} ${location.address || ''}`.trim() : '📍 Ubicación compartida'
          break
        case 'button':
          // Handle button replies (Quick Replies)
          messageContent = { ...messageContent, button: message.button }
          textContent = message.button?.text || '[Button Reply]'
          break
        case 'interactive':
          // Handle interactive messages (List replies, etc.)
          if (message.interactive?.type === 'button_reply') {
             messageContent = { ...messageContent, interactive: message.interactive }
             textContent = message.interactive.button_reply?.title || '[Button Reply]'
          } else if (message.interactive?.type === 'list_reply') {
             messageContent = { ...messageContent, interactive: message.interactive }
             textContent = message.interactive.list_reply?.title || '[List Reply]'
          } else {
             textContent = '[Interactive Message]'
          }
          break
        case 'reaction':
          // WhatsApp manda las reacciones (emoji a un mensaje) como un mensaje aparte.
          // Guardamos el emoji y a qué mensaje reaccionó; lo mostramos legible.
          messageContent = { ...messageContent, reaction: message.reaction }
          textContent = message.reaction?.emoji
            ? `Reaccionó con ${message.reaction.emoji}`
            : 'Quitó su reacción'
          break
        default:
          textContent = `[${messageType} message]`
      }

      // Check for duplicate messages (check metadata for whatsapp_message_id)
      // MOVED UP for parallel execution
      /* 
      const { data: existingMessage } = await supabase
        .from('messages')
        .select('id')
        .filter('metadata->>whatsapp_message_id', 'eq', whatsappMessageId)
        .maybeSingle()

      if (existingMessage) {
        continue // Skip duplicate messages
      }
      */

      // OPTIMIZATION: Parallelize Conversation and Client Lookup
      
      // 1. Find conversation
      // Flexible search to handle 549 vs local numbers
      let convQuery = supabase
        .from('conversations')
        .select('*')
        .eq('bot_id', bot.id);

      // If senderPhone is Argentina mobile (549...), check for local version too
      if (senderPhone.startsWith('549')) {
         const shortPhone = senderPhone.substring(3); 
         convQuery = convQuery.or(`client_phone.eq.${senderPhone},client_phone.eq.${shortPhone}`);
      } else {
         convQuery = convQuery.eq('client_phone', senderPhone);
      }

      const conversationPromise = convQuery
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      // 2. Find client (Generate phone variations for lookup)
      const phoneVariations = [senderPhone];
      // Argentina specific logic
      if (senderPhone.startsWith('549')) {
        phoneVariations.push(senderPhone.substring(3));
        phoneVariations.push('54' + senderPhone.substring(3));
      }

      const clientPromise = supabase
        .from('clients')
        .select('id')
        .eq('user_id', bot.user_id)
        .in('phone', phoneVariations)
        .maybeSingle()

      const [conversationResult, clientResult] = await Promise.all([conversationPromise, clientPromise])
      
      const conversation = conversationResult.data
      const client = clientResult.data

      if (client) {
        // Update existing client's last interaction (Fire and forget)
        supabase
          .from('clients')
          .update({ last_interaction_at: new Date().toISOString() })
          .eq('id', client.id)
          .then(() => console.log('✅ Updated client last interaction:', client.id))
          .catch(err => console.error('Error updating client:', err))
      } else {
        // Optional: Create new client if not exists? 
        // For now, we'll just log it. The user might want to create clients automatically later.
        console.log('ℹ️ No client found for phone:', senderPhone)
      }

      let conversationId = conversation?.id

      if (!conversation) {
        // Create new conversation
        const { data: newConversation, error: createError } = await supabase
          .from('conversations')
          .insert({
            user_id: bot.user_id,
            bot_id: bot.id,
            client_phone: senderPhone,
            client_name: senderName || senderPhone, // Use actual name from WhatsApp profile
            platform: 'whatsapp',
            status: 'active'
          })
          .select()
          .single()

        if (createError) {
          console.error('Error creating conversation:', createError)
          continue
        }

        conversationId = newConversation.id
      } else {
        // Update conversation name if we have a better name and current name is just the phone
        if (senderName && conversation.client_name === senderPhone) {
          await supabase
            .from('conversations')
            .update({ client_name: senderName })
            .eq('id', conversation.id)
        }

        // Update phone number to international format if we found a match with a different (likely short) number
        // This ensures we migrate local numbers to international format on new activity
        if (senderPhone.startsWith('549') && conversation.client_phone !== senderPhone) {
           await supabase
            .from('conversations')
            .update({ client_phone: senderPhone })
            .eq('id', conversation.id);
        }
      }

      // Store the message
      // IMPORTANT: Map WhatsApp message types to our internal types
      let internalMessageType = 'text';
      if (['image', 'audio', 'document', 'video', 'location'].includes(messageType)) {
        internalMessageType = messageType;
      } else if (messageType === 'sticker') {
        // Los stickers se almacenan como 'image' (CHECK-safe) y se distinguen por metadata.is_sticker
        internalMessageType = 'image';
      }
      // Treat buttons and interactive messages as text for storage purposes, 
      // but keep the original type in metadata
      
      const { data: storedMessage, error: messageError } = await supabase
        .from('messages')
        .insert({
          conversation_id: conversationId,
          content: textContent,
          sender_type: 'client',
          message_type: internalMessageType,
          metadata: {
            whatsapp_message_id: whatsappMessageId,
            original_type: messageType,
            context, // Store context in metadata
            ...messageContent
          }
        })
        .select()
        .single()

      if (messageError) {
        console.error('Error storing message:', messageError)
        continue
      }

      // Marca el último mensaje entrante del cliente: define la ventana de 24 hs
      await supabase
        .from('conversations')
        .update({ last_client_message_at: new Date().toISOString(), last_message_at: new Date().toISOString() })
        .eq('id', conversationId)

      console.log('✅ Message stored successfully')

      // Only process AI response for text messages (for now)
      // Also process button replies and interactive messages as text
      // Also process images (for receipts/comprobantes) and audio
      const shouldProcessAI = (['text', 'button', 'interactive', 'image', 'audio', 'location'].includes(messageType));

      if (shouldProcessAI) {
        // Check if conversation is paused
        if (conversation && conversation.status === 'paused') {
          // Check if pause has expired
          if (conversation.paused_until) {
            const pausedUntil = new Date(conversation.paused_until)
            const now = new Date()
            
            if (now > pausedUntil) {
              console.log('▶️ Pause expired, reactivating AI...')
              // Update status to active
              await supabase
                .from('conversations')
                .update({ status: 'active', paused_until: null })
                .eq('id', conversationId)
              
              // Continue to process message as normal
            } else {
              console.log('⏸️ Conversation is paused until ' + pausedUntil.toISOString() + ', skipping AI response')
              continue
            }
          } else {
            // Indefinite pause
            console.log('⏸️ Conversation is paused indefinitely, skipping AI response')
            continue
          }
        }

        // DEBOUNCE LOGIC: Wait 7 seconds to see if more messages arrive
        // This allows grouping multiple rapid messages into a single AI response
        console.log('⏳ Waiting 7s for potential follow-up messages...')
        await new Promise(resolve => setTimeout(resolve, 7000))

        // Check if any newer messages exist for this conversation
        const { data: newerMessages } = await supabase
          .from('messages')
          .select('id')
          .eq('conversation_id', conversationId)
          .gt('created_at', storedMessage.created_at)
          .limit(1)
        
        if (newerMessages && newerMessages.length > 0) {
          console.log('⏭️ Newer message detected, skipping response for this message')
          continue
        }

        console.log('⚡ No newer messages, generating response...')
        
        // Extract media ID if present (for images or audio)
        const mediaId = messageType === 'image' ? message.image?.id : (messageType === 'audio' ? message.audio?.id : undefined);
        
        await generateAndSendAIResponse(integration, conversationId, senderPhone, textContent, bot.id, senderName, origin, mediaId)
      }

    } catch (error) {
      console.error('Error processing individual message:', error)
    }
  }
}

async function generateAndSendAIResponse(
  integration: any,
  conversationId: string,
  senderPhone: string,
  userMessage: string,
  botId: string,
  senderName?: string,
  origin?: string,
  mediaId?: string
) {
  try {
    // Generate AI response using webhook-specific chat API
    let baseUrl = origin;
    if (!baseUrl) {
      if (process.env.NEXTAUTH_URL) {
        baseUrl = process.env.NEXTAUTH_URL;
      } else if (process.env.VERCEL_URL) {
        baseUrl = `https://${process.env.VERCEL_URL}`;
      } else {
        baseUrl = 'http://localhost:3000';
      }
    }
    
    // Force HTTP for localhost to avoid SSL errors in development
    if (baseUrl.includes('localhost')) {
      baseUrl = baseUrl.replace('https://', 'http://');
    }
    
    const chatApiUrl = `${baseUrl}/api/chat/webhook`
    
    const response = await fetch(chatApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: userMessage,
        conversationId,
        botId: botId,
        senderPhone,
        senderName,
        platform: 'whatsapp',
        mediaId // Pass mediaId to the chat webhook
      })
    })

    if (!response.ok) {
      console.error('Error generating AI response:', response.statusText)
      return
    }

    const aiResponse = await response.json()
    
    if (aiResponse.response) {
      // Token propio del cliente primero (configuración manual / legacy):
      // el System Token solo sirve para WABAs conectados vía Embedded Signup.
      const accessToken = integration.config?.access_token || process.env.WHATSAPP_SYSTEM_TOKEN
      const phoneNumberId = integration.config?.phone_number_id

      if (!accessToken || !phoneNumberId) {
        console.error('Missing WhatsApp credentials (no system token in env and no per-client token in config)')
        return
      }

      // Send response via WhatsApp
      const sent = await sendWhatsAppMessage(accessToken, phoneNumberId, senderPhone, aiResponse.response)

      if (sent) {
        // Log usage for AI response
        const supabase = createAdminClient()
        await supabase.from('usage_logs').insert({
          user_id: integration.user_id,
          type: 'ai_response',
          amount: 1,
          description: `Respuesta IA a ${senderPhone} (WhatsApp)`
        })
      }
    }

  } catch (error) {
    console.error('Error generating AI response:', error)
  }
}

async function sendWhatsAppMessage(accessToken: string, phoneNumberId: string, recipientPhone: string, message: string) {
  try {
    // Normalize phone number for Argentina (remove extra 9)
    let normalizedPhone = recipientPhone
    if (recipientPhone.startsWith('549')) {
      normalizedPhone = '54' + recipientPhone.substring(3)
    }
    
    // Clean message to avoid encoding issues
    const cleanMessage = message
      .replace(/[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, '')
      .replace(/[^\x00-\xFF]/g, '')
      .trim()
    
    const tokenToUse = accessToken.trim()

    const requestBody = {
      messaging_product: 'whatsapp',
      to: normalizedPhone,
      type: 'text',
      text: {
        body: cleanMessage
      }
    }
    
    const graphVersion = process.env.META_GRAPH_VERSION || 'v21.0'
    const response = await fetch(`https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tokenToUse}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    })

    if (!response.ok) {
      const errorData = await response.json()
      console.error('WhatsApp API Error:', errorData)
      return
    }

    await response.json()
    return true

  } catch (error) {
    console.error('Error sending WhatsApp message:', error)
    return false
  }
}