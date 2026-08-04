import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import { getWhatsAppToken } from '@/lib/meta/credentials'
import { storeWhatsAppMedia } from '@/lib/meta/store-media'
import { handleQualityUpdate } from '@/lib/meta/quality'
import { getWhatsAppProvider } from '@/lib/whatsapp/provider'
import { waitUntil } from '@vercel/functions'

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
    //
    // LOS MENSAJES SE PROCESAN EN SEGUNDO PLANO. Antes se hacía `await` acá, y el
    // 200 a Meta salía recién al terminar TODO: los 7 segundos de la ventana de
    // escucha más lo que tardara la IA, entre 15 y 20 segundos. Meta reintenta si
    // tardás demasiado, y cada reintento es una oportunidad de mensaje duplicado.
    // Con waitUntil, el 200 sale al instante y el trabajo sigue corriendo.
    const pendientes: Promise<any>[] = []

    if (body.entry && body.entry.length > 0) {
      for (const entry of body.entry) {
        if (entry.changes && entry.changes.length > 0) {
          for (const change of entry.changes) {
            if (change.field === 'messages') {
              pendientes.push(
                processWhatsAppMessage(change.value, origin).catch((e) =>
                  console.error('Error procesando mensaje en segundo plano:', e),
                ),
              )
            } else if (change.field === 'phone_number_quality_update') {
              // Meta avisa acá cuando baja la calidad de un número. Es la única
              // señal temprana antes de que inhabilite el número o el negocio.
              try {
                await handleQualityUpdate(entry.id ?? null, change.value)
              } catch (e) {
                console.error('[WA quality] error procesando evento:', e)
              }
            } else {
              // COEXISTENCIA: campos como history / smb_message_echoes / smb_app_state_sync.
              // Por ahora los logueamos para ver el formato REAL de Meta y después
              // implementar el guardado exacto (sincronizar mensajes del celular).
              try {
                console.log('[WA coexistence] field:', change.field, JSON.stringify(change.value).slice(0, 2000))
              } catch { /* noop */ }
            }
          }
        }
      }
    }

    // El runtime mantiene viva la función hasta que estas promesas terminen, pero
    // la respuesta ya salió. Sin esto, el proceso se cortaría al retornar y el
    // mensaje quedaría sin contestar.
    if (pendientes.length > 0) waitUntil(Promise.all(pendientes))

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
      //
      // OJO: sin ORDER BY, un `limit(1)` sobre una cuenta con MÁS DE UN bot activo
      // devuelve cualquiera y puede variar entre requests. Como la conversación se
      // ataba al bot_id, el mismo cliente terminaba duplicado en la bandeja.
      // Orden fijo (el bot más antiguo) → siempre el mismo bot para el mismo número.
      const botPromise = supabase
        .from('bots')
        .select('*')
        .eq('user_id', integration.user_id)
        .contains('platforms', ['whatsapp'])
        .eq('is_active', true)
        .order('created_at', { ascending: true })
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
        case 'location': {
          messageContent = { ...messageContent, location }
          // Texto descriptivo para que la IA ENTIENDA que el cliente compartió una
          // ubicación (puede ser la suya o cualquier otra) y pueda usar la dirección
          // según el contexto (además del render del mapa en el chat).
          const locPlace = [location?.name, location?.address].filter(Boolean).join(' - ')
          const locCoords =
            location?.latitude != null && location?.longitude != null
              ? ` (lat: ${location.latitude}, long: ${location.longitude})`
              : ''
          textContent = `📍 El cliente compartió una ubicación${locPlace ? `: ${locPlace}` : ''}${locCoords}`
          break
        }
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
        case 'contacts': {
          // Tarjeta de contacto compartida: mostramos nombre y teléfonos.
          messageContent = { ...messageContent, contacts: message.contacts }
          const c = message.contacts?.[0]
          const cName = c?.name?.formatted_name || c?.name?.first_name || 'un contacto'
          const cPhones = (c?.phones || []).map((p: any) => p.phone).filter(Boolean).join(', ')
          textContent = `👤 El cliente compartió el contacto de ${cName}${cPhones ? ` (${cPhones})` : ''}`
          break
        }
        case 'order': {
          // Pedido armado desde el catálogo de WhatsApp.
          messageContent = { ...messageContent, order: message.order }
          const items = message.order?.product_items?.length || 0
          textContent = `🛒 El cliente envió un pedido del catálogo con ${items} producto${items === 1 ? '' : 's'}`
          break
        }
        case 'system':
          // Avisos de la plataforma (típico: el cliente cambió de número).
          messageContent = { ...messageContent, system: message.system }
          textContent = message.system?.body || 'WhatsApp envió un aviso del sistema'
          break
        case 'unsupported':
          // WhatsApp no puede entregar el contenido (formatos nuevos, encuestas,
          // algunas plantillas). Igual dejamos rastro para que el operador lo vea.
          messageContent = { ...messageContent, errors: message.errors }
          textContent =
            '⚠️ El cliente envió un mensaje que WhatsApp no puede mostrar acá. Revisalo desde el celular.'
          break
        default:
          // Tipo nuevo que Meta agregó y todavía no contemplamos: no se pierde,
          // queda visible con su nombre para poder detectarlo.
          messageContent = { ...messageContent, [messageType]: (message as any)[messageType] }
          textContent = `⚠️ Mensaje de tipo "${messageType}" recibido (todavía no se muestra completo acá)`
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
      // Se busca por CUENTA (user_id), no por bot_id: si la cuenta tiene más de un
      // bot, atarla al bot creaba una conversación nueva por cada bot y el mismo
      // cliente aparecía duplicado en la bandeja. El número es del negocio, así que
      // la charla es una sola sin importar qué bot la atienda.
      let convQuery = supabase
        .from('conversations')
        .select('*')
        .eq('user_id', integration.user_id)
        .eq('platform', 'whatsapp');

      // Variantes AR: 549XXX (WhatsApp) / 54XXX / XXX (local), para no duplicar
      // por diferencias de formato del mismo número.
      if (senderPhone.startsWith('549')) {
         const shortPhone = senderPhone.substring(3);
         convQuery = convQuery.or(
           `client_phone.eq.${senderPhone},client_phone.eq.${shortPhone},client_phone.eq.54${shortPhone}`
         );
      } else {
         convQuery = convQuery.eq('client_phone', senderPhone);
      }

      // La más activa primero: si ya quedaron duplicados de antes, se sigue usando
      // esa (la que tiene la charla real) en vez de abrir otra.
      const conversationPromise = convQuery
        .order('last_message_at', { ascending: false, nullsFirst: false })
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
        // El builder de Supabase devuelve un PromiseLike (sin .catch): si esta
        // actualización fallaba, el rechazo quedaba sin manejar en vez de loguearse.
        void supabase
          .from('clients')
          .update({ last_interaction_at: new Date().toISOString() })
          .eq('id', client.id)
          .then(({ error }) => {
            if (error) console.error('Error updating client:', error.message)
            else console.log('✅ Updated client last interaction:', client.id)
          })
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

      // Persistir la media en nuestro storage: Meta borra la media pasado un tiempo
      // y su URL expira, así que la descargamos y guardamos una URL permanente.
      let storedUrl: string | null = null
      const mediaObj: any =
        (messageContent as any).image ||
        (messageContent as any).video ||
        (messageContent as any).audio ||
        (messageContent as any).document ||
        (messageContent as any).sticker
      if (mediaObj?.stored_url) {
        // Evolution: la media ya la descargó y subió el webhook de Evolution.
        storedUrl = mediaObj.stored_url
      } else if (mediaObj?.id) {
        // Cloud API: descargar de Meta con el token (comportamiento histórico).
        const token = getWhatsAppToken(integration)
        if (token) {
          storedUrl = await storeWhatsAppMedia({
            mediaId: mediaObj.id,
            accessToken: token,
            userId: integration.user_id,
            kind: messageType,
          })
        }
      }

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
            ...messageContent,
            ...(storedUrl ? { stored_url: storedUrl } : {}),
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

        // DEBOUNCE LOGIC: ventana de escucha configurable por bot (default 7s).
        // Agrupa los mensajes que el cliente manda seguidos en una sola respuesta.
        const debounceMs = (Number(bot?.feature_config?.debounce_seconds) || 7) * 1000
        console.log(`⏳ Esperando ${debounceMs}ms (ventana de escucha)...`)
        await new Promise(resolve => setTimeout(resolve, debounceMs))

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

        // Pausa tomada durante la ventana de escucha: cortamos antes de gastar
        // una llamada a la IA.
        if (await isConversationPaused(conversationId)) {
          console.log('⏸️ Pausada durante la ventana de escucha, no se responde')
          continue
        }

        console.log('⚡ No newer messages, generating response...')
        
        // Extract media ID if present (for images or audio)
        const mediaId = messageType === 'image' ? message.image?.id : (messageType === 'audio' ? message.audio?.id : undefined);
        // Evolution: media ya guardada en el bucket; pasamos la URL para que la IA la baje.
        const mediaUrl = (messageContent as any)?.[messageType]?.stored_url || undefined

        await generateAndSendAIResponse(integration, conversationId, senderPhone, textContent, bot.id, senderName, origin, mediaId, mediaUrl)
      }

    } catch (error) {
      console.error('Error processing individual message:', error)
    }
  }
}

/**
 * Limpia el texto saliente de la IA.
 *
 * ANTES: para el proveedor 'cloud' se borraban los emojis y TODO lo que estuviera
 * fuera de Latin-1 (`[^\x00-\xFF]`). Eso no solo mataba los emojis: también se comía
 * la rayita larga (—), los puntos suspensivos (…), las comillas tipográficas (" ")
 * y las viñetas (•). El resultado eran frases cortadas y comas colgando al final
 * ("Necesito tu nombre, apellido, "), que es justo lo que se veía en la cuenta
 * conectada por Cloud API y no en las otras.
 *
 * Por eso los mensajes salían SIN emojis por WhatsApp aunque en el dashboard se
 * vieran bien: el filtro corría recién al enviar, después de guardar.
 *
 * AHORA no se borra ni se reemplaza ningún carácter: la Cloud API soporta UTF-8
 * igual que YCloud y Evolution, así que las tres integraciones mandan exactamente
 * el mismo texto. Si el negocio quiere emojis (o no), lo decide su prompt, no un
 * filtro nuestro. Solo queda normalización de espacios en blanco.
 */
function sanitizeOutgoingText(text: string): string {
  return (text || '')
    .replace(/ /g, ' ')  // espacio duro (NBSP) -> espacio normal
    .replace(/[ \t]+$/gm, '') // espacios sobrantes al final de cada renglon
    .trim()
}

/**
 * ¿La conversación está pausada AHORA? (lectura fresca de la base)
 *
 * Se usa como último control antes de enviar. Una pausa vencida no cuenta: de eso
 * se encarga la reactivación automática del flujo principal.
 */
async function isConversationPaused(conversationId: string): Promise<boolean> {
  try {
    const supabase = createAdminClient()
    const { data } = await supabase
      .from('conversations')
      .select('status, paused_until')
      .eq('id', conversationId)
      .maybeSingle()

    if (!data || data.status !== 'paused') return false
    if (!data.paused_until) return true // pausa indefinida
    return new Date(data.paused_until) > new Date()
  } catch (e) {
    // Ante un error de lectura preferimos NO bloquear la respuesta del bot.
    console.error('[pausa] no se pudo verificar el estado:', e)
    return false
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
  mediaId?: string,
  mediaUrl?: string
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
        mediaId, // Cloud API: id de Meta para descargar la media
        mediaUrl // Evolution: URL en el bucket ya subida
      })
    })

    if (!response.ok) {
      console.error('Error generating AI response:', response.statusText)
      return
    }

    const aiResponse = await response.json()

    if (aiResponse.response) {
      // RE-CHEQUEO DE PAUSA. El chequeo inicial ocurre ANTES del debounce (7s por
      // defecto) y de la generación de la IA: entre medio pueden pasar 10-20 s, que
      // es justo cuando un humano ve el mensaje y toma la conversación (desde /chat
      // o contestando por el celular). Sin esto, el bot contestaba igual y quedaban
      // dos respuestas pisadas.
      if (await isConversationPaused(conversationId)) {
        console.log('⏸️ Pausada mientras se generaba la respuesta: no se envía')
        return
      }

      // Capa de proveedores: cloud (Meta), ycloud o evolution, según la integración.
      const provider = getWhatsAppProvider(integration)
      if (!provider) {
        console.error('Missing WhatsApp provider configuration for integration')
        return
      }

      // Si el bot tiene "separar mensajes largos", el chat webhook devuelve varias partes.
      const parts: string[] = Array.isArray(aiResponse.messages) && aiResponse.messages.length > 0
        ? aiResponse.messages
        : [aiResponse.response]

      let sent = false
      for (let i = 0; i < parts.length; i++) {
        const cleanPart = sanitizeOutgoingText(parts[i])
        const result = await provider.sendText(senderPhone, cleanPart)
        sent = sent || result.success

        // El id que devuelve WhatsApp hay que pegarlo al mensaje que /api/chat/webhook
        // ya guardó ANTES de este envío. Sin él no se puede aparear el evento de
        // estado (whatsapp.message.updated) y la respuesta de la IA nunca muestra
        // tildes de entregado ni de leído.
        // Se busca por el texto SIN sanear: es el que quedó guardado. El saneado
        // recorta espacios y cambia los NBSP, así que buscar por `cleanPart`
        // fallaría justo en los mensajes donde la IA metió esos caracteres.
        if (result.success && result.messageId) {
          await attachWhatsAppId(conversationId, parts[i], result.messageId, cleanPart)
        }
        // Pequeña pausa entre mensajes para que se sienta natural
        if (i < parts.length - 1) {
          await new Promise((r) => setTimeout(r, 1200))
          // Con "separar mensajes largos" esto puede tardar varios segundos más:
          // si el humano entra en el medio, se corta acá y no se mandan las partes
          // que faltan.
          if (await isConversationPaused(conversationId)) {
            console.log('⏸️ Pausada entre partes: se cortan los mensajes restantes')
            break
          }
        }
      }

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

/**
 * Pega el id de WhatsApp al mensaje de la IA que ya estaba guardado.
 *
 * POR QUÉ HACE FALTA: el mensaje se persiste en /api/chat/webhook, que es quien
 * genera la respuesta, y recién después vuelve acá para enviarse. Cuando WhatsApp
 * devuelve el id, la fila ya existe y nadie la volvía a tocar — 1.188 respuestas
 * de IA quedaron sin id, y sin id el webhook de estados no encuentra a quién
 * aplicarle el "entregado" o el "leído".
 *
 * El apareo es por contenido porque no hay otra referencia compartida entre los
 * dos endpoints. Para que no enganche un mensaje viejo de texto idéntico ("hola",
 * "dale") se exige que sea reciente y que todavía no tenga id.
 */
async function attachWhatsAppId(
  conversationId: string,
  content: string,
  messageId: string,
  fallbackContent?: string
): Promise<void> {
  try {
    const admin = createAdminClient()
    const since = new Date(Date.now() - 5 * 60 * 1000).toISOString()

    const findRow = async (text: string) => {
      const { data } = await admin
        .from('messages')
        .select('id, metadata')
        .eq('conversation_id', conversationId)
        .eq('sender_type', 'bot')
        .eq('content', text)
        .is('wa_message_id', null)
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      return data
    }

    let row = await findRow(content)
    // Por si alguna vez lo que se guarda pasa a ser el texto ya saneado.
    if (!row && fallbackContent && fallbackContent !== content) {
      row = await findRow(fallbackContent)
    }
    if (!row) return

    await admin
      .from('messages')
      .update({ metadata: { ...(row.metadata as any || {}), whatsapp_message_id: messageId } })
      .eq('id', row.id)
  } catch (e) {
    // No es crítico: si falla, el mensaje se mandó igual y solo pierde los tildes.
    console.error('[WA] no se pudo guardar el id del mensaje de la IA:', e)
  }
}

