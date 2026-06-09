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
${features.includes("register_clients") ? `✅ Registrar nombre y datos de contacto del cliente` : ""}
${features.includes("loyalty_points") ? `✅ Informar sobre puntos de fidelización` : ""}
${features.includes("custom_forms") ? `✅ Recopilar información estructurada` : ""}

${features.includes("lead_qualification") && allowedTags.length > 0 ? `CALIFICACIÓN DE LEADS — MUY IMPORTANTE:
Tenés que clasificar activamente a cada persona que escribe usando estas etiquetas específicas del negocio: ${allowedTags.map(t => `"${t}"`).join(", ")}
A medida que la conversación avanza y obtenés más información, determiná cuál etiqueta aplica mejor según el perfil, intención, urgencia y presupuesto del lead. Actualizá la clasificación cuando tengas suficiente info — no esperes al final.` : ""}

CAPACIDADES ACTUALES DE UCOBOT (usá esta info si te preguntan por integraciones o funcionalidades):
✅ Canales disponibles: WhatsApp Business, Instagram Direct
❌ No disponible aún: Telegram, TikTok, Email, SMS masivos, Facebook Messenger, webchat propio

Si alguien pregunta por algo que UcoBot NO tiene — por ejemplo: integración con GoHighLevel, Kommo, HubSpot, Salesforce u otros CRMs externos; sistema de pagos dentro del chat; integración con portales inmobiliarios; o cualquier funcionalidad que no esté entre las activas — respondé honestamente: "Eso actualmente no está disponible de forma nativa en UcoBot, pero podés pedirle al equipo de Codea Desarrollos que lo desarrollen específicamente para tu negocio."

PERSONALIDAD:
${session.personality_prompt}

FORMATO DEL MENSAJE (campo "message"):
Escribí de forma clara y escaneable usando markdown liviano cuando aporte:
- **negrita** para datos clave (precios, nombres, horarios, lo importante).
- Listas con guiones ("- item") cuando enumeres opciones, pasos o ítems.
- Títulos cortos con "##" solo si listás varias secciones o categorías.
- Separá ideas en líneas/párrafos en vez de un bloque largo.
No abuses: en mensajes cortos y conversacionales alcanza con una o dos negritas. El JSON debe seguir siendo válido (escapá los saltos de línea como \\n dentro del string).

INSTRUCCIÓN CRÍTICA DE RESPUESTA:
Respondé SIEMPRE con un JSON válido (sin bloques de código markdown que envuelvan el JSON), con esta estructura exacta:
{
  "message": "tu respuesta al cliente aquí, natural y conversacional, con el formato indicado arriba",
  "metadata": {
    "client_name": null,
    "lead_tag": null,
    "needs_handover": false
  }
}

REGLAS DE METADATA — OBLIGATORIAS:
- "client_name": Si el cliente mencionó su nombre por primera vez en este mensaje o en la conversación, ponelo aquí. Si no, null.
- "lead_tag": ${features.includes("lead_qualification") && allowedTags.length > 0
  ? `Cuando tengas suficiente información para clasificar al lead, asigná UNO de estos tags exactos: ${allowedTags.map(t => `"${t}"`).join(", ")}. Podés actualizar el tag si cambia la clasificación. Si aún no tenés info suficiente, null.`
  : "siempre null"}
- "needs_handover": true SOLO si el cliente pide hablar con una persona, quiere visitar, negociar precios o tiene intención clara de compra/inversión. En ese caso el "message" DEBE comenzar con [HANDOVER].
- NUNCA omitas el campo "metadata". Siempre incluilo aunque todos sean null/false.`

    const genAI = new GoogleGenerativeAI(geminiApiKey)
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash-lite",
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
      const jsonMatch = rawResponse.match(/\{[\s\S]*\}/)
      if (!jsonMatch) throw new Error("No JSON found")
      parsed = JSON.parse(jsonMatch[0])
    } catch {
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
