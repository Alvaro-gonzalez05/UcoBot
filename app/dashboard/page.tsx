import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { DashboardOverview } from "@/components/dashboard/dashboard-overview"
import { EmployeeHome } from "@/components/dashboard/employee-home"

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { skip?: string }
}) {
  const supabase = await createClient()

  const { data, error } = await supabase.auth.getUser()
  if (error || !data?.user) {
    redirect("/login")
  }

  // Get user profile
  const { data: profile } = await supabase.from("user_profiles").select("*").eq("id", data.user.id).single()

  // Si es EMPLEADO: home especial (saludo + accesos), sin métricas ni onboarding de pago.
  if (profile?.parent_user_id) {
    const allowed = Array.isArray(profile.sidebar_config)
      ? profile.sidebar_config.filter((s: any) => s.visible).map((s: any) => s.id)
      : []
    return <EmployeeHome name={profile.full_name || ""} sections={allowed} />
  }

  // Onboarding: si todavía no adhirió el débito automático (y no es exento ni ya paga),
  // lo mandamos a activar su prueba. Con ?skip=1 (botón "explorar primero") lo dejamos pasar.
  if (
    !searchParams?.skip &&
    profile &&
    !profile.mp_preapproval_id &&
    !profile.billing_exempt &&
    profile.subscription_status !== "active"
  ) {
    redirect("/bienvenido")
  }

  return (
    <DashboardOverview user={data.user} profile={profile} />
  )
}
