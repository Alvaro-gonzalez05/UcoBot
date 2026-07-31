import { NextRequest, NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { getAccountContext } from "@/lib/account"

/**
 * Sugerencias de mejora del prompt: listarlas, aplicarlas o descartarlas.
 *
 * Aplicar SUMA el texto al final del prompt, nunca lo reescribe: el prompt es lo
 * que define cómo atiende el negocio y una sugerencia automática no puede pisar
 * lo que el dueño configuró a mano.
 */

export async function GET(_request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

    const ctx = await getAccountContext()
    const accountId = ctx?.ownerId || user.id

    const admin = createAdminClient()
    const { data } = await admin
      .from("bot_improvement_suggestions")
      .select("*")
      .eq("user_id", accountId)
      .eq("status", "pending")
      .order("occurrences", { ascending: false })

    return NextResponse.json({ suggestions: data || [] })
  } catch (error: any) {
    console.error("[sugerencias GET] error:", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

    const ctx = await getAccountContext()
    const accountId = ctx?.ownerId || user.id

    const body = await request.json()
    const id = String(body.id || "")
    const action = String(body.action || "")

    if (!id || !["apply", "dismiss"].includes(action)) {
      return NextResponse.json({ error: "Pedido inválido" }, { status: 400 })
    }

    const admin = createAdminClient()
    const { data: suggestion } = await admin
      .from("bot_improvement_suggestions")
      .select("*")
      .eq("id", id)
      .eq("user_id", accountId)
      .maybeSingle()

    if (!suggestion) {
      return NextResponse.json({ error: "No se encontró la sugerencia" }, { status: 404 })
    }

    if (action === "apply") {
      const { data: bot } = await admin
        .from("bots")
        .select("id, personality_prompt")
        .eq("id", suggestion.bot_id)
        .maybeSingle()

      if (!bot) {
        return NextResponse.json({ error: "El bot ya no existe" }, { status: 404 })
      }

      // Se AGREGA al final, separado y rotulado. Reescribir el prompt entero con
      // algo generado sería la forma más rápida de arruinar un bot que funciona.
      const actual = (bot.personality_prompt || "").trimEnd()
      const nuevo = `${actual}\n\n${suggestion.suggested_text.trim()}`.trim()

      const { error: updateError } = await admin
        .from("bots")
        .update({ personality_prompt: nuevo })
        .eq("id", bot.id)

      if (updateError) {
        console.error("[sugerencias] no se pudo aplicar:", updateError.message)
        return NextResponse.json({ error: "No se pudo aplicar" }, { status: 500 })
      }
    }

    await admin
      .from("bot_improvement_suggestions")
      .update({
        status: action === "apply" ? "applied" : "dismissed",
        resolved_at: new Date().toISOString(),
      })
      .eq("id", id)

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("[sugerencias POST] error:", error)
    return NextResponse.json({ error: error?.message || "Error interno" }, { status: 500 })
  }
}
