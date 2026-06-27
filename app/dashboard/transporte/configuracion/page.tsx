import { requireTransporte } from "@/lib/transporte/guard"
import { ConfiguracionClient } from "@/components/dashboard/transporte/configuracion-client"

export const dynamic = "force-dynamic"

export default async function ConfiguracionPage() {
  const { supabase, user } = await requireTransporte()

  const [{ data: settings }, { data: carriers }, { data: vehicles }, { data: drivers }, { data: corridors }] =
    await Promise.all([
      supabase.from("transport_settings").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.from("transport_carriers").select("*").eq("user_id", user.id).order("is_default", { ascending: false }),
      supabase.from("transport_vehicles").select("id, patente, kind").eq("user_id", user.id),
      supabase.from("transport_drivers").select("id, nombre").eq("user_id", user.id),
      supabase.from("transport_corridors").select("id, name").eq("user_id", user.id),
    ])

  const carrier = (carriers || []).find((c: any) => c.id === settings?.default_carrier_id) || (carriers || [])[0] || null

  return (
    <ConfiguracionClient
      userId={user.id}
      settings={settings || null}
      carrier={carrier}
      vehicles={vehicles || []}
      drivers={drivers || []}
      corridors={corridors || []}
    />
  )
}
