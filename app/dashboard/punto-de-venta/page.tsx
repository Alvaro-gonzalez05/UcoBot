import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { PuntoDeVentaView } from "@/components/dashboard/punto-de-venta-view"
import { getAccountContext } from "@/lib/account"

export default async function PuntoDeVentaPage() {
  const supabase = await createClient()

  const { data, error } = await supabase.auth.getUser()
  if (error || !data?.user) {
    redirect("/login")
  }

  const account = await getAccountContext()
  const ownerId = account?.ownerId || data.user.id

  const [{ data: products }, { data: clients }, { data: promotions }] = await Promise.all([
    supabase
      .from("products")
      .select("id, name, description, price, category, is_available, image_url, created_at")
      .eq("user_id", ownerId)
      .eq("is_available", true)
      .order("created_at", { ascending: false })
      .range(0, 17),
    supabase
      .from("clients")
      .select("id, name, phone, instagram_username, points, stamps, total_purchases, loyalty_code")
      .eq("user_id", ownerId)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("promotions")
      .select("*")
      .eq("user_id", ownerId)
      .eq("is_active", true),
  ])

  const { data: categoryRows } = await supabase
    .from("products")
    .select("category")
    .eq("user_id", data.user.id)
    .eq("is_available", true)

  const categories = Array.from(
    new Set((categoryRows || []).map((row) => row.category).filter(Boolean))
  ) as string[]

  return (
    <div className="-m-4 -mb-28 lg:m-0 h-[calc(100dvh-4rem)] lg:h-[calc(100vh-2rem)] overflow-hidden">
      <PuntoDeVentaView
        userId={ownerId}
        products={products || []}
        categories={categories}
        clients={clients || []}
        promotions={promotions || []}
      />
    </div>
  )
}