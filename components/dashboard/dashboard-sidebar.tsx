"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import Image from "next/image"
import { ChevronLeft, ChevronRight, Menu } from "lucide-react"
import type { User } from "@supabase/supabase-js"
import ProfileDropdown from "./ProfileDropdown"
import NotificationsDropdown from "./NotificationsDropdown"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"

interface NavigationItem {
  name: string
  href: string
  icon: string // Material Symbols Outlined icon name
  requiresFeature?: string
  requiresAdmin?: boolean
  visible?: boolean
}

const baseNavigation: NavigationItem[] = [
  { name: "Resumen", href: "/dashboard", icon: "dashboard" },
  { name: "Chatbots", href: "/dashboard/bots", icon: "forum" },
  { name: "Mensajes", href: "/dashboard/chat", icon: "chat_bubble" },
  { name: "Clientes", href: "/dashboard/clientes", icon: "group" },
  { name: "Pedidos", href: "/dashboard/pedidos", icon: "shopping_cart", requiresFeature: "take_orders" },
  { name: "Reservas", href: "/dashboard/reservas", icon: "calendar_month", requiresFeature: "take_reservations" },
  { name: "Promociones", href: "/dashboard/promociones", icon: "local_offer" },
  { name: "Automatizaciones", href: "/dashboard/automatizaciones", icon: "account_tree" },
  { name: "Admin", href: "/dashboard/admin", icon: "shield", requiresAdmin: true },
]

interface DashboardSidebarProps {
  onLinkClick?: () => void
  mode?: 'desktop' | 'mobile'
  user?: User
  profile?: any
}

export function DashboardSidebar({ onLinkClick, mode = 'desktop', user, profile }: DashboardSidebarProps) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const [navigation, setNavigation] = useState<NavigationItem[]>(() =>
    baseNavigation.map(item => ({
      ...item,
      visible: !item.requiresFeature && !item.requiresAdmin
    }))
  )
  const [hasNewMessages, setHasNewMessages] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const supabase = createClient()

  const checkNewMessages = async (uid?: string) => {
    try {
      const currentUserId = uid || userId
      if (!currentUserId) return
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
      const { count } = await supabase
        .from('conversations')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', currentUserId)
        .gt('last_message_at', oneHourAgo)
      setHasNewMessages((count || 0) > 0)
    } catch (error) {
      console.error('Error checking new messages:', error)
    }
  }

  const updateNavigation = async () => {
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (!authUser) return
      if (!userId) setUserId(authUser.id)

      const { data: bots, error: botsError } = await supabase
        .from("bots").select("features").eq("user_id", authUser.id)
      if (botsError) { console.error('Error fetching bots for sidebar:', botsError); return }

      const { data: userProfile } = await supabase
        .from("user_profiles").select("role").eq("id", authUser.id).single()
      const isAdmin = userProfile?.role === 'admin'

      if (!bots || bots.length === 0) {
        setNavigation(baseNavigation.map(item => ({
          ...item,
          visible: (!item.requiresFeature && !item.requiresAdmin) || (item.requiresAdmin && isAdmin)
        })))
        return
      }

      const allFeatures = new Set<string>()
      bots.forEach((bot) => {
        if (bot.features && Array.isArray(bot.features)) {
          bot.features.forEach((feature: string) => allFeatures.add(feature))
        }
      })

      setNavigation(baseNavigation.map(item => {
        let isVisible = true
        if (item.requiresFeature) isVisible = allFeatures.has(item.requiresFeature)
        if (item.requiresAdmin) isVisible = isAdmin
        return { ...item, visible: isVisible }
      }))
    } catch (error) {
      console.error('Error updating navigation:', error)
      setNavigation(baseNavigation.map(item => ({ ...item, visible: true })))
    }
  }

  useEffect(() => {
    updateNavigation()
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) { setUserId(data.user.id); checkNewMessages(data.user.id) }
    })
    const handleBotUpdate = () => updateNavigation()
    window.addEventListener('botCreated', handleBotUpdate)
    window.addEventListener('botUpdated', handleBotUpdate)
    const handleRouteChange = () => { setTimeout(() => { updateNavigation(); checkNewMessages() }, 500) }
    window.addEventListener('focus', handleRouteChange)
    const messageInterval = setInterval(() => checkNewMessages(), 60000)
    return () => {
      window.removeEventListener('botCreated', handleBotUpdate)
      window.removeEventListener('botUpdated', handleBotUpdate)
      window.removeEventListener('focus', handleRouteChange)
      clearInterval(messageInterval)
    }
  }, [supabase])

  useEffect(() => {
    if (!userId) return
    const channel = supabase
      .channel('sidebar_conversations')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations', filter: `user_id=eq.${userId}` }, () => setHasNewMessages(true))
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [userId, supabase])

  const isMobile = mode === 'mobile'
  const isCollapsed = isMobile ? false : collapsed

  return (
    <aside className={cn(
      "bg-[#1C1C28] text-white flex-shrink-0 flex flex-col p-4 sm:p-5 shadow-2xl transition-all duration-300 relative",
      isMobile ? "w-full h-full rounded-none" : "m-4 rounded-[2.5rem] h-[calc(100vh-2rem)]",
      isCollapsed ? "w-22" : "w-64"
    )}>
      {/* Collapse toggle — Desktop only. Positioned top right */}
      {!isMobile && (
        <button
          onClick={() => setCollapsed(!collapsed)}
          className={cn(
            "absolute top-6 z-10 w-7 h-7 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-gray-400 hover:text-[#D1F366] hover:bg-white/10 transition-all",
            isCollapsed ? "left-1/2 -translate-x-1/2 top-20" : "right-5"
          )}
        >
          {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
        </button>
      )}

      {/* Top section: Logo + Scrollable Nav */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* Logo */}
        <div className={cn(
          "flex items-center mb-8 mt-2",
          isCollapsed ? "justify-center" : "gap-3 px-2"
        )}>
          <Image
            src="/ucobot-logo.png"
            alt="UcoBot Logo"
            width={40}
            height={40}
            className="w-10 h-10 flex-shrink-0"
          />
          {!isCollapsed && (
            <div className="flex flex-col">
              <span className="text-lg font-bold text-white">UcoBot</span>
              <span className="text-[10px] text-gray-400 uppercase tracking-widest">CODEA DESARROLLOS</span>
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-0.5 overflow-y-auto hide-scrollbar pb-4">
          {navigation
            .filter(item => item.visible !== false)
            .map((item) => {
              const isActive = pathname === item.href
              return (
                <Link
                  key={item.name + item.href}
                  href={item.href}
                  onClick={onLinkClick}
                  className={cn(
                    "flex items-center gap-4 py-3 rounded-2xl transition-all active:scale-95",
                    isActive
                      ? "bg-[#D1F366] text-[#1C1C28] font-semibold shadow-lg shadow-[#D1F366]/10"
                      : "text-gray-400 sidebar-item transition-colors",
                    isCollapsed ? "justify-center px-3" : "px-4"
                  )}
                >
                  <span className={cn(
                    "material-symbols-outlined text-xl flex-shrink-0",
                    isActive ? "text-[#1C1C28]" : ""
                  )}>{item.icon}</span>
                  {!isCollapsed && (
                    <span className="truncate">{item.name}</span>
                  )}
                  {!isCollapsed && item.name === "Mensajes" && hasNewMessages && (
                    <span className="ml-auto h-2.5 w-2.5 rounded-full bg-blue-500 animate-pulse flex-shrink-0" />
                  )}
                  {isCollapsed && item.name === "Mensajes" && hasNewMessages && (
                    <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
                  )}
                </Link>
              )
            })}
        </nav>
      </div>

      {/* Bottom section — Profile (left) + Notifications (right) */}
      <div className={cn(
        "flex items-center justify-between pt-4 pb-2 border-t border-white/10 shrink-0",
        isCollapsed ? "flex-col gap-4" : ""
      )}>
        {user && profile ? (
          <ProfileDropdown user={user} profile={profile} />
        ) : <div />}
        <NotificationsDropdown />
      </div>
    </aside>
  )
}

/* ============================================
   Mobile Header — only shows hamburger + sidebar
   ============================================ */
interface MobileHeaderProps {
  user?: User
  profile?: any
}

export function MobileHeader({ user, profile }: MobileHeaderProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  return (
    <div className="lg:hidden flex items-center justify-between px-4 py-3 bg-background border-b border-border">
      <div className="flex items-center gap-2">
        <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="-ml-2">
              <Menu className="h-6 w-6" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="p-0 w-[85vw] sm:w-72 bg-[#1C1C28] border-none">
            <DashboardSidebar 
              mode="mobile" 
              onLinkClick={() => setIsMobileMenuOpen(false)} 
              user={user}
              profile={profile}
            />
          </SheetContent>
        </Sheet>
        <Image src="/ucobot-logo.png" alt="UcoBot" width={28} height={28} className="w-7 h-7" />
        <span className="text-sm font-bold">UcoBot</span>
      </div>
      <div className="flex items-center gap-2">
        {user && profile && <ProfileDropdown user={user} profile={profile} />}
        <NotificationsDropdown />
      </div>
    </div>
  )
}
