import { NextRequest, NextResponse } from "next/server"
import { GoogleGenerativeAI } from "@google/generative-ai"

export async function POST(request: NextRequest) {
  try {
    const { stage, contactName, businessName, userMessage, transcript } = await request.json()

    const geminiApiKey = process.env.GEMINI_DEMO_API_KEY
    if (!geminiApiKey) {
      return NextResponse.json({ error: "API key no configurada" }, { status: 500 })
    }

    const genAI = new GoogleGenerativeAI(geminiApiKey)
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" })

    let prompt = ""

    const ucobot_context = `
UCOBOT — QUÉ ES Y QUÉ PUEDE HACER (lista completa de funcionalidades):
- Bot de IA para WhatsApp e Instagram que responde, atiende, califica y registra leads 24/7
- CRM interno: historial de conversaciones, etiquetas de calificación, datos y preferencias del contacto
- Registro y reconocimiento de clientes recurrentes (los identifica y personaliza la atención)
- Agenda de citas / visitas / turnos / reservas coordinadas por el bot, con confirmaciones automáticas
- Toma de pedidos y solicitudes estructuradas (consultas, cotizaciones, presupuestos)
- Catálogo de productos/servicios con precios que el bot usa para responder y vender
- Punto de venta para registrar ventas directas de mostrador o para llevar
- Formularios conversacionales: el bot RECOPILA DATOS específicos del cliente mediante chat natural (registros, fichas, preferencias, encuestas, calificaciones)
- Puntos de fidelización por compras (ideal para consumo frecuente)
- Calificación automática de leads con tags (Lead Caliente/Frío, Inversor, Comprador Final, etc.)
- Alertas al equipo comercial y derivación a humano (handover) cuando detecta intención real
- Automatizaciones post-conversación (seguimientos, recordatorios, reactivación de leads fríos)
- Promociones y campañas activas que el bot puede comunicar

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
${transcript ? `CONVERSACIÓN HASTA AHORA (no repitas nada de esto):\n${transcript}\n` : `Acaba de describir su negocio así: "${userMessage}"`}

INSTRUCCIONES CRÍTICAS (sonar humano y personalizado, NO robótico):
1. PROHIBIDO empezar con "¡Genial!", "¡Perfecto!", "Entiendo que...", "Claro", "Por supuesto" o repetir/parafrasear lo que el cliente dijo. Eso suena a plantilla. Entrá directo con una observación real.
2. Demostrá conocimiento del rubro: arrancá con UN detalle concreto y específico de ESE tipo de negocio (un caso de uso real, una situación típica del rubro) que muestre que entendés su mundo.
3. IMPORTANTE — Mostrale TODO lo que UcoBot puede hacer por ESE negocio: recorré las funcionalidades RELEVANTES de la sección "QUÉ PUEDE HACER" (no te limites a un número fijo, incluí todas las que apliquen a su rubro) y traducí cada una a una acción concreta y específica para ellos, en una lista con guiones. Mencioná explícitamente que, si necesita **recolectar datos** de sus clientes (registros, fichas, preferencias, encuestas), UcoBot lo hace con formularios conversacionales. Nada genérico tipo "automatizar tu negocio" — cada punto pegado a su realidad.
4. Después de mostrarle las posibilidades, invitá al cliente a contarte si quiere ajustar algo, sumar algún detalle, o si ya está conforme para que armes la configuración. Dejá claro que cuando él diga que está listo, vos le configurás todo.
5. Variá la redacción. Nunca uses la misma estructura de frase dos veces. No re-preguntes nada ya respondido en la conversación.

Estructura sugerida: 1 frase de observación del rubro → "Con UcoBot vas a poder:" + lista de guiones con TODO lo relevante → cierre invitando a ajustar o a confirmar que arme la configuración.
Tono: español argentino, cálido, consultivo, experto. Máximo 160 palabras. Sin saludos ni despedidas.
FORMATO: markdown liviano — **negrita** en lo importante, guiones ("- item") para las funcionalidades. Respondé únicamente con el texto del mensaje, sin JSON.`

    } else if (stage === "react_to_followup") {
      prompt = `Sos el asistente de configuración de UcoBot.
${ucobot_context}

Negocio: "${businessName}".
${transcript ? `CONVERSACIÓN HASTA AHORA:\n${transcript}\n` : `El cliente acaba de compartir: "${userMessage}"`}

TAREA 1 — Determinar si hay que preguntar por criterios de calificación de leads:
¿El negocio claramente necesita calificar leads (inmobiliaria, servicios B2B, consultoría, salud especializada, educación, servicios de alto ticket) Y en NINGÚN momento de la conversación el cliente especificó cómo quiere clasificarlos (no mencionó tags, criterios, tipos de cliente, hot/cold, urgencia, perfil, etc.)?
Si AMBAS condiciones se cumplen → needs_tag_question: true. De lo contrario → false.

TAREA 2 — Escribir el "reply" (que suene humano y personalizado, NO robótico):
- PROHIBIDO empezar con "¡Genial!", "¡Perfecto!", "Entiendo que...", o parafrasear lo que dijo el cliente. PROHIBIDO repetir preguntas ya respondidas en la conversación.
- Si needs_tag_question es TRUE: mencioná un detalle concreto del rubro y luego preguntá, de forma natural y variada, cómo querría clasificar a sus clientes/leads (dale 2-3 ejemplos pegados a SU rubro, no genéricos).
- Si needs_tag_question es FALSE: cerrá con confianza diciendo algo específico de SU negocio que detectaste y que ya tenés todo para armar la configuración. Generá expectativa.

Respondé ÚNICAMENTE con un JSON válido (sin bloques de código):
{
  "reply": "texto de respuesta al cliente",
  "needs_tag_question": true
}

Tono: español argentino, cálido, confiado, experto. Sin saludos ni despedidas. Máximo 1 emoji. Máximo 75 palabras para el reply.
FORMATO del campo "reply": markdown liviano — **negrita** en lo importante y guiones si enumerás. Escapá saltos de línea como \\n para que el JSON sea válido.`
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
