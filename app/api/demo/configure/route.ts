import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { GoogleGenerativeAI } from "@google/generative-ai"

export async function POST(request: NextRequest) {
  try {
    const { contact_name, business_name, business_description, contact_email } = await request.json()

    if (!contact_name || !business_name || !business_description) {
      return NextResponse.json({ error: "Faltan campos requeridos" }, { status: 400 })
    }

    const geminiApiKey = process.env.GEMINI_DEMO_API_KEY
    if (!geminiApiKey) {
      return NextResponse.json({ error: "API key no configurada" }, { status: 500 })
    }

    const genAI = new GoogleGenerativeAI(geminiApiKey)
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" })

    const configPrompt = `Eres un experto en configuración de chatbots de IA para negocios.
Analizá la siguiente descripción de negocio y generá una configuración óptima para su bot de atención al cliente.

NEGOCIO: ${business_name}
DESCRIPCIÓN Y NECESIDADES: ${business_description}

FEATURES DISPONIBLES (seleccioná SOLO las que realmente aplican al negocio):
- "register_clients": Registrar y reconocer clientes recurrentes, guardar nombre y datos de contacto
- "take_orders": Tomar pedidos de productos/servicios con catálogo de precios. NUNCA para: inmobiliarias, consultorías, asesorías jurídicas o financieras, servicios de alto ticket sin catálogo fijo. Solo si hay ítems con precio definido que se pueden "pedir" por el chat.
- "manage_appointments": Agendar reuniones, visitas, citas, reservas, turnos
- "lead_qualification": Calificar leads por perfil, intención, urgencia y presupuesto (ideal para ventas complejas, inmobiliarias, servicios B2B)
- "loyalty_points": Sistema de puntos de fidelización por compras. NUNCA para: inmobiliarias, servicios de alto ticket con compra única, consultorías, servicios profesionales. SOLO para: cafeterías, peluquerías/barberías, farmacias, restaurantes, tiendas con compras frecuentes.
- "custom_forms": Recopilar datos estructurados mediante conversación natural (formularios conversacionales)

Respondé ÚNICAMENTE con un JSON válido (sin markdown, sin bloques de código), con esta estructura exacta:
{
  "bot_name_suggestion": "nombre sugerido para el bot con personalidad (ej: Ana, Lucas, Asistente Wonder). Que suene natural, no genérico.",
  "business_type": "tipo de negocio en inglés snake_case (ej: real_estate, restaurant, law_firm, ecommerce, health, education)",
  "features": ["lista de features seleccionadas"],
  "feature_justifications": {
    "register_clients": "Por qué específicamente este negocio necesita esta feature (1-2 oraciones concretas referidas al negocio)",
    "manage_appointments": "Por qué específicamente...",
    "lead_qualification": "Por qué específicamente..."
  },
  "feature_config": {
    "appointments_label": "cómo llamar a las citas según el rubro (ej: visita, reunión, turno, reserva, cita)",
    "appointments_confirm_phrase": "frase interna de confirmación (ej: VISITA CONFIRMADA)",
    "requests_label": "cómo llamar a los pedidos (ej: consulta, pedido, cotización, presupuesto)",
    "requests_confirm_phrase": "frase de confirmación (ej: CONSULTA REGISTRADA)",
    "catalog_label": "cómo llamar al catálogo (ej: propiedades, servicios, productos, proyectos)"
  },
  "personality_prompt": "prompt de personalidad detallado (mínimo 250 palabras). Debe incluir: nombre del bot, tono y estilo específico para este rubro, cómo presentarse al cliente, qué preguntas estratégicas hacer para calificar/entender al cliente, cómo manejar objeciones típicas del rubro, qué información nunca inventar, cuándo derivar a un humano con [HANDOVER]. Escribir en segunda persona (sos, respondés) en español argentino.",
  "allowed_tags": ["tags relevantes para clasificar leads de este negocio, máximo 6"],
  "business_summary": "resumen en una oración de qué hace el bot para este negocio específico",
  "suggested_questions": [
    {"title": "Título corto (3-5 palabras)", "description": "descripción de 5-8 palabras"},
    {"title": "Título corto", "description": "descripción"},
    {"title": "Título corto", "description": "descripción"},
    {"title": "Título corto", "description": "descripción"},
    {"title": "Título corto", "description": "descripción"},
    {"title": "Título corto", "description": "descripción"}
  ],
  "sidebar_config": [
    {
      "id": "clients",
      "label": "nombre del CRM de clientes/leads según el rubro — esta sección en UcoBot es el CRM donde se ven todos los contactos que interactuaron con el bot: sus datos, historial de mensajes, etiquetas de calificación asignadas, puntos de fidelidad y operaciones. (ej: Leads, Clientes, Pacientes, Alumnos, Propietarios)",
      "visible": true si el negocio necesita seguimiento y gestión de una base de contactos,
      "icon": "Users",
      "justification": "1 oración concreta explicando por qué este negocio SÍ o NO necesita un CRM de contactos en el panel"
    },
    {
      "id": "reservations",
      "label": "nombre de la agenda de citas/visitas — esta sección en UcoBot es el calendario donde se ven todas las citas que el bot coordinó y confirmó, con estado (pendiente, confirmada, cancelada). (ej: Visitas, Reservas, Turnos, Reuniones, Citas)",
      "visible": true SOLO si manage_appointments está en features, false si no,
      "icon": "Calendar",
      "justification": "1 oración concreta de por qué este negocio SÍ o NO necesita agenda de citas"
    },
    {
      "id": "orders",
      "label": "nombre del registro de pedidos/solicitudes — esta sección en UcoBot es la bandeja donde llegan todas las solicitudes estructuradas que el bot registró durante las conversaciones: pedidos, consultas con detalle, cotizaciones o interesados con datos completos. (ej: Pedidos, Consultas, Cotizaciones, Interesados, Presupuestos)",
      "visible": true si take_orders está en features O si el negocio recibe consultas/solicitudes estructuradas que conviene registrar por separado del CRM,
      "icon": "ShoppingBag",
      "justification": "1 oración concreta explicando qué tipo de pedidos o solicitudes registraría el bot para este negocio"
    },
    {
      "id": "products",
      "label": "nombre del catálogo — esta sección en UcoBot es el inventario de ítems que el bot puede mostrar, recomendar y sobre los que puede tomar pedidos: propiedades, productos, servicios, menú. (ej: Propiedades, Catálogo, Menú, Servicios, Proyectos)",
      "visible": true si el negocio tiene un catálogo definido de ítems que el bot presenta a los clientes,
      "icon": "Package",
      "justification": "1 oración concreta de qué ítems tendría el catálogo para este negocio y por qué"
    },
    {
      "id": "forms",
      "label": "nombre de los formularios conversacionales — esta sección en UcoBot son formularios que el bot completa mediante conversación natural: calificaciones de lead, registros de interés, encuestas de perfil. (ej: Calificaciones, Formularios, Registros, Encuestas)",
      "visible": true SOLO si custom_forms está en features,
      "icon": "FileText",
      "justification": "1 oración concreta de qué tipo de formularios o calificaciones estructuradas necesita este negocio"
    },
    {
      "id": "promotions",
      "label": "nombre de la sección de promociones — esta sección en UcoBot gestiona ofertas, descuentos y campañas que el bot puede comunicar activamente. (ej: Promociones, Ofertas, Campañas)",
      "visible": true SOLO para negocios B2C de consumo frecuente con promociones reales (tiendas, restaurantes, e-commerce, salones de belleza). SIEMPRE false para: inmobiliarias, estudios jurídicos, consultoría, servicios financieros premium, educación universitaria, B2B, servicios de alto ticket. Ante la duda → false.,
      "icon": "Tag",
      "justification": "1 oración concreta de si este negocio usa promociones activas o no"
    }
  ]
}

REGLAS CRÍTICAS PARA sidebar_config (aplicar con criterio estricto):
- "visible": true SOLO si la funcionalidad es CENTRAL al negocio y se usaría a diario.
- Para negocios de servicios premium o consultivos (inmobiliarias, asesorías, salud especializada, legal, financiero): "promotions" y "loyalty_points" son casi SIEMPRE false. Si el negocio no los mencionó explícitamente, poné false.
- "orders": Para negocios consultivos premium (ej: inmobiliarias), las consultas estructuradas van en el CRM ("clients"), NO en orders. Solo visible si existe un flujo diferenciado de pedidos o cotizaciones con datos específicos que no son el CRM de contactos.
- "forms": ÚNICAMENTE si custom_forms está en features. Sin excepción.
- "reservations": ÚNICAMENTE si manage_appointments está en features. Sin excepción.
- Ante la duda, preferí false. Es mejor que el cliente pida agregar una sección que ver secciones irrelevantes.`

    const result = await model.generateContent(configPrompt)
    const rawText = result.response.text().trim()

    let aiConfig: any
    try {
      let cleaned = rawText.trim()
      // Extract content from markdown code block if present
      const codeBlockMatch = cleaned.match(/^```(?:json)?\s*\r?\n?([\s\S]+?)\r?\n?\s*```\s*$/)
      if (codeBlockMatch) {
        cleaned = codeBlockMatch[1].trim()
      } else if (cleaned.includes("```")) {
        cleaned = cleaned.replace(/```(?:json)?\s*/gi, "").replace(/```\s*/gi, "").trim()
      }
      aiConfig = JSON.parse(cleaned)
    } catch {
      console.error("Error parsing AI response:", rawText)
      return NextResponse.json({ error: "Error al procesar la configuración de IA" }, { status: 500 })
    }

    const supabase = createAdminClient()

    const featureConfigWithJustifications = {
      ...(aiConfig.feature_config || {}),
      justifications: aiConfig.feature_justifications || {},
    }

    const { data: session, error } = await supabase
      .from("demo_sessions")
      .insert({
        contact_name,
        business_name,
        business_description,
        contact_email: contact_email || null,
        bot_name: aiConfig.bot_name_suggestion || `Asistente ${business_name}`,
        personality_prompt: aiConfig.personality_prompt,
        features: aiConfig.features || ["register_clients"],
        feature_config: featureConfigWithJustifications,
        allowed_tags: aiConfig.allowed_tags || [],
        business_summary: aiConfig.business_summary || "",
        business_type: aiConfig.business_type || "general",
        suggested_questions: aiConfig.suggested_questions || [],
        sidebar_config: aiConfig.sidebar_config || [],
        status: "active",
      })
      .select()
      .single()

    if (error || !session) {
      console.error("Error creating demo session:", error)
      return NextResponse.json({ error: "Error al guardar la configuración" }, { status: 500 })
    }

    return NextResponse.json({
      sessionId: session.id,
      sessionToken: session.session_token,
      botNameSuggestion: session.bot_name,
      businessSummary: session.business_summary,
      features: session.features,
      featureJustifications: aiConfig.feature_justifications || {},
      suggestedQuestions: session.suggested_questions,
      sidebarConfig: aiConfig.sidebar_config || [],
    })
  } catch (error) {
    console.error("Error in demo configure:", error)
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 })
  }
}

// Actualizar nombre del bot después de que el usuario lo personalice
export async function PATCH(request: NextRequest) {
  try {
    const { sessionId, bot_name, sidebar_config } = await request.json()
    if (!sessionId) {
      return NextResponse.json({ error: "Faltan campos" }, { status: 400 })
    }

    const supabase = createAdminClient()
    const updates: Record<string, any> = {}
    if (bot_name) updates.bot_name = bot_name
    if (sidebar_config) updates.sidebar_config = sidebar_config

    const { error } = await supabase
      .from("demo_sessions")
      .update(updates)
      .eq("id", sessionId)

    if (error) return NextResponse.json({ error: "Error al actualizar" }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
