import { NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { createPreapproval } from "@/lib/mercadopago"

/**
 * Crea la suscripción (débito automático) del abono de UcoBot para el usuario
 * logueado y devuelve el link de Mercado Pago donde autoriza el pago.
 */
export async function POST() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    }
    if (!user.email) {
      return NextResponse.json({ error: "Tu cuenta no tiene email para facturar" }, { status: 400 })
    }

    const admin = createAdminClient()

    // El primer cobro arranca cuando termina el trial (si todavía le quedan días).
    const { data: profile } = await admin
      .from("user_profiles")
      .select("trial_ends_at")
      .eq("id", user.id)
      .maybeSingle()
    const startDate =
      profile?.trial_ends_at && new Date(profile.trial_ends_at).getTime() > Date.now()
        ? profile.trial_ends_at
        : undefined

    // Creamos la suscripción en Mercado Pago
    const preapproval = await createPreapproval({
      payerEmail: user.email,
      externalReference: user.id,
      startDate,
    })

    // Guardamos el id. NO tocamos subscription_status: durante el trial sigue en "trial"
    // (la tarjeta queda adherida y MP cobra recién al terminar la prueba).
    await admin
      .from("user_profiles")
      .update({
        mp_preapproval_id: preapproval.id,
        mp_payer_email: user.email,
      })
      .eq("id", user.id)

    return NextResponse.json({ init_point: preapproval.init_point })
  } catch (error: any) {
    console.error("Error creando suscripción MP:", error)
    return NextResponse.json(
      { error: error?.message || "No se pudo iniciar la suscripción" },
      { status: 500 }
    )
  }
}
