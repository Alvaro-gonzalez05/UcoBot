"use client"

import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Loader2, CheckCircle2, Unlink, AlertCircle } from "lucide-react"
import { SiMercadopago } from "react-icons/si"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"

/**
 * Tarjeta para que el cliente conecte/desconecte su cuenta de Mercado Pago.
 * Una vez conectada, el bot podrá generar links de pago y el POS, QRs (Milestone 2).
 */
export function MpConnectCard() {
  const params = useSearchParams()
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [connected, setConnected] = useState(false)
  const [mpUserId, setMpUserId] = useState<string | null>(null)
  const [working, setWorking] = useState(false)
  const [locationReady, setLocationReady] = useState(true)

  const loadStatus = async () => {
    try {
      const res = await fetch("/api/mp/oauth/status")
      const j = await res.json()
      setConnected(!!j.connected)
      setMpUserId(j.mp_user_id || null)
    } catch {
      /* noop */
    } finally {
      setLoading(false)
    }
  }

  // Verifica que el negocio tenga cargada localidad y provincia (requeridas por MP).
  const loadLocation = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: prof } = await supabase
        .from("user_profiles")
        .select("business_info")
        .eq("id", user.id)
        .maybeSingle()
      const bi = (prof?.business_info || {}) as { city?: string; state?: string }
      setLocationReady(!!(bi.city || "").trim() && !!(bi.state || "").trim())
    } catch {
      /* noop */
    }
  }

  useEffect(() => {
    loadStatus()
    loadLocation()
    // Feedback al volver del OAuth (caso fallback full-page)
    const mp = params.get("mp")
    if (mp === "ok") toast.success("¡Mercado Pago conectado!")
    if (mp === "error") toast.error(params.get("msg") || "No se pudo conectar Mercado Pago")

    // Resultado del OAuth cuando se hace por popup
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return
      if (e.data?.source !== "mp-oauth") return
      if (e.data.mp === "ok") {
        toast.success("¡Mercado Pago conectado!")
        loadStatus()
      } else {
        toast.error(e.data.msg || "No se pudo conectar Mercado Pago")
      }
    }
    window.addEventListener("message", onMessage)
    return () => window.removeEventListener("message", onMessage)
  }, [])

  // Abre el OAuth de Mercado Pago en un popup centrado (no a pantalla completa).
  const handleConnect = () => {
    if (!locationReady) {
      toast.error("Completá primero tu negocio", {
        description: "Cargá Localidad y Provincia en Configuración → Mi negocio → Contacto.",
      })
      return
    }
    const w = 480
    const h = 720
    const left = window.screenX + Math.max(0, (window.outerWidth - w) / 2)
    const top = window.screenY + Math.max(0, (window.outerHeight - h) / 2)
    const popup = window.open(
      "/api/mp/oauth/start",
      "mp_oauth",
      `width=${w},height=${h},left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no`
    )
    if (!popup) {
      // Si el navegador bloquea el popup, caemos al flujo normal
      window.location.href = "/api/mp/oauth/start"
    }
  }

  const handleDisconnect = async () => {
    setWorking(true)
    try {
      const res = await fetch("/api/mp/oauth/status", { method: "DELETE" })
      if (!res.ok) throw new Error()
      setConnected(false)
      setMpUserId(null)
      toast.success("Mercado Pago desconectado", {
        description: "UcoBot ya no puede cobrar con tu cuenta. Para revocar el permiso por completo, hacelo desde tu cuenta de Mercado Pago.",
      })
    } catch {
      toast.error("No se pudo desconectar")
    } finally {
      setWorking(false)
    }
  }

  return (
    <Card className="w-full max-w-[260px] overflow-hidden rounded-2xl border-0 shadow-md flex flex-col">
      {/* Cabecera azul con el logo real de Mercado Pago */}
      <div className="flex flex-col items-center justify-center gap-2 bg-[#009ee3] px-4 py-8 text-white">
        <SiMercadopago className="h-16 w-16" />
        <span className="text-base font-semibold tracking-tight">Mercado Pago</span>
        {connected ? (
          <Badge className="border-0 bg-white/20 text-white hover:bg-white/20">Conectado</Badge>
        ) : (
          <span className="text-xs text-white/80">Cobros y QR</span>
        )}
      </div>

      {/* Cuerpo */}
      <div className="flex flex-1 flex-col gap-4 p-4">
        {loading ? (
          <div className="flex flex-1 items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : connected ? (
          <>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" />
              <div className="min-w-0">
                <p className="text-sm font-medium">Cuenta conectada</p>
                {mpUserId && (
                  <p className="truncate text-xs text-muted-foreground">ID: {mpUserId}</p>
                )}
              </div>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Tu bot y tu punto de venta generan cobros y QR. La plata entra directo a tu cuenta.
            </p>
            <Button
              variant="outline"
              onClick={handleDisconnect}
              disabled={working}
              className="mt-auto w-full gap-2"
            >
              {working ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unlink className="h-4 w-4" />}
              Desconectar
            </Button>
          </>
        ) : (
          <>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Conectá tu cuenta para que el bot genere links de pago y el punto de venta genere QR
              de cobro. La plata va directo a tu cuenta.
            </p>
            {!locationReady && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-[11px] leading-relaxed text-amber-800">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  Antes de conectar, cargá <b>Localidad</b> y <b>Provincia</b> en Configuración → Mi
                  negocio → Contacto.
                </span>
              </div>
            )}
            <Button
              onClick={handleConnect}
              disabled={!locationReady}
              className="w-full gap-2 bg-[#009ee3] font-semibold text-white hover:bg-[#0089c7] disabled:opacity-50"
            >
              Conectar
            </Button>
            <p className="mt-auto text-[11px] leading-relaxed text-muted-foreground/80">
              Para revocar el permiso por completo, entrá a tu cuenta de Mercado Pago → Seguridad →
              Mis aplicaciones.
            </p>
          </>
        )}
      </div>
    </Card>
  )
}
