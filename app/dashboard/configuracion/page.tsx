import { createClient } from "@/lib/supabase/server"
import { Settings } from "@/components/dashboard/settings"
import { StaffServicesManagement } from "@/components/dashboard/staff-services-management"
import { getAccountContext } from "@/lib/account"

export default async function ConfiguracionPage() {
  const supabase = await createClient()
  const account = await getAccountContext()
  const ownerId = account?.ownerId

  // ¿El bot está en modo "turno"? Ahí mostramos la gestión del Equipo del turnero.
  let appointmentMode = false
  if (ownerId) {
    const { data: bot } = await supabase
      .from("bots")
      .select("feature_config")
      .eq("user_id", ownerId)
      .limit(1)
      .maybeSingle()
    appointmentMode = (bot?.feature_config as any)?.reservation_mode === "appointment"
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Configuración</h1>
        <p className="text-muted-foreground">Administra tu cuenta y preferencias del sistema</p>
      </div>
      {appointmentMode && ownerId && <StaffServicesManagement userId={ownerId} />}
      <Settings />
    </div>
  )
}
