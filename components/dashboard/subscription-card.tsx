"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Loader2, CreditCard, CheckCircle2, AlertTriangle } from "lucide-react"
import { toast } from "sonner"

const PRICE_LABEL = "$90.000 / mes"

const statusMeta: Record<string, { label: string; cls: string; icon: any }> = {
  active: { label: "Activa", cls: "bg-emerald-100 text-emerald-800 border-emerald-200", icon: CheckCircle2 },
  pending: { label: "Pendiente de autorización", cls: "bg-amber-100 text-amber-800 border-amber-200", icon: AlertTriangle },
  past_due: { label: "Pago pendiente", cls: "bg-red-100 text-red-800 border-red-200", icon: AlertTriangle },
  cancelled: { label: "Cancelada", cls: "bg-neutral-100 text-neutral-700 border-neutral-200", icon: AlertTriangle },
}

export function SubscriptionCard() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState<string>("none")
  const [endDate, setEndDate] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return setLoading(false)
      const { data } = await supabase
        .from("user_profiles")
        .select("subscription_status, subscription_end_date")
        .eq("id", user.id)
        .maybeSingle()
      setStatus(data?.subscription_status || "none")
      setEndDate(data?.subscription_end_date || null)
      setLoading(false)
    }
    load()
  }, [])

  const handleSubscribe = async () => {
    setSubmitting(true)
    try {
      const res = await fetch("/api/mp/subscribe", { method: "POST" })
      const j = await res.json()
      if (!res.ok || !j.init_point) {
        toast.error(j.error || "No se pudo iniciar la suscripción")
        return
      }
      // Redirige a Mercado Pago para autorizar el débito automático
      window.location.href = j.init_point
    } catch {
      toast.error("Error de red al iniciar la suscripción")
    } finally {
      setSubmitting(false)
    }
  }

  const meta = statusMeta[status]
  const isActive = status === "active"

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="h-5 w-5 text-[#D1F366]" />
          Suscripción de UcoBot
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Plan mensual</p>
                <p className="text-2xl font-black">{PRICE_LABEL}</p>
              </div>
              {meta && (
                <Badge variant="secondary" className={meta.cls}>
                  {meta.label}
                </Badge>
              )}
            </div>

            {isActive && endDate && (
              <p className="text-xs text-muted-foreground">
                Próximo cobro: {new Date(endDate).toLocaleDateString("es-AR")}
              </p>
            )}

            {!isActive && (
              <p className="text-sm text-muted-foreground">
                {status === "past_due"
                  ? "Tu último pago no se pudo procesar. Reactivá el abono para seguir usando UcoBot."
                  : "Activá el débito automático con Mercado Pago para mantener tu cuenta activa."}
              </p>
            )}

            {!isActive && (
              <Button
                onClick={handleSubscribe}
                disabled={submitting}
                className="w-full gap-2 bg-[#D1F366] text-[#1C1C28] hover:bg-[#B3D93C] font-bold"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                {status === "past_due" ? "Reactivar abono" : "Suscribirme"}
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
