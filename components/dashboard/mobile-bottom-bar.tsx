"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import type { User } from "@supabase/supabase-js"
import { AnimatePresence, motion } from "framer-motion"
import { cn } from "@/lib/utils"
import ProfileDropdown from "./ProfileDropdown"

interface MobileBottomBarProps {
  user?: User
  profile?: any
}

// Accesos principales del downbar (estilo Instagram)
const MAIN_ITEMS = [
  { name: "Resumen", href: "/dashboard", icon: "dashboard" },
  { name: "Mensajes", href: "/dashboard/chat", icon: "chat_bubble" },
  { name: "Clientes", href: "/dashboard/clientes", icon: "group" },
]

// El resto de las secciones viven en el panel "Más"
const MORE_ITEMS = [
  { name: "Punto de venta", href: "/dashboard/punto-de-venta", icon: "point_of_sale" },
  { name: "Finanzas", href: "/dashboard/finanzas", icon: "account_balance_wallet" },
  { name: "Pedidos", href: "/dashboard/pedidos", icon: "shopping_cart" },
  { name: "Reservas", href: "/dashboard/reservas", icon: "calendar_month" },
  { name: "Chatbots", href: "/dashboard/bots", icon: "forum" },
  { name: "Formularios", href: "/dashboard/formularios", icon: "description" },
  { name: "Promociones", href: "/dashboard/promociones", icon: "local_offer" },
  { name: "Automatizaciones", href: "/dashboard/automatizaciones", icon: "account_tree" },
]

// Rutas donde el downbar molesta (pantallas de altura completa con input abajo)
const HIDDEN_ROUTES = ["/dashboard/punto-de-venta"]

const glassPanel =
  "bg-white/70 dark:bg-[#1C1C28]/70 backdrop-blur-2xl backdrop-saturate-150 border border-white/40 dark:border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.18)]"

export function MobileBottomBar({ user, profile }: MobileBottomBarProps) {
  const pathname = usePathname()
  const [isMoreOpen, setIsMoreOpen] = useState(false)
  const [isShrunk, setIsShrunk] = useState(false)
  const [isChatOpen, setIsChatOpen] = useState(false)

  // El chat avisa cuando hay una conversación abierta (ahí sí se oculta la barra)
  useEffect(() => {
    const sync = () => setIsChatOpen(document.body.dataset.chatOpen === "true")
    sync()
    window.addEventListener("ucobot:chat-state", sync)
    return () => window.removeEventListener("ucobot:chat-state", sync)
  }, [])

  // Animación de scroll: bajar achica la barra, subir la agranda.
  // Se escucha en fase de captura para agarrar el scroll de CUALQUIER contenedor
  // (el main del dashboard, la lista de conversaciones del chat, etc.)
  useEffect(() => {
    const lastPositions = new WeakMap<EventTarget, number>()

    const onScroll = (e: Event) => {
      const raw = e.target as HTMLElement | Document
      const el = raw instanceof Document ? (raw.scrollingElement as HTMLElement | null) : raw
      if (!el || typeof el.scrollTop !== "number") return

      const current = el.scrollTop
      const last = lastPositions.get(el) ?? current
      lastPositions.set(el, current)

      const delta = current - last
      if (Math.abs(delta) < 8) return
      setIsShrunk(delta > 0 && current > 40)
    }

    document.addEventListener("scroll", onScroll, { capture: true, passive: true })
    return () => document.removeEventListener("scroll", onScroll, { capture: true })
  }, [])

  // Cerrar el panel "Más" al navegar
  useEffect(() => {
    setIsMoreOpen(false)
  }, [pathname])

  if (HIDDEN_ROUTES.some((r) => pathname?.startsWith(r))) return null
  // En Mensajes la barra vive en la lista de conversaciones, pero no dentro de un chat
  if (pathname?.startsWith("/dashboard/chat") && isChatOpen) return null

  const isActive = (href: string) =>
    href === "/dashboard" ? pathname === "/dashboard" : pathname?.startsWith(href)

  const isMoreActive = MORE_ITEMS.some((item) => isActive(item.href))

  const initials = (profile?.business_name || user?.email || "U")
    .split(" ")
    .map((w: string) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase()

  return (
    <div className="lg:hidden fixed inset-x-0 bottom-0 z-50 pointer-events-none">
      {/* Backdrop del panel Más */}
      <AnimatePresence>
        {isMoreOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/30 backdrop-blur-[2px] pointer-events-auto"
            onClick={() => setIsMoreOpen(false)}
          />
        )}
      </AnimatePresence>

      <div className="relative px-3 pb-3 pt-2" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
        {/* Panel "Más" — glass, aparece sobre la barra */}
        <AnimatePresence>
          {isMoreOpen && (
            <motion.div
              initial={{ opacity: 0, y: 24, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 24, scale: 0.95 }}
              transition={{ type: "spring", stiffness: 380, damping: 30 }}
              className={cn("absolute bottom-full left-3 right-3 mb-2 rounded-[1.75rem] p-4 pointer-events-auto", glassPanel)}
            >
              <div className="grid grid-cols-4 gap-3">
                {MORE_ITEMS.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setIsMoreOpen(false)}
                    className="flex flex-col items-center gap-1.5 py-2 rounded-2xl active:scale-95 transition-transform"
                  >
                    <span
                      className={cn(
                        "w-11 h-11 rounded-2xl flex items-center justify-center",
                        isActive(item.href)
                          ? "bg-[#D1F366] text-[#1C1C28]"
                          : "bg-black/5 dark:bg-white/10 text-foreground"
                      )}
                    >
                      <span className="material-symbols-outlined text-[22px]">{item.icon}</span>
                    </span>
                    <span className="text-[9px] font-semibold text-center leading-tight text-foreground/80">
                      {item.name}
                    </span>
                  </Link>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Downbar */}
        <motion.nav
          animate={{ scale: isShrunk ? 0.88 : 1, y: isShrunk ? 6 : 0, opacity: isShrunk ? 0.92 : 1 }}
          transition={{ type: "spring", stiffness: 320, damping: 28 }}
          style={{ transformOrigin: "bottom center" }}
          className={cn("pointer-events-auto rounded-[2rem] px-2 py-2 flex items-center justify-around", glassPanel)}
        >
          {MAIN_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex flex-col items-center justify-center w-14 py-1 active:scale-90 transition-transform"
            >
              <span
                className={cn(
                  "material-symbols-outlined text-[24px] transition-colors",
                  isActive(item.href) ? "text-[#D1F366]" : "text-foreground/60"
                )}
                style={isActive(item.href) ? { fontVariationSettings: "'FILL' 1" } : undefined}
              >
                {item.icon}
              </span>
              <span className={cn(
                "text-[9px] font-semibold mt-0.5",
                isActive(item.href) ? "text-[#D1F366]" : "text-foreground/50"
              )}>
                {item.name}
              </span>
            </Link>
          ))}

          {/* Más */}
          <button
            type="button"
            onClick={() => setIsMoreOpen((v) => !v)}
            className="flex flex-col items-center justify-center w-14 py-1 active:scale-90 transition-transform"
          >
            <motion.span
              animate={{ rotate: isMoreOpen ? 45 : 0 }}
              transition={{ type: "spring", stiffness: 400, damping: 25 }}
              className={cn(
                "material-symbols-outlined text-[24px] transition-colors",
                isMoreOpen || isMoreActive ? "text-[#D1F366]" : "text-foreground/60"
              )}
            >
              {isMoreOpen ? "close" : "apps"}
            </motion.span>
            <span className={cn(
              "text-[9px] font-semibold mt-0.5",
              isMoreOpen || isMoreActive ? "text-[#D1F366]" : "text-foreground/50"
            )}>
              Más
            </span>
          </button>

          {/* Perfil — abre el mismo dropdown que el header, en versión glass hacia arriba */}
          {user && profile ? (
            <ProfileDropdown
              user={user}
              profile={profile}
              position="downbar"
              trigger={
                <span className="flex flex-col items-center justify-center w-14 py-1 active:scale-90 transition-transform">
                  {profile?.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={profile.avatar_url}
                      alt="Perfil"
                      className="w-7 h-7 rounded-full object-cover border-2 border-[#D1F366]"
                    />
                  ) : (
                    <span className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black bg-[#D1F366] text-[#1C1C28]">
                      {initials}
                    </span>
                  )}
                  <span className="text-[9px] font-semibold mt-0.5 text-[#D1F366]">Perfil</span>
                </span>
              }
            />
          ) : (
            <Link
              href="/dashboard/configuracion"
              className="flex flex-col items-center justify-center w-14 py-1 active:scale-90 transition-transform"
            >
              <span className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black bg-[#D1F366] text-[#1C1C28]">
                {initials}
              </span>
              <span className="text-[9px] font-semibold mt-0.5 text-[#D1F366]">Perfil</span>
            </Link>
          )}
        </motion.nav>
      </div>
    </div>
  )
}
