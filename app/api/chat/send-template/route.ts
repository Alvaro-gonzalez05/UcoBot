import { NextRequest, NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { getWhatsAppToken, getGraphVersion } from "@/lib/meta/credentials"

/**
 * Envía una plantilla de WhatsApp aprobada para REABRIR la ventana de 24 hs
 * cuando ya está cerrada (mensaje libre no permitido por Meta fuera de ventana).
 * Guarda el mensaje renderizado en la conversación.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    }

    const body = await request.json()
    const conversationId = String(body.conversationId || "")
    const templateName = String(body.template_name || "")
    const language = String(body.language || "es_AR")
    const variables: string[] = Array.isArray(body.variables) ? body.variables.map((v: any) => String(v ?? "")) : []
    const renderedText = String(body.rendered_text || "")

    if (!conversationId || !templateName) {
      return NextResponse.json({ error: "Faltan datos (conversación o plantilla)" }, { status: 400 })
    }

    const admin = createAdminClient()

    // Conversación → bot (verificando que sea del usuario logueado)
    const { data: conversation } = await admin
      .from("conversations")
      .select("*, bots(*)")
      .eq("id", conversationId)
      .maybeSingle()

    if (!conversation || conversation.user_id !== user.id) {
      return NextResponse.json({ error: "Conversación no encontrada" }, { status: 404 })
    }
    if (conversation.platform !== "whatsapp") {
      return NextResponse.json({ error: "Las plantillas solo aplican a WhatsApp" }, { status: 400 })
    }

    const to = conversation.client_phone
    if (!to) {
      return NextResponse.json({ error: "La conversación no tiene un número de WhatsApp" }, { status: 400 })
    }

    // Integración de WhatsApp del usuario
    const { data: integration } = await admin
      .from("integrations")
      .select("config")
      .eq("user_id", user.id)
      .eq("platform", "whatsapp")
      .eq("is_active", true)
      .maybeSingle()

    const accessToken = getWhatsAppToken(integration)
    const phoneNumberId = integration?.config?.phone_number_id
    if (!accessToken || !phoneNumberId) {
      return NextResponse.json({ error: "WhatsApp no está configurado correctamente" }, { status: 400 })
    }

    // Componentes: solo el body con sus variables (si tiene)
    const components = variables.length > 0
      ? [{ type: "body", parameters: variables.map((text) => ({ type: "text", text })) }]
      : []

    const graphVersion = getGraphVersion()
    const res = await fetch(`https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: {
          name: templateName,
          language: { code: language },
          ...(components.length > 0 ? { components } : {}),
        },
      }),
    })

    const result = await res.json().catch(() => ({}))
    if (!res.ok) {
      console.error("Error sending WhatsApp template:", result)
      return NextResponse.json(
        { error: result.error?.error_user_msg || result.error?.message || "Meta rechazó el envío de la plantilla" },
        { status: 400 }
      )
    }

    // Guardar el mensaje en la conversación (texto renderizado para que se lea natural)
    await admin.from("messages").insert({
      conversation_id: conversationId,
      content: renderedText || `📋 Plantilla: ${templateName}`,
      sender_type: "bot",
      message_type: "text",
      metadata: {
        whatsapp_message_id: result.messages?.[0]?.id || null,
        template_name: templateName,
        sent_by: "agent",
        reengagement: true,
      },
    })

    await admin
      .from("conversations")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", conversationId)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error in send-template:", error)
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 })
  }
}
