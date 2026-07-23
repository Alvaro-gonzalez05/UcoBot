import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { BotsManagement } from "@/components/dashboard/bots-management"
import { PageTransition } from "@/components/ui/page-transition"
import { getAccountContext } from "@/lib/account"
import { BranchViewBanner } from "@/components/dashboard/branch-view-banner"

export default async function BotsPage({
  searchParams,
}: {
  searchParams: { sucursal?: string }
}) {
  const supabase = await createClient()

  const { data, error } = await supabase.auth.getUser()
  if (error || !data?.user) {
    redirect("/login")
  }

  // ?sucursal=<id>: el dueño mira los chatbots de una sucursal (solo lectura)
  const account = await getAccountContext(searchParams?.sucursal)
  const ownerId = account?.ownerId || data.user.id

  // Get bots for this user
  const { data: bots } = await supabase
    .from("bots")
    .select("*")
    .eq("user_id", ownerId)
    .order("created_at", { ascending: false })

  return (
    <>
      {account?.viewingBranch && (
        <div className="px-4 pt-4 lg:px-0">
          <BranchViewBanner branchName={account.viewingBranch.name} />
        </div>
      )}
      <BotsManagement initialBots={bots || []} userId={ownerId} />
    </>
  )
}
