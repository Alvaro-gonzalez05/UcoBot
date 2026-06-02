import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { PuntoDeVentaView } from "@/components/dashboard/punto-de-venta-view"

export default async function PuntoDeVentaPage() {
  const supabase = await createClient()

  const { data, error } = await supabase.auth.getUser()
  if (error || !data?.user) {
    redirect("/login")
  }

  const [{ data: products }, { data: clients }] = await Promise.all([
    supabase
      .from("products")
      .select("id, name, description, price, category, is_available, image_url, created_at")
      .eq("user_id", data.user.id)
      .eq("is_available", true)
      .order("created_at", { ascending: false })
      .range(0, 17),
    supabase
      .from("clients")
      .select("id, name, phone, instagram_username, points, total_purchases")
      .eq("user_id", data.user.id)
      .order("created_at", { ascending: false })
      .limit(100),
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
    <div className="-m-4 lg:m-0 min-h-[calc(100dvh-5rem)] lg:min-h-[calc(100vh-9rem)]">
      <PuntoDeVentaView
        userId={data.user.id}
        products={products || []}
        categories={categories}
        clients={clients || []}
      />
    </div>
  )
}