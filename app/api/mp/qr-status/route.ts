import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getValidSellerToken, getQrOrderStatus } from "@/lib/mp-payments"

/** Consulta si una orden de QR ya fue pagada (el POS hace polling con esto). */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

    const orderId = req.nextUrl.searchParams.get("orderId")
    if (!orderId) return NextResponse.json({ error: "Falta orderId" }, { status: 400 })

    const { data: prof } = await supabase.from("user_profiles").select("parent_user_id").eq("id", user.id).maybeSingle()
    const ownerId = prof?.parent_user_id || user.id

    const seller = await getValidSellerToken(ownerId)
    if (!seller) return NextResponse.json({ paid: false })

    const { paid, status } = await getQrOrderStatus(seller.token, orderId)
    return NextResponse.json({ paid, status })
  } catch (error) {
    console.error("Error consultando estado QR:", error)
    return NextResponse.json({ paid: false })
  }
}
