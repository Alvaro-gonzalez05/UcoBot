import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { ChatView } from "../../../components/dashboard/chat/chat-view"
import { getAccountContext } from "@/lib/account"
import { BranchViewBanner } from "@/components/dashboard/branch-view-banner"

export default async function ChatPage({
  searchParams,
}: {
  searchParams: { sucursal?: string }
}) {
  const supabase = await createClient()

  const { data, error } = await supabase.auth.getUser()
  if (error || !data?.user) {
    redirect("/login")
  }

  // Si es empleado, opera sobre los datos del dueño.
  // ?sucursal=<id>: el dueño mira las conversaciones de una sucursal (solo lectura).
  const account = await getAccountContext(searchParams?.sucursal)
  const ownerId = account?.ownerId || data.user.id

  if (account?.viewingBranch) {
    return (
      <div className="-m-4 -mb-28 lg:m-0 flex h-[calc(100dvh-5rem)] flex-col lg:h-[calc(100vh-2rem)]">
        <div className="px-4 pt-4 lg:px-0 lg:pt-0">
          <BranchViewBanner branchName={account.viewingBranch.name} />
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">
          <ChatView userId={ownerId} />
        </div>
      </div>
    )
  }

  return (
    <div className="-m-4 -mb-28 lg:m-0 h-[calc(100dvh-5rem)] lg:h-[calc(100vh-2rem)] overflow-hidden">
      <ChatView userId={ownerId} />
    </div>
  )
}
