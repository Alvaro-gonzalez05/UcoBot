import { createClient, createAdminClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

/**
 * Activar/desactivar la función "Equipos y sucursales" de la cuenta.
 * Es un interruptor de visibilidad: apagarla NO borra sucursales ni empleados,
 * solo esconde la sección (se puede volver a prender y sigue todo).
 */

async function requireOwner() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: "No autorizado" }, { status: 401 }) }
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("parent_user_id, team_enabled")
    .eq("id", user.id)
    .maybeSingle()
  if (profile?.parent_user_id) {
    return { error: NextResponse.json({ error: "Solo el dueño puede cambiar esto" }, { status: 403 }) }
  }
  return { ownerId: user.id, enabled: Boolean(profile?.team_enabled) }
}

export async function GET() {
  const r = await requireOwner()
  if (r.error) return r.error
  return NextResponse.json({ enabled: r.enabled })
}

export async function PATCH(request: NextRequest) {
  const r = await requireOwner()
  if (r.error) return r.error
  try {
    const { enabled } = await request.json()
    const admin = createAdminClient()
    const { error } = await admin
      .from("user_profiles")
      .update({ team_enabled: Boolean(enabled) })
      .eq("id", r.ownerId)
    if (error) throw error
    return NextResponse.json({ success: true, enabled: Boolean(enabled) })
  } catch {
    return NextResponse.json({ error: "No se pudo guardar" }, { status: 500 })
  }
}
