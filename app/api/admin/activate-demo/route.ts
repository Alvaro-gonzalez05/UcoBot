import { createClient, createAdminClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function POST(request: Request) {
  try {
    const supabase = await createClient()

    // Verify the requesting user is an admin
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from("user_profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    if (profile?.role !== "admin") {
      return NextResponse.json({ error: "Acceso denegado" }, { status: 403 })
    }

    const body = await request.json()
    const { demoId, email, password, businessName, contactName } = body

    if (!demoId || !email || !password || !businessName) {
      return NextResponse.json({ error: "Faltan campos requeridos" }, { status: 400 })
    }

    const adminClient = createAdminClient()

    // Fetch the demo session to get the configuration
    const { data: demo, error: demoError } = await adminClient
      .from("demo_sessions")
      .select("*")
      .eq("id", demoId)
      .single()

    if (demoError || !demo) {
      return NextResponse.json({ error: "Demo no encontrada" }, { status: 404 })
    }

    if (demo.status === "claimed") {
      return NextResponse.json({ error: "Esta demo ya fue activada" }, { status: 400 })
    }

    // Create the auth user using admin client
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
      console.error("Error creating user:", createError)
      return NextResponse.json(
        { error: createError?.message || "Error al crear usuario" },
        { status: 500 }
      )
    }

    const newUserId = newUser.user.id

    // Calculate trial end date (15 days from now)
    const trialEndsAt = new Date()
    trialEndsAt.setDate(trialEndsAt.getDate() + 15)

    // Upsert the user profile with demo configuration
    const { error: profileError } = await adminClient
      .from("user_profiles")
      .upsert({
        id: newUserId,
        email,
        business_name: businessName,
        plan_type: "trial",
        subscription_status: "active",
        trial_ends_at: trialEndsAt.toISOString(),
        max_bots: 1,
        role: "user",
        // Store demo config as business info
        business_info: {
          phone: "",
          email: email,
          website: "",
          contact_name: contactName || "",
          business_type: demo.business_type || "general",
          activated_from_demo: demoId,
        },
        business_description: demo.business_summary || "",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })

    if (profileError) {
      console.error("Error creating profile:", profileError)
      // Try to clean up the created auth user
      await adminClient.auth.admin.deleteUser(newUserId)
      return NextResponse.json(
        { error: "Error al crear el perfil del usuario" },
        { status: 500 }
      )
    }

    // Create a default bot based on demo configuration
    const features = Array.isArray(demo.features) ? demo.features : []
    const { error: botError } = await adminClient.from("bots").insert({
      user_id: newUserId,
      name: `${businessName} Bot`,
      is_active: false,
      model: "gemini-1.5-flash",
      platform: "whatsapp",
      features: features,
      business_type: demo.business_type || "general",
      system_prompt: demo.business_summary
        ? `Eres el asistente virtual de ${businessName}. ${demo.business_summary}`
        : `Eres el asistente virtual de ${businessName}.`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })

    if (botError) {
      console.error("Error creating bot (non-fatal):", botError)
      // Non-fatal — user can create a bot manually
    }

    // Mark demo as claimed and link to the new user
    await adminClient
      .from("demo_sessions")
      .update({
        status: "claimed",
        claimed_user_id: newUserId,
        claimed_at: new Date().toISOString(),
      })
      .eq("id", demoId)

    return NextResponse.json({
      success: true,
      userId: newUserId,
      message: `Cuenta creada exitosamente para ${businessName}`,
    })
  } catch (error) {
    console.error("Unexpected error activating demo:", error)
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    )
  }
}
