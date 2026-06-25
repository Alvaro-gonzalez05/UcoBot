import { createClient, createAdminClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

// Secciones que el dueño puede habilitar a un empleado.
const GRANTABLE = ["chat", "reservas", "pedidos", "punto-de-venta", "clientes", "promociones", "formularios"]
// Secciones SIEMPRE ocultas para empleados (sensibles).
const FORCE_HIDDEN = ["bots", "configuracion", "finanzas", "automatizaciones", "admin"]

function buildSidebarConfig(sections: string[]) {
  const granted = (sections || []).filter((s) => GRANTABLE.includes(s))
  const cfg = GRANTABLE.map((id) => ({ id, visible: granted.includes(id) }))
  for (const id of FORCE_HIDDEN) cfg.push({ id, visible: false })
  return cfg
}

// Verifica que el logueado sea DUEÑO (no empleado) y devuelve su perfil.
async function requireOwner() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: "No autorizado" }, { status: 401 }) }
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("id, parent_user_id, business_name")
    .eq("id", user.id)
    .single()
  if (profile?.parent_user_id) {
    return { error: NextResponse.json({ error: "Solo el dueño puede gestionar el equipo" }, { status: 403 }) }
  }
  return { ownerId: user.id, ownerProfile: profile }
}

// Listar empleados del dueño
export async function GET() {
  const r = await requireOwner()
  if (r.error) return r.error
  const admin = createAdminClient()
  const { data } = await admin
    .from("user_profiles")
    .select("id, full_name, sidebar_config, created_at")
    .eq("parent_user_id", r.ownerId)
    .order("created_at", { ascending: false })
  return NextResponse.json({ members: data || [] })
}

// Crear empleado
export async function POST(request: NextRequest) {
  const r = await requireOwner()
  if (r.error) return r.error
  try {
    const { email, password, name, sections } = await request.json()
    if (!email || !password || !name) {
      return NextResponse.json({ error: "Faltan email, contraseña o nombre" }, { status: 400 })
    }
    if (String(password).length < 6) {
      return NextResponse.json({ error: "La contraseña debe tener al menos 6 caracteres" }, { status: 400 })
    }

    const admin = createAdminClient()
    const { data: newUser, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: name, business_name: r.ownerProfile?.business_name || name },
    })
    if (createError || !newUser.user) {
      return NextResponse.json({ error: createError?.message || "No se pudo crear la cuenta" }, { status: 500 })
    }

    const { error: profileError } = await admin.from("user_profiles").upsert({
      id: newUser.user.id,
      full_name: name,
      business_name: r.ownerProfile?.business_name || name,
      parent_user_id: r.ownerId,
      role: "user",
      subscription_status: "active",
      billing_exempt: true, // el empleado no paga: depende del abono del dueño
      sidebar_config: buildSidebarConfig(sections || []),
    })
    if (profileError) {
      await admin.auth.admin.deleteUser(newUser.user.id)
      return NextResponse.json({ error: "No se pudo crear el perfil del empleado" }, { status: 500 })
    }

    return NextResponse.json({ success: true, userId: newUser.user.id })
  } catch (e) {
    console.error("Error creando empleado:", e)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}

// Actualizar secciones de un empleado
export async function PATCH(request: NextRequest) {
  const r = await requireOwner()
  if (r.error) return r.error
  try {
    const { memberId, sections } = await request.json()
    if (!memberId) return NextResponse.json({ error: "Falta memberId" }, { status: 400 })
    const admin = createAdminClient()
    // Verificar que el empleado pertenece al dueño
    const { data: m } = await admin.from("user_profiles").select("parent_user_id").eq("id", memberId).maybeSingle()
    if (m?.parent_user_id !== r.ownerId) return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    await admin.from("user_profiles").update({ sidebar_config: buildSidebarConfig(sections || []) }).eq("id", memberId)
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}

// Eliminar empleado
export async function DELETE(request: NextRequest) {
  const r = await requireOwner()
  if (r.error) return r.error
  try {
    const { memberId } = await request.json()
    if (!memberId) return NextResponse.json({ error: "Falta memberId" }, { status: 400 })
    const admin = createAdminClient()
    const { data: m } = await admin.from("user_profiles").select("parent_user_id").eq("id", memberId).maybeSingle()
    if (m?.parent_user_id !== r.ownerId) return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    await admin.auth.admin.deleteUser(memberId)
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
