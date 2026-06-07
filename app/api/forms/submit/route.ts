import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/service"
import { getWhatsAppToken, getInstagramToken, getGraphVersion, getGraphHost } from "@/lib/meta/credentials"

export async function POST(req: NextRequest) {
  try {
    const { form_id, user_id, data, conversation_id } = await req.json()

    if (!form_id || !user_id || !data) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 })
    }

    const supabase = createServiceClient()

    const { error } = await supabase.from("form_submissions").insert({
      form_id,
      user_id,
      data,
    })

    if (error) {
      console.error("Form submission error:", error)
      return NextResponse.json({ error: "Failed to save submission" }, { status: 500 })
    }

    // Increment submissions count
    try {
      await supabase.rpc("increment_form_submissions", { p_form_id: form_id })
    } catch {
      const { data: formRow } = await supabase
        .from("forms")
        .select("submissions_count")
        .eq("id", form_id)
        .single()
      if (formRow) {
        await supabase
          .from("forms")
          .update({ submissions_count: (formRow.submissions_count || 0) + 1 })
          .eq("id", form_id)
      }
    }

    // Execute after_submit action
    if (conversation_id) {
      try {
        await executeAfterSubmit(supabase, form_id, conversation_id)
      } catch (err) {
        console.error("After-submit action error:", err)
        // Non-fatal: don't fail the whole submission
      }
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("Form submit route error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

async function executeAfterSubmit(supabase: any, form_id: string, conversation_id: string) {
  // Load form settings
  const { data: formRow } = await supabase
    .from("forms")
    .select("settings")
    .eq("id", form_id)
    .single()

  const afterSubmit = (formRow?.settings as any)?.after_submit
  if (!afterSubmit?.action || afterSubmit.action === "none" || !afterSubmit.message?.trim()) return

  // Load conversation with bot info
  const { data: conv } = await supabase
    .from("conversations")
    .select("id, platform, client_phone, client_instagram_id, bot_id, bots(user_id)")
    .eq("id", conversation_id)
    .single()

  if (!conv) return

  const platform: string = conv.platform
  const botUserId: string = conv.bots?.user_id
  const messageText: string = afterSubmit.message.trim()

  // Determine recipient based on platform
  const recipient = platform === "instagram" ? conv.client_instagram_id : conv.client_phone

  if (recipient && botUserId) {
    const { data: integrations } = await supabase
      .from("integrations")
      .select("config")
      .eq("user_id", botUserId)
      .eq("platform", platform)
      .eq("is_active", true)
      .limit(1)

    const integration = integrations?.[0]
    const token = platform === "whatsapp"
      ? getWhatsAppToken(integration)
      : getInstagramToken(integration)

    if (token) {
      if (platform === "whatsapp") {
        const phoneNumberId = integration?.config?.phone_number_id
        if (phoneNumberId) {
          sendWhatsAppMessage(token, phoneNumberId, recipient, messageText).catch(console.error)
        }
      } else if (platform === "instagram") {
        sendInstagramMessage(token, recipient, messageText).catch(console.error)
      }
    }
  }

  // Save bot message to DB
  await supabase.from("messages").insert({
    conversation_id,
    sender_type: "bot",
    content: messageText,
    message_type: "text",
    metadata: { source: "after_form", status: "sent" },
  })

  // Update conversation
  const updates: Record<string, any> = {
    last_message_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
  if (afterSubmit.action === "message_handover") {
    updates.needs_attention = true
    updates.status = "paused"
  }
  await supabase.from("conversations").update(updates).eq("id", conversation_id)
}

async function sendWhatsAppMessage(
  accessToken: string,
  phoneNumberId: string,
  recipientPhone: string,
  message: string
) {
  let normalizedPhone = recipientPhone
  if (recipientPhone.startsWith("549")) {
    normalizedPhone = "54" + recipientPhone.substring(3)
  }

  const response = await fetch(`https://graph.facebook.com/${getGraphVersion()}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: normalizedPhone,
      type: "text",
      text: { body: message },
    }),
  })

  if (!response.ok) {
    const data = await response.json()
    console.error("WhatsApp API error (after_form):", data)
  }
}

async function sendInstagramMessage(accessToken: string, recipientId: string, message: string) {
  const host = getGraphHost(accessToken)
  const version = getGraphVersion()

  const response = await fetch(`https://${host}/${version}/me/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      recipient: { id: recipientId },
      message: { text: message },
    }),
  })

  if (!response.ok) {
    const data = await response.json()
    console.error("Instagram API error (after_form):", data)
  }
}
