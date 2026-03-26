import type React from "react"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { DashboardSidebar, MobileHeader } from "@/components/dashboard/dashboard-sidebar"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()

  const { data, error } = await supabase.auth.getUser()
  if (error || !data?.user) {
    redirect("/login")
  }

  // Get user profile
  const { data: profile } = await supabase.from("user_profiles").select("*").eq("id", data.user.id).single()

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Sidebar - hidden on mobile */}
      <div className="hidden lg:flex flex-shrink-0">
        <DashboardSidebar user={data.user} profile={profile} />
      </div>
      
      {/* Main content area */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Mobile header with hamburger — only visible on mobile */}
        <MobileHeader user={data.user} profile={profile} />

        <main className="flex-1 overflow-y-auto hide-scrollbar py-4 pr-4 pl-4 lg:pl-0">
          {children}
        </main>
      </div>
    </div>
  )
}
