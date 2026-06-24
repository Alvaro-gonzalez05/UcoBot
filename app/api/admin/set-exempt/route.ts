import { createClient, createAdminClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

/** Marca/desmarca a un usuario como "pago manual / exento" (billing_exempt). Solo admins. */
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

    const { data: me } = await supabase.from("user_profiles").select("role").eq("id", user.id).single()
    if (me?.role !== "admin") return NextResponse.json({ error: "Acceso denegado" }, { status: 403 })

    const { userId, exempt } = await request.json()
    if (!userId) return NextResponse.json({ error: "Falta userId" }, { status: 400 })

    const admin = createAdminClient()
    await admin.from("user_profiles").update({ billing_exempt: !!exempt }).eq("id", userId)

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("Error set-exempt:", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
