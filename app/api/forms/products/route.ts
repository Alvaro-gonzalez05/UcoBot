import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/service"

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const user_id = searchParams.get("user_id")
  const ids = searchParams.get("ids")
  const limit = Math.min(parseInt(searchParams.get("limit") || "5"), 20)
  const offset = parseInt(searchParams.get("offset") || "0")
  const category = searchParams.get("category")

  if (!user_id) return NextResponse.json({ error: "Missing user_id" }, { status: 400 })

  const supabase = createServiceClient()

  // Specific product IDs mode — return exactly those products
  if (ids) {
    const idList = ids.split(",").filter(Boolean)
    const { data, error } = await supabase
      .from("products")
      .select("id, name, description, price, category, image_url")
      .eq("user_id", user_id)
      .in("id", idList)
      .eq("is_available", true)
    if (error) return NextResponse.json({ error: "Failed to fetch products" }, { status: 500 })
    return NextResponse.json({ products: data || [], total: data?.length || 0 })
  }

  // Paginated mode
  let query = supabase
    .from("products")
    .select("id, name, description, price, category, image_url", { count: "exact" })
    .eq("user_id", user_id)
    .eq("is_available", true)
    .order("category", { ascending: true })
    .order("name", { ascending: true })
    .range(offset, offset + limit - 1)

  if (category) query = query.eq("category", category)

  const { data, error, count } = await query
  if (error) return NextResponse.json({ error: "Failed to fetch products" }, { status: 500 })

  return NextResponse.json({ products: data || [], total: count || 0 })
}
