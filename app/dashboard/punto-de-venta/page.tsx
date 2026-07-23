import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { PuntoDeVentaView } from "@/components/dashboard/punto-de-venta-view"
import { getAccountContext } from "@/lib/account"
import { BranchViewBanner } from "@/components/dashboard/branch-view-banner"

export default async function PuntoDeVentaPage({
  searchParams,
}: {
  searchParams: { sucursal?: string }
}) {
  const supabase = await createClient()

  const { data, error } = await supabase.auth.getUser()
  if (error || !data?.user) {
    redirect("/login")
  }

  // ?sucursal=<id>: el dueño abre el punto de venta de una sucursal
  const account = await getAccountContext(searchParams?.sucursal)
  const ownerId = account?.ownerId || data.user.id

  const [{ data: products }, { data: clients }, { data: promotions }, { data: profile }] = await Promise.all([
    supabase
      .from("products")
      .select("id, name, description, price, category, is_available, image_url, created_at")
      .eq("user_id", ownerId)
      .eq("is_available", true)
      .order("created_at", { ascending: false }),
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
    supabase.from("user_profiles").select("business_name").eq("id", ownerId).single(),
  ])

  // Opciones/modificadores de producto
  const [{ data: optGroups }, { data: optItems }, { data: optLinks }] = await Promise.all([
    supabase.from("product_option_groups").select("*").eq("user_id", ownerId).order("created_at"),
    supabase.from("product_option_items").select("*").eq("user_id", ownerId).order("sort_order"),
    supabase.from("product_option_links").select("*").eq("user_id", ownerId),
  ])

  // Mapa producto -> grupos de opciones (con sus items)
  const optionsByProduct: Record<string, any[]> = {}
  for (const link of optLinks || []) {
    const group = (optGroups || []).find((g) => g.id === link.group_id)
    if (!group) continue
    const items = (optItems || [])
      .filter((i) => i.group_id === group.id)
      .map((i) => ({ id: i.id, name: i.name, price_delta: Number(i.price_delta) || 0 }))
    if (items.length === 0) continue
    const entry = { id: group.id, name: group.name, required: group.required, multi: group.multi, items }
    ;(optionsByProduct[link.product_id] ??= []).push(entry)
  }

  const { data: categoryRows } = await supabase
    .from("products")
    .select("category")
    .eq("user_id", ownerId)
    .eq("is_available", true)

  const categories = Array.from(
    new Set((categoryRows || []).map((row) => row.category).filter(Boolean))
  ) as string[]

  if (account?.viewingBranch) {
    return (
      <div className="-m-4 -mb-28 lg:m-0 flex h-[calc(100dvh-4rem)] flex-col lg:h-[calc(100vh-2rem)]">
        <div className="shrink-0 px-4 pt-4 lg:px-0 lg:pt-0">
          <BranchViewBanner branchName={account.viewingBranch.name} />
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">
          <PuntoDeVentaView
            userId={ownerId}
            products={products || []}
            categories={categories}
            clients={clients || []}
            promotions={promotions || []}
            businessName={profile?.business_name || "Mi Negocio"}
            optionsByProduct={optionsByProduct}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="-m-4 -mb-28 lg:m-0 h-[calc(100dvh-4rem)] lg:h-[calc(100vh-2rem)] overflow-hidden">
      <PuntoDeVentaView
        userId={ownerId}
        products={products || []}
        categories={categories}
        clients={clients || []}
        promotions={promotions || []}
        businessName={profile?.business_name || "Mi Negocio"}
        optionsByProduct={optionsByProduct}
      />
    </div>
  )
}