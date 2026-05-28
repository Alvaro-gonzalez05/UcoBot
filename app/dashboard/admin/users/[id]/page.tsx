import { createClient } from "@/lib/supabase/server"
import { notFound } from "next/navigation"
import {
  Bot,
  CreditCard,
  Activity,
  MessageSquare,
  Settings,
  ArrowLeft,
  MapPin,
  Mail,
  Phone,
  Globe,
  Hash,
  Calendar,
  ShieldAlert,
  Store,
  Clock,
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import Link from "next/link"
import { BusinessDetailsCard } from "@/components/dashboard/admin/business-details-card"
import { UserSuspendButton } from "@/components/dashboard/admin/user-suspend-button"
import { UserActionsMenu } from "@/components/dashboard/admin/user-actions-menu"

function getInitials(name: string) {
  return (name || "U")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()
}

const STATUS_CONFIG: Record<
  string,
  { label: string; dot: string; badge: string }
> = {
  active: {
    label: "Activo",
    dot: "bg-green-500",
    badge: "bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400",
  },
  suspended: {
    label: "Suspendido",
    dot: "bg-red-500",
    badge: "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400",
  },
  trialing: {
    label: "En prueba",
    dot: "bg-amber-500",
    badge: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400",
  },
  past_due: {
    label: "Pago pendiente",
    dot: "bg-orange-500",
    badge: "bg-orange-50 text-orange-700 border-orange-200",
  },
  canceled: {
    label: "Cancelado",
    dot: "bg-gray-400",
    badge: "bg-gray-100 text-gray-600 border-gray-200",
  },
}

export default async function AdminUserDetailsPage({
  params,
}: {
  params: { id: string }
}) {
  const supabase = await createClient()

  const { data: profile, error: profileError } = await supabase
    .from("user_profiles")
    .select("*")
    .eq("id", params.id)
    .single()

  if (profileError || !profile) {
    notFound()
  }

  const { data: bots } = await supabase
    .from("bots")
    .select("*")
    .eq("user_id", params.id)
    .order("created_at", { ascending: false })

  const { data: usageLogs } = await supabase
    .from("usage_logs")
    .select("*")
    .eq("user_id", params.id)
    .order("created_at", { ascending: false })
    .limit(15)

  const statusCfg =
    STATUS_CONFIG[profile.subscription_status || "trialing"] ||
    STATUS_CONFIG.trialing

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 px-1 pt-2">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            asChild
            className="rounded-xl h-9 w-9 flex-shrink-0"
          >
            <Link href="/dashboard/admin/users">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white font-bold text-lg shadow-lg flex-shrink-0">
              {getInitials(profile.business_name || "U")}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-2xl font-bold dark:text-white">
                  {profile.business_name || "Sin nombre"}
                </h2>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${statusCfg.badge}`}
                >
                  <span
                    className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 ${statusCfg.dot}`}
                  />
                  {statusCfg.label}
                </span>
              </div>
              <p className="text-xs text-muted-foreground font-mono mt-0.5">
                {profile.email}
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button variant="outline" size="sm" asChild className="rounded-xl">
            <Link href={`/dashboard/admin/users/${params.id}/chat`}>
              <MessageSquare className="h-4 w-4 mr-2" />
              Ver Chat
            </Link>
          </Button>
          <UserSuspendButton
            userId={profile.id}
            currentStatus={profile.subscription_status || "trialing"}
            userName={profile.business_name || "Usuario"}
          />
          <UserActionsMenu
            userId={profile.id}
            currentPlan={profile.plan_type || "free"}
            currentStatus={profile.subscription_status || "trialing"}
            userName={profile.business_name || "Usuario"}
          />
        </div>
      </div>

      {/* Overview stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-card rounded-3xl p-5 shadow-sm border border-border flex items-center gap-4">
          <div className="w-12 h-12 bg-blue-50 dark:bg-blue-900/30 text-blue-500 rounded-2xl flex items-center justify-center flex-shrink-0">
            <CreditCard className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">
              Plan
            </p>
            <p className="text-lg font-bold dark:text-white capitalize">
              {profile.plan_type || "Free"}
            </p>
          </div>
        </div>

        <div className="bg-card rounded-3xl p-5 shadow-sm border border-border flex items-center gap-4">
          <div className="w-12 h-12 bg-violet-50 dark:bg-violet-900/30 text-violet-500 rounded-2xl flex items-center justify-center flex-shrink-0">
            <Bot className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">
              Bots
            </p>
            <p className="text-2xl font-bold dark:text-white">
              {bots?.length || 0}
            </p>
          </div>
        </div>

        <div className="bg-card rounded-3xl p-5 shadow-sm border border-border flex items-center gap-4">
          <div className="w-12 h-12 bg-green-50 dark:bg-green-900/30 text-green-500 rounded-2xl flex items-center justify-center flex-shrink-0">
            <Activity className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">
              Saldo uso
            </p>
            <p className="text-2xl font-bold dark:text-white">
              ${profile.usage_balance || "0"}
            </p>
          </div>
        </div>

        <div className="bg-card rounded-3xl p-5 shadow-sm border border-border flex items-center gap-4">
          <div className="w-12 h-12 bg-amber-50 dark:bg-amber-900/30 text-amber-500 rounded-2xl flex items-center justify-center flex-shrink-0">
            <Calendar className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">
              Registro
            </p>
            <p className="text-sm font-bold dark:text-white">
              {new Date(profile.created_at).toLocaleDateString("es-AR", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              })}
            </p>
          </div>
        </div>
      </div>

      {/* Main content: Tabs + Business info */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Tabs (left 1 col) */}
        <div className="lg:col-span-1">
          <Tabs defaultValue="bots" className="w-full">
            <TabsList className="w-full grid grid-cols-3 rounded-2xl mb-4">
              <TabsTrigger value="bots" className="rounded-xl text-xs">
                Bots
              </TabsTrigger>
              <TabsTrigger value="activity" className="rounded-xl text-xs">
                Actividad
              </TabsTrigger>
              <TabsTrigger value="billing" className="rounded-xl text-xs">
                Facturación
              </TabsTrigger>
            </TabsList>

            {/* Bots tab */}
            <TabsContent value="bots" className="space-y-3 mt-0">
              {bots && bots.length > 0 ? (
                bots.map((bot) => (
                  <div
                    key={bot.id}
                    className="bg-card rounded-2xl p-4 border border-border shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-violet-50 dark:bg-violet-900/30 text-violet-500 flex items-center justify-center flex-shrink-0">
                          <Bot className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="font-semibold text-sm">{bot.name}</p>
                          <p className="text-xs text-muted-foreground capitalize">
                            {bot.platform || "WhatsApp"}
                          </p>
                        </div>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold border flex-shrink-0 ${
                          bot.is_active
                            ? "bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400"
                            : "bg-gray-100 text-gray-600 border-gray-200"
                        }`}
                      >
                        {bot.is_active ? "Activo" : "Inactivo"}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mb-3">
                      Modelo: {bot.model || "Gemini Flash"}
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full rounded-xl text-xs h-8"
                      asChild
                    >
                      <Link
                        href={`/dashboard/admin/users/${params.id}/bots`}
                      >
                        <Settings className="h-3 w-3 mr-1.5" />
                        Configurar
                      </Link>
                    </Button>
                  </div>
                ))
              ) : (
                <div className="bg-card rounded-2xl border border-dashed border-border p-10 flex flex-col items-center justify-center text-center gap-2">
                  <Bot className="h-8 w-8 text-muted-foreground opacity-20" />
                  <p className="text-sm text-muted-foreground">
                    Sin bots creados.
                  </p>
                </div>
              )}
            </TabsContent>

            {/* Activity tab */}
            <TabsContent value="activity" className="mt-0">
              <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
                <div className="divide-y divide-border">
                  {usageLogs && usageLogs.length > 0 ? (
                    usageLogs.map((log) => (
                      <div
                        key={log.id}
                        className="flex items-center gap-3 px-4 py-3"
                      >
                        <div className="w-8 h-8 rounded-xl bg-muted flex items-center justify-center flex-shrink-0">
                          <Activity className="h-3.5 w-3.5 text-muted-foreground" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold truncate">
                            {log.description || log.type}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            {new Date(log.created_at).toLocaleDateString(
                              "es-AR",
                              {
                                day: "2-digit",
                                month: "2-digit",
                                year: "2-digit",
                              }
                            )}
                          </p>
                        </div>
                        <p
                          className={`text-xs font-bold flex-shrink-0 ${
                            log.amount > 0
                              ? "text-green-500"
                              : "text-red-500"
                          }`}
                        >
                          {log.amount > 0
                            ? `+$${log.amount}`
                            : `-$${Math.abs(log.amount)}`}
                        </p>
                      </div>
                    ))
                  ) : (
                    <div className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-2">
                      <Activity className="h-7 w-7 opacity-20" />
                      <p className="text-xs">Sin actividad registrada.</p>
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>

            {/* Billing tab */}
            <TabsContent value="billing" className="mt-0">
              <div className="bg-card rounded-2xl border border-border shadow-sm p-4 space-y-4">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">
                    ID Cliente Stripe
                  </p>
                  <p className="font-mono text-xs truncate bg-muted px-3 py-2 rounded-xl">
                    {profile.stripe_customer_id || "No registrado"}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">
                    ID Suscripción
                  </p>
                  <p className="font-mono text-xs truncate bg-muted px-3 py-2 rounded-xl">
                    {profile.stripe_subscription_id || "Sin suscripción"}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">
                    Método de Pago
                  </p>
                  <div className="flex items-center gap-2 bg-muted px-3 py-2 rounded-xl">
                    <CreditCard className="h-4 w-4 text-muted-foreground" />
                    <span className="text-xs">
                      {profile.pm_brand
                        ? `${profile.pm_brand} •••• ${profile.pm_last_4}`
                        : "No hay tarjeta registrada"}
                    </span>
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">
                    Fin de Prueba
                  </p>
                  <p className="text-sm bg-muted px-3 py-2 rounded-xl">
                    {profile.trial_ends_at
                      ? new Date(profile.trial_ends_at).toLocaleDateString(
                          "es-AR"
                        )
                      : "N/A"}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">
                    API Key (BYOK)
                  </p>
                  <p className="font-mono text-xs bg-muted px-3 py-2 rounded-xl">
                    {profile.gemini_api_key
                      ? "••••••••" + profile.gemini_api_key.slice(-4)
                      : "No configurada"}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">
                    Rol
                  </p>
                  <div className="bg-muted px-3 py-2 rounded-xl">
                    <span
                      className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border ${
                        profile.role === "admin"
                          ? "bg-red-50 text-red-700 border-red-200"
                          : "bg-gray-100 text-gray-600 border-gray-200"
                      }`}
                    >
                      <ShieldAlert className="h-3 w-3" />
                      {profile.role || "user"}
                    </span>
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {/* Business details (right 2 cols) */}
        <div className="lg:col-span-2">
          <div className="sticky top-6">
            <BusinessDetailsCard profile={profile} />
          </div>
        </div>
      </div>
    </div>
  )
}
