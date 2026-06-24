import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { DashboardOverview } from "@/components/dashboard/dashboard-overview"
import { PageTransition } from "@/components/ui/page-transition"

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
