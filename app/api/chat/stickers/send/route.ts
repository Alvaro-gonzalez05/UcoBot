import { NextRequest, NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { getWhatsAppToken, getGraphVersion } from "@/lib/meta/credentials"

// Reenvía un sticker guardado a una conversación de WhatsApp
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    }

    const { stickerId, conversationId } = await request.json()
    if (!stickerId || !conversationId) {
      return NextResponse.json({ error: "Faltan stickerId o conversationId" }, { status: 400 })
    }

    // Sticker guardado (propio)
    const { data: sticker } = await supabase
      .from("saved_stickers")
      .select("*")
      .eq("id", stickerId)
      .eq("user_id", user.id)
      .single()

    if (!sticker) {
      return NextResponse.json({ error: "Sticker no encontrado" }, { status: 404 })
    }

    const admin = createAdminClient()

    // Conversación (debe ser del usuario y estar pausada para envío manual)
    const { data: conversation } = await admin
      .from("conversations")
      .select("*, bots(*)")
      .eq("id", conversationId)
      .single()

    if (!conversation || conversation.user_id !== user.id) {
      return NextResponse.json({ error: "Conversación no encontrada" }, { status: 404 })
    }
    if (conversation.platform !== "whatsapp") {
      return NextResponse.json({ error: "Solo se pueden enviar stickers por WhatsApp" }, { status: 400 })
    }
    if (conversation.status !== "paused") {
      return NextResponse.json(
        { error: "Pausá la IA antes de enviar mensajes manuales." },
        { status: 403 }
      )
    }

    // Integración / credenciales
    const { data: integration } = await admin
      .from("integrations")
      .select("*")
      .eq("user_id", user.id)
      .eq("platform", "whatsapp")
      .eq("is_active", true)
      .single()

    const accessToken = getWhatsAppToken(integration)
    const phoneNumberId = integration?.config?.phone_number_id
    const graphVersion = getGraphVersion()

    if (!accessToken || !phoneNumberId) {
      return NextResponse.json({ error: "Configuración de WhatsApp inválida" }, { status: 500 })
    }

    // Descargar el .webp desde Storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from("chat-media")
      .download(sticker.storage_path)

    if (downloadError || !fileData) {
      return NextResponse.json({ error: "No se pudo leer el sticker guardado" }, { status: 500 })
    }

    // Subir a WhatsApp Media API (los media-id expiran, por eso se sube cada vez)
    const whatsappFormData = new FormData()
    whatsappFormData.append("file", fileData, "sticker.webp")
    whatsappFormData.append("type", sticker.mime_type || "image/webp")
    whatsappFormData.append("messaging_product", "whatsapp")

    const uploadRes = await fetch(`https://graph.facebook.com/${graphVersion}/${phoneNumberId}/media`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: whatsappFormData,
    })

    if (!uploadRes.ok) {
      const err = await uploadRes.json().catch(() => ({}))
      console.error("WhatsApp Media Upload Error (sticker):", err)
      return NextResponse.json({ error: "No se pudo subir el sticker a WhatsApp" }, { status: 502 })
    }

    const uploadData = await uploadRes.json()
    const mediaId = uploadData.id

    // Enviar como sticker
    let normalizedPhone = conversation.client_phone
    if (normalizedPhone.startsWith("549")) {
      normalizedPhone = "54" + normalizedPhone.substring(3)
    }

    const sendRes = await fetch(`https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: normalizedPhone,
        type: "sticker",
        sticker: { id: mediaId },
      }),
    })

    if (!sendRes.ok) {
      const err = await sendRes.json().catch(() => ({}))
      console.error("WhatsApp Send Error (sticker):", err)
      return NextResponse.json({ error: "No se pudo enviar el sticker" }, { status: 502 })
    }

    const sendData = await sendRes.json()
    const whatsappMessageId = sendData.messages?.[0]?.id

    // Guardar en messages (como image + is_sticker, igual que los entrantes)
    const { data: storedMessage } = await admin
      .from("messages")
      .insert({
        conversation_id: conversationId,
        content: "[Sticker]",
        sender_type: "bot",
        message_type: "image",
        metadata: {
          sent_by: "agent",
          status: "sent",
          is_sticker: true,
          sticker: { id: mediaId, link: sticker.public_url },
          saved_sticker_id: sticker.id,
          whatsapp_message_id: whatsappMessageId,
        },
      })
      .select()
      .single()

    await admin
      .from("conversations")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", conversationId)

    return NextResponse.json({ success: true, message: storedMessage })
  } catch (error) {
    console.error("Error en stickers/send:", error)
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 })
  }
}
