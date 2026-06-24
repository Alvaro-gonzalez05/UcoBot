import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getValidSellerToken, createPreference } from "@/lib/mp-payments"

/**
 * Crea un link de pago (Checkout Pro) en la cuenta MP del vendedor logueado.
 * Lo usa el POS (para mostrar el QR) y puede usarlo el bot.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

    const body = await req.json().catch(() => ({}))
    const amount = Number(body.amount)
    const title = String(body.title || "Pago").trim()
    const externalReference = body.orderId ? String(body.orderId) : undefined
    const payerEmail = body.payerEmail ? String(body.payerEmail) : undefined

    if (!amount || amount <= 0) {
      return NextResponse.json({ error: "Monto inválido" }, { status: 400 })
    }

    const seller = await getValidSellerToken(user.id)
    if (!seller) {
      return NextResponse.json(
        { error: "Conectá tu Mercado Pago en Configuración para poder cobrar" },
        { status: 400 }
      )
    }

    const pref = await createPreference({
      sellerUserId: user.id,
      sellerToken: seller.token,
      title,
      amount,
      externalReference,
      payerEmail,
    })

    return NextResponse.json({ init_point: pref.init_point, preference_id: pref.id })
  } catch (error: any) {
    console.error("Error creando pago MP:", error)
    return NextResponse.json({ error: error?.message || "No se pudo generar el pago" }, { status: 500 })
  }
}
