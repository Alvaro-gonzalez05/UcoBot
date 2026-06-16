import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

// Lista los stickers guardados del usuario
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    }

    const { data, error } = await supabase
      .from("saved_stickers")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })

    if (error) {
      console.error("Error listando stickers:", error)
      return NextResponse.json({ error: "Error al listar stickers" }, { status: 500 })
    }

    return NextResponse.json({ stickers: data || [] })
  } catch (error) {
    console.error("Error en stickers GET:", error)
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 })
  }
}
