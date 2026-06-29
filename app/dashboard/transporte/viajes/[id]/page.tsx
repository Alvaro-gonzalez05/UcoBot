import { notFound } from "next/navigation"
import { requireTransporte } from "@/lib/transporte/guard"
import { ViajeDetail } from "@/components/dashboard/transporte/viaje-detail"

export const dynamic = "force-dynamic"

export default async function ViajeDetailPage({ params }: { params: { id: string } }) {
  const { supabase, user } = await requireTransporte()

  const { data: trip } = await supabase
    .from("transport_trips")
    .select(`*,
      transport_crts ( *, transport_shipping_permits ( permit_number, exporter_razon_social, pais_destino_code, cond_venta, fob_total, fob_divisa, peso_bruto, peso_neto ) ),
      corredor:transport_corridors ( name )`)
    .eq("user_id", user.id)
    .eq("id", params.id)
    .maybeSingle()

  if (!trip) notFound()

  const [{ data: vehicles }, { data: drivers }, { data: settings }] = await Promise.all([
    supabase.from("transport_vehicles").select("id, patente, kind").eq("user_id", user.id).eq("is_active", true),
    supabase.from("transport_drivers").select("id, nombre").eq("user_id", user.id).eq("is_active", true),
    supabase.from("transport_settings").select("default_tractor_id, default_semi_id, default_driver_id").eq("user_id", user.id).maybeSingle(),
  ])

  return (
    <ViajeDetail
      userId={user.id}
      trip={trip}
      vehicles={vehicles || []}
      drivers={drivers || []}
      settings={settings || null}
    />
  )
}
