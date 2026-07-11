import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { PedidosClient } from "@/components/dashboard/pedidos-client"
import { getAccountContext } from "@/lib/account"

export default async function PedidosPage() {
  const supabase = await createClient()

  const { data, error } = await supabase.auth.getUser()
  if (error || !data?.user) {
    redirect("/login")
  }

  const account = await getAccountContext()
  const ownerId = account?.ownerId || data.user.id

  // Primer lote para el infinite scroll (los siguientes se cargan del lado del cliente)
  const PAGE_SIZE = 10
  const { data: orders } = await supabase
    .from("orders")
    .select(`
      *,
      client:client_id(name, phone),
      conversation:conversation_id(platform)
    `)
    .eq("user_id", ownerId)
    .order("created_at", { ascending: false })
    .range(0, PAGE_SIZE - 1)

  // Fetch products for the user
  const { data: products } = await supabase
    .from("products")
    .select("*")
    .eq("user_id", ownerId)
    .order("created_at", { ascending: false })

  // Get unique categories
  const categories = [...new Set(products?.map(p => p.category).filter(Boolean))] as string[]

  // Fetch delivery settings + business name (ticket) + config de propina del POS
  const [{ data: deliverySettings }, { data: profile }, { data: posSettings }] = await Promise.all([
    supabase.from("delivery_settings").select("*").eq("user_id", ownerId).single(),
    supabase.from("user_profiles").select("business_name").eq("id", ownerId).single(),
    supabase.from("pos_settings").select("tip_enabled, tip_percent").eq("user_id", ownerId).maybeSingle(),
  ])

  // Opciones/modificadores de producto (mismo mapa que el POS)
  const [{ data: optGroups }, { data: optItems }, { data: optLinks }] = await Promise.all([
    supabase.from("product_option_groups").select("*").eq("user_id", ownerId).order("created_at"),
    supabase.from("product_option_items").select("*").eq("user_id", ownerId).order("sort_order"),
    supabase.from("product_option_links").select("*").eq("user_id", ownerId),
  ])
  const optionsByProduct: Record<string, any[]> = {}
  for (const link of optLinks || []) {
    const group = (optGroups || []).find((g) => g.id === link.group_id)
    if (!group) continue
    const items = (optItems || [])
      .filter((i) => i.group_id === group.id)
      .map((i) => ({ id: i.id, name: i.name, price_delta: Number(i.price_delta) || 0 }))
    if (items.length === 0) continue
    ;(optionsByProduct[link.product_id] ??= []).push({ id: group.id, name: group.name, required: group.required, multi: group.multi, items })
  }

  return (
    <PedidosClient
      userId={ownerId}
      optionsByProduct={optionsByProduct}
      initialOrders={orders || []}
      initialProducts={products || []}
      initialCategories={categories}
      deliverySettings={deliverySettings || undefined}
      businessName={profile?.business_name || "Mi Negocio"}
      posTipEnabled={posSettings?.tip_enabled ?? false}
      posTipPercent={Number(posSettings?.tip_percent) || 10}
    />
  )
}