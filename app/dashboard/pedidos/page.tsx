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

  // Fetch delivery settings
  const { data: deliverySettings } = await supabase
    .from("delivery_settings")
    .select("*")
    .eq("user_id", ownerId)
    .single()

  return (
    <PedidosClient 
      initialOrders={orders || []}
      initialProducts={products || []}
      initialCategories={categories}
      deliverySettings={deliverySettings || undefined}
      pagination={{
        page,
        limit,
        totalItems,
        totalPages,
      }}
    />
  )
}