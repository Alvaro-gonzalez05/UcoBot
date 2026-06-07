import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getWhatsAppToken, getGraphVersion } from '@/lib/meta/credentials'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    const conversationId = formData.get('conversationId') as string
    const caption = formData.get('caption') as string || ''

    if (!file || !conversationId) {
      return NextResponse.json(
        { error: 'Missing required fields: file, conversationId' },
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
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }

    // Enforce rule: Manual messages only allowed when AI is paused
    if (conversation.status !== 'paused') {
      return NextResponse.json(
        { error: 'Cannot send manual messages while AI is active. Please pause the AI first.' },
        { status: 403 }
      )
    }

    const bot = conversation.bots
    const platform = conversation.platform

    // Get integration
    const { data: integrations, error: integrationError } = await supabase
      .from('integrations')
      .select('*')
      .eq('user_id', bot.user_id)
      .eq('platform', platform)
      .eq('is_active', true)

    if (integrationError || !integrations || integrations.length === 0) {
      return NextResponse.json({ error: `No active ${platform} integration found` }, { status: 404 })
    }

    const integration = integrations[0]
    const accessToken = getWhatsAppToken(integration)
    const phoneNumberId = integration.config?.phone_number_id
    const graphVersion = getGraphVersion()

    if (!accessToken || !phoneNumberId) {
      return NextResponse.json({ error: 'Invalid configuration' }, { status: 500 })
    }

    // 1. Upload to WhatsApp Media API
    const whatsappFormData = new FormData()
    whatsappFormData.append('file', file)
    whatsappFormData.append('messaging_product', 'whatsapp')

    const uploadRes = await fetch(`https://graph.facebook.com/${graphVersion}/${phoneNumberId}/media`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
      body: whatsappFormData
    })

    if (!uploadRes.ok) {
      const error = await uploadRes.json()
      console.error('WhatsApp Media Upload Error:', error)
      return NextResponse.json({ error: 'Failed to upload media to WhatsApp' }, { status: 500 })
    }

    const uploadData = await uploadRes.json()
    const mediaId = uploadData.id

    // 2. Send Message with Media ID
    const recipientPhone = conversation.client_phone
    // Normalize phone
    let normalizedPhone = recipientPhone
    if (recipientPhone.startsWith('549')) {
      normalizedPhone = '54' + recipientPhone.substring(3)
    }

    // Determine message type based on MIME type
    let messageType = 'document'
    if (file.type.startsWith('image/')) messageType = 'image'
    else if (file.type.startsWith('audio/')) messageType = 'audio'
    else if (file.type.startsWith('video/')) messageType = 'video'

    const messageBody: any = {
      messaging_product: 'whatsapp',
      to: normalizedPhone,
      type: messageType,
    }

    messageBody[messageType] = {
      id: mediaId,
      caption: caption || undefined
    }
    
    // For documents, add filename
    if (messageType === 'document') {
        messageBody[messageType].filename = file.name
    }

    const sendRes = await fetch(`https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(messageBody)
    })

    if (!sendRes.ok) {
      const error = await sendRes.json()
      console.error('WhatsApp Send Error:', error)
      return NextResponse.json({ error: 'Failed to send media message' }, { status: 500 })
    }

    const sendData = await sendRes.json()
    const whatsappMessageId = sendData.messages?.[0]?.id

    // 3. Save to Database
    const metadata: any = {
      sent_by: 'agent',
      whatsapp_message_id: whatsappMessageId,
      status: 'sent'
    }
    
    if (messageType === 'image') metadata.image = { id: mediaId, caption }
    if (messageType === 'audio') metadata.audio = { id: mediaId }
    if (messageType === 'document') metadata.document = { id: mediaId, caption, filename: file.name }
    if (messageType === 'video') metadata.video = { id: mediaId, caption }

    const { data: storedMessage, error: dbError } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        content: caption || (messageType === 'image' ? '[Image]' : `[${messageType}]`),
        sender_type: 'bot',
        message_type: messageType,
        metadata
      })
      .select()
      .single()

    if (dbError) {
      console.error('DB Insert Error:', dbError)
      // Don't fail the request if message was sent but DB failed, just log it
    }

    return NextResponse.json({ success: true, message: storedMessage })

  } catch (error) {
    console.error('Error sending media:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
