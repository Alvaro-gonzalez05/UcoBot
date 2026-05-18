import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { GoogleGenerativeAI } from "@google/generative-ai"

export async function POST(request: NextRequest) {
  try {
    const { sessionId, message } = await request.json()

    if (!sessionId || !message) {
      return NextResponse.json({ error: "Faltan campos requeridos" }, { status: 400 })
    }

    const supabase = createAdminClient()

    const { data: session, error: sessionError } = await supabase
      .from("demo_sessions")
      .select("*")
      .eq("id", sessionId)
      .single()

    if (sessionError || !session) {
      return NextResponse.json({ error: "Sesión no encontrada" }, { status: 404 })
    }

    await supabase.from("demo_messages").insert({
      session_id: sessionId,
      sender_type: "client",
      content: message,
    })

    const { data: history } = await supabase
      .from("demo_messages")
      .select("*")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true })
      .limit(20)

    const geminiApiKey = process.env.GEMINI_DEMO_API_KEY
    if (!geminiApiKey) {
      return NextResponse.json({ error: "API key no configurada" }, { status: 500 })
    }

    const featureConfig = (session.feature_config as any) || {}
    const features: string[] = (session.features as string[]) || []
    const allowedTags: string[] = (session.allowed_tags as string[]) || []

    const systemPrompt = `Sos ${session.bot_name}, el asistente virtual de ${session.business_name}.

FECHA Y HORA ACTUAL: ${new Date().toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })}

INFORMACIÓN DEL NEGOCIO:
- Nombre: ${session.business_name}
- Descripción: ${session.business_description}

FUNCIONALIDADES HABILITADAS:
${features.includes("manage_appointments") ? `✅ Agendar ${featureConfig.appointments_label || "citas"} (confirmá con "${featureConfig.appointments_confirm_phrase || "CITA CONFIRMADA"}")` : ""}
${features.includes("take_orders") ? `✅ Tomar ${featureConfig.requests_label || "pedidos"} (confirmá con "${featureConfig.requests_confirm_phrase || "PEDIDO CONFIRMADO"}")` : ""}
${features.includes("lead_qualification") ? `✅ Calificar leads usando los tags: ${allowedTags.join(", ")}` : ""}
${features.includes("register_clients") ? `✅ Registrar nombre y datos de contacto del cliente` : ""}
${features.includes("loyalty_points") ? `✅ Informar sobre puntos de fidelización` : ""}
${features.includes("custom_forms") ? `✅ Recopilar información estructurada` : ""}

PERSONALIDAD:
${session.personality_prompt}

INSTRUCCIÓN CRÍTICA DE RESPUESTA:
Respondé SIEMPRE con un JSON válido (sin markdown), con esta estructura exacta:
{
  "message": "tu respuesta al cliente aquí, natural y conversacional",
  "metadata": {
    "client_name": null,
    "lead_tag": null,
    "needs_handover": false
  }
}

REGLAS DE METADATA:
- "client_name": Si el cliente acaba de decir su nombre por primera vez en esta conversación, ponelo aquí. Si no, null.
- "lead_tag": ${features.includes("lead_qualification") ? `Si podés clasificar al cliente según el historial, usá uno de: ${allowedTags.map(t => `"${t}"`).join(", ")}. Si aún no tenés suficiente info, null.` : "siempre null"}
- "needs_handover": true SOLO si el cliente pide hablar con una persona, quiere negociar precios, o tiene intención de compra/inversión muy clara. En ese caso, el "message" debe comenzar con [HANDOVER].`

    const genAI = new GoogleGenerativeAI(geminiApiKey)
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      systemInstruction: systemPrompt,
    })

    const chatHistory = (history || [])
      .slice(0, -1)
      .map((msg: any) => ({
        role: msg.sender_type === "client" ? "user" : "model",
        parts: [{ text: msg.content }],
      }))

    const chat = model.startChat({ history: chatHistory })
    const result = await chat.sendMessage(message)
    const rawResponse = result.response.text().trim()

    let parsed: { message: string; metadata: any }
    try {
      const cleaned = rawResponse.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim()
      parsed = JSON.parse(cleaned)
    } catch {
      // Si falla el parsing, tratar la respuesta entera como el mensaje
      parsed = { message: rawResponse, metadata: { client_name: null, lead_tag: null, needs_handover: false } }
    }

    const botMessage = parsed.message || rawResponse
    const metadata = parsed.metadata || {}

    await supabase.from("demo_messages").insert({
      session_id: sessionId,
      sender_type: "bot",
      content: botMessage,
    })

    return NextResponse.json({
      response: botMessage,
      metadata: {
        clientName: metadata.client_name || null,
        leadTag: metadata.lead_tag || null,
        needsHandover: metadata.needs_handover || false,
      },
    })
  } catch (error) {
    console.error("Error in demo chat:", error)
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const sessionId = searchParams.get("sessionId")

  if (!sessionId) {
    return NextResponse.json({ error: "sessionId requerido" }, { status: 400 })
  }

  const supabase = createAdminClient()

  const { data: session } = await supabase
    .from("demo_sessions")
    .select("id, contact_name, business_name, bot_name, business_summary, features, feature_config, suggested_questions, allowed_tags, sidebar_config, status")
    .eq("id", sessionId)
    .single()

  if (!session) {
    return NextResponse.json({ error: "Sesión no encontrada" }, { status: 404 })
  }

  const { data: messages } = await supabase
    .from("demo_messages")
    .select("*")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true })

  return NextResponse.json({ session, messages: messages || [] })
}
