import { requireTransporte } from "@/lib/transporte/guard"
import { ChoferesClient } from "@/components/dashboard/transporte/choferes-client"

export const dynamic = "force-dynamic"

export default async function ChoferesPage() {
  const { supabase, user } = await requireTransporte()
  const { data: drivers } = await supabase
    .from("transport_drivers").select("*").eq("user_id", user.id)
    .order("created_at", { ascending: false })
  return <ChoferesClient userId={user.id} drivers={drivers || []} />
}
