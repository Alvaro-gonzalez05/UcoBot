import { NextRequest, NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"

/**
 * Edición del perfil de un cliente desde el panel de administración.
 *
 * POR QUÉ ES UN ENDPOINT Y NO UN UPDATE DESDE EL NAVEGADOR (29/07/2026):
 * `user_profiles` tiene política de SELECT para admin (`admin_view_all_profiles`)
 * pero NINGUNA de UPDATE — solo `user_profiles_update_own`. El panel veía a todos
 * los clientes pero no podía modificar a ninguno: el UPDATE no matcheaba ninguna
 * fila, PostgREST devolvía éxito con cero filas afectadas y la interfaz mostraba
 * "actualizado" sin haber cambiado nada. Pasaba en los cuatro lugares que editan
 * un cliente (menú de acciones, suspender, editar perfil y el diálogo de edición).
 *
 * Se resuelve acá y no con una política nueva a propósito: dejar que un admin
 * escriba cualquier columna de `user_profiles` desde el navegador es mucho más
 * permiso del necesario. Este endpoint valida el rol y solo deja pasar los campos
 * de la lista blanca.
 */

/** Lo único que el panel puede tocar de un cliente. */
const CAMPOS_PERMITIDOS = [
  "business_name",
  "business_description",
  "location",
  "menu_link",
  "business_info",
  "business_hours",
  "social_links",
  "plan_type",
  "subscription_status",
] as const

const PLANES = ["trial", "pro"]
const ESTADOS = ["active", "trialing", "trial", "past_due", "canceled", "cancelled", "suspended"]

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 })

    const { data: me } = await supabase
      .from("user_profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    if (me?.role !== "admin") {
      return NextResponse.json({ error: "Solo para administradores" }, { status: 403 })
    }

    const body = await request.json()
    const userId = String(body.user_id || "")
    if (!userId) return NextResponse.json({ error: "Falta el usuario" }, { status: 400 })

    const patch: Record<string, any> = {}
    for (const campo of CAMPOS_PERMITIDOS) {
      if (body[campo] !== undefined) patch[campo] = body[campo]
    }

    // Los dos campos que gobiernan el acceso se validan contra su lista: son los
    // que deciden si el cliente entra o no, no conviene aceptar cualquier texto.
    if (patch.plan_type !== undefined && !PLANES.includes(String(patch.plan_type))) {
      return NextResponse.json({ error: `Plan inválido: ${patch.plan_type}` }, { status: 400 })
    }
    if (
      patch.subscription_status !== undefined &&
      !ESTADOS.includes(String(patch.subscription_status))
    ) {
      return NextResponse.json(
        { error: `Estado inválido: ${patch.subscription_status}` },
        { status: 400 },
      )
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "Nada para cambiar" }, { status: 400 })
    }

    const admin = createAdminClient()
    const { data, error } = await admin
      .from("user_profiles")
      .update(patch)
      .eq("id", userId)
      // El select confirma que se tocó una fila: sin esto, un id inexistente
      // devolvía éxito igual, que es el mismo engaño que se está arreglando.
      .select("id, business_name, plan_type, subscription_status")
      .maybeSingle()

    if (error) {
      console.error("[admin user-profile] update falló:", error)
      return NextResponse.json({ error: "No se pudo actualizar" }, { status: 500 })
    }
    if (!data) {
      return NextResponse.json({ error: "No se encontró ese usuario" }, { status: 404 })
    }

    return NextResponse.json({ success: true, profile: data })
  } catch (error: any) {
    console.error("[admin user-profile] error:", error)
    return NextResponse.json({ error: error?.message || "Error interno" }, { status: 500 })
  }
}
