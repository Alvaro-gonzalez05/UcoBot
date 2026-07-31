import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { createNotification } from "@/lib/notifications"
import { callGeminiWithFallback, geminiText } from "@/lib/gemini"
import { findProblemConversations, REASON_LABELS } from "@/lib/bot-gaps"

/**
 * Detecta en qué le está fallando el bot y propone qué agregarle al prompt.
 *
 * Lo corre un cron semanal. El trabajo pesado NO lo hace la IA: las charlas donde
 * el bot no resolvió ya se identifican con los datos (handover al celular,
 * conversación marcada para atención, o el propio bot diciendo que no sabe). La IA
 * solo recibe esas charlas y las AGRUPA POR TEMA.
 *
 * Agrupar es lo que hace la diferencia entre algo útil y ruido: 28 avisos sueltos
 * en un mes nadie los lee, "12 personas preguntaron por envíos y no supo" sí.
 */

export const maxDuration = 300

/** Mínimo de charlas fallidas para molestar al dueño con un análisis. */
const MIN_CONVERSACIONES = 3

/** Tope de sugerencias por corrida. Pocas y buenas: la fatiga de alertas mata esto. */
const MAX_SUGERENCIAS = 3

/** Un patrón tiene que repetirse al menos esto para valer una sugerencia. */
const MIN_REPETICIONES = 2

const VENTANA_DIAS = 7

export async function POST(request: NextRequest) {
  try {
    // Este endpoint es público (lo llama el cron sin sesión) y consume IA, así que
    // si hay un secreto configurado se exige. Sin CRON_SECRET sigue abierto, para
    // no romper el cron ya agendado mientras no se configure.
    const secret = process.env.CRON_SECRET?.trim()
    if (secret) {
      const header = request.headers.get("authorization") || ""
      if (header !== `Bearer ${secret}`) {
        return NextResponse.json({ error: "No autorizado" }, { status: 401 })
      }
    }

    const admin = createAdminClient()

    const { data: bots } = await admin
      .from("bots")
      .select("id, user_id, name, personality_prompt, gemini_api_key")
      .eq("is_active", true)

    if (!bots || bots.length === 0) {
      return NextResponse.json({ ok: true, analizados: 0 })
    }

    let analizados = 0
    let generadas = 0

    for (const bot of bots) {
      try {
        // No volver a proponer mientras haya sugerencias sin resolver: si el dueño
        // todavía no miró las de la semana pasada, sumarle más es contraproducente.
        const { count: pendientes } = await admin
          .from("bot_improvement_suggestions")
          .select("*", { count: "exact", head: true })
          .eq("bot_id", bot.id)
          .eq("status", "pending")

        if ((pendientes ?? 0) > 0) continue

        const problemas = await findProblemConversations(admin, bot.user_id, VENTANA_DIAS)
        analizados++

        if (problemas.length < MIN_CONVERSACIONES) continue

        const apiKey = bot.gemini_api_key || process.env.GEMINI_DEMO_API_KEY
        if (!apiKey) continue

        const bloques = problemas
          .map(
            (p, i) =>
              `--- CHARLA ${i + 1} (${REASON_LABELS[p.reason]}) [id:${p.id}]\n${p.transcript}`,
          )
          .join("\n\n")

        const prompt = `
Sos un analista que ayuda a mejorar el asistente virtual de un negocio.

Abajo hay conversaciones REALES donde el asistente NO logró resolver: o tuvo que
contestar un humano, o quedó marcada para atención, o el propio bot dijo que no sabía.

INSTRUCCIONES DEL ASISTENTE (así está configurado hoy):
"""
${(bot.personality_prompt || "(sin instrucciones)").slice(0, 3000)}
"""

CONVERSACIONES:
${bloques.slice(0, 60000)}

TAREA:
Agrupá las fallas POR TEMA. Un tema es algo que el negocio debería poder responder
y el asistente no supo (una zona de envío, un medio de pago, un horario especial,
un producto que no está en la carta, una política de devolución, etc).

REGLAS:
- Solo temas que aparezcan en AL MENOS ${MIN_REPETICIONES} conversaciones distintas.
- Máximo ${MAX_SUGERENCIAS} temas, los más frecuentes.
- NO inventes datos del negocio: si no sabés el horario real, la sugerencia debe
  pedirle al dueño que lo complete, no inventar uno.
- Si el humano intervino por algo que NO es una falla del bot (una queja, un tema
  personal, una negociación), NO lo cuentes como tema.
- Si no hay ningún patrón claro, devolvé una lista vacía.

Respondé SOLO con este JSON:
{
  "temas": [
    {
      "topic": "título corto del tema",
      "rationale": "por qué se detectó, en una frase",
      "suggested_text": "texto exacto para agregar a las instrucciones del asistente",
      "conversation_ids": ["id de las charlas donde aparece"]
    }
  ]
}
`.trim()

        const response = await callGeminiWithFallback(
          apiKey,
          {
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.2 },
          },
          { label: "[analisis-bot]" },
        )

        if (!response || !response.ok) continue

        const raw = geminiText(await response.json())
        if (!raw) continue

        let parsed: any
        try {
          parsed = JSON.parse(raw.replace(/```json/g, "").replace(/```/g, "").trim())
        } catch {
          console.error("[analisis-bot] JSON inválido para el bot", bot.id)
          continue
        }

        const temas: any[] = Array.isArray(parsed?.temas) ? parsed.temas.slice(0, MAX_SUGERENCIAS) : []
        if (temas.length === 0) continue

        const idsValidos = new Set(problemas.map((p) => p.id))
        const desde = new Date(Date.now() - VENTANA_DIAS * 24 * 60 * 60 * 1000).toISOString()

        const filas = temas
          .filter((t) => t?.topic && t?.suggested_text)
          .map((t) => {
            // Los ids se validan contra los que realmente mandamos: el modelo puede
            // devolver identificadores inventados y quedarían enlaces rotos.
            const ejemplos = (Array.isArray(t.conversation_ids) ? t.conversation_ids : []).filter(
              (id: string) => idsValidos.has(id),
            )
            return {
              user_id: bot.user_id,
              bot_id: bot.id,
              topic: String(t.topic).slice(0, 200),
              rationale: t.rationale ? String(t.rationale).slice(0, 500) : null,
              suggested_text: String(t.suggested_text).slice(0, 2000),
              occurrences: Math.max(ejemplos.length, MIN_REPETICIONES),
              example_conversation_ids: ejemplos.slice(0, 10),
              analyzed_from: desde,
              analyzed_to: new Date().toISOString(),
            }
          })

        if (filas.length === 0) continue

        const { error } = await admin.from("bot_improvement_suggestions").insert(filas)
        if (error) {
          console.error("[analisis-bot] no se pudieron guardar las sugerencias:", error.message)
          continue
        }

        generadas += filas.length

        await createNotification({
          userId: bot.user_id,
          title: "Tu asistente puede mejorar",
          message:
            filas.length === 1
              ? `Detectamos un tema que ${bot.name} no supo responder: ${filas[0].topic}`
              : `Detectamos ${filas.length} temas que ${bot.name} no supo responder`,
          type: "info",
          link: "/dashboard/bots",
        })
      } catch (e) {
        console.error("[analisis-bot] error con el bot", bot.id, e)
      }
    }

    return NextResponse.json({ ok: true, analizados, generadas })
  } catch (error: any) {
    console.error("[analisis-bot] error general:", error)
    return NextResponse.json({ error: error?.message || "Error" }, { status: 500 })
  }
}
