import { createClient } from "@/lib/supabase/server"
import {
  Users,
  MessageSquare,
  DollarSign,
  Activity,
  CreditCard,
  Bot,
  TrendingUp,
  ArrowRight,
  Zap,
} from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

function getInitials(name: string) {
  return (name || "U")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()
}

const PLAN_COLORS: Record<string, string> = {
  pro: "bg-[#D1F366]/10 text-[#4a7c00] border-[#D1F366]/30 dark:text-[#D1F366]",
  trial: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400",
  free: "bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-400",
}

const STATUS_DOT: Record<string, string> = {
  active: "bg-green-500",
  suspended: "bg-red-500",
  trialing: "bg-amber-500",
  past_due: "bg-orange-500",
  canceled: "bg-gray-400",
}

export default async function AdminDashboard() {
  const supabase = await createClient()

  const { count: userCount } = await supabase
    .from("user_profiles")
    .select("*", { count: "exact", head: true })

  const { count: botCount } = await supabase
    .from("bots")
    .select("*", { count: "exact", head: true })

  const { count: activeTrials } = await supabase
    .from("user_profiles")
    .select("*", { count: "exact", head: true })
    .eq("plan_type", "trial")
    .eq("subscription_status", "active")

  const { data: recentActivity } = await supabase
    .from("usage_logs")
    .select("*, user_profiles(business_name)")
    .order("created_at", { ascending: false })
    .limit(6)

  const { data: recentUsers } = await supabase
    .from("user_profiles")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(6)

  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)

  // Ingresos reales del mes: cobros aprobados de suscripción (Mercado Pago)
  const { data: monthPayments } = await supabase
    .from("subscription_payments")
    .select("amount")
    .eq("status", "approved")
    .gte("paid_at", startOfMonth.toISOString())

  const totalRevenue =
    monthPayments?.reduce((acc, p) => acc + (Number(p.amount) || 0), 0) || 0

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="px-1 pt-2">
        <h2 className="text-3xl font-bold dark:text-white">
          Panel de Administración
        </h2>
        <p className="text-muted-foreground text-sm mt-1">
          Visión general del sistema UcoBot.
        </p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-card rounded-3xl p-5 shadow-sm border border-border flex items-center gap-4">
          <div className="w-12 h-12 bg-blue-50 dark:bg-blue-900/30 text-blue-500 rounded-2xl flex items-center justify-center flex-shrink-0">
            <Users className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">
              Usuarios
            </p>
            <p className="text-2xl font-bold dark:text-white">
              {userCount || 0}
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
              {botCount || 0}
            </p>
          </div>
        </div>

        <div className="bg-card rounded-3xl p-5 shadow-sm border border-border flex items-center gap-4">
          <div className="w-12 h-12 bg-green-50 dark:bg-green-900/30 text-green-500 rounded-2xl flex items-center justify-center flex-shrink-0">
            <DollarSign className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">
              Ingresos (mes)
            </p>
            <p className="text-2xl font-bold dark:text-white">
              {new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(totalRevenue)}
            </p>
          </div>
        </div>

        <div className="bg-card rounded-3xl p-5 shadow-sm border border-border flex items-center gap-4">
          <div className="w-12 h-12 bg-amber-50 dark:bg-amber-900/30 text-amber-500 rounded-2xl flex items-center justify-center flex-shrink-0">
            <Activity className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">
              En prueba
            </p>
            <p className="text-2xl font-bold dark:text-white">
              {activeTrials || 0}
            </p>
          </div>
        </div>
      </div>

      {/* Quick nav cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link
          href="/dashboard/admin/users"
          className="group bg-card rounded-3xl p-6 shadow-sm border border-border hover:shadow-md hover:-translate-y-0.5 transition-all flex items-center justify-between"
        >
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 bg-blue-50 dark:bg-blue-900/30 text-blue-500 rounded-2xl flex items-center justify-center">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <p className="font-bold">Usuarios</p>
              <p className="text-xs text-muted-foreground">
                Gestionar cuentas
              </p>
            </div>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground group-hover:translate-x-1 transition-all" />
        </Link>

        <Link
          href="/dashboard/admin/payments"
          className="group bg-card rounded-3xl p-6 shadow-sm border border-border hover:shadow-md hover:-translate-y-0.5 transition-all flex items-center justify-between"
        >
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 bg-green-50 dark:bg-green-900/30 text-green-500 rounded-2xl flex items-center justify-center">
              <CreditCard className="h-5 w-5" />
            </div>
            <div>
              <p className="font-bold">Pagos</p>
              <p className="text-xs text-muted-foreground">
                Facturación y planes
              </p>
            </div>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground group-hover:translate-x-1 transition-all" />
        </Link>

        <Link
          href="/dashboard/admin/demos"
          className="group bg-card rounded-3xl p-6 shadow-sm border border-border hover:shadow-md hover:-translate-y-0.5 transition-all flex items-center justify-between"
        >
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 bg-[#D1F366]/10 dark:bg-[#D1F366]/10 text-[#4a7c00] dark:text-[#D1F366] rounded-2xl flex items-center justify-center">
              <Zap className="h-5 w-5" />
            </div>
            <div>
              <p className="font-bold">Demos / Leads</p>
              <p className="text-xs text-muted-foreground">
                Activar cuentas
              </p>
            </div>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground group-hover:translate-x-1 transition-all" />
        </Link>
      </div>

      {/* Main content: Users + Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recent Users */}
        <div className="bg-card rounded-3xl shadow-sm border border-border overflow-hidden">
          <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-border">
            <div>
              <h3 className="font-bold text-base dark:text-white">
                Usuarios Recientes
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Últimas cuentas registradas
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              asChild
              className="text-xs rounded-xl gap-1"
            >
              <Link href="/dashboard/admin/users">
                Ver todos <ArrowRight className="h-3 w-3" />
              </Link>
            </Button>
          </div>
          <div className="divide-y divide-border">
            {recentUsers && recentUsers.length > 0 ? (
              recentUsers.map((user) => (
                <Link
                  key={user.id}
                  href={`/dashboard/admin/users/${user.id}`}
                  className="flex items-center gap-4 px-6 py-3.5 hover:bg-muted/40 transition-colors"
                >
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                    {getInitials(user.business_name || "U")}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate dark:text-white">
                      {user.business_name || "Sin nombre"}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {user.email}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold border capitalize ${
                        PLAN_COLORS[user.plan_type || "free"] ||
                        PLAN_COLORS.free
                      }`}
                    >
                      {user.plan_type || "free"}
                    </span>
                    <div
                      className={`w-2 h-2 rounded-full flex-shrink-0 ${
                        STATUS_DOT[user.subscription_status || "trialing"] ||
                        STATUS_DOT.trialing
                      }`}
                    />
                  </div>
                </Link>
              ))
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
                <Users className="h-8 w-8 opacity-20" />
                <p className="text-sm">No hay usuarios registrados.</p>
              </div>
            )}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-card rounded-3xl shadow-sm border border-border overflow-hidden">
          <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-border">
            <div>
              <h3 className="font-bold text-base dark:text-white">
                Actividad Reciente
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Últimos eventos del sistema
              </p>
            </div>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="divide-y divide-border">
            {recentActivity && recentActivity.length > 0 ? (
              recentActivity.map((log: any) => (
                <div
                  key={log.id}
                  className="flex items-center gap-4 px-6 py-3.5"
                >
                  <div className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center flex-shrink-0">
                    <MessageSquare className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate dark:text-white">
                      {log.user_profiles?.business_name || "Usuario desconocido"}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {log.description || log.type}
                    </p>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <p
                      className={`text-sm font-bold ${
                        log.amount > 0 ? "text-green-500" : "text-red-500"
                      }`}
                    >
                      {log.amount > 0
                        ? `+$${log.amount}`
                        : `-$${Math.abs(log.amount)}`}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {new Date(log.created_at).toLocaleDateString("es-AR", {
                        day: "2-digit",
                        month: "2-digit",
                      })}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
                <Activity className="h-8 w-8 opacity-20" />
                <p className="text-sm">No hay actividad reciente.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
