import { createClient, createAdminClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function POST(request: Request) {
  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

    const { data: profile } = await supabase
      .from("user_profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    if (profile?.role !== "admin") {
      return NextResponse.json({ error: "Acceso denegado" }, { status: 403 })
    }

    const body = await request.json()
    const { email, password, businessName, contactName, planType, sidebarConfig } = body

    if (!email || !password || !businessName) {
      return NextResponse.json({ error: "Faltan campos requeridos" }, { status: 400 })
    }

    const adminClient = createAdminClient()

    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        business_name: businessName,
        full_name: contactName || businessName,
      },
    })

    if (createError || !newUser.user) {
      return NextResponse.json(
        { error: createError?.message || "Error al crear usuario" },
        { status: 500 }
      )
    }

    const newUserId = newUser.user.id

    const { error: profileError } = await adminClient
      .from("user_profiles")
      .upsert({
        id: newUserId,
        business_name: businessName,
        full_name: contactName || businessName,
        plan_type: planType || "pro",
        subscription_status: "active",
        role: "user",
        sidebar_config: Array.isArray(sidebarConfig) && sidebarConfig.length > 0
          ? sidebarConfig
          : null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })

    if (profileError) {
      await adminClient.auth.admin.deleteUser(newUserId)
      return NextResponse.json({ error: "Error al crear el perfil" }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      userId: newUserId,
      message: `Cuenta creada para ${businessName}`,
    })
  } catch (error) {
    console.error("Error creating user:", error)
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 })
  }
}
