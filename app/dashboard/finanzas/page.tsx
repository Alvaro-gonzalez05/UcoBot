import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { FinanzasView } from "@/components/dashboard/finanzas-view"
import { PageTransition } from "@/components/ui/page-transition"

export default async function FinanzasPage() {
  const supabase = await createClient()

  const { data, error } = await supabase.auth.getUser()
  if (error || !data?.user) {
    redirect("/login")
  }

  return (
    <PageTransition>
      <FinanzasView userId={data.user.id} />
    </PageTransition>
  )
}
