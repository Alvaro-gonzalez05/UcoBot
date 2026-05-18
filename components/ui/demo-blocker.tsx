"use client"

import type { ReactNode } from "react"

interface DemoBlockerProps {
  children: ReactNode
  message?: string
}

export function DemoBlocker({
  children,
  message = "Activá tu cuenta para empezar a usar",
}: DemoBlockerProps) {
  return (
    <div className="relative group/demoblocker inline-flex">
      <div className="pointer-events-none opacity-50 select-none">{children}</div>
      {/* Invisible overlay that captures the hover/click */}
      <div className="absolute inset-0 cursor-not-allowed rounded-[inherit]" />
      {/* Tooltip */}
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-[200] hidden group-hover/demoblocker:flex flex-col items-center pointer-events-none">
        <div className="bg-popover text-popover-foreground border border-border text-xs rounded-xl px-3 py-2 whitespace-nowrap shadow-xl font-medium">
          {message}
        </div>
        <div className="w-2.5 h-2.5 rotate-45 bg-popover border-r border-b border-border -mt-[5px]" />
      </div>
    </div>
  )
}
