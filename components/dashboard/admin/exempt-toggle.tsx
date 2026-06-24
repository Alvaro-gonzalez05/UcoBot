"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Loader2, ShieldCheck, Shield } from "lucide-react"
import { toast } from "sonner"

/** Botón para marcar/desmarcar a un usuario como "pago manual / exento". */
export function ExemptToggle({ userId, exempt }: { userId: string; exempt: boolean }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  const toggle = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/admin/set-exempt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, exempt: !exempt }),
      })
      if (!res.ok) throw new Error()
      toast.success(!exempt ? "Marcado como pago manual (exento)" : "Se quitó el pago manual")
      router.refresh()
    } catch {
      toast.error("No se pudo actualizar")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button
      size="sm"
      variant={exempt ? "secondary" : "outline"}
      onClick={toggle}
      disabled={loading}
      className="gap-1.5 text-xs h-8 flex-shrink-0"
    >
      {loading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : exempt ? (
        <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
      ) : (
        <Shield className="h-3.5 w-3.5" />
      )}
      {exempt ? "Pago manual" : "Marcar exento"}
    </Button>
  )
}
