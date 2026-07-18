import { createClient, createAdminClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

/**
 * Sucursales del negocio.
 *
 * Modelo "sucursal = cuenta": cada sucursal es una cuenta propia (con su bot,
 * su WhatsApp, su CRM y sus métricas), agrupada bajo el negocio del dueño vía
 * las tablas companies / company_members (migración 102).
 *
 * El negocio (companies) se crea solo la primera vez que el dueño crea una
 * sucursal, con el nombre del negocio que ya tiene registrado. El dueño queda
 * como `company_admin` (ve todas las sucursales); cada sucursal como `branch`.
 *
 * Contraseñas: se muestran UNA sola vez, al crear o al regenerar. No se guardan
 * en texto plano (Supabase las almacena encriptadas).
 */

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
    return { error: NextResponse.json({ error: "Solo el dueño puede gestionar sucursales" }, { status: 403 }) }
  }
  return { ownerId: user.id, businessName: profile?.business_name || "Mi negocio" }
}

function slugify(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24) || "sucursal"
}

function randomPassword(): string {
  // 12 caracteres legibles (sin ambiguos i/l/0/O)
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789"
  let out = ""
  for (let i = 0; i < 12; i++) out += chars[Math.floor(Math.random() * chars.length)]
  return out
}

// Devuelve el company del dueño; lo crea si no existe y lo deja como company_admin.
async function ensureCompany(admin: ReturnType<typeof createAdminClient>, ownerId: string, businessName: string) {
  const { data: membership } = await admin
    .from("company_members")
    .select("company_id, role")
    .eq("user_id", ownerId)
    .maybeSingle()

  if (membership?.company_id) return membership.company_id

  const { data: company, error } = await admin
    .from("companies")
    .insert({ name: businessName })
    .select("id")
    .single()
  if (error || !company) throw new Error("No se pudo crear el negocio")

  await admin.from("company_members").insert({
    company_id: company.id,
    user_id: ownerId,
    branch_name: "Casa central",
    role: "company_admin",
  })
  return company.id
}

// GET: negocio + lista de sucursales (sin contraseñas)
export async function GET() {
  const r = await requireOwner()
  if (r.error) return r.error
  const admin = createAdminClient()

  const { data: membership } = await admin
    .from("company_members")
    .select("company_id")
    .eq("user_id", r.ownerId)
    .maybeSingle()

  if (!membership?.company_id) {
    return NextResponse.json({ businessName: r.businessName, branches: [] })
  }

  const { data: members } = await admin
    .from("company_members")
    .select("user_id, branch_name, role")
    .eq("company_id", membership.company_id)
    .eq("role", "branch")
    .order("created_at", { ascending: true })

  const ids = (members || []).map((m) => m.user_id)
  // El email vive en auth.users (user_profiles no lo guarda): lo traemos del admin API.
  const emailById = new Map<string, string>()
  await Promise.all(
    ids.map(async (id) => {
      const { data } = await admin.auth.admin.getUserById(id)
      if (data?.user?.email) emailById.set(id, data.user.email)
    })
  )

  const branches = (members || []).map((m) => ({
    userId: m.user_id,
    branchName: m.branch_name || "Sucursal",
    email: emailById.get(m.user_id) || "",
  }))

  return NextResponse.json({ businessName: r.businessName, branches })
}

// POST: crear sucursal → devuelve credenciales (email + password) UNA vez
export async function POST(request: NextRequest) {
  const r = await requireOwner()
  if (r.error) return r.error
  try {
    const { branchName } = await request.json()
    const name = String(branchName || "").trim()
    if (!name) return NextResponse.json({ error: "Falta el nombre de la sucursal" }, { status: 400 })

    const admin = createAdminClient()
    const companyId = await ensureCompany(admin, r.ownerId, r.businessName)

    // Email de login legible + sufijo aleatorio para garantizar unicidad
    // (auth.users rechaza emails duplicados; no consultamos user_profiles porque
    // no guarda el email).
    const base = `${slugify(name)}.${slugify(r.businessName)}`
    const email = `${base}-${Math.random().toString(36).slice(2, 6)}@sucursal.ucobot.app`

    const password = randomPassword()

    const { data: newUser, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: name, business_name: `${r.businessName} — ${name}` },
    })
    if (createError || !newUser.user) {
      return NextResponse.json({ error: createError?.message || "No se pudo crear la cuenta" }, { status: 500 })
    }

    // Perfil: cuenta PROPIA (parent_user_id null) con sus propios datos.
    // (el email no se guarda acá: vive en auth.users)
    const { error: profileError } = await admin.from("user_profiles").upsert({
      id: newUser.user.id,
      full_name: name,
      business_name: `${r.businessName} — ${name}`,
      parent_user_id: null,
      role: "user",
      subscription_status: "active",
      billing_exempt: true, // la sucursal no paga aparte: depende del abono del dueño
    })
    if (profileError) {
      await admin.auth.admin.deleteUser(newUser.user.id)
      return NextResponse.json({ error: "No se pudo crear el perfil de la sucursal" }, { status: 500 })
    }

    await admin.from("company_members").insert({
      company_id: companyId,
      user_id: newUser.user.id,
      branch_name: name,
      role: "branch",
    })

    // Credenciales devueltas UNA vez (no se guardan en texto plano).
    return NextResponse.json({ success: true, branch: { userId: newUser.user.id, branchName: name, email }, password })
  } catch (e: any) {
    console.error("Error creando sucursal:", e)
    return NextResponse.json({ error: e?.message || "Error interno" }, { status: 500 })
  }
}

// PATCH: regenerar contraseña de una sucursal → devuelve la nueva UNA vez
export async function PATCH(request: NextRequest) {
  const r = await requireOwner()
  if (r.error) return r.error
  try {
    const { userId } = await request.json()
    if (!userId) return NextResponse.json({ error: "Falta userId" }, { status: 400 })

    const admin = createAdminClient()
    // Verificar que la sucursal pertenece al negocio del dueño
    const { data: ownerMembership } = await admin
      .from("company_members").select("company_id").eq("user_id", r.ownerId).maybeSingle()
    const { data: branchMembership } = await admin
      .from("company_members").select("company_id, role").eq("user_id", userId).maybeSingle()
    if (!ownerMembership?.company_id || branchMembership?.company_id !== ownerMembership.company_id || branchMembership?.role !== "branch") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }

    const password = randomPassword()
    const { error } = await admin.auth.admin.updateUserById(userId, { password })
    if (error) return NextResponse.json({ error: "No se pudo regenerar la contraseña" }, { status: 500 })

    return NextResponse.json({ success: true, password })
  } catch {
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}

// DELETE: eliminar sucursal (cuenta + membresía)
export async function DELETE(request: NextRequest) {
  const r = await requireOwner()
  if (r.error) return r.error
  try {
    const { userId } = await request.json()
    if (!userId) return NextResponse.json({ error: "Falta userId" }, { status: 400 })

    const admin = createAdminClient()
    const { data: ownerMembership } = await admin
      .from("company_members").select("company_id").eq("user_id", r.ownerId).maybeSingle()
    const { data: branchMembership } = await admin
      .from("company_members").select("company_id, role").eq("user_id", userId).maybeSingle()
    if (!ownerMembership?.company_id || branchMembership?.company_id !== ownerMembership.company_id || branchMembership?.role !== "branch") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }

    await admin.from("company_members").delete().eq("user_id", userId)
    await admin.auth.admin.deleteUser(userId)
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
