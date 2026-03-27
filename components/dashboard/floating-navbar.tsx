"use client"

import * as React from "react"
import Link from "next/link"
import { useState, useEffect } from "react"
import { usePathname } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  BarChart3,
  Users,
  Bot,
  Gift,
  Zap,
  Building2,
  TestTube,
  Package,
  Calendar,
  ShoppingCart,
  MessageSquare,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import type { User } from "@supabase/supabase-js"

interface NavigationItem {
  name: string
  href: string
  icon: any
  requiresFeature?: string
}

interface NavigationItemWithVisibility extends NavigationItem {
  visible: boolean
}

// Navigation items maintaining the original structure but adding dynamic features
const navigationItems: NavigationItem[] = [
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
]

interface FloatingNavbarProps {
  user?: User
  profile?: any
}

export function FloatingNavbar({ user, profile }: FloatingNavbarProps) {
  const pathname = usePathname()
  // Initialize with base navigation
  const [navigation, setNavigation] = useState<NavigationItemWithVisibility[]>(
    navigationItems.map(item => ({ ...item, visible: !item.requiresFeature }))
  )

  const isActive = (href: string) => pathname === href

  // Update navigation based on bot features (same logic as sidebar)
  const updateNavigation = async () => {
    if (!user) return

    try {
      const supabase = createClient()
      
      const { data: bots, error } = await supabase
        .from("bots")
        .select("features")
        .eq("user_id", user.id)

      if (error || !bots) {
        const updatedNavigation = navigationItems.map(item => ({
          ...item,
          visible: !item.requiresFeature
        }))
        setNavigation(updatedNavigation)
        return
      }

      // Extract all enabled features across all bots
      const allFeatures = new Set<string>()
      bots.forEach((bot) => {
        if (bot.features && Array.isArray(bot.features)) {
          bot.features.forEach((feature: string) => allFeatures.add(feature))
        }
      })

      // Update navigation based on available features
      const updatedNavigation = navigationItems.map(item => {
        const isVisible = item.requiresFeature ? allFeatures.has(item.requiresFeature) : true
        return {
          ...item,
          visible: isVisible
        }
      })
      
      setNavigation(updatedNavigation)
    } catch (error) {
      console.error('Error updating mobile navigation:', error)
      // Fallback: show all items
      setNavigation(navigationItems.map(item => ({ ...item, visible: true })))
    }
  }

  useEffect(() => {
    updateNavigation()
  }, [user])

  // Filter visible items - show all available sections
  const visibleItems = navigation.filter(item => item.visible)

  return (
    <div className="fixed bottom-4 left-4 right-4 flex justify-center z-50 lg:hidden">
      <nav className="flex items-center justify-center gap-1 px-2 py-2 rounded-2xl border bg-background/95 backdrop-blur-md shadow-lg overflow-x-auto">
        {visibleItems.map((item) => (
          <Button
            key={item.name}
            variant={isActive(item.href) ? "default" : "ghost"}
            size="icon"
            className={cn(
              "rounded-xl h-9 w-9 flex-shrink-0",
              isActive(item.href) && "bg-primary shadow-sm"
            )}
            asChild
          >
            <Link href={item.href}>
              <item.icon className="h-4 w-4" />
              <span className="sr-only">{item.name}</span>
            </Link>
          </Button>
        ))}
      </nav>
    </div>
  )
}