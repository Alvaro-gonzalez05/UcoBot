import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getValidSellerToken, ensureSellerPos, createQrOrder } from "@/lib/mp-payments"

/**
 * Genera un QR interoperable (Transferencias 3.0): lo paga CUALQUIER billetera.
 * Lo usa el Punto de venta. Devuelve la trama (qr_data) y el id de la orden (para el polling).
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

    // Empleado → cobra con el Mercado Pago del dueño
    const { data: prof } = await supabase.from("user_profiles").select("parent_user_id").eq("id", user.id).maybeSingle()
    const ownerId = prof?.parent_user_id || user.id

    const body = await req.json().catch(() => ({}))
    const amount = Number(body.amount)
    if (!amount || amount <= 0) return NextResponse.json({ error: "Monto inválido" }, { status: 400 })

    const seller = await getValidSellerToken(ownerId)
    if (!seller) return NextResponse.json({ error: "Conectá tu Mercado Pago en Configuración para cobrar" }, { status: 400 })

    const posExternal = await ensureSellerPos(ownerId, seller.token, seller.mpUserId || "")
    if (!posExternal) return NextResponse.json({ error: "No se pudo preparar la caja de Mercado Pago" }, { status: 500 })

    const ref = `${ownerId.replace(/-/g, "").slice(0, 12)}-${Date.now()}`
    const { qrData, orderId } = await createQrOrder(seller.token, seller.mpUserId || "", posExternal, amount, ref)
    if (!qrData) return NextResponse.json({ error: "No se pudo generar el QR" }, { status: 500 })

    return NextResponse.json({ qr_data: qrData, order_id: orderId })
  } catch (error: any) {
    console.error("Error creando QR MP:", error)
    return NextResponse.json({ error: error?.message || "No se pudo generar el QR" }, { status: 500 })
  }
}
