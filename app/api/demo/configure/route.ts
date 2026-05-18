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
- "take_orders": Tomar pedidos de productos/servicios con catálogo de precios
- "manage_appointments": Agendar reuniones, visitas, citas, reservas, turnos
- "lead_qualification": Calificar leads por perfil, intención, urgencia y presupuesto (ideal para ventas complejas)
- "loyalty_points": Sistema de puntos de fidelización por compras
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
      "label": "nombre para los clientes/leads según el rubro (ej: Clientes, Leads, Pacientes, Alumnos, Propietarios)",
      "visible": true o false según si el negocio necesita gestionar una base de clientes o leads,
      "icon": "Users",
      "justification": "1 oración concreta de por qué este negocio SÍ o NO necesita gestionar clientes en el panel"
    },
    {
      "id": "reservations",
      "label": "nombre para turnos/citas según el rubro (ej: Visitas, Reservas, Turnos, Reuniones, Citas)",
      "visible": true SOLO si manage_appointments está en features, false si no,
      "icon": "Calendar",
      "justification": "1 oración concreta de por qué este negocio SÍ o NO necesita esta sección"
    },
    {
      "id": "orders",
      "label": "nombre para pedidos/solicitudes (ej: Pedidos, Consultas, Cotizaciones, Presupuestos)",
      "visible": true SOLO si take_orders está en features, false si no,
      "icon": "ShoppingBag",
      "justification": "1 oración concreta de por qué este negocio SÍ o NO necesita esta sección"
    },
    {
      "id": "products",
      "label": "nombre para el catálogo (ej: Propiedades, Servicios, Productos, Menú, Proyectos)",
      "visible": true si take_orders está en features o el negocio claramente tiene un catálogo, false si no,
      "icon": "Package",
      "justification": "1 oración concreta de por qué este negocio SÍ o NO necesita esta sección"
    },
    {
      "id": "forms",
      "label": "nombre para formularios (ej: Formularios, Encuestas, Registros)",
      "visible": true SOLO si custom_forms está en features, false si no,
      "icon": "FileText",
      "justification": "1 oración concreta de por qué este negocio SÍ o NO necesita esta sección"
    },
    {
      "id": "promotions",
      "label": "nombre para promociones/ofertas (ej: Promociones, Ofertas, Campañas, Descuentos)",
      "visible": true si el negocio hace campañas o descuentos regularmente, false si no,
      "icon": "Tag",
      "justification": "1 oración concreta de por qué este negocio SÍ o NO necesita esta sección"
    }
  ]
}`

    const result = await model.generateContent(configPrompt)
    const rawText = result.response.text().trim()

    let aiConfig: any
    try {
      const cleaned = rawText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim()
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
