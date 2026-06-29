import { requireTransporte } from "@/lib/transporte/guard"
import { ClientesClient } from "@/components/dashboard/transporte/clientes-client"

export const dynamic = "force-dynamic"

export default async function ClientesPage() {
  const { supabase, user } = await requireTransporte()
  const { data: clients } = await supabase
    .from("transport_clients").select("*").eq("user_id", user.id)
    .order("created_at", { ascending: false })
  return <ClientesClient userId={user.id} clients={clients || []} />
}
