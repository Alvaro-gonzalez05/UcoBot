import { NextRequest, NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"

/**
 * Secciones del panel lateral de un cliente, editadas por el admin.
 *
 * El cliente puede configurarlas desde sus propios ajustes, pero el admin no
 * tenía forma de hacerlo por él — y es lo que hace falta al dar de alta una
 * cuenta o al habilitarle un módulo nuevo, sin tener que pedirle que entre a
 * tocarlo.
 *
 * Se escribe con el cliente admin (saltea RLS, que solo deja al dueño tocar su
 * propia fila), así que el chequeo de rol de acá es la única barrera: sin él
 * cualquiera podría reescribir el menú de cualquier cuenta.
 */
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
    const sections = body.sections

    if (!userId) {
      return NextResponse.json({ error: "Falta el usuario" }, { status: 400 })
    }
    if (!Array.isArray(sections)) {
      return NextResponse.json({ error: "Formato de secciones inválido" }, { status: 400 })
    }

    // Se normaliza a { id, label, visible } y se descarta cualquier otra clave:
    // esto termina en una columna JSON que lee el panel lateral, y no queremos
    // que entre ahí lo que venga del navegador sin mirar.
    const clean = sections
      .filter((s: any) => s && typeof s.id === "string")
      .map((s: any) => ({
        id: String(s.id),
        label: String(s.label || s.id),
        visible: s.visible !== false,
      }))

    if (clean.length === 0) {
      return NextResponse.json({ error: "No hay secciones válidas" }, { status: 400 })
    }

    const admin = createAdminClient()
    const { error } = await admin
      .from("user_profiles")
      .update({ sidebar_config: clean })
      .eq("id", userId)

    if (error) {
      console.error("[admin user-menus] update falló:", error)
      return NextResponse.json({ error: "No se pudo guardar" }, { status: 500 })
    }

    return NextResponse.json({ success: true, sections: clean })
  } catch (error: any) {
    console.error("[admin user-menus] error:", error)
    return NextResponse.json({ error: error?.message || "Error interno" }, { status: 500 })
  }
}
