import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { ArrowLeft, DollarSign, TrendingUp, Users, Receipt } from "lucide-react"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { isSubscriptionActive } from "@/lib/subscription"
import { ExemptToggle } from "@/components/dashboard/admin/exempt-toggle"

const fmt = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 })

function statusLabel(u: any): { text: string; cls: string } {
  if (u.billing_exempt) return { text: "Pago manual", cls: "bg-emerald-100 text-emerald-800 border-emerald-200" }
  if (isSubscriptionActive(u)) {
    if (u.subscription_status === "trial" || u.subscription_status === "trialing")
      return { text: "En prueba", cls: "bg-blue-100 text-blue-800 border-blue-200" }
    return { text: "Al día", cls: "bg-emerald-100 text-emerald-800 border-emerald-200" }
  }
  if (u.subscription_status === "past_due") return { text: "Pago vencido", cls: "bg-red-100 text-red-800 border-red-200" }
  if (u.subscription_status === "cancelled") return { text: "Cancelada", cls: "bg-neutral-100 text-neutral-700 border-neutral-200" }
  return { text: "Sin abono", cls: "bg-amber-100 text-amber-800 border-amber-200" }
}

export default async function AdminPaymentsPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")
  const { data: me } = await supabase.from("user_profiles").select("role").eq("id", user.id).single()
  if (me?.role !== "admin") redirect("/dashboard")

  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)

  // Pagos reales de suscripción (gracias a la policy is_admin, el admin ve todos)
  const { data: payments } = await supabase
    .from("subscription_payments")
    .select("*")
    .eq("status", "approved")
    .order("paid_at", { ascending: false })

  const { data: users } = await supabase
    .from("user_profiles")
    .select("id, business_name, full_name, subscription_status, billing_exempt, trial_ends_at")

  const userById = new Map((users || []).map((u) => [u.id, u]))

  const allPayments = payments || []
  const totalAllTime = allPayments.reduce((acc, p) => acc + Number(p.amount || 0), 0)
  const totalThisMonth = allPayments
    .filter((p) => p.paid_at && new Date(p.paid_at) >= startOfMonth)
    .reduce((acc, p) => acc + Number(p.amount || 0), 0)
  const activeSubscribers = (users || []).filter((u) => u.subscription_status === "active").length

  // Total recaudado por usuario
  const byUser = new Map<string, { total: number; count: number; last: string | null }>()
  for (const p of allPayments) {
    if (!p.user_id) continue
    const cur = byUser.get(p.user_id) || { total: 0, count: 0, last: null }
    cur.total += Number(p.amount || 0)
    cur.count += 1
    if (!cur.last || (p.paid_at && new Date(p.paid_at) > new Date(cur.last))) cur.last = p.paid_at
    byUser.set(p.user_id, cur)
  }
  // Listamos TODOS los usuarios (incluye los de pago manual que no tienen cobros de MP)
  const perUser = (users || [])
    .map((u) => {
      const v = byUser.get(u.id) || { total: 0, count: 0, last: null }
      return { ...u, total: v.total, count: v.count, last: v.last, name: u.business_name || "Usuario" }
    })
    .sort((a, b) => b.total - a.total)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-4 px-1 pt-2">
        <Button variant="ghost" size="icon" asChild className="rounded-xl h-9 w-9 flex-shrink-0">
          <Link href="/dashboard/admin"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div>
          <h2 className="text-3xl font-bold dark:text-white">Pagos y Facturación</h2>
          <p className="text-muted-foreground text-sm mt-0.5">Cobros reales de las suscripciones de UcoBot (Mercado Pago).</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-card rounded-3xl p-5 shadow-sm border border-border flex items-center gap-4">
          <div className="w-12 h-12 bg-green-50 dark:bg-green-900/30 text-green-500 rounded-2xl flex items-center justify-center flex-shrink-0">
            <DollarSign className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">Recaudado total</p>
            <p className="text-2xl font-bold dark:text-white">{fmt.format(totalAllTime)}</p>
          </div>
        </div>
        <div className="bg-card rounded-3xl p-5 shadow-sm border border-border flex items-center gap-4">
          <div className="w-12 h-12 bg-[#D1F366]/15 text-[#4a7c00] dark:text-[#D1F366] rounded-2xl flex items-center justify-center flex-shrink-0">
            <TrendingUp className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">Este mes</p>
            <p className="text-2xl font-bold dark:text-white">{fmt.format(totalThisMonth)}</p>
          </div>
        </div>
        <div className="bg-card rounded-3xl p-5 shadow-sm border border-border flex items-center gap-4">
          <div className="w-12 h-12 bg-blue-50 dark:bg-blue-900/30 text-blue-500 rounded-2xl flex items-center justify-center flex-shrink-0">
            <Users className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">Suscriptores activos</p>
            <p className="text-2xl font-bold dark:text-white">{activeSubscribers}</p>
          </div>
        </div>
        <div className="bg-card rounded-3xl p-5 shadow-sm border border-border flex items-center gap-4">
          <div className="w-12 h-12 bg-violet-50 dark:bg-violet-900/30 text-violet-500 rounded-2xl flex items-center justify-center flex-shrink-0">
            <Receipt className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">Cobros totales</p>
            <p className="text-2xl font-bold dark:text-white">{allPayments.length}</p>
          </div>
        </div>
      </div>

      {/* Clientes: estado + recaudado + exención */}
      <div className="bg-card rounded-3xl shadow-sm border border-border overflow-hidden">
        <div className="px-6 pt-5 pb-4 border-b border-border">
          <h3 className="font-bold text-base dark:text-white">Clientes</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Estado de la suscripción, total recaudado y pago manual.</p>
        </div>
        <div className="divide-y divide-border">
          {perUser.length > 0 ? perUser.map((u) => {
            const st = statusLabel(u)
            return (
              <div key={u.id} className="flex items-center gap-3 px-6 py-4 hover:bg-muted/20 transition-colors">
                <Link href={`/dashboard/admin/users/${u.id}`} className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                    {(u.name || "U").slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate dark:text-white">{u.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {u.count > 0
                        ? `${u.count} cobro${u.count !== 1 ? "s" : ""}${u.last ? ` · último ${new Date(u.last).toLocaleDateString("es-AR")}` : ""}`
                        : "Sin cobros registrados"}
                    </p>
                  </div>
                </Link>
                <span className={`hidden sm:inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold border ${st.cls}`}>
                  {st.text}
                </span>
                <span className="text-sm font-bold text-green-600 dark:text-green-400 w-20 text-right flex-shrink-0">{fmt.format(u.total)}</span>
                <ExemptToggle userId={u.id} exempt={!!u.billing_exempt} />
              </div>
            )
          }) : (
            <div className="flex flex-col items-center justify-center py-12 gap-2 text-muted-foreground">
              <Users className="h-8 w-8 opacity-20" />
              <p className="text-sm">No hay clientes.</p>
            </div>
          )}
        </div>
      </div>

      {/* Últimos cobros */}
      {allPayments.length > 0 && (
        <div className="bg-card rounded-3xl shadow-sm border border-border overflow-hidden">
          <div className="px-6 pt-5 pb-4 border-b border-border">
            <h3 className="font-bold text-base dark:text-white">Últimos cobros</h3>
          </div>
          <div className="divide-y divide-border">
            {allPayments.slice(0, 20).map((p) => (
              <div key={p.id} className="flex items-center gap-4 px-6 py-3.5">
                <div className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center flex-shrink-0">
                  <Receipt className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate dark:text-white">{userById.get(p.user_id)?.business_name || "Usuario"}</p>
                  <p className="text-xs text-muted-foreground">{p.paid_at ? new Date(p.paid_at).toLocaleString("es-AR") : ""}</p>
                </div>
                <span className="text-sm font-bold text-green-600 dark:text-green-400">{fmt.format(Number(p.amount || 0))}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
