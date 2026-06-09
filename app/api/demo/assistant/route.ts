import { NextRequest, NextResponse } from "next/server"
import { GoogleGenerativeAI } from "@google/generative-ai"

// Asistente de configuración de UcoBot (distinto del bot del negocio).
// Ayuda al cliente a entender qué puede hacer la plataforma, agregar
// funcionalidades o resolver dudas, manteniendo el contexto de su negocio.
export async function POST(request: NextRequest) {
  try {
    const { businessName, businessSummary, features, history, message } = await request.json()

    if (!message) {
      return NextResponse.json({ error: "Falta el mensaje" }, { status: 400 })
    }

    const geminiApiKey = process.env.GEMINI_DEMO_API_KEY
    if (!geminiApiKey) {
      return NextResponse.json({ error: "API key no configurada" }, { status: 500 })
    }

    const featureList = Array.isArray(features) && features.length > 0
      ? features.join(", ")
      : "(ninguna configurada todavía)"

    const systemPrompt = `Sos el asistente de configuración de UcoBot, una plataforma de chatbots con IA para negocios. Estás ayudando a ${businessName || "un cliente"} DESPUÉS de que su bot ya fue configurado en la demo.

CONTEXTO DEL NEGOCIO:
- Negocio: ${businessName || "—"}
- Resumen: ${businessSummary || "—"}
- Funcionalidades ya activadas: ${featureList}

QUÉ PODÉS HACER EN ESTA CONVERSACIÓN:
- Explicar en detalle qué hace cada funcionalidad de UcoBot y cómo le sirve a este negocio.
- Recomendar funcionalidades adicionales que podrían activar.
- Responder dudas sobre cómo funciona la plataforma.
- Si piden algo que UcoBot todavía no tiene, anotarlo como pedido para el equipo de Codea Desarrollos.

UCOBOT — LO QUE TIENE HOY:
- Bot de IA para WhatsApp e Instagram (responde, califica y registra leads 24/7)
- CRM interno con historial, etiquetas de calificación y datos de contacto
- Agenda de citas/reservas coordinadas por el bot
- Registro de pedidos, consultas y solicitudes estructuradas
- Catálogo de productos/servicios y punto de venta
- Formularios conversacionales
- Promociones y automatizaciones post-conversación
- Calificación y etiquetado automático de leads, alertas y derivación a humano

UCOBOT — LO QUE NO TIENE TODAVÍA (se puede desarrollar a pedido):
- Integración directa con Meta Ads / Facebook Ads
- Conexión con CRMs externos (GoHighLevel, Kommo, HubSpot, Salesforce)
- Integración con calendarios externos (Google Calendar, Calendly)
- Pasarelas de pago, ERPs externos, portales inmobiliarios externos
Si el cliente pide algo de esta lista, decí honestamente que aún no está integrado de forma nativa pero el equipo de Codea Desarrollos puede desarrollarlo para su negocio.

TONO Y FORMATO:
- Español argentino, cálido, consultivo y directo. Sin saludos formales repetidos.
- Usá markdown liviano: **negrita** en lo importante, guiones ("- item") para enumerar, y títulos cortos con "##" solo si listás varias secciones.
- Respuestas concretas, máximo ~120 palabras. Respondé solo con el texto del mensaje (sin JSON).`

    const genAI = new GoogleGenerativeAI(geminiApiKey)
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash-lite",
      systemInstruction: systemPrompt,
    })

    const chatHistory = (Array.isArray(history) ? history : [])
      .filter((m: any) => m && typeof m.content === "string")
      .map((m: any) => ({
        role: m.role === "user" ? "user" : "model",
        parts: [{ text: m.content }],
      }))

    const chat = model.startChat({ history: chatHistory })
    const result = await chat.sendMessage(message)
    const reply = result.response.text().trim()

    return NextResponse.json({ reply })
  } catch (error) {
    console.error("Error in demo assistant:", error)
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 })
  }
}
