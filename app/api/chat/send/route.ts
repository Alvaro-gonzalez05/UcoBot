import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getGraphHost, getGraphVersion } from '@/lib/meta/credentials'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    console.log('Send Message Request:', JSON.stringify(body, null, 2))
    const { to, message, conversationId, replyToId } = body

    if (!to || !message || !conversationId) {
      console.error('Missing required fields:', { to, message, conversationId })
      return NextResponse.json(
        { error: 'Missing required fields: to, message, conversationId' },
        { status: 400 }
      )
    }

    const supabase = createAdminClient()

    // Get conversation to find bot and user
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('*, bots(*)')
      .eq('id', conversationId)
      .single()

    if (convError || !conversation) {
      console.error('Conversation not found:', conversationId)
      return NextResponse.json(
        { error: 'Conversation not found' },
        { status: 404 }
      )
    }

    console.log('Found conversation:', { id: conversation.id, platform: conversation.platform, status: conversation.status })

    // Enforce rule: Manual messages only allowed when AI is paused
    if (conversation.status !== 'paused') {
      return NextResponse.json(
        { error: 'Cannot send manual messages while AI is active. Please pause the AI first.' },
        { status: 403 }
      )
    }

    const bot = conversation.bots
    if (!bot) {
      return NextResponse.json(
        { error: 'Bot not found for this conversation' },
        { status: 404 }
      )
    }

    const platform = conversation.platform

    // Get integration for the user and platform
    const { data: integrations, error: integrationError } = await supabase
      .from('integrations')
      .select('*')
      .eq('user_id', bot.user_id)
      .eq('platform', platform)
      .eq('is_active', true)

    if (integrationError || !integrations || integrations.length === 0) {
      return NextResponse.json(
        { error: `No active ${platform} integration found` },
        { status: 404 }
      )
    }

    const integration = integrations[0]

    // WhatsApp: prefer app-level System Token (Embedded Signup). Fallback to per-client token (legacy).
    // Instagram: per-client Page Access Token (Facebook Login flow gives this per user).
    const accessToken = platform === 'whatsapp'
      ? (process.env.WHATSAPP_SYSTEM_TOKEN || integration.config?.access_token)
      : integration.config?.access_token

    if (!accessToken) {
      return NextResponse.json(
        { error: `Invalid configuration: missing access token for ${platform}` },
        { status: 500 }
      )
    }

    // PARALLEL EXECUTION STRATEGY:
    // We launch the WhatsApp/Instagram request AND the Database Insert simultaneously.
    // This ensures the message leaves our server towards the client at the earliest possible millisecond.
    
    // 1. Prepare DB Insert Promise
    const metadata: any = {
      sent_by: 'agent',
      status: 'sending'
    }
    
    if (replyToId) {
      metadata.context = { id: replyToId }
    }

    const dbInsertPromise = supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        content: message,
        sender_type: 'bot', 
        message_type: 'text',
        metadata: metadata
      })
      .select()
      .single()

    // 2. Prepare Platform Send Promise
    let sendPromise;
    if (platform === 'whatsapp') {
        const phoneNumberId = integration.config?.phone_number_id
        if (!phoneNumberId) {
             return NextResponse.json({ error: 'Invalid WhatsApp configuration' }, { status: 500 })
        }
        sendPromise = sendWhatsAppMessage(accessToken, phoneNumberId, to, message, replyToId)
    } else if (platform === 'instagram') {
        sendPromise = sendInstagramMessage(accessToken, to, message)
    } else {
        console.error('Unsupported platform:', platform)
        return NextResponse.json({ error: `Unsupported platform: ${platform}` }, { status: 400 })
    }

    // 3. FIRE AND FORGET (Ultra-fast response)
    // We await the DB insert to ensure we have a record, but we do NOT await the WhatsApp API call.
    // We let it run in the background and update the DB status when it finishes.
    
    const dbResult = await dbInsertPromise
    
    if (dbResult.error) {
      console.error('Error storing initial message:', dbResult.error)
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    }
    
    const insertedMessage = dbResult.data

    // Handle Platform Send in Background
    sendPromise
      .then(async (result) => {
        if (!result.success) {
          throw new Error(result.error || 'Failed to send message')
        }
        
        // Success: Update DB
        const updateMetadata: any = {
          ...metadata, // Keep existing metadata (like context)
          status: 'sent',
          platform_message_id: result.messageId
        }

        // For WhatsApp, explicitly set whatsapp_message_id to match webhook format
        if (platform === 'whatsapp') {
          updateMetadata.whatsapp_message_id = result.messageId
        }

        await supabase
          .from('messages')
          .update({
            metadata: updateMetadata
          })
          .eq('id', insertedMessage.id)
      })
      .catch(async (error) => {
        console.error('Background send error:', error)
        // Failure: Update DB
        await supabase
          .from('messages')
          .update({
            metadata: {
              sent_by: 'agent',
              status: 'failed',
              error: error.message || 'Unknown error'
            }
          })
          .eq('id', insertedMessage.id)
      })

    // Return immediately!
    return NextResponse.json({ 
      success: true, 
      messageId: 'pending', // We don't have it yet
      status: 'queued'
    })

  } catch (error) {
    console.error('Error sending message:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

async function sendWhatsAppMessage(
  accessToken: string,
  phoneNumberId: string,
  recipientPhone: string,
  message: string,
  replyToId?: string
) {
  try {
    // Normalize phone number for Argentina (remove extra 9)
    let normalizedPhone = recipientPhone
    if (recipientPhone.startsWith('549')) {
      normalizedPhone = '54' + recipientPhone.substring(3)
    }

    const requestBody: any = {
      messaging_product: 'whatsapp',
      to: normalizedPhone,
      type: 'text',
      text: { body: message }
    }

    if (replyToId) {
      requestBody.context = { message_id: replyToId }
    }

    const graphVersion = process.env.META_GRAPH_VERSION || 'v21.0'
    const response = await fetch(`https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    })

    const data = await response.json()

    if (!response.ok) {
      console.error('WhatsApp API Error:', data)
      return { success: false, error: data.error?.message || 'Unknown error' }
    }

    return { success: true, messageId: data.messages?.[0]?.id }
  } catch (error) {
    console.error('Error sending WhatsApp message:', error)
    return { success: false, error: 'Network error' }
  }
}

async function sendInstagramMessage(accessToken: string, recipientId: string, message: string) {
    try {
        const host = getGraphHost(accessToken);
        const version = getGraphVersion();

        console.log(`Sending Instagram message via ${host} (${version}) to ${recipientId}`);

        const response = await fetch(`https://${host}/${version}/me/messages`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                recipient: { id: recipientId },
                message: { text: message }
            })
        })

        const data = await response.json()

        if (!response.ok) {
            console.error('Instagram API Error:', JSON.stringify(data, null, 2))
            return { success: false, error: data.error?.message || 'Unknown error' }
        }

        return { success: true, messageId: data.message_id || data.id }
    } catch (error) {
        console.error('Error sending Instagram message:', error)
        return { success: false, error: 'Network error' }
    }
}
