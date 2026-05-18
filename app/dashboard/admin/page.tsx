import { createClient } from "@/lib/supabase/server"
import { Users, MessageSquare, DollarSign, Activity, CreditCard, Bot } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

export default async function AdminDashboard() {
  const supabase = await createClient()

  // Fetch real stats
  const { count: userCount } = await supabase.from("user_profiles").select("*", { count: 'exact', head: true })
  const { count: botCount } = await supabase.from("bots").select("*", { count: 'exact', head: true })
  
  // Fetch active trials
  const { count: activeTrials } = await supabase
    .from("user_profiles")
    .select("*", { count: 'exact', head: true })
    .eq("plan_type", "trial")
    .eq("subscription_status", "active")

  // Fetch recent activity (usage logs)
  const { data: recentActivity } = await supabase
    .from("usage_logs")
    .select("*, user_profiles(business_name)")
    .order("created_at", { ascending: false })
    .limit(5)

  // Fetch recent users
  const { data: recentUsers } = await supabase
    .from("user_profiles")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(5)
  
  // Calculate estimated revenue
  // Fetch all users to calculate plan revenue
  const { data: allUsers } = await supabase.from("user_profiles").select("plan_type")
  
  // Calculate plan revenue ($69 for non-trial/free)
  const planRevenue = allUsers?.reduce((acc, user) => {
    if (user.plan_type !== 'trial' && user.plan_type !== 'free') {
      return acc + 69
    }
    return acc
  }, 0) || 0

  // Fetch usage logs for mass messages to calculate usage revenue
  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)
  
  const { data: usageLogs } = await supabase
    .from("usage_logs")
    .select("amount")
    .eq("type", "mass_message")
    .gte("created_at", startOfMonth.toISOString())

  const usageRevenue = usageLogs?.reduce((acc, log) => acc + (Number(log.amount) || 0) * 0.10, 0) || 0
  
  const totalRevenue = planRevenue + usageRevenue

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <h2 className="text-3xl font-bold tracking-tight">Panel de Administración</h2>
        <div className="flex items-center space-x-2">
          <Button variant="outline" asChild>
            <Link href="/dashboard/admin/payments">
              <CreditCard className="mr-2 h-4 w-4" />
              Ver Pagos
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/dashboard/admin/demos">
              <Bot className="mr-2 h-4 w-4" />
              Ver Demos
            </Link>
          </Button>
          <Button asChild>
            <Link href="/dashboard/admin/users">
              <Users className="mr-2 h-4 w-4" />
              Gestionar Usuarios
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Stat Cards */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Usuarios Totales</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{userCount || 0}</div>
            <p className="text-xs text-muted-foreground">
              Usuarios registrados
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Bots Activos</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{botCount || 0}</div>
            <p className="text-xs text-muted-foreground">
              Bots creados en total
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ingresos (Est.)</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${totalRevenue.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">
              Planes + Uso (Mes actual)
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pruebas Activas</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeTrials || 0}</div>
            <p className="text-xs text-muted-foreground">
              Usuarios en periodo de prueba
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Recent Users Section */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Usuarios Recientes</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/dashboard/admin/users">Ver todos</Link>
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentUsers?.map((user) => (
                <div key={user.id} className="flex items-center justify-between border-b pb-4 last:border-0 last:pb-0">
                  <div className="space-y-1">
                    <p className="text-sm font-medium leading-none">
                      {user.business_name || "Sin nombre comercial"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {user.email}
                    </p>
                  </div>
                  <div className="text-right">
                    <Badge variant={user.subscription_status === 'active' ? 'default' : 'secondary'}>
                      {user.plan_type}
                    </Badge>
                  </div>
                </div>
              ))}
              {(!recentUsers || recentUsers.length === 0) && (
                <div className="text-center py-8 text-muted-foreground">
                  No hay usuarios registrados.
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Recent Activity Section */}
        <Card>
          <CardHeader>
            <CardTitle>Actividad Reciente del Sistema</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentActivity?.map((log: any) => (
                <div key={log.id} className="flex items-center justify-between border-b pb-4 last:border-0 last:pb-0">
                  <div className="space-y-1">
                    <p className="text-sm font-medium leading-none">
                      {log.user_profiles?.business_name || "Usuario Desconocido"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {log.description || log.type}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="font-medium text-sm">
                      {log.amount > 0 ? `+$${log.amount}` : `-$${Math.abs(log.amount)}`}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {new Date(log.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
              {(!recentActivity || recentActivity.length === 0) && (
                <div className="text-center py-8 text-muted-foreground">
                  No hay actividad reciente registrada.
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
