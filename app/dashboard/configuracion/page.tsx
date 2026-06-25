import { Suspense } from "react"
import { createClient } from "@/lib/supabase/server"
import { Settings } from "@/components/dashboard/settings"
import { SubscriptionCard } from "@/components/dashboard/subscription-card"
import { MpConnectCard } from "@/components/dashboard/mp-connect-card"
import { StaffServicesManagement } from "@/components/dashboard/staff-services-management"
import { TeamManagement } from "@/components/dashboard/team-management"
import { getAccountContext } from "@/lib/account"

export default async function ConfiguracionPage() {
  const supabase = await createClient()
  const account = await getAccountContext()
  const ownerId = account?.ownerId
  const isMember = !!account?.isMember

  // ¿El bot está en modo "turno"? Ahí mostramos la gestión del Equipo (turnero).
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
      {/* Solo el dueño ve facturación, conexión MP y equipo */}
      {!isMember && <SubscriptionCard />}
      {!isMember && (
        <Suspense fallback={null}>
          <MpConnectCard />
        </Suspense>
      )}
      {appointmentMode && ownerId && <StaffServicesManagement userId={ownerId} />}
      {!isMember && <TeamManagement />}
      <Settings />
    </div>
  )
}
