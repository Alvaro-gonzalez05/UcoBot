import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { getValidSellerToken, getPaymentWithToken } from "@/lib/mp-payments"
import { createNotification } from "@/lib/notifications"

/**
 * Webhook de los cobros de los clientes (Parte B). MP avisa cada pago.
 * Sabemos de qué vendedor es por el query `?seller=` que pusimos en notification_url.
 * Con el token de ESE vendedor consultamos el pago y, si está aprobado, avisamos
 * y marcamos el pedido como pagado.
 */
export async function POST(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const sellerUserId = url.searchParams.get("seller")
    const body = await req.json().catch(() => ({} as any))

    const type: string = body?.type || url.searchParams.get("topic") || ""
    const paymentId: string = body?.data?.id || url.searchParams.get("id") || url.searchParams.get("data.id") || ""

    // Solo nos interesan los pagos
    if (!sellerUserId || !paymentId || !type.includes("payment")) {
      return NextResponse.json({ ok: true })
    }

    const seller = await getValidSellerToken(sellerUserId)
    if (!seller) return NextResponse.json({ ok: true })

    const payment = await getPaymentWithToken(seller.token, paymentId)

    if (payment.status === "approved") {
      const admin = createAdminClient()
      const orderId = payment.external_reference || null

      // Si vino de un pedido, lo marcamos como pagado/completado
      if (orderId) {
        await admin
          .from("orders")
          .update({ status: "completed" })
          .eq("id", orderId)
          .eq("user_id", sellerUserId)
      }

      await createNotification({
        userId: sellerUserId,
        title: "Pago recibido",
        message: `Cobraste $${payment.transaction_amount} por Mercado Pago.`,
        type: "success",
        link: "/dashboard/finanzas",
      })
      console.log(`MP payment ${payment.id} aprobado para vendedor ${sellerUserId}`)
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("Error en payments-webhook MP:", error)
    return NextResponse.json({ ok: true })
  }
}
