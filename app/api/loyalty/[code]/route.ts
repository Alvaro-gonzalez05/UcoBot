import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

/**
 * Saldo actual de una tarjeta de fidelización (público, por loyalty_code).
 * Lo usa la tarjeta del cliente como fallback de polling si el broadcast
 * Realtime no llega. No expone datos sensibles: solo puntos/sellos/compras.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(code)
  if (!isUuid) {
    return NextResponse.json({ error: "not_found" }, { status: 404 })
  }

  try {
    const supabase = createAdminClient()
    const { data: client } = await supabase
      .from("clients")
      .select("points, stamps, total_purchases")
      .eq("loyalty_code", code)
      .maybeSingle()

    if (!client) {
      return NextResponse.json({ error: "not_found" }, { status: 404 })
    }

    return NextResponse.json(
      {
        points: client.points || 0,
        stamps: client.stamps || 0,
        total_purchases: client.total_purchases || 0,
      },
      { headers: { "Cache-Control": "no-store" } }
    )
  } catch (error) {
    console.error("Error fetching loyalty balance:", error)
    return NextResponse.json({ error: "internal" }, { status: 500 })
  }
}
