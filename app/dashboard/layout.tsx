import type React from "react"
import Link from "next/link"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { DashboardSidebar, MobileHeader } from "@/components/dashboard/dashboard-sidebar"
import { MobileBottomBar } from "@/components/dashboard/mobile-bottom-bar"
import { isSubscriptionActive } from "@/lib/subscription"

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

        <main id="dashboard-main" className="flex-1 overflow-y-auto hide-scrollbar py-4 pr-4 pl-4 lg:pl-0 pb-28 lg:pb-4">
          {!isSubscriptionActive(profile?.subscription_status) && (
            <Link
              href="/dashboard/configuracion"
              className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-red-300 bg-red-50 dark:bg-red-950/30 dark:border-red-900 px-4 py-3 text-sm hover:bg-red-100 dark:hover:bg-red-950/50 transition-colors"
            >
              <span className="text-red-800 dark:text-red-300">
                <strong>Tu abono no está al día.</strong> El bot dejó de responder a tus clientes. Reactivá tu suscripción para volver a operar.
              </span>
              <span className="shrink-0 rounded-lg bg-red-600 text-white px-3 py-1.5 text-xs font-bold">
                Reactivar abono
              </span>
            </Link>
          )}
          {children}
        </main>
      </div>

      {/* Downbar móvil estilo glass (reemplaza al sidebar en mobile) */}
      <MobileBottomBar user={data.user} profile={profile} />
    </div>
  )
}
