import { requireTransporte } from "@/lib/transporte/guard"
import { ViajesClient } from "@/components/dashboard/transporte/viajes-client"

export const dynamic = "force-dynamic"

export default async function ViajesPage() {
  const { supabase, user } = await requireTransporte()
  const { data: trips } = await supabase
    .from("transport_trips")
    .select(`id, estado, mic_clave, consolidado, fraccionado, created_at,
      transport_crts ( crt_number, descripcion_mercaderia,
        transport_shipping_permits ( permit_number, exporter_razon_social, pais_destino_code ) )`)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })

  return <ViajesClient trips={trips || []} />
}
