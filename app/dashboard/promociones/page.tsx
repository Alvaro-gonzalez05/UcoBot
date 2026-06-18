import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { PromotionsManagement } from "@/components/dashboard/promotions-management"

export default async function PromotionsPage() {
  const supabase = await createClient()

  const { data, error } = await supabase.auth.getUser()
  if (error || !data?.user) {
    redirect("/login")
  }

  // Get promotions, rewards and products for this user
  const [{ data: promotions }, { data: rewards }, { data: products }] = await Promise.all([
    supabase.from("promotions").select("*").eq("user_id", data.user.id).order("created_at", { ascending: false }),
    supabase.from("rewards").select("*").eq("user_id", data.user.id).order("created_at", { ascending: false }),
    supabase.from("products").select("id, name, price, category").eq("user_id", data.user.id).order("name", { ascending: true }),
  ])

  return (
    <PromotionsManagement
      initialPromotions={promotions || []}
      initialRewards={rewards || []}
      products={products || []}
      userId={data.user.id}
    />
  )
}
