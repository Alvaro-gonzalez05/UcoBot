import { createClient } from "@/lib/supabase/server"
import { ArrowLeft, Users, UserCheck, UserX, Clock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { UserListCard } from "@/components/dashboard/admin/user-list-card"
import { CreateUserButton } from "@/components/dashboard/admin/create-user-button"
import Link from "next/link"

export default async function AdminUsersPage() {
  const supabase = await createClient()

  const { data: users } = await supabase
    .from("user_profiles")
    .select("*")
    .order("created_at", { ascending: false })

  // Relaciones de dependencia: sucursales (company_members role 'branch') y
  // empleados (parent_user_id). Sirve para que el dev vea qué cuentas cuelgan de
  // otra (impacto de costos: hoy solo se avisa, no se factura aparte).
  const nameById = new Map<string, string>(
    (users || []).map((u) => [u.id, u.business_name || u.full_name || "Cuenta"])
  )
  const { data: members } = await supabase
    .from("company_members")
    .select("user_id, role, company_id")

  const adminByCompany = new Map<string, string>()
  for (const m of members || []) if (m.role === "company_admin") adminByCompany.set(m.company_id, m.user_id)
  const branchParent = new Map<string, string>()
  for (const m of members || []) if (m.role === "branch") {
    const parent = adminByCompany.get(m.company_id)
    if (parent) branchParent.set(m.user_id, parent)
  }

  const relationOf = (u: any): { type: "sucursal" | "empleado"; parentName: string } | null => {
    if (branchParent.has(u.id)) return { type: "sucursal", parentName: nameById.get(branchParent.get(u.id)!) || "otra cuenta" }
    if (u.parent_user_id) return { type: "empleado", parentName: nameById.get(u.parent_user_id) || "otra cuenta" }
    return null
  }

  const dependentCount = (users || []).filter((u) => relationOf(u) !== null).length

  const totalUsers = users?.length || 0
  const activeUsers =
    users?.filter((u) => u.subscription_status === "active").length || 0
  const suspendedUsers =
    users?.filter((u) => u.subscription_status === "suspended").length || 0
  const trialingUsers =
    users?.filter(
      (u) =>
        u.subscription_status === "trialing" || u.plan_type === "trial"
    ).length || 0

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
        <div className="flex-1">
          <h2 className="text-3xl font-bold dark:text-white">
            Gestión de Usuarios
          </h2>
          <p className="text-muted-foreground text-sm mt-0.5">
            Administra los perfiles y suscripciones de los clientes.
          </p>
        </div>
        <CreateUserButton />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-card rounded-3xl p-5 shadow-sm border border-border flex items-center gap-4">
          <div className="w-12 h-12 bg-blue-50 dark:bg-blue-900/30 text-blue-500 rounded-2xl flex items-center justify-center flex-shrink-0">
            <Users className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">
              Total
            </p>
            <p className="text-2xl font-bold dark:text-white">{totalUsers}</p>
          </div>
        </div>

        <div className="bg-card rounded-3xl p-5 shadow-sm border border-border flex items-center gap-4">
          <div className="w-12 h-12 bg-green-50 dark:bg-green-900/30 text-green-500 rounded-2xl flex items-center justify-center flex-shrink-0">
            <UserCheck className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">
              Activos
            </p>
            <p className="text-2xl font-bold dark:text-white">{activeUsers}</p>
          </div>
        </div>

        <div className="bg-card rounded-3xl p-5 shadow-sm border border-border flex items-center gap-4">
          <div className="w-12 h-12 bg-amber-50 dark:bg-amber-900/30 text-amber-500 rounded-2xl flex items-center justify-center flex-shrink-0">
            <Clock className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">
              En prueba
            </p>
            <p className="text-2xl font-bold dark:text-white">
              {trialingUsers}
            </p>
          </div>
        </div>

        <div className="bg-card rounded-3xl p-5 shadow-sm border border-border flex items-center gap-4">
          <div className="w-12 h-12 bg-red-50 dark:bg-red-900/30 text-red-500 rounded-2xl flex items-center justify-center flex-shrink-0">
            <UserX className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">
              Suspendidos
            </p>
            <p className="text-2xl font-bold dark:text-white">
              {suspendedUsers}
            </p>
          </div>
        </div>
      </div>

      {/* Aviso de cuentas dependientes (sucursales + empleados) */}
      {dependentCount > 0 && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-900/15 px-4 py-3">
          <span className="material-symbols-outlined text-amber-500 mt-0.5">info</span>
          <p className="text-sm text-amber-800 dark:text-amber-300">
            <b>{dependentCount}</b> de estas cuentas dependen de otra (sucursales y empleados). No pagan abono
            aparte: se apoyan en el del dueño. Cada una consume recursos (WhatsApp, IA), tenelo en cuenta para costos.
          </p>
        </div>
      )}

      {/* User list */}
      <div className="space-y-2">
        {users?.map((user) => (
          <UserListCard key={user.id} user={user} relation={relationOf(user)} />
        ))}

        {(!users || users.length === 0) && (
          <div className="bg-card rounded-3xl border border-border p-16 flex flex-col items-center justify-center text-center shadow-sm gap-3">
            <Users className="h-10 w-10 text-muted-foreground opacity-20" />
            <p className="text-muted-foreground">No hay usuarios registrados.</p>
          </div>
        )}
      </div>
    </div>
  )
}
