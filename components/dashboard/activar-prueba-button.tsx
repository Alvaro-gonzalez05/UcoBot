"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Loader2, CreditCard } from "lucide-react"
import { toast } from "sonner"

/** Inicia la adhesión al débito automático (Mercado Pago) y redirige a MP. */
export function ActivarPruebaButton() {
  const [loading, setLoading] = useState(false)

  const handleClick = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/mp/subscribe", { method: "POST" })
      const j = await res.json()
      if (!res.ok || !j.init_point) {
        toast.error(j.error || "No se pudo iniciar la adhesión")
        return
      }
      window.location.href = j.init_point
    } catch {
      toast.error("Error de red al iniciar la adhesión")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button
      onClick={handleClick}
      disabled={loading}
      size="lg"
      className="w-full gap-2 bg-[#D1F366] text-[#1C1C28] hover:bg-[#B3D93C] font-bold"
    >
      {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <CreditCard className="h-5 w-5" />}
      Activar prueba y adherir débito automático
    </Button>
  )
}
