import { NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"

/** Devuelve si el usuario tiene conectado su Mercado Pago (sin exponer tokens). */
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ connected: false }, { status: 401 })

  const admin = createAdminClient()
  const { data } = await admin
    .from("mp_connections")
    .select("mp_user_id, connected_at")
    .eq("user_id", user.id)
    .maybeSingle()

  return NextResponse.json({
    connected: !!data,
    mp_user_id: data?.mp_user_id || null,
    connected_at: data?.connected_at || null,
  })
}

/** Desconecta (borra la conexión) del usuario. */
export async function DELETE() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  const admin = createAdminClient()
  await admin.from("mp_connections").delete().eq("user_id", user.id)
  return NextResponse.json({ ok: true })
}
