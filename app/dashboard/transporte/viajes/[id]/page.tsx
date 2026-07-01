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

  // Fracciones hermanas: todos los viajes-fracción del mismo permiso
  const fraccionesP = crt?.permit_id && (crt.fraccion || trip.fraccionado)
    ? supabase.from("transport_crts")
        .select(`id, trip_id, fraccion_tipo, cantidad, peso_bruto, descripcion_mercaderia,
          trip:transport_trips!inner ( id, estado, tractor_id, semi_id, driver_id, created_at, mic_clave )`)
        .eq("user_id", user.id).eq("permit_id", crt.permit_id).eq("fraccion", true)
    : Promise.resolve({ data: [] } as any)

  const [{ data: vehicles }, { data: drivers }, { data: settings }, itemsRes, fraccionesRes] = await Promise.all([
    supabase.from("transport_vehicles").select("id, patente, kind, capacidad_traccion_ton").eq("user_id", user.id).eq("is_active", true),
    supabase.from("transport_drivers").select("id, nombre").eq("user_id", user.id).eq("is_active", true),
    supabase.from("transport_settings").select("default_tractor_id, default_semi_id, default_driver_id").eq("user_id", user.id).maybeSingle(),
    crt?.permit_id
      ? supabase.from("transport_permit_items").select("id, item_number, descripcion, cantidad, kg_neto, unidad").eq("permit_id", crt.permit_id).order("item_number")
      : Promise.resolve({ data: [] } as any),
    fraccionesP,
  ])

  const fracciones = (fraccionesRes.data || [])
    .sort((a: any, b: any) => new Date(a.trip?.created_at || 0).getTime() - new Date(b.trip?.created_at || 0).getTime())

  return (
    <ViajeDetail
      userId={user.id}
      trip={trip}
      vehicles={vehicles || []}
      drivers={drivers || []}
      settings={settings || null}
      permitItems={itemsRes.data || []}
      fracciones={fracciones}
    />
  )
}
