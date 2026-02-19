"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import Image from "next/image"
import { createClient } from "@/lib/supabase/client"
import {
  Users,
  Gift,
  Settings,
  BarChart3,
  Zap,
  Building2,
  TestTube,
  ChevronLeft,
  ChevronRight,
  Package,
  Calendar,
  ShoppingCart,
  MessageSquare,
  Bot,
  Shield,
} from "lucide-react"

interface NavigationItem {
  name: string
  href: string
  icon: any
  requiresFeature?: string
  requiresAdmin?: boolean
  visible?: boolean
}

const baseNavigation: NavigationItem[] = [
  {
    name: "Dashboard",
    href: "/dashboard",
    icon: BarChart3,
  },
  {
    name: "Mensajes",
    href: "/dashboard/chat",
    icon: MessageSquare,
  },
  {
    name: "Clientes",
    href: "/dashboard/clientes",
    icon: Users,
  },
  {
    name: "Bots",
    href: "/dashboard/bots",
    icon: Bot,
  },
  {
    name: "Pedidos",
    href: "/dashboard/pedidos",
    icon: ShoppingCart,
    requiresFeature: "take_orders",
  },
  {
    name: "Reservas",
    href: "/dashboard/reservas",
    icon: Calendar,
    requiresFeature: "take_reservations",
  },
  {
    name: "Promociones",
    href: "/dashboard/promociones",
    icon: Gift,
  },
  {
    name: "Automatizaciones",
    href: "/dashboard/automatizaciones",
    icon: Zap,
  },
  {
    name: "Mi Negocio",
    href: "/dashboard/negocio",
    icon: Building2,
  },
  {
    name: "Pruebas",
    href: "/dashboard/pruebas",
    icon: TestTube,
  },
  {
    name: "Configuración",
    href: "/dashboard/settings",
    icon: Settings,
  },
  {
    name: "Admin",
    href: "/dashboard/admin",
    icon: Shield,
    requiresAdmin: true,
  },
]

interface DashboardSidebarProps {
  onLinkClick?: () => void
  mode?: 'desktop' | 'mobile'
}

export function DashboardSidebar({ onLinkClick, mode = 'desktop' }: DashboardSidebarProps) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const [navigation, setNavigation] = useState<NavigationItem[]>(() => 
    // Initialize with feature items hidden to avoid flash
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
      
      // Check for conversations with messages in the last hour
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
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      
      if (!userId) setUserId(user.id)

      // Get user's bots and their features
      const { data: bots, error: botsError } = await supabase
        .from("bots")
        .select("features")
        .eq("user_id", user.id)

      console.log('🔍 Updating sidebar navigation...')
      console.log('📊 Found bots:', bots)
      console.log('❌ Botss error:', botsError)

      if (botsError) {
        console.error('Error fetching bots for sidebar:', botsError)
        return
      }

      // Get user profile to check for admin role
      const { data: profile } = await supabase
        .from("user_profiles")
        .select("role")
        .eq("id", user.id)
        .single()
      
      const isAdmin = profile?.role === 'admin'

      if (!bots || bots.length === 0) {
        console.log('⚠️ No bots found, hiding all feature-dependent items')
        const updatedNavigation = baseNavigation.map(item => ({
          ...item,
          visible: (!item.requiresFeature && !item.requiresAdmin) || (item.requiresAdmin && isAdmin)
        }))
        setNavigation(updatedNavigation)
        return
      }

      // Extract all enabled features across all bots
      const allFeatures = new Set<string>()
      bots.forEach((bot, index) => {
        console.log(`🤖 Bot ${index + 1} features:`, bot.features, typeof bot.features)
        if (bot.features && Array.isArray(bot.features)) {
          bot.features.forEach((feature: string) => allFeatures.add(feature))
        }
      })

      console.log('✨ All enabled features:', Array.from(allFeatures))

      // Update navigation based on available features and admin role
      const updatedNavigation = baseNavigation.map(item => {
        let isVisible = true
        
        if (item.requiresFeature) {
          isVisible = allFeatures.has(item.requiresFeature)
        }
        
        if (item.requiresAdmin) {
          isVisible = isAdmin
        }
        
        console.log(`📋 ${item.name}: requiresFeature="${item.requiresFeature}" requiresAdmin="${item.requiresAdmin}" → visible=${isVisible}`)
        return {
          ...item,
          visible: isVisible
        }
      })

      console.log('🎯 Final navigation state:')
      updatedNavigation.forEach(item => {
        if (item.requiresFeature) {
          console.log(`  ${item.name}: ${item.visible ? '✅ VISIBLE' : '❌ HIDDEN'}`)
        }
      })
      
      setNavigation(updatedNavigation)
    } catch (error) {
      console.error('Error updating navigation:', error)
      // Fallback: show all items
      setNavigation(baseNavigation.map(item => ({ ...item, visible: true })))
    }
  }

  useEffect(() => {
    updateNavigation()
    
    // Initial check
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setUserId(data.user.id)
        checkNewMessages(data.user.id)
      }
    })

    // Listen for custom events when bots are created/updated
    const handleBotUpdate = () => {
      console.log('Bot update event received, refreshing navigation...')
      updateNavigation()
    }

    window.addEventListener('botCreated', handleBotUpdate)
    window.addEventListener('botUpdated', handleBotUpdate)

    // Also update navigation when navigating between pages (in case user created/edited a bot)
    const handleRouteChange = () => {
      setTimeout(() => {
        updateNavigation()
        checkNewMessages()
      }, 500) // Small delay to ensure data is saved
    }
    
    window.addEventListener('focus', handleRouteChange)

    // Set up interval to check for new messages every minute
    const messageInterval = setInterval(() => checkNewMessages(), 60000)

    return () => {
      window.removeEventListener('botCreated', handleBotUpdate)
      window.removeEventListener('botUpdated', handleBotUpdate)
      window.removeEventListener('focus', handleRouteChange)
      clearInterval(messageInterval)
    }
  }, [supabase])

  // Realtime subscription for new messages
  useEffect(() => {
    if (!userId) return

    const channel = supabase
      .channel('sidebar_conversations')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'conversations',
          filter: `user_id=eq.${userId}`
        },
        (payload) => {
          // If a conversation is updated or inserted, it means there's activity
          // We can simply set the indicator to true immediately
          setHasNewMessages(true)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [userId, supabase])

  const isMobile = mode === 'mobile'
  const isCollapsed = isMobile ? false : collapsed

  return (
    <div
      className={cn(
        "flex flex-col bg-sidebar border-r border-sidebar-border transition-all duration-300 h-full",
        isCollapsed ? "w-16" : "w-full lg:w-64",
      )}
    >
      {/* Logo */}
      <div className="flex items-center justify-between p-4 border-b border-sidebar-border">
        {!isCollapsed && (
          <div className="flex items-center space-x-2">
            <Image src="/ucobot-logo.png" alt="UcoBot" width={24} height={24} className="text-primary" />
            <span className="text-lg font-bold text-sidebar-foreground">UcoBot</span>
          </div>
        )}
        {!isMobile && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCollapsed(!collapsed)}
            className="text-sidebar-foreground hover:bg-sidebar-accent"
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </Button>
        )}
      </div>

      {/* Navigation */}
      <ScrollArea className="flex-1 px-3 py-4">
        <nav className="space-y-1">
          {navigation
            .filter(item => item.visible !== false)
            .map((item) => {
              const isActive = pathname === item.href
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={onLinkClick}
                  className={cn(
                    "flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors",
                    isActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                    isCollapsed && "justify-center",
                  )}
                >
                  <div className="relative">
                    <item.icon className={cn("h-4 w-4", !isCollapsed && "mr-3")} />
                    {item.name === "Mensajes" && hasNewMessages && isCollapsed && (
                      <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
                    )}
                  </div>
                  {!isCollapsed && (
                    <div className="flex items-center justify-between flex-1">
                      <span>{item.name}</span>
                      {item.name === "Mensajes" && hasNewMessages && (
                        <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
                      )}
                    </div>
                  )}
                </Link>
              )
            })}
        </nav>
      </ScrollArea>

      {/* Footer */}
      {!isCollapsed && (
        <div className="p-4 border-t border-sidebar-border">
          <div className="text-xs text-sidebar-foreground/60 text-center">UcoBot v1.0</div>
        </div>
      )}
    </div>
  )
}
