import { requireTransporte } from "@/lib/transporte/guard"
import { FlotaClient } from "@/components/dashboard/transporte/flota-client"

export const dynamic = "force-dynamic"

export default async function FlotaPage() {
  const { supabase, user } = await requireTransporte()
  const { data: vehicles } = await supabase
    .from("transport_vehicles").select("*").eq("user_id", user.id)
    .order("created_at", { ascending: false })
  return <FlotaClient userId={user.id} vehicles={vehicles || []} />
}
