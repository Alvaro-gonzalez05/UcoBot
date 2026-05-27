"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Eye, Building2, Calendar, MessageSquare, Bot } from "lucide-react"
import Link from "next/link"
import { UserActionsMenu } from "./user-actions-menu"

interface UserListCardProps {
  user: any
}

function getInitials(name: string) {
  return (name || "U")
    .split(" ")
    .map((n: string) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()
}

const INITIALS_COLORS = [
  "from-blue-400 to-blue-600",
  "from-violet-400 to-violet-600",
  "from-rose-400 to-rose-600",
  "from-amber-400 to-amber-600",
  "from-teal-400 to-teal-600",
  "from-indigo-400 to-indigo-600",
]

function getInitialsColor(name: string) {
  const idx = (name || "U").charCodeAt(0) % INITIALS_COLORS.length
  return INITIALS_COLORS[idx]
}

const STATUS_CONFIG: Record<string, { dot: string; label: string; badge: string }> = {
  active: {
    dot: "bg-green-500",
    label: "Activo",
    badge: "bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400",
  },
  suspended: {
    dot: "bg-red-500",
    label: "Suspendido",
    badge: "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400",
  },
  trialing: {
    dot: "bg-amber-500",
    label: "En prueba",
    badge: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400",
  },
  past_due: {
    dot: "bg-orange-500",
    label: "Pago pend.",
    badge: "bg-orange-50 text-orange-700 border-orange-200",
  },
  canceled: {
    dot: "bg-gray-400",
    label: "Cancelado",
    badge: "bg-gray-100 text-gray-600 border-gray-200",
  },
}

const PLAN_BADGE: Record<string, string> = {
  pro: "bg-[#D1F366]/10 text-[#4a7c00] border-[#D1F366]/30 dark:text-[#D1F366]",
  trial: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400",
  free: "bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-400",
}

export function UserListCard({ user }: UserListCardProps) {
  const initials = getInitials(user.business_name || "U")
  const initColor = getInitialsColor(user.business_name || "U")
  const statusCfg =
    STATUS_CONFIG[user.subscription_status || "trialing"] ||
    STATUS_CONFIG.trialing
  const planBadge =
    PLAN_BADGE[user.plan_type || "free"] || PLAN_BADGE.free

  return (
    <div className="bg-card rounded-3xl shadow-sm border border-border hover:shadow-md hover:-translate-y-0.5 transition-all overflow-hidden">
      <div className="flex items-center gap-4 px-6 py-4">
        {/* Avatar */}
        <div
          className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${initColor} flex items-center justify-center text-white font-bold text-sm flex-shrink-0 shadow-sm`}
        >
          {initials}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <h3 className="font-bold text-base dark:text-white truncate">
              {user.business_name || "Sin nombre"}
            </h3>
            {user.role === "admin" && (
              <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold border bg-red-50 text-red-700 border-red-200 uppercase tracking-wide">
                admin
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground truncate">{user.email}</p>
          <p className="text-[10px] text-muted-foreground/60 font-mono truncate mt-0.5">
            {user.id}
          </p>
        </div>

        {/* Meta */}
        <div className="hidden md:flex items-center gap-6 flex-shrink-0">
          <div className="text-center">
            <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide mb-1">
              Plan
            </p>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold border capitalize ${planBadge}`}
            >
              {user.plan_type || "free"}
            </span>
          </div>

          <div className="text-center">
            <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide mb-1">
              Estado
            </p>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold border flex items-center gap-1 ${statusCfg.badge}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${statusCfg.dot}`} />
              {statusCfg.label}
            </span>
          </div>

          <div className="text-center">
            <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide mb-1">
              Registro
            </p>
            <span className="text-xs font-medium flex items-center gap-1">
              <Calendar className="h-3 w-3 text-muted-foreground" />
              {new Date(user.created_at).toLocaleDateString("es-AR", {
                day: "2-digit",
                month: "2-digit",
                year: "2-digit",
              })}
            </span>
          </div>

          {user.location && (
            <div className="text-center hidden lg:block">
              <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide mb-1">
                Ubicación
              </p>
              <span className="text-xs flex items-center gap-1 text-muted-foreground">
                <Building2 className="h-3 w-3" />
                {user.location}
              </span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className="h-9 w-9 p-0 rounded-xl hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-900/20"
            asChild
          >
            <Link href={`/dashboard/admin/users/${user.id}/chat?from=list`}>
              <MessageSquare className="h-4 w-4" />
            </Link>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-9 w-9 p-0 rounded-xl hover:bg-green-50 hover:text-green-600 dark:hover:bg-green-900/20"
            asChild
          >
            <Link href={`/dashboard/admin/users/${user.id}`}>
              <Eye className="h-4 w-4" />
            </Link>
          </Button>
          <UserActionsMenu
            userId={user.id}
            currentPlan={user.plan_type || "free"}
            currentStatus={user.subscription_status || "trialing"}
            userName={user.business_name || "Usuario"}
          />
        </div>
      </div>
    </div>
  )
}
