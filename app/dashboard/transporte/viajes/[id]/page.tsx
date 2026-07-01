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

  const crt = Array.isArray(trip.transport_crts) ? trip.transport_crts[0] : trip.transport_crts

  const [{ data: vehicles }, { data: drivers }, { data: settings }, itemsRes] = await Promise.all([
    supabase.from("transport_vehicles").select("id, patente, kind, capacidad_traccion_ton").eq("user_id", user.id).eq("is_active", true),
    supabase.from("transport_drivers").select("id, nombre").eq("user_id", user.id).eq("is_active", true),
    supabase.from("transport_settings").select("default_tractor_id, default_semi_id, default_driver_id").eq("user_id", user.id).maybeSingle(),
    crt?.permit_id
      ? supabase.from("transport_permit_items").select("id, item_number, descripcion, cantidad, kg_neto, unidad").eq("permit_id", crt.permit_id).order("item_number")
      : Promise.resolve({ data: [] } as any),
  ])

  return (
    <ViajeDetail
      userId={user.id}
      trip={trip}
      vehicles={vehicles || []}
      drivers={drivers || []}
      settings={settings || null}
      permitItems={itemsRes.data || []}
    />
  )
}
