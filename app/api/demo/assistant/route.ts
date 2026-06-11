import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { GoogleGenerativeAI } from "@google/generative-ai"

const VALID_FEATURES = new Set([
  "register_clients", "take_orders", "manage_appointments",
  "lead_qualification", "loyalty_points", "custom_forms",
])

// Asistente de configuración de UcoBot (distinto del bot del negocio).
// Además de responder dudas, puede APLICAR cambios reales sobre la sesión demo:
// actualizar el prompt de personalidad y activar/desactivar funcionalidades.
export async function POST(request: NextRequest) {
  try {
    const { businessName, businessSummary, features, history, message, sessionId } = await request.json()

    if (!message) {
      return NextResponse.json({ error: "Falta el mensaje" }, { status: 400 })
    }

    const geminiApiKey = process.env.GEMINI_DEMO_API_KEY
    if (!geminiApiKey) {
      return NextResponse.json({ error: "API key no configurada" }, { status: 500 })
    }

    // Cargar la sesión para tener el prompt y features actuales
    const supabase = createAdminClient()
    let currentPrompt = ""
    let currentFeatures: string[] = Array.isArray(features) ? features : []
    if (sessionId) {
      const { data: session } = await supabase
        .from("demo_sessions")
        .select("personality_prompt, features, bot_name")
        .eq("id", sessionId)
        .single()
      if (session) {
        currentPrompt = session.personality_prompt || ""
        currentFeatures = (session.features as string[]) || currentFeatures
      }
    }

    const systemPrompt = `Sos el asistente de configuración de UcoBot, una plataforma de chatbots con IA para negocios. Estás ayudando a ${businessName || "un cliente"} DESPUÉS de que su bot ya fue configurado en la demo.

CONTEXTO DEL NEGOCIO:
- Negocio: ${businessName || "—"}
- Resumen: ${businessSummary || "—"}
- Funcionalidades activadas hoy: ${currentFeatures.length > 0 ? currentFeatures.join(", ") : "(ninguna)"}

PROMPT DE PERSONALIDAD ACTUAL DEL BOT:
"""
${currentPrompt || "(sin prompt)"}
"""

PODÉS APLICAR CAMBIOS REALES EN LA CONFIGURACIÓN:
1. Si el cliente pide cambiar algo de la personalidad, tono, presentación o comportamiento del bot → reescribí el prompt COMPLETO actualizado (basate en el actual, aplicá solo el cambio pedido, mantené el resto) y devolvelo en "updates.personality_prompt".
   FORMATO OBLIGATORIO del prompt: SIEMPRE estructurado en secciones markdown, NUNCA un párrafo corrido. Estructura exacta:
   ## Identidad (nombre, rol, negocio)
   ## Tono y estilo (guiones)
   ## Presentación (frase exacta de saludo)
   ## Preguntas estratégicas (guiones)
   ## Manejo de situaciones (un guion por situación: reservas, pedidos, objeciones, etc.)
   ## Reglas (qué nunca inventar, cuándo derivar con [HANDOVER], cuándo dirigir a formularios)
   Si el prompt actual es un párrafo sin estructura y el cliente pide "ordenarlo", "re-armarlo" o "estructurarlo", reescribilo COMPLETO con esta estructura conservando TODO el contenido (frases exactas, reglas, nombres). Escapá los saltos de línea como \\n dentro del string JSON.
2. Si pide activar o desactivar funcionalidades → usá "updates.features_add" / "updates.features_remove" con estos IDs exactos:
   - "register_clients" (registro de clientes)
   - "take_orders" (toma de pedidos)
   - "manage_appointments" (citas/reservas/turnos)
   - "lead_qualification" (calificación de leads)
   - "loyalty_points" (puntos de fidelización)
   - "custom_forms" (formularios conversacionales / recolección de datos)
3. Si solo pregunta o charla, no incluyas "updates".
Cuando apliques un cambio, confirmalo en el "reply" con claridad ("Listo, actualicé...").

UCOBOT — LO QUE TIENE HOY:
- Bot de IA para WhatsApp e Instagram (responde, califica y registra leads 24/7)
- CRM interno con historial, etiquetas y datos de contacto
- Agenda de citas/reservas, pedidos y solicitudes estructuradas
- Catálogo de productos/servicios, punto de venta, formularios conversacionales
- Puntos de fidelización, promociones, automatizaciones post-conversación
- Calificación de leads, alertas y derivación a humano

UCOBOT — LO QUE NO TIENE TODAVÍA (se puede desarrollar a pedido):
- Meta Ads, CRMs externos (GoHighLevel, Kommo, HubSpot), calendarios externos (Google Calendar, Calendly), pasarelas de pago, ERPs. Si piden algo de esto, decí honestamente que aún no está nativo pero el equipo de Codea Desarrollos puede desarrollarlo.

FORMATO DE RESPUESTA — Respondé SIEMPRE con un JSON válido (sin bloques de código):
{
  "reply": "tu respuesta al cliente (markdown liviano: **negrita**, guiones para listas; escapá saltos de línea como \\n)",
  "updates": {
    "personality_prompt": "solo si cambia, el prompt completo actualizado",
    "features_add": ["ids"],
    "features_remove": ["ids"]
  }
}
Si no hay cambios, omití "updates" o mandalo vacío.

TONO: español argentino, cálido, consultivo, directo. Respuestas concretas, máximo ~120 palabras en el reply.`

    const genAI = new GoogleGenerativeAI(geminiApiKey)
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash-lite",
      systemInstruction: systemPrompt,
    })

    let chatHistory = (Array.isArray(history) ? history : [])
      .filter((m: any) => m && typeof m.content === "string" && m.content.trim())
      .map((m: any) => ({
        role: m.role === "user" ? "user" : "model",
        parts: [{ text: m.content }],
      }))

    // Gemini exige que el historial empiece con rol "user" — descartar los
    // mensajes iniciales del bot (ej: el saludo del onboarding)
    const firstUserIdx = chatHistory.findIndex((m) => m.role === "user")
    chatHistory = firstUserIdx === -1 ? [] : chatHistory.slice(firstUserIdx)

    const chat = model.startChat({ history: chatHistory })
    const result = await chat.sendMessage(message)
    const rawText = result.response.text().trim()

    let reply = rawText
    let updates: any = null
    try {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        if (parsed.reply) {
          reply = parsed.reply
          updates = parsed.updates || null
        }
      }
    } catch {}

    // Aplicar cambios reales sobre la sesión
    let updatedFeatures: string[] | null = null
    let updatedPrompt: string | null = null
    if (updates && sessionId) {
      const dbUpdates: Record<string, any> = {}

      if (typeof updates.personality_prompt === "string" && updates.personality_prompt.trim().length > 20) {
        updatedPrompt = updates.personality_prompt.trim()
        dbUpdates.personality_prompt = updatedPrompt
      }

      const toAdd: string[] = (Array.isArray(updates.features_add) ? updates.features_add : []).filter((f: string) => VALID_FEATURES.has(f))
      const toRemove: string[] = (Array.isArray(updates.features_remove) ? updates.features_remove : []).filter((f: string) => VALID_FEATURES.has(f))
      if (toAdd.length > 0 || toRemove.length > 0) {
        const next = new Set(currentFeatures)
        toAdd.forEach((f) => next.add(f))
        toRemove.forEach((f) => next.delete(f))
        updatedFeatures = Array.from(next)
        dbUpdates.features = updatedFeatures
      }

      if (Object.keys(dbUpdates).length > 0) {
        await supabase.from("demo_sessions").update(dbUpdates).eq("id", sessionId)
      }
    }

    return NextResponse.json({
      reply,
      features: updatedFeatures,
      personalityPrompt: updatedPrompt,
    })
  } catch (error) {
    console.error("Error in demo assistant:", error)
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 })
  }
}
