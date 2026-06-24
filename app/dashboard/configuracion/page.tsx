import { Settings } from "@/components/dashboard/settings"
import { SubscriptionCard } from "@/components/dashboard/subscription-card"

export default function ConfiguracionPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Configuración</h1>
        <p className="text-muted-foreground">Administra tu cuenta y preferencias del sistema</p>
      </div>
      <SubscriptionCard />
      <Settings />
    </div>
  )
}
