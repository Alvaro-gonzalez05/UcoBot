"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  BarChart3,
  Users,
  Bot,
  Gift,
  Zap,
  Building2,
  TestTube,
  Settings,
  Crown,
  DoorOpen,
  Check,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import type { User } from "@supabase/supabase-js"

// Navegación izquierda (4 elementos)
const leftNavigation = [
  {
    name: "Dashboard",
    href: "/dashboard",
    icon: BarChart3,
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
    name: "Promociones",
    href: "/dashboard/promociones",
    icon: Gift,
  },
]

// Navegación derecha (3 elementos)
const rightNavigation = [
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
  const router = useRouter()
  const supabase = createClient()

  const isActive = (href: string) => pathname === href

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push("/")
  }

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2)
  }

  return (
    <div className="fixed bottom-4 left-4 right-4 flex justify-center z-50 lg:hidden">
      <nav className="flex items-center justify-between px-3 py-2 rounded-2xl border bg-background/95 backdrop-blur-md shadow-lg max-w-full w-full">
        {/* Navegación Izquierda */}
        <div className="flex items-center space-x-1">
          {leftNavigation.map((item) => (
            <Button
              key={item.name}
              variant={isActive(item.href) ? "default" : "ghost"}
              size="icon"
              className={cn(
                "rounded-xl h-9 w-9",
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
        </div>

        {/* Perfil Central */}
        <div className="mx-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="rounded-full h-10 w-10 bg-primary/10 hover:bg-primary/20"
              >
                <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-medium">
                  {getInitials(profile?.business_name || user?.email || "U")}
                </div>
                <span className="sr-only">Perfil</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" className="mb-2 w-56">
              {/* User Info Header */}
              <div className="px-2 py-1.5">
                <div className="flex items-center space-x-2">
                  <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">
                    {getInitials(profile?.business_name || user?.email || "U")}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">
                      {profile?.business_name || "Mi Negocio"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {user?.email}
                    </span>
                  </div>
                  <div className="flex items-center justify-center w-4 h-4 bg-blue-500 rounded-full">
                    <Check className="w-2.5 h-2.5 text-white" />
                  </div>
                </div>
              </div>
              <DropdownMenuSeparator />
              
              <DropdownMenuItem onClick={() => router.push("/dashboard/configuracion")}>
                <Settings className="mr-2 h-4 w-4" />
                Configuración
              </DropdownMenuItem>
              
              <DropdownMenuItem onClick={() => console.log("Upgrade clicked")}>
                <Crown className="mr-2 h-4 w-4" />
                Upgrade to Pro
              </DropdownMenuItem>
              
              <DropdownMenuSeparator />
              
              <DropdownMenuItem onClick={handleSignOut} className="text-red-600">
                <DoorOpen className="mr-2 h-4 w-4" />
                Cerrar Sesión
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Navegación Derecha */}
        <div className="flex items-center space-x-1">
          {rightNavigation.map((item) => (
            <Button
              key={item.name}
              variant={isActive(item.href) ? "default" : "ghost"}
              size="icon"
              className={cn(
                "rounded-xl h-9 w-9",
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
        </div>
      </nav>
    </div>
  )
}
              )}>
                <Building2 className="mr-2 h-4 w-4" />
                Mi Negocio
              </Link>
            </DropdownMenuItem>

          </DropdownMenuContent>
        </DropdownMenu>

        {/* Promociones */}
        <Button 
          variant={isActive("/dashboard/promociones") ? "default" : "ghost"} 
          size="icon" 
          className={cn(
            "rounded-xl h-10 w-10",
            isActive("/dashboard/promociones") && "bg-primary shadow-sm"
          )}
          asChild
        >
          <Link href="/dashboard/promociones">
            <Gift className="h-4 w-4" />
            <span className="sr-only">Promociones</span>
          </Link>
        </Button>

        {/* Configuración */}
        <Button 
          variant={isActive("/dashboard/configuracion") ? "default" : "ghost"} 
          size="icon" 
          className={cn(
            "rounded-xl h-10 w-10",
            isActive("/dashboard/configuracion") && "bg-primary shadow-sm"
          )}
          asChild
        >
          <Link href="/dashboard/configuracion">
            <Settings className="h-4 w-4" />
            <span className="sr-only">Configuración</span>
          </Link>
        </Button>
      </nav>
    </div>
  );
}