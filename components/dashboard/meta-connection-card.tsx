"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { CheckCircle2, Loader2, Link2, AlertCircle, RefreshCw, Instagram, Settings2, Copy } from "lucide-react"
import { FaWhatsapp, FaFacebookMessenger } from "react-icons/fa"
import { toast } from "sonner"

type Platform = "whatsapp" | "instagram" | "messenger"

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

function CopyField({ label, value }: { label: string; value: string }) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      toast.success(`${label} copiado`)
    } catch {
      toast.error("No se pudo copiar")
    }
  }
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="flex items-center gap-2">
        <code className="flex-1 text-xs bg-muted rounded-md px-2 py-1.5 break-all">{value}</code>
        <Button type="button" variant="outline" size="icon" className="h-8 w-8 flex-shrink-0" onClick={copy}>
          <Copy className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  )
}

function ManualWhatsAppDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  const [wabaId, setWabaId] = useState("")
  const [phoneNumberId, setPhoneNumberId] = useState("")
  const [accessToken, setAccessToken] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [webhook, setWebhook] = useState<{ url: string; verify_token: string } | null>(null)

  // Si ya hay una integración manual, mostrar los datos del webhook existente
  useEffect(() => {
    if (!open) return
    fetch("/api/integrations/whatsapp/manual")
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (json?.manual && json.webhook?.verify_token) {
          setWebhook(json.webhook)
          setWabaId(json.integration?.waba_id || "")
          setPhoneNumberId(json.integration?.phone_number_id || "")
        }
      })
      .catch(() => {})
  }, [open])

  const handleSubmit = async () => {
    if (!wabaId.trim() || !phoneNumberId.trim() || !accessToken.trim()) {
      toast.error("Completá los tres campos")
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch("/api/integrations/whatsapp/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          waba_id: wabaId.trim(),
          phone_number_id: phoneNumberId.trim(),
          access_token: accessToken.trim(),
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || "No se pudo guardar la configuración")
        return
      }
      toast.success(
        json.integration?.display_phone_number
          ? `Número ${json.integration.display_phone_number} conectado`
          : "WhatsApp configurado correctamente"
      )
      setWebhook(json.webhook)
      setAccessToken("")
      onSaved()
    } catch {
      toast.error("Error de red al guardar la configuración")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Configuración manual de WhatsApp</DialogTitle>
          <DialogDescription>
            Conectá tu número usando tu propia app de Meta, sin pasar por el flujo de Embedded Signup.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-3 text-xs text-muted-foreground">
            <p>
              <b className="text-foreground">Importante:</b> el número que uses no puede estar
              activo en la app de WhatsApp. Si es tu número actual, primero hacé un backup de tus
              chats y eliminá la cuenta desde la app (Configuración → Cuenta → Eliminar cuenta), o
              usá un número nuevo dedicado al bot.
            </p>
          </div>

          <div className="rounded-lg bg-muted/50 border border-border/50 p-3 text-xs text-muted-foreground space-y-1.5">
            <p className="font-semibold text-foreground">Dónde encontrar estos datos:</p>
            <p>
              1. Entrá a{" "}
              <a
                href="https://developers.facebook.com"
                target="_blank"
                rel="noreferrer"
                className="underline text-foreground"
              >
                developers.facebook.com
              </a>{" "}
              → tu app → <b>WhatsApp → Configuración de la API</b>. Ahí vas a ver el{" "}
              <b>Identificador del número de teléfono</b> y el{" "}
              <b>Identificador de la cuenta de WhatsApp Business (WABA)</b>.
            </p>
            <p>
              2. El token tiene que ser <b>permanente</b>: creá un <b>Usuario del sistema</b> en{" "}
              business.facebook.com → Configuración del negocio → Usuarios del sistema, asignale tu
              app y tu WABA, y generá un token con permisos{" "}
              <code className="text-[10px]">whatsapp_business_messaging</code> y{" "}
              <code className="text-[10px]">whatsapp_business_management</code>. (El token temporal
              de la página de la API vence a las 24 hs.)
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="manual-waba-id">WABA ID (cuenta de WhatsApp Business)</Label>
            <Input
              id="manual-waba-id"
              placeholder="Ej: 102290129340398"
              value={wabaId}
              onChange={(e) => setWabaId(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="manual-phone-id">Phone Number ID (identificador del número)</Label>
            <Input
              id="manual-phone-id"
              placeholder="Ej: 106540352242922"
              value={phoneNumberId}
              onChange={(e) => setPhoneNumberId(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Es un ID numérico, no el número de teléfono.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="manual-token">Token de acceso permanente</Label>
            <Input
              id="manual-token"
              type="password"
              placeholder="EAAG..."
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
            />
          </div>

          <Button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full bg-[#D1F366] text-[#1C1C28] hover:bg-[#B3D93C] font-bold rounded-xl gap-2"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Validando con Meta…
              </>
            ) : (
              "Guardar y validar"
            )}
          </Button>

          {webhook && (
            <div className="space-y-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
              <p className="text-xs font-semibold text-foreground">
                Último paso: configurá el webhook en tu app de Meta
              </p>
              <p className="text-xs text-muted-foreground">
                En developers.facebook.com → tu app → <b>WhatsApp → Configuración</b> →{" "}
                <b>Webhook</b>, pegá estos valores y suscribite al campo <b>messages</b>:
              </p>
              <CopyField label="URL de devolución de llamada (Callback URL)" value={webhook.url} />
              <CopyField label="Token de verificación (Verify token)" value={webhook.verify_token} />
              <p className="text-xs text-muted-foreground">
                Sin este paso el bot no recibe los mensajes entrantes. Una vez configurado, envía un
                mensaje de prueba a tu número para verificar que todo funcione.
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function MetaConnectionCard({ platform }: MetaConnectionCardProps) {
  const [status, setStatus] = useState<IntegrationStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState(false)
  const [manualOpen, setManualOpen] = useState(false)

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

  // Mostrar feedback si el callback de Instagram/Messenger volvió con error o éxito
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
    } else if (params.get("msgr_connected") === "1") {
      toast.success("Messenger conectado correctamente")
      window.history.replaceState({}, "", window.location.pathname)
      fetchStatus()
    } else if (params.get("msgr_error")) {
      toast.error(`No se pudo conectar Messenger: ${params.get("msgr_error")}`)
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

  const connectMessenger = () => {
    const appId = process.env.NEXT_PUBLIC_META_APP_ID
    if (!appId) {
      toast.error("Falta NEXT_PUBLIC_META_APP_ID en la configuración del servidor")
      return
    }
    const redirectUri = `${window.location.origin}/api/auth/meta/messenger/callback`
    const scope = [
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
    if (platform === "messenger") return connectMessenger()
    return connectInstagram()
  }

  const PlatformIcon =
    platform === "whatsapp" ? FaWhatsapp : platform === "messenger" ? FaFacebookMessenger : Instagram
  const platformColor =
    platform === "whatsapp"
      ? "text-emerald-500"
      : platform === "messenger"
        ? "text-blue-500"
        : "text-pink-500"
  const platformBgGradient =
    platform === "whatsapp"
      ? "from-emerald-500/10 to-emerald-500/5"
      : platform === "messenger"
        ? "from-blue-500/10 to-blue-500/5"
        : "from-pink-500/10 to-purple-500/5"
  const platformLabel =
    platform === "whatsapp" ? "WhatsApp Business" : platform === "messenger" ? "Messenger" : "Instagram"

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
            {platform === "whatsapp" && status?.connection_method === "manual" && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-xs gap-2 text-muted-foreground"
                onClick={() => setManualOpen(true)}
              >
                <Settings2 className="w-3.5 h-3.5" />
                Ver configuración manual
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
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
            {platform === "whatsapp" && (
              <Button
                variant="outline"
                size="sm"
                className="w-full text-xs gap-2"
                onClick={() => setManualOpen(true)}
              >
                <Settings2 className="w-3.5 h-3.5" />
                Configurar manualmente
              </Button>
            )}
          </div>
        )}
      </div>

      {platform === "whatsapp" && (
        <ManualWhatsAppDialog
          open={manualOpen}
          onOpenChange={setManualOpen}
          onSaved={fetchStatus}
        />
      )}

      {!loading && !isConnected && (
        <p className="text-xs text-muted-foreground flex items-start gap-2">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <span>
            {platform === "whatsapp"
              ? "Se abrirá el flujo oficial de Meta para conectar tu número de WhatsApp Business."
              : platform === "messenger"
                ? "Se abrirá Facebook Login para autorizar el acceso a tu página de Facebook."
                : "Se abrirá Facebook Login para autorizar el acceso a tu cuenta de Instagram Business."}
          </span>
        </p>
      )}
    </div>
  )
}
