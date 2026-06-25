import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { ChatView } from "../../../components/dashboard/chat/chat-view"
import { getAccountContext } from "@/lib/account"

export default async function ChatPage() {
  const supabase = await createClient()

  const { data, error } = await supabase.auth.getUser()
  if (error || !data?.user) {
    redirect("/login")
  }

  // Si es empleado, opera sobre los datos del dueño.
  const account = await getAccountContext()
  const ownerId = account?.ownerId || data.user.id

  return (
    <div className="-m-4 -mb-28 lg:m-0 h-[calc(100dvh-5rem)] lg:h-[calc(100vh-2rem)] overflow-hidden">
      <ChatView userId={ownerId} />
    </div>
  )
}
