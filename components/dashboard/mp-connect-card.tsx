"use client"

import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Loader2, Link2, CheckCircle2, Unlink } from "lucide-react"
import { toast } from "sonner"

/**
 * Tarjeta para que el cliente conecte/desconecte su cuenta de Mercado Pago.
 * Una vez conectada, el bot podrá generar links de pago y el POS, QRs (Milestone 2).
 */
export function MpConnectCard() {
  const params = useSearchParams()
  const [loading, setLoading] = useState(true)
  const [connected, setConnected] = useState(false)
  const [mpUserId, setMpUserId] = useState<string | null>(null)
  const [working, setWorking] = useState(false)

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

  useEffect(() => {
    loadStatus()
    // Feedback al volver del OAuth
    const mp = params.get("mp")
    if (mp === "ok") toast.success("¡Mercado Pago conectado!")
    if (mp === "error") toast.error(params.get("msg") || "No se pudo conectar Mercado Pago")
  }, [])

  const handleConnect = () => {
    // Redirige al flujo OAuth (la ruta arma el state y manda a MP)
    window.location.href = "/api/mp/oauth/start"
  }

  const handleDisconnect = async () => {
    setWorking(true)
    try {
      const res = await fetch("/api/mp/oauth/status", { method: "DELETE" })
      if (!res.ok) throw new Error()
      setConnected(false)
      setMpUserId(null)
      toast.success("Mercado Pago desconectado")
    } catch {
      toast.error("No se pudo desconectar")
    } finally {
      setWorking(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Link2 className="h-5 w-5 text-[#009ee3]" />
          Cobros con Mercado Pago
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : connected ? (
          <>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                <div>
                  <p className="text-sm font-medium">Cuenta conectada</p>
                  {mpUserId && <p className="text-xs text-muted-foreground">ID vendedor: {mpUserId}</p>}
                </div>
              </div>
              <Badge variant="secondary" className="bg-emerald-100 text-emerald-800 border-emerald-200">
                Activa
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Tu bot y tu punto de venta van a poder generar cobros con Mercado Pago. La plata
              entra directo a tu cuenta.
            </p>
            <Button
              variant="outline"
              onClick={handleDisconnect}
              disabled={working}
              className="gap-2"
            >
              {working ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unlink className="h-4 w-4" />}
              Desconectar
            </Button>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Conectá tu cuenta de Mercado Pago para que el bot genere links de pago y el punto
              de venta genere QRs de cobro. La plata va directo a tu cuenta.
            </p>
            <Button onClick={handleConnect} className="gap-2 bg-[#009ee3] hover:bg-[#0089c7] text-white font-semibold">
              <Link2 className="h-4 w-4" />
              Conectar Mercado Pago
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  )
}
