import { requireTransporte } from "@/lib/transporte/guard"
import { CorredoresClient } from "@/components/dashboard/transporte/corredores-client"

export const dynamic = "force-dynamic"

export default async function CorredoresPage() {
  const { supabase, user } = await requireTransporte()
  const { data: corridors } = await supabase
    .from("transport_corridors").select("*").eq("user_id", user.id)
    .order("created_at", { ascending: false })
  return <CorredoresClient userId={user.id} corridors={corridors || []} />
}
