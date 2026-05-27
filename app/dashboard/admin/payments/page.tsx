import { createClient } from "@/lib/supabase/server"
import { ArrowLeft, CreditCard, DollarSign, MessageSquare, TrendingUp, Users } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import Link from "next/link"

export default async function AdminPaymentsPage() {
  const supabase = await createClient()

  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)
  const startOfMonthStr = startOfMonth.toISOString()

  const { data: users } = await supabase
    .from("user_profiles")
    .select("*")
    .order("created_at", { ascending: false })

  const { data: usageLogs } = await supabase
    .from("usage_logs")
    .select("*")
    .gte("created_at", startOfMonthStr)

  const userCosts =
    users?.map((user) => {
      const userLogs =
        usageLogs?.filter((log) => log.user_id === user.id) || []
      const massMessagesCount = userLogs
        .filter((log) => log.type === "mass_message")
        .reduce((acc, log) => acc + (Number(log.amount) || 0), 0)
      const massMessagesCost = massMessagesCount * 0.1
      const isTrial =
        user.plan_type === "trial" || user.plan_type === "free"
      const planCost = isTrial ? 0 : 69.0
      return {
        ...user,
        massMessagesCount,
        massMessagesCost,
        planCost,
        totalDue: planCost + massMessagesCost,
      }
    }) || []

  const totalRevenue = userCosts.reduce((acc, u) => acc + u.totalDue, 0)
  const totalMassMessages = userCosts.reduce(
    (acc, u) => acc + u.massMessagesCount,
    0
  )
  const paidUsers = userCosts.filter((u) => u.planCost > 0).length

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center gap-4 px-1 pt-2">
        <Button
          variant="ghost"
          size="icon"
          asChild
          className="rounded-xl h-9 w-9 flex-shrink-0"
        >
          <Link href="/dashboard/admin">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h2 className="text-3xl font-bold dark:text-white">
            Pagos y Facturación
          </h2>
          <p className="text-muted-foreground text-sm mt-0.5">
            Periodo:{" "}
            {startOfMonth.toLocaleDateString("es-ES", {
              month: "long",
              year: "numeric",
            })}
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-card rounded-3xl p-5 shadow-sm border border-border flex items-center gap-4">
          <div className="w-12 h-12 bg-green-50 dark:bg-green-900/30 text-green-500 rounded-2xl flex items-center justify-center flex-shrink-0">
            <DollarSign className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">
              Ingresos Est.
            </p>
            <p className="text-2xl font-bold dark:text-white">
              ${totalRevenue.toFixed(2)}
            </p>
          </div>
        </div>

        <div className="bg-card rounded-3xl p-5 shadow-sm border border-border flex items-center gap-4">
          <div className="w-12 h-12 bg-blue-50 dark:bg-blue-900/30 text-blue-500 rounded-2xl flex items-center justify-center flex-shrink-0">
            <Users className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">
              Clientes pago
            </p>
            <p className="text-2xl font-bold dark:text-white">{paidUsers}</p>
          </div>
        </div>

        <div className="bg-card rounded-3xl p-5 shadow-sm border border-border flex items-center gap-4 col-span-2 lg:col-span-1">
          <div className="w-12 h-12 bg-violet-50 dark:bg-violet-900/30 text-violet-500 rounded-2xl flex items-center justify-center flex-shrink-0">
            <MessageSquare className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">
              Mensajes masivos
            </p>
            <p className="text-2xl font-bold dark:text-white">
              {totalMassMessages}
            </p>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-card rounded-3xl shadow-sm border border-border overflow-hidden">
        <div className="px-6 pt-5 pb-4 border-b border-border">
          <h3 className="font-bold text-base dark:text-white">
            Detalle por Usuario
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Planes ($69/mes) + mensajes masivos ($0.10/msg)
          </p>
        </div>

        {/* Header row */}
        <div className="grid grid-cols-7 gap-2 px-6 py-3 bg-muted/40 border-b border-border text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          <div className="col-span-2">Cliente</div>
          <div className="text-center">Plan</div>
          <div className="text-right">Plan $</div>
          <div className="text-right">Msgs</div>
          <div className="text-right">Uso $</div>
          <div className="text-right">Total</div>
        </div>

        {/* Body */}
        <div className="divide-y divide-border">
          {userCosts.length > 0 ? (
            userCosts.map((user) => (
              <Link
                key={user.id}
                href={`/dashboard/admin/users/${user.id}`}
                className="grid grid-cols-7 gap-2 px-6 py-4 items-center hover:bg-muted/30 transition-colors"
              >
                <div className="col-span-2 flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                    {(user.business_name || "U").slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate dark:text-white">
                      {user.business_name || "Sin nombre"}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {user.email}
                    </p>
                  </div>
                </div>

                <div className="text-center">
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                      user.plan_type === "trial" || user.plan_type === "free"
                        ? "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400"
                        : "bg-[#D1F366]/10 text-[#4a7c00] border-[#D1F366]/30 dark:text-[#D1F366]"
                    }`}
                  >
                    {user.plan_type === "trial" || user.plan_type === "free"
                      ? "Trial"
                      : "Pro"}
                  </span>
                </div>

                <div className="text-right text-sm font-semibold dark:text-white">
                  ${user.planCost.toFixed(2)}
                </div>

                <div className="text-right text-sm text-muted-foreground">
                  {user.massMessagesCount}
                </div>

                <div className="text-right text-sm text-muted-foreground">
                  ${user.massMessagesCost.toFixed(2)}
                </div>

                <div className="text-right">
                  <span
                    className={`text-sm font-bold ${
                      user.totalDue > 0
                        ? "text-green-600 dark:text-green-400"
                        : "text-muted-foreground"
                    }`}
                  >
                    ${user.totalDue.toFixed(2)}
                  </span>
                  {user.subscription_status === "active" ? (
                    <span className="block text-[10px] text-green-500">
                      Al día
                    </span>
                  ) : (
                    <span className="block text-[10px] text-amber-500 capitalize">
                      {user.subscription_status}
                    </span>
                  )}
                </div>
              </Link>
            ))
          ) : (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
              <DollarSign className="h-10 w-10 opacity-20" />
              <p className="text-sm">No hay datos de facturación.</p>
            </div>
          )}
        </div>

        {/* Footer total */}
        {userCosts.length > 0 && (
          <div className="grid grid-cols-7 gap-2 px-6 py-4 bg-muted/40 border-t border-border">
            <div className="col-span-5 flex items-center">
              <TrendingUp className="h-4 w-4 text-green-500 mr-2" />
              <span className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
                Total del período
              </span>
            </div>
            <div className="col-span-2 text-right">
              <span className="text-lg font-bold text-green-600 dark:text-green-400">
                ${totalRevenue.toFixed(2)}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
