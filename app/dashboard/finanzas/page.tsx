import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { FinanzasView } from "@/components/dashboard/finanzas-view"
import { PageTransition } from "@/components/ui/page-transition"
import { getAccountContext } from "@/lib/account"
import { BranchViewBanner } from "@/components/dashboard/branch-view-banner"

export default async function FinanzasPage({
  searchParams,
}: {
  searchParams: { sucursal?: string }
}) {
  const supabase = await createClient()

  const { data, error } = await supabase.auth.getUser()
  if (error || !data?.user) {
    redirect("/login")
  }

  // ?sucursal=<id>: el dueño mira las finanzas de una sucursal (solo lectura)
  const account = await getAccountContext(searchParams?.sucursal)
  const ownerId = account?.ownerId || data.user.id

  return (
    <PageTransition>
      {account?.viewingBranch && <BranchViewBanner branchName={account.viewingBranch.name} />}
      <FinanzasView userId={ownerId} branchId={account?.viewingBranch?.id ?? null} />
    </PageTransition>
  )
}
