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
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" })

    const configPrompt = `Eres un experto en configuración de chatbots de IA para negocios.
Analizá la siguiente descripción de negocio y generá una configuración óptima para su bot de atención al cliente.

NEGOCIO: ${business_name}
DESCRIPCIÓN Y NECESIDADES: ${business_description}

LO QUE UCOBOT TIENE HOY:
- Bot de IA para WhatsApp e Instagram (responde, califica, registra clientes)
- CRM interno de clientes/leads con historial de conversaciones y etiquetas
- Sistema de reservas y agenda de citas coordinadas por el bot
- Bandeja de pedidos y solicitudes estructuradas
- Catálogo de productos/servicios interno (accesible desde Pedidos)
- Punto de venta para negocios de venta directa
- Formularios conversacionales (el bot completa formularios mediante chat)
- Sistema de promociones para campañas activas
- Automatizaciones internas post-conversación
- Calificación y etiquetado automático de leads
- Alertas y derivación al equipo humano (handover)

LO QUE UCOBOT NO TIENE TODAVÍA (pero puede desarrollarse):
- Integración directa con Meta Ads (Facebook/Instagram Ads)
- Integración con CRMs externos (GoHighLevel, KOMMO, HubSpot, Salesforce, etc.)
- Integración con calendarios externos (Google Calendar, Calendly, etc.)
- Conexión con portales inmobiliarios externos
- Pasarelas de pago externas
- Integración con ERPs o sistemas de gestión externos

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
  "personality_prompt": "prompt de personalidad detallado (mínimo 250 palabras), ESTRUCTURADO OBLIGATORIAMENTE en secciones markdown — NUNCA un solo párrafo corrido. Usá exactamente esta estructura (escapando saltos de línea como \\n dentro del string JSON):\\n## Identidad\\n- Nombre, rol y negocio al que representa\\n\\n## Tono y estilo\\n- 2-4 guiones con el tono específico del rubro (español argentino)\\n\\n## Presentación\\n- Cómo se presenta al cliente (frase exacta)\\n\\n## Preguntas estratégicas\\n- 2-4 guiones con preguntas para calificar/entender al cliente\\n\\n## Manejo de situaciones\\n- Un guion por situación típica del rubro (reservas, pedidos, objeciones, promociones, etc.) con la respuesta o acción esperada\\n\\n## Reglas\\n- Qué información NUNCA inventar\\n- Cuándo y cómo derivar a un humano con [HANDOVER]\\n- Si 'custom_forms' está en features: cuándo dirigir al cliente a completar un formulario ('los formularios disponibles aparecen automáticamente en el contexto del bot con sus enlaces reales'). Escribir en segunda persona (sos, respondés).",
  "allowed_tags": ["tags relevantes para clasificar leads de este negocio, máximo 6"],
  "business_summary": "resumen en una oración de qué hace el bot para este negocio específico",
  "feature_gaps": [],
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
      "label": "Clientes",
      "visible": true si el negocio necesita seguimiento y gestión de una base de contactos (casi siempre true),
      "icon": "Users",
      "justification": "1 oración concreta explicando para qué usaría este negocio el CRM de contactos"
    },
    {
      "id": "reservations",
      "label": "palabra exacta que describe las citas en este rubro — UNA sola palabra o término corto (ej: 'Visitas' para inmobiliaria, 'Reuniones' para consultoría, 'Turnos' para salud, 'Citas' para belleza, 'Reservas' para restaurante/hotel)",
      "visible": true si el negocio agenda citas, visitas, reuniones o turnos con sus clientes,
      "icon": "Calendar",
      "justification": "1 oración concreta de por qué este negocio SÍ o NO necesita agenda de citas"
    },
    {
      "id": "orders",
      "label": "palabra exacta que describe las solicitudes en este rubro — UNA sola palabra o término corto (ej: 'Consultas' para servicios profesionales, 'Pedidos' para e-commerce/restaurante, 'Presupuestos' para construcción, 'Leads' para ventas, 'Interesados' para inmobiliaria/educación)",
      "visible": true si el negocio recibe solicitudes estructuradas que conviene registrar (leads con datos, pedidos con detalle, cotizaciones),
      "icon": "ShoppingBag",
      "justification": "1 oración concreta explicando qué tipo de solicitudes registraría el bot para este negocio"
    },
    {
      "id": "punto_de_venta",
      "label": "Punto de venta",
      "visible": true SOLO para negocios de venta directa con transacciones frecuentes donde el cliente elige y paga productos/servicios en el momento (restaurantes, cafés, kioscos, tiendas físicas, e-commerce). SIEMPRE false para: inmobiliarias, estudios jurídicos, consultoría, servicios profesionales, salud especializada, educación, B2B, servicios de alto ticket. Ante la duda → false.,
      "icon": "Package",
      "justification": "1 oración concreta de si este negocio hace ventas directas de mostrador o punto de venta"
    },
    {
      "id": "forms",
      "label": "Formularios",
      "visible": true si el negocio necesita recopilar datos estructurados de sus clientes mediante conversación (calificaciones de lead, registros de interés, encuestas, fichas de paciente, etc.),
      "icon": "FileText",
      "justification": "1 oración concreta de qué tipo de formularios o calificaciones estructuradas necesita este negocio"
    },
    {
      "id": "promotions",
      "label": "Promociones",
      "visible": true SOLO para negocios B2C de consumo frecuente con promociones reales (tiendas, restaurantes, e-commerce, salones de belleza). SIEMPRE false para: inmobiliarias, estudios jurídicos, consultoría, servicios financieros premium, educación universitaria, B2B, servicios de alto ticket. Ante la duda → false.,
      "icon": "Tag",
      "justification": "1 oración concreta de si este negocio usa promociones activas o no"
    }
  ]
}

REGLAS CRÍTICAS PARA sidebar_config:
- Los labels de "clients", "punto_de_venta", "forms" y "promotions" son FIJOS — no los cambies, respetá exactamente los valores del template.
- Solo "reservations" y "orders" tienen labels variables — elegí UNA palabra o término corto apropiado al rubro.
- "visible": true SOLO si la funcionalidad es CENTRAL al negocio y se usaría a diario.
- Ante la duda sobre visible, preferí false.

REGLAS CRÍTICAS PARA feature_gaps:
- Por defecto debe ser un array VACÍO [].
- Incluí un ítem ÚNICAMENTE si el cliente, en su DESCRIPCIÓN literal de arriba, nombró de forma EXPLÍCITA una herramienta o integración externa concreta (ej: si escribió textualmente "Meta Ads", "Google Calendar", "HubSpot", etc.).
- NUNCA inventes, supongas ni copies los ejemplos de la sección "LO QUE UCOBOT NO TIENE TODAVÍA". Esa sección es solo contexto para vos, NO es una lista de gaps del cliente.
- "CRM", "automatizaciones", "redes sociales", "WhatsApp", "Instagram" NO son gaps: UcoBot ya los cubre. No los incluyas.
- Si el cliente no nombró textualmente ninguna herramienta externa que UcoBot no tenga, devolvé feature_gaps: [].`

    const result = await model.generateContent(configPrompt)
    const rawText = result.response.text().trim()

    let aiConfig: any
    try {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/)
      if (!jsonMatch) throw new Error("No JSON object found in response")
      aiConfig = JSON.parse(jsonMatch[0])
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
      personalityPrompt: session.personality_prompt,
      businessSummary: session.business_summary,
      features: session.features,
      featureJustifications: aiConfig.feature_justifications || {},
      suggestedQuestions: session.suggested_questions,
      sidebarConfig: aiConfig.sidebar_config || [],
      featureGaps: aiConfig.feature_gaps || [],
    })
  } catch (error) {
    console.error("Error in demo configure:", error)
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 })
  }
}

// Actualizar nombre del bot después de que el usuario lo personalice
export async function PATCH(request: NextRequest) {
  try {
    const { sessionId, bot_name, sidebar_config, personality_prompt } = await request.json()
    if (!sessionId) {
      return NextResponse.json({ error: "Faltan campos" }, { status: 400 })
    }

    const supabase = createAdminClient()
    const updates: Record<string, any> = {}
    if (bot_name) updates.bot_name = bot_name
    if (sidebar_config) updates.sidebar_config = sidebar_config
    if (typeof personality_prompt === "string" && personality_prompt.trim().length > 0) updates.personality_prompt = personality_prompt.trim()

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
