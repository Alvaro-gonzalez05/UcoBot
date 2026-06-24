"use client"

import { Suspense, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Loader2 } from "lucide-react"

/**
 * Página de retorno del OAuth de Mercado Pago.
 * Si se abrió en popup: avisa a la ventana padre y se cierra sola.
 * Si no (flujo full-page): redirige a Configuración con el resultado.
 */
function MpConectadoInner() {
  const params = useSearchParams()
  const router = useRouter()
  const mp = params.get("mp") || "ok"
  const msg = params.get("msg") || ""

  useEffect(() => {
    if (typeof window !== "undefined" && window.opener && !window.opener.closed) {
      window.opener.postMessage({ source: "mp-oauth", mp, msg }, window.location.origin)
      window.close()
      return
    }
    router.replace(`/dashboard/configuracion?mp=${mp}${msg ? `&msg=${encodeURIComponent(msg)}` : ""}`)
  }, [mp, msg, router])

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3 text-muted-foreground">
      <Loader2 className="h-6 w-6 animate-spin" />
      <p className="text-sm">{mp === "ok" ? "Conectando con Mercado Pago…" : "Volviendo…"}</p>
    </div>
  )
}

export default function MpConectadoPage() {
  return (
    <Suspense fallback={null}>
      <MpConectadoInner />
    </Suspense>
  )
}
