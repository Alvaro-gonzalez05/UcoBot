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

      {/* User list */}
      <div className="space-y-2">
        {users?.map((user) => (
          <UserListCard key={user.id} user={user} />
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
