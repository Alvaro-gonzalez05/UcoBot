"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { CheckCircle2, Loader2, Link2, AlertCircle, RefreshCw, Instagram } from "lucide-react"
import { FaWhatsapp } from "react-icons/fa"
import { toast } from "sonner"

type Platform = "whatsapp" | "instagram"

interface MetaConnectionCardProps {
  platform: Platform
}

interface IntegrationStatus {
  connected: boolean
  display_name: string | null
  connection_method: string
  connected_at: string | null
}

declare global {
  interface Window {
    FB: any
    fbAsyncInit?: () => void
  }
}

const FB_SDK_VERSION = process.env.NEXT_PUBLIC_META_GRAPH_VERSION || "v21.0"

function loadFacebookSdk(appId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") return reject(new Error("Solo cliente"))
    if (window.FB) return resolve()

    window.fbAsyncInit = () => {
      window.FB.init({
        appId,
        cookie: true,
        xfbml: false,
        version: FB_SDK_VERSION,
      })
      resolve()
    }

    const existing = document.getElementById("facebook-jssdk") as HTMLScriptElement | null
    if (existing) return

    const script = document.createElement("script")
    script.id = "facebook-jssdk"
    script.src = "https://connect.facebook.net/en_US/sdk.js"
    script.async = true
    script.defer = true
    script.crossOrigin = "anonymous"
    script.onerror = () => reject(new Error("No se pudo cargar el SDK de Facebook"))
    document.body.appendChild(script)
  })
}

export function MetaConnectionCard({ platform }: MetaConnectionCardProps) {
  const [status, setStatus] = useState<IntegrationStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState(false)

  const fetchStatus = async () => {
    try {
      const res = await fetch(`/api/integrations/status?platform=${platform}`)
      if (!res.ok) throw new Error("status_fetch_failed")
      const json = await res.json()
      const found = json.integrations?.[0] as IntegrationStatus | undefined
      setStatus(
        found || {
          connected: false,
          display_name: null,
          connection_method: "none",
          connected_at: null,
        }
      )
    } catch {
      setStatus({ connected: false, display_name: null, connection_method: "none", connected_at: null })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchStatus()
  }, [platform])

  // Mostrar feedback si el callback de Instagram volvió con error o éxito
  useEffect(() => {
    if (typeof window === "undefined") return
    const params = new URLSearchParams(window.location.search)
    if (params.get("ig_connected") === "1") {
      toast.success("Instagram conectado correctamente")
      window.history.replaceState({}, "", window.location.pathname)
      fetchStatus()
    } else if (params.get("ig_error")) {
      toast.error(`No se pudo conectar Instagram: ${params.get("ig_error")}`)
      window.history.replaceState({}, "", window.location.pathname)
    }
  }, [])

  const connectWhatsApp = async () => {
    const appId = process.env.NEXT_PUBLIC_META_APP_ID
    const configId = process.env.NEXT_PUBLIC_WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID

    if (!appId) {
      toast.error("Falta NEXT_PUBLIC_META_APP_ID en la configuración del servidor")
      return
    }
    if (!configId) {
      toast.error("Falta NEXT_PUBLIC_WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID. Configuralo en developers.facebook.com → WhatsApp → Embedded Signup.")
      return
    }

    setConnecting(true)
    try {
      await loadFacebookSdk(appId)

      let waInfo: { phone_number_id?: string; waba_id?: string; business_id?: string } = {}

      const messageListener = (event: MessageEvent) => {
        if (!event.origin.endsWith("facebook.com")) return
        try {
          const data = typeof event.data === "string" ? JSON.parse(event.data) : event.data
          if (data?.type === "WA_EMBEDDED_SIGNUP" && data.event === "FINISH") {
            waInfo = data.data || {}
          }
        } catch {
          // ignorar mensajes no JSON
        }
      }
      window.addEventListener("message", messageListener)

      window.FB.login(
        async (loginResponse: any) => {
          window.removeEventListener("message", messageListener)

          if (!loginResponse?.authResponse) {
            toast.error("Conexión cancelada")
            setConnecting(false)
            return
          }

          const code = loginResponse.authResponse.code
          if (!waInfo.phone_number_id || !waInfo.waba_id) {
            toast.error("Meta no devolvió el número de WhatsApp. Reintentá.")
            setConnecting(false)
            return
          }

          try {
            const res = await fetch("/api/auth/meta/whatsapp/callback", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ...waInfo, code }),
            })
            const json = await res.json()
            if (!res.ok) {
              toast.error(json.error || "No se pudo guardar la integración")
            } else {
              toast.success("WhatsApp conectado correctamente")
              await fetchStatus()
            }
          } catch {
            toast.error("Error de red al guardar la integración")
          } finally {
            setConnecting(false)
          }
        },
        {
          config_id: configId,
          response_type: "code",
          override_default_response_type: true,
          extras: { version: "v3", featureType: "", sessionInfoVersion: "2" },
        }
      )
    } catch (err: any) {
      toast.error(err?.message || "No se pudo iniciar el flujo de conexión")
      setConnecting(false)
    }
  }

  const connectInstagram = () => {
    const appId = process.env.NEXT_PUBLIC_META_APP_ID
    if (!appId) {
      toast.error("Falta NEXT_PUBLIC_META_APP_ID en la configuración del servidor")
      return
    }
    const redirectUri = `${window.location.origin}/api/auth/meta/instagram/callback`
    const scope = [
      "instagram_basic",
      "instagram_manage_messages",
      "pages_show_list",
      "pages_manage_metadata",
      "pages_messaging",
      "business_management",
    ].join(",")

    const url =
      `https://www.facebook.com/${FB_SDK_VERSION}/dialog/oauth?` +
      new URLSearchParams({
        client_id: appId,
        redirect_uri: redirectUri,
        response_type: "code",
        scope,
      }).toString()

    window.location.href = url
  }

  const handleConnect = () => {
    if (platform === "whatsapp") return connectWhatsApp()
    return connectInstagram()
  }

  const PlatformIcon = platform === "whatsapp" ? FaWhatsapp : Instagram
  const platformColor = platform === "whatsapp" ? "text-emerald-500" : "text-pink-500"
  const platformBgGradient =
    platform === "whatsapp"
      ? "from-emerald-500/10 to-emerald-500/5"
      : "from-pink-500/10 to-purple-500/5"
  const platformLabel = platform === "whatsapp" ? "WhatsApp Business" : "Instagram"

  const isConnected = status?.connected === true

  return (
    <div className="executive-card space-y-4">
      <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">
        Conexión con Meta
      </p>

      <div className={`rounded-xl bg-gradient-to-br ${platformBgGradient} p-4 border border-border/50`}>
        <div className="flex items-center gap-3 mb-3">
          <div className={`w-10 h-10 rounded-xl bg-background/80 flex items-center justify-center ${platformColor}`}>
            <PlatformIcon className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold truncate">{platformLabel}</p>
            {loading ? (
              <p className="text-xs text-muted-foreground">Cargando estado…</p>
            ) : isConnected ? (
              <p className="text-xs text-muted-foreground truncate">
                {status?.display_name || "Cuenta conectada"}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">No conectado</p>
            )}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-2">
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          </div>
        ) : isConnected ? (
          <div className="space-y-2">
            <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/20 gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Conectado
            </Badge>
            <Button
              variant="outline"
              size="sm"
              className="w-full text-xs gap-2"
              onClick={handleConnect}
              disabled={connecting}
            >
              {connecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Reconectar
            </Button>
          </div>
        ) : (
          <Button
            onClick={handleConnect}
            disabled={connecting}
            className="w-full bg-[#D1F366] text-[#1C1C28] hover:bg-[#B3D93C] font-bold rounded-xl gap-2"
          >
            {connecting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Conectando…
              </>
            ) : (
              <>
                <Link2 className="w-4 h-4" />
                Conectar {platformLabel}
              </>
            )}
          </Button>
        )}
      </div>

      {!loading && !isConnected && (
        <p className="text-xs text-muted-foreground flex items-start gap-2">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <span>
            {platform === "whatsapp"
              ? "Se abrirá el flujo oficial de Meta para conectar tu número de WhatsApp Business."
              : "Se abrirá Facebook Login para autorizar el acceso a tu cuenta de Instagram Business."}
          </span>
        </p>
      )}
    </div>
  )
}
