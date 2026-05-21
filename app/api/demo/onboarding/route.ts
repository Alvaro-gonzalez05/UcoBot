import { NextRequest, NextResponse } from "next/server"
import { GoogleGenerativeAI } from "@google/generative-ai"

export async function POST(request: NextRequest) {
  try {
    const { stage, contactName, businessName, userMessage } = await request.json()

    const geminiApiKey = process.env.GEMINI_DEMO_API_KEY
    if (!geminiApiKey) {
      return NextResponse.json({ error: "API key no configurada" }, { status: 500 })
    }

    const genAI = new GoogleGenerativeAI(geminiApiKey)
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" })

    let prompt = ""

    const ucobot_context = `
UCOBOT — QUÉ ES Y QUÉ PUEDE HACER:
- Bot de IA para WhatsApp e Instagram que responde, califica y registra leads 24/7
- CRM interno: historial de conversaciones, etiquetas de calificación, datos del contacto
- Agenda de citas/visitas coordinadas por el bot (con confirmaciones automáticas)
- Registro de pedidos, consultas y solicitudes estructuradas
- Formularios conversacionales: el bot recopila datos específicos del cliente mediante chat natural
- Calificación automática de leads con tags (Lead Caliente, Inversor, Comprador Final, etc.)
- Alertas al equipo comercial cuando el bot detecta intención real o necesidad de handover
- Automatizaciones post-conversación (seguimientos, recordatorios, reactivación de leads fríos)
- Promociones activas que el bot puede comunicar

UCOBOT — LO QUE NO TIENE TODAVÍA (pero se puede desarrollar):
- Integración directa con Meta Ads / Facebook Ads
- Conexión con CRMs externos (GoHighLevel, Kommo, HubSpot, Salesforce)
- Integración con calendarios externos (Google Calendar, Calendly)
- Conexión con portales inmobiliarios (Properati, Argenprop, Zonaprop)
- Pasarelas de pago
- Integración con ERPs externos`

    if (stage === "react_to_goals") {
      prompt = `Sos el asistente de configuración de UcoBot, una plataforma de chatbots IA para negocios latinoamericanos.
${ucobot_context}

El cliente se llama ${contactName} y su negocio se llama "${businessName}".
Acaba de describir su negocio y sus necesidades así: "${userMessage}"

INSTRUCCIONES CRÍTICAS:
1. Leé bien lo que escribió. Es posible que ya haya respondido varias cosas (canales de entrada, problemas actuales, objetivos). NO repitas preguntas sobre información que ya dio.
2. Reaccioná en 1-2 oraciones específicas al negocio — mostrá que entendiste el rubro y el contexto real que describió. Nombrá algo concreto de lo que dijo.
3. Si UcoBot puede resolver algo que mencionaron, decílo con una idea concreta y específica para su negocio (no genérica).
4. Solo preguntá por información que realmente NO dieron todavía y que sea útil para configurar el bot. Si ya dieron suficiente contexto, podés simplemente confirmar que vas a configurar.

Tono: español argentino, cálido, consultivo, directo. Máximo 100 palabras. Sin saludos ni despedidas. No digas "claro" ni "por supuesto". Respondé únicamente con el texto del mensaje, sin JSON ni formato adicional.`

    } else if (stage === "react_to_followup") {
      prompt = `Sos el asistente de configuración de UcoBot.
${ucobot_context}

El cliente tiene el negocio "${businessName}" y acaba de compartir más contexto operativo: "${userMessage}"

TAREA 1 — Determinar si hay que preguntar por criterios de calificación de leads:
¿El negocio claramente necesita calificar leads (inmobiliaria, servicios B2B, consultoría, salud especializada, educación, servicios de alto ticket) Y el cliente NO especificó en ningún momento cómo quiere clasificarlos (no mencionó nombres de tags, criterios, tipos de cliente, hot/cold, urgencia, perfil, etc.)?
Si AMBAS condiciones se cumplen → needs_tag_question: true. De lo contrario → false.

TAREA 2 — Escribir la respuesta según el resultado de TAREA 1:
- Si needs_tag_question es TRUE: en 2 oraciones: 1) confirmá que entendiste algo concreto del negocio, 2) preguntá cómo le gustaría clasificar sus leads. Ejemplo de cierre: "¿Cómo querés clasificar tus leads? Podés usar algo como Lead Caliente/Frío, Inversor/Comprador Final, por urgencia, o lo que tenga sentido para tu rubro."
- Si needs_tag_question es FALSE: 2-3 oraciones confirmando que entendiste algo específico de lo que dijeron y que con toda esa info ya podés configurar el bot.

Respondé ÚNICAMENTE con un JSON válido (sin markdown, sin bloques de código):
{
  "reply": "texto de respuesta al cliente",
  "needs_tag_question": true
}

Tono: español argentino, cálido y confiado. Sin saludos ni despedidas. Máximo 1 emoji. Máximo 80 palabras para el reply.`
    }

    if (!prompt) {
      return NextResponse.json({ error: "Stage inválido" }, { status: 400 })
    }

    const result = await model.generateContent(prompt)
    const rawText = result.response.text().trim()

    if (stage === "react_to_followup") {
      try {
        const jsonMatch = rawText.match(/\{[\s\S]*\}/)
        if (!jsonMatch) throw new Error("No JSON")
        const parsed = JSON.parse(jsonMatch[0])
        return NextResponse.json({
          reply: parsed.reply || "",
          needsTagQuestion: parsed.needs_tag_question === true,
        })
      } catch {
        return NextResponse.json({ reply: rawText, needsTagQuestion: false })
      }
    }

    return NextResponse.json({ reply: rawText })
  } catch (error) {
    console.error("Error in demo onboarding:", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
