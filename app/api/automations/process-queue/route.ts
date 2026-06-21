import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { createNotification } from '@/lib/notifications'
import { getWhatsAppToken, getInstagramToken, getGraphVersion } from '@/lib/meta/credentials'

// Endpoint para procesar la cola de mensajes programados
// Se puede llamar manualmente o desde un cron job
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const MAX_DURATION = 55000; // 55 segundos de límite de seguridad (para evitar timeouts de Vercel)

  try {
    const { batch_size = 100, user_id } = await request.json().catch(() => ({}))

    console.log('🚀 Processing message queue...', { batch_size, user_id })

    const supabase = createAdminClient()

    let totalProcessed = 0
    let totalFailed = 0
    let keepProcessing = true
    let loopCount = 0

    while (keepProcessing) {
      loopCount++

      // Verificar límite de tiempo
      if (Date.now() - startTime > MAX_DURATION) {
        console.log('⏳ Time limit reached, stopping execution to avoid timeout')
        break
      }

      // Obtener mensajes pendientes o fallidos (para reintentar)
      let query = supabase
        .from('scheduled_messages')
        .select(`
          *,
          automations!inner(*, bots!inner(*)),
          clients(name, phone)
        `)
        .in('status', ['pending', 'failed']) // Incluir fallidos para reintento
        .lt('retry_count', 3) // Solo si no han superado el límite de intentos
        .lte('scheduled_for', new Date().toISOString())
        .order('priority', { ascending: true })
        .order('scheduled_for', { ascending: true })
        .limit(batch_size)

      // Filtrar por usuario si se especifica
      if (user_id) {
        query = query.eq('user_id', user_id)
      }

      const { data: pendingMessages, error: fetchError } = await query

      if (fetchError) {
        console.error('❌ Error fetching pending messages:', fetchError)
        return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 })
      }

      if (!pendingMessages || pendingMessages.length === 0) {
        console.log('ℹ️ No more pending messages to process')
        keepProcessing = false
        break
      }

      console.log(`Batch #${loopCount}: Found ${pendingMessages.length} messages to process`)

      let batchProcessed = 0
      let batchFailed = 0

      // Procesar mensajes en paralelo con concurrencia limitada
      const CONCURRENCY = 10;

      for (let i = 0; i < pendingMessages.length; i += CONCURRENCY) {
        const chunk = pendingMessages.slice(i, i + CONCURRENCY);

        // Marcar lote como procesando
        await supabase
          .from('scheduled_messages')
          .update({ status: 'processing', updated_at: new Date().toISOString() })
          .in('id', chunk.map(m => m.id));

        // Procesar lote en paralelo
        const results = await Promise.all(chunk.map(async (message) => {
          try {
            // Determinar la plataforma del bot
            const bot = message.automations.bots
            const platform = bot.platform

            // Enviar usando la función unificada multi-plataforma
            const result = await sendMessage(message, bot)
            const success = result.success
            const externalMessageId = result.messageId || null
            const errorMessage = result.error || null

            // Crear log de la ejecución (PRIMERO, antes de borrar el mensaje)
            await supabase
              .from('automation_logs')
              .insert({
                automation_id: message.automation_id,
                client_id: message.client_id,
                scheduled_message_id: message.id,
                log_type: success ? 'sent' : 'failed',
                message_content: message.message_content,
                recipient_phone: message.recipient_phone,
                success: success,
                error_details: errorMessage,
                external_message_id: externalMessageId
              })

            if (success) {
              console.log(`✅ Message sent successfully via ${platform}:`, externalMessageId)

              // Registrar consumo en usage_logs (Mensaje Masivo)
              await supabase.from('usage_logs').insert({
                user_id: message.user_id,
                type: 'mass_message',
                amount: 1, // Cantidad de mensajes
                description: `Mensaje masivo a ${message.recipient_phone} (${bot.platform})`
              });

              // Marcar como enviado
              await supabase
                .from('scheduled_messages')
                .update({ status: 'sent', sent_at: new Date().toISOString() })
                .eq('id', message.id)

              return { success: true, id: message.id }
            } else {
              console.error(`❌ Failed to send ${platform} message:`, errorMessage)

              // Notificar error
              await createNotification({
                userId: message.user_id,
                title: "Error en automatización",
                message: `Fallo al enviar a ${message.recipient_name || message.recipient_phone}: ${errorMessage}`,
                type: "error",
                link: `/dashboard/automatizaciones`
              });

              // Actualizar estado a fallido (NO BORRAR)
              // Lógica de reintentos inteligente:
              // Solo incrementar el contador de intentos si ha pasado un día desde el último intento
              // Esto permite que el cron siga intentando enviar (por si se libera el límite)
              // pero sin agotar los 3 intentos permitidos en un solo día.
              
              const lastUpdate = new Date(message.updated_at)
              const now = new Date()
              const isSameDay = lastUpdate.toDateString() === now.toDateString()
              
              let newRetryCount = message.retry_count || 0
              
              // Si es el primer intento (0) o si es un día diferente, incrementamos
              // Si es el mismo día y ya falló una vez, NO incrementamos (para no gastar intentos por límites diarios)
              if (!isSameDay || newRetryCount === 0) {
                 newRetryCount++
              }

              await supabase
                .from('scheduled_messages')
                .update({
                  status: 'failed',
                  error_message: errorMessage,
                  retry_count: newRetryCount,
                  updated_at: new Date().toISOString()
                })
                .eq('id', message.id)

              return { success: false, id: message.id, error: errorMessage }
            }

          } catch (messageError) {
            console.error('💥 Error processing message:', message.id, messageError)
            return { success: false, id: message.id, error: 'Unknown error' }
          }
        }));

        batchProcessed += results.filter(r => r.success).length;
        batchFailed += results.filter(r => !r.success).length;
      }

      totalProcessed += batchProcessed
      totalFailed += batchFailed

      // Si obtuvimos menos mensajes que el tamaño del lote, significa que ya no hay más
      if (pendingMessages.length < batch_size) {
        keepProcessing = false
      }
    }

    // Contar mensajes restantes totales
    const { count: remainingCount } = await supabase
      .from('scheduled_messages')
      .select('*', { count: 'exact', head: true })
      .in('status', ['pending', 'failed'])
      .lt('retry_count', 3)
      .lte('scheduled_for', new Date().toISOString())

    console.log('📊 Processing completed:', { totalProcessed, totalFailed, remaining: remainingCount || 0 })

    return NextResponse.json({
      processed: totalProcessed,
      failed: totalFailed,
      remaining: remainingCount || 0,
      success: true,
      loops: loopCount
    })

  } catch (error) {
    console.error('💥 Queue processing error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

// Helper function to log automation messages to conversation history
async function logMessageToConversation(supabase: any, message: any, bot: any, externalMessageId: string | null) {
  try {
    // 1. Find or create conversation
    let conversationId = null;
    
    // Try to find existing conversation by phone (most reliable identifier)
    // We need to handle potential format differences (e.g. 549 vs local)
    // So we search for exact match OR if the stored phone ends with the recipient phone (for local numbers)
    
    let query = supabase
      .from('conversations')
      .select('id, client_id, client_phone')
      .eq('bot_id', bot.id);
      
    // Construct a flexible phone search
    // If phone is short (e.g. 10 digits), it might be a suffix of the full international number
    const cleanPhone = message.recipient_phone.replace(/\D/g, ''); // Remove non-digits
    
    if (cleanPhone.length >= 7) {
       // Search for exact match OR if the DB phone ends with our phone (handling 549 prefix vs local)
       // We use ilike with % suffix to match the end of the string
       query = query.or(`client_phone.eq.${message.recipient_phone},client_phone.ilike.%${cleanPhone}`);
    } else {
       query = query.eq('client_phone', message.recipient_phone);
    }
    
    const { data: existingConvs } = await query;
    
    // Sort by length descending to prioritize longer numbers (international format)
    // This ensures that if we have '261...' and '549261...', we pick '549261...'
    const existingConv = existingConvs?.sort((a, b) => b.client_phone.length - a.client_phone.length)[0];
      
    if (existingConv) {
      conversationId = existingConv.id;
      
      // Update client_id if missing in conversation but present in message
      if (!existingConv.client_id && message.client_id) {
         await supabase
           .from('conversations')
           .update({ client_id: message.client_id })
           .eq('id', conversationId);
      }
    } else {
      // Create new conversation
      let clientName = message.recipient_name || 'Cliente';
      
      // If we have client_id, try to get name from clients table
      if (message.client_id) {
        const { data: client } = await supabase
          .from('clients')
          .select('name')
          .eq('id', message.client_id)
          .single();
          
        if (client && client.name) clientName = client.name;
      }

      // Determine the phone number to save
      // We prefer the international format (with prefix) to avoid duplicates
      let phoneToSave = message.recipient_phone;
      
      // Heuristic for Argentina (based on user request):
      // If the number is 10 digits (local mobile), prepend 549
      if (cleanPhone.length === 10) {
         phoneToSave = '549' + cleanPhone;
      }
        
      const { data: newConv, error: createError } = await supabase
        .from('conversations')
        .insert({
          user_id: message.user_id,
          bot_id: bot.id,
          client_id: message.client_id,
          client_name: clientName,
          client_phone: phoneToSave,
          platform: bot.platform,
          status: 'active',
          last_message_at: new Date().toISOString()
        })
        .select('id')
        .single();
        
      if (newConv) conversationId = newConv.id;
      if (createError) {
        // If creation failed (e.g. race condition), try to fetch again
        console.error('Error creating conversation, retrying fetch:', createError);
        
        // Retry with the same flexible logic
        let retryQuery = supabase
          .from('conversations')
          .select('id')
          .eq('bot_id', bot.id);
          
        if (cleanPhone.length >= 7) {
           retryQuery = retryQuery.or(`client_phone.eq.${message.recipient_phone},client_phone.ilike.%${cleanPhone}`);
        } else {
           retryQuery = retryQuery.eq('client_phone', message.recipient_phone);
        }
          
        const { data: retryConvs } = await retryQuery.limit(1);
        if (retryConvs?.[0]) conversationId = retryConvs[0].id;
      }
    }
    
    if (conversationId) {
      // Determine content
      let content = message.message_content;
      if (message.metadata?.is_meta_template) {
        content = content || `[Plantilla: ${message.metadata.template_name}]`;
      }

      // 2. Insert message
      await supabase.from('messages').insert({
        conversation_id: conversationId,
        content: content,
        sender_type: 'bot',
        message_type: 'text', 
        metadata: {
          sent_by: 'automation',
          automation_id: message.automation_id,
          whatsapp_message_id: externalMessageId,
          status: 'sent',
          is_template: message.metadata?.is_meta_template
        }
      });
      
      // 3. Update conversation timestamp
      await supabase
        .from('conversations')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', conversationId);
    }
  } catch (error) {
    console.error('Error logging automation message to conversation:', error);
  }
}

// Función para enviar mensaje según la plataforma
async function sendMessage(message: any, bot: any): Promise<{ success: boolean, messageId?: string, error?: string }> {
  try {
    switch (bot.platform) {
      case 'whatsapp':
        return await sendWhatsAppMessage(message, bot)
      case 'instagram':
        return await sendInstagramMessage(message, bot)
      case 'gmail':
        return await sendGmailMessage(message, bot)
      default:
        return { success: false, error: `Unsupported platform: ${bot.platform}` }
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown sending error'
    }
  }
}

// Función para enviar mensaje por WhatsApp
async function sendWhatsAppMessage(message: any, bot: any): Promise<{ success: boolean, messageId?: string, error?: string }> {
  try {
    // Obtener configuración de WhatsApp desde integrations
    const supabase = createAdminClient()

    const { data: integration, error: configError } = await supabase
      .from('integrations')
      .select('*')
      .eq('user_id', message.user_id)
      .eq('platform', 'whatsapp')
      .eq('is_active', true)
      .single()

    if (configError || !integration || !integration.config) {
      console.error('[WhatsApp] Configuration not found:', configError)
      return { success: false, error: 'WhatsApp integration not found or inactive' }
    }

    // Extraer la configuración del JSONB
    const whatsappConfig = integration.config
    const whatsappToken = getWhatsAppToken(integration)

    if (!whatsappConfig.phone_number_id || !whatsappToken) {
      console.error('[WhatsApp] Missing required config fields:', whatsappConfig)
      return { success: false, error: 'WhatsApp configuration incomplete' }
    }

    // Preparar el mensaje para WhatsApp Business API
    let messagePayload: any = {
      messaging_product: 'whatsapp',
      to: message.recipient_phone
    }

    // Verificar si es una plantilla de Meta o mensaje de texto simple
    if (message.metadata?.is_meta_template) {
      messagePayload.type = 'template';
      
      // Usar componentes pre-construidos si existen (nueva lógica)
      let components = message.metadata.whatsapp_components;

      // Fallback para compatibilidad hacia atrás (lógica antigua)
      if (!components && message.metadata.template_parameters) {
        components = [
          {
            type: 'body',
            parameters: message.metadata.template_parameters || []
          }
        ];
      }

      messagePayload.template = {
        name: message.metadata.template_name,
        language: {
          code: message.metadata.template_language || 'es'
        },
        components: components || []
      };
    } else {
      messagePayload.type = 'text';
      messagePayload.text = {
        body: message.message_content
      };
    }

    console.log('[WhatsApp] Sending payload:', JSON.stringify(messagePayload, null, 2))

    // Enviar via WhatsApp Business API
    const response = await fetch(`https://graph.facebook.com/${getGraphVersion()}/${whatsappConfig.phone_number_id}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${whatsappToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(messagePayload)
    })

    const result = await response.json()
    console.log('[WhatsApp] API Response:', JSON.stringify(result, null, 2))

    if (response.ok && result.messages && result.messages[0]) {
      return {
        success: true,
        messageId: result.messages[0].id
      }
    } else {
      return {
        success: false,
        error: result.error?.message || 'Failed to send WhatsApp message'
      }
    }

  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown WhatsApp error'
    }
  }
}

// Función para enviar mensaje por Instagram
async function sendInstagramMessage(message: any, bot: any): Promise<{ success: boolean, messageId?: string, error?: string }> {
  try {
    // Obtener configuración de Instagram desde integrations
    const supabase = createAdminClient()

    const { data: integration, error: configError } = await supabase
      .from('integrations')
      .select('*')
      .eq('user_id', message.user_id)
      .eq('platform', 'instagram')
      .eq('is_active', true)
      .single()

    if (configError || !integration || !integration.config) {
      console.error('[Instagram] Configuration not found:', configError)
      return { success: false, error: 'Instagram integration not found or inactive' }
    }

    // Extraer la configuración del JSONB
    const instagramConfig = integration.config
    const instagramToken = getInstagramToken(integration)

    if (!instagramConfig.page_id || !instagramToken) {
      console.error('[Instagram] Missing required config fields:', instagramConfig)
      return { success: false, error: 'Instagram configuration incomplete' }
    }

    // Preparar el mensaje para Instagram Messaging API
    const messagePayload = {
      recipient: {
        id: message.recipient_instagram_id
      },
      message: {
        text: message.message_content
      }
    }

    // Enviar via Instagram Messaging API
    const response = await fetch(`https://graph.facebook.com/${getGraphVersion()}/${instagramConfig.page_id}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${instagramToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(messagePayload)
    })

    const result = await response.json()

    if (response.ok && result.message_id) {
      return {
        success: true,
        messageId: result.message_id
      }
    } else {
      return {
        success: false,
        error: result.error?.message || 'Failed to send Instagram message'
      }
    }

  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown Instagram error'
    }
  }
}

// Función para enviar Gmail
async function sendGmailMessage(message: any, bot: any): Promise<{ success: boolean, messageId?: string, error?: string }> {
  try {
    // Obtener configuración de gmail del bot
    const supabase = createAdminClient()
    const { data: gmailConfig, error: configError } = await supabase
      .from('integrations')
      .select('*')
      .eq('user_id', bot.user_id)
      .eq('platform', 'gmail')
      .eq('is_active', true)
      .single()

    if (configError || !gmailConfig) {
      return { success: false, error: 'Gmail integration not found or inactive' }
    }

    let result: any

    switch (gmailConfig.config.provider) {
      case 'sendgrid':
        result = await sendViaSendGrid(message, gmailConfig.config)
        break
      case 'mailgun':
        result = await sendViaMailgun(message, gmailConfig.config)
        break
      case 'ses':
        result = await sendViaSES(message, gmailConfig.config)
        break
      default:
        return { success: false, error: `Unsupported email provider: ${gmailConfig.config.provider}` }
    }

    return result

  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown email error'
    }
  }
}

// Enviar email via SendGrid
async function sendViaSendGrid(message: any, config: any): Promise<{ success: boolean, messageId?: string, error?: string }> {
  try {
    const emailPayload = {
      personalizations: [{
        to: [{ email: message.recipient_email }],
        subject: message.subject || 'Mensaje automático'
      }],
      from: { email: config.from_email, name: config.from_name },
      content: [{
        type: 'text/plain',
        value: message.message_content
      }]
    }

    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.api_key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(emailPayload)
    })

    if (response.ok) {
      const messageId = response.headers.get('x-message-id') || 'sendgrid_sent'
      return { success: true, messageId }
    } else {
      const error = await response.text()
      return { success: false, error: `SendGrid error: ${error}` }
    }

  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'SendGrid sending error'
    }
  }
}

// Enviar email via Mailgun
async function sendViaMailgun(message: any, config: any): Promise<{ success: boolean, messageId?: string, error?: string }> {
  // Implementación similar para Mailgun
  return { success: false, error: 'Mailgun implementation pending' }
}

// Enviar email via Amazon SES
async function sendViaSES(message: any, config: any): Promise<{ success: boolean, messageId?: string, error?: string }> {
  // Implementación similar para Amazon SES
  return { success: false, error: 'SES implementation pending' }
}

// Endpoint GET para verificar el estado de la cola
export async function GET() {
  try {
    const supabase = createAdminClient()

    // Obtener estadísticas de la cola
    const { data: stats, error } = await supabase
      .from('scheduled_messages')
      .select('status')

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 })
    }

    const statusCounts = stats.reduce((acc: any, msg: any) => {
      acc[msg.status] = (acc[msg.status] || 0) + 1
      return acc
    }, {})

    return NextResponse.json({
      total: stats.length,
      by_status: statusCounts,
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}