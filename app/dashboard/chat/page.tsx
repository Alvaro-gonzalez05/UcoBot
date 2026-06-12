import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { ChatView } from "../../../components/dashboard/chat/chat-view"

export default async function ChatPage() {
  const supabase = await createClient()

  const { data, error } = await supabase.auth.getUser()
  if (error || !data?.user) {
    redirect("/login")
  }

  return (
    <div className="-m-4 lg:m-0 h-[calc(100dvh-5rem)] lg:h-[calc(100vh-2rem)] overflow-hidden">
      <ChatView userId={data.user.id} />
    </div>
  )
}
