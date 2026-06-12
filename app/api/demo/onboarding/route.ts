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
- Finanzas: registro de ingresos y gastos del negocio, con ganancia neta calculada automáticamente sobre las ventas del bot y del punto de venta
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
2. "intro": 1-2 oraciones con UN detalle concreto y específico de ESE tipo de negocio (una situación típica real del rubro) que muestre que entendés su mundo. Acá podés usar **negrita**.
3. "capabilities": TODO lo que UcoBot puede hacer por ESE negocio — recorré las funcionalidades RELEVANTES de la sección "QUÉ PUEDE HACER" (no te limites a un número fijo: incluí todas las que apliquen al rubro, típicamente entre 5 y 10). Cada una con:
   - "icon": UN nombre de Material Symbols de esta lista exacta: smart_toy, group, calendar_month, shopping_cart, restaurant_menu, point_of_sale, description, loyalty, label, notifications, account_tree, local_offer, storefront, chat_bubble, payments, support_agent
   - "title": máximo 4 palabras, concreto (ej: "Pedidos por WhatsApp")
   - "description": máximo 14 palabras, pegada a SU negocio, no genérica (ej: "Toma pedidos para llevar sin que nadie atienda el teléfono")
   Si el negocio necesita juntar datos de clientes (fichas, preferencias, encuestas), incluí una card de formularios conversacionales con icon "description".
4. "outro": 1-2 oraciones invitando a ajustar, sumar algo, o confirmar para que armes la configuración. Dejá claro que cuando esté conforme, vos le configurás todo. Podés usar **negrita** y 1 emoji.
5. Variá la redacción. No re-preguntes nada ya respondido en la conversación.

Respondé ÚNICAMENTE con un JSON válido (sin bloques de código), con esta estructura exacta:
{
  "intro": "texto",
  "capabilities": [
    { "icon": "calendar_month", "title": "Reservas sin solaparse", "description": "El bot agenda mesas y confirma automáticamente" }
  ],
  "outro": "texto"
}

Tono: español argentino, cálido, consultivo, experto. Sin saludos ni despedidas. Escapá saltos de línea como \\n para que el JSON sea válido.`

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

    if (stage === "react_to_goals") {
      try {
        const jsonMatch = rawText.match(/\{[\s\S]*\}/)
        if (!jsonMatch) throw new Error("No JSON")
        const parsed = JSON.parse(jsonMatch[0])
        const capabilities = (Array.isArray(parsed.capabilities) ? parsed.capabilities : [])
          .filter((c: any) => c && c.title)
          .map((c: any) => ({
            icon: typeof c.icon === "string" ? c.icon : "smart_toy",
            title: String(c.title),
            description: String(c.description || ""),
          }))
        if (capabilities.length > 0) {
          return NextResponse.json({
            intro: parsed.intro || "",
            capabilities,
            outro: parsed.outro || "",
          })
        }
        // JSON came back but without cards — fall back to plain reply
        return NextResponse.json({ reply: parsed.intro || rawText })
      } catch {
        // Model ignored the JSON instruction — use raw text as a normal reply
        return NextResponse.json({ reply: rawText })
      }
    }

    return NextResponse.json({ reply: rawText })
  } catch (error) {
    console.error("Error in demo onboarding:", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
