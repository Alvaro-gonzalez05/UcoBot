import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { PedidosClient } from "@/components/dashboard/pedidos-client"
import { getAccountContext } from "@/lib/account"

interface PedidosPageProps {
  searchParams: {
    page?: string
  }
}

export default async function PedidosPage({ searchParams }: PedidosPageProps) {
  const supabase = await createClient()
  
  const { data, error } = await supabase.auth.getUser()
  if (error || !data?.user) {
    redirect("/login")
  }

  const account = await getAccountContext()
  const ownerId = account?.ownerId || data.user.id

  // Parse pagination parameters
  const page = parseInt(searchParams.page || "1")
  const limit = 10 // Pedidos por página
  const offset = (page - 1) * limit

  // Fetch orders for the user with pagination
  const { data: orders, count } = await supabase
    .from("orders")
    .select(`
      *,
      client:client_id(name, phone),
      conversation:conversation_id(platform)
    `, { count: "exact" })
    .eq("user_id", ownerId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1)

  // Calculate pagination info
  const totalItems = count || 0
  const totalPages = Math.ceil(totalItems / limit)

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

  return (
    <PedidosClient
      userId={ownerId}
      initialOrders={orders || []}
      initialProducts={products || []}
      initialCategories={categories}
      deliverySettings={deliverySettings || undefined}
      businessName={profile?.business_name || "Mi Negocio"}
      posTipEnabled={posSettings?.tip_enabled ?? false}
      posTipPercent={Number(posSettings?.tip_percent) || 10}
      pagination={{
        page,
        limit,
        totalItems,
        totalPages,
      }}
    />
  )
}