import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

/**
 * Carga masiva de productos (usada por el importador de catálogo).
 * Recibe { products: [{ name, description, price, category, is_available }] }.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    }

    const body = await request.json()
    const items = Array.isArray(body.products) ? body.products : []

    if (items.length === 0) {
      return NextResponse.json({ error: "No hay productos para importar" }, { status: 400 })
    }
    if (items.length > 300) {
      return NextResponse.json({ error: "Máximo 300 productos por importación" }, { status: 400 })
    }

    const rows = items
      .map((p: any) => ({
        user_id: user.id,
        name: String(p?.name || "").trim(),
        description: String(p?.description || "").trim() || null,
        price: Number.isFinite(Number(p?.price)) ? Number(p.price) : 0,
        category: String(p?.category || "").trim() || null,
        is_available: p?.is_available !== false,
      }))
      .filter((p: any) => p.name.length > 0)

    if (rows.length === 0) {
      return NextResponse.json({ error: "No hay productos válidos para importar" }, { status: 400 })
    }

    const { data, error } = await supabase.from("products").insert(rows).select("id")
    if (error) {
      console.error("Error bulk inserting products:", error)
      return NextResponse.json({ error: "Error al guardar los productos" }, { status: 500 })
    }

    return NextResponse.json({ success: true, imported: data?.length || 0 })
  } catch (error) {
    console.error("Error in products bulk API:", error)
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 })
  }
}
