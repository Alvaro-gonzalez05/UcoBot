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
import { CheckCircle2, Loader2, Link2, AlertCircle, RefreshCw, Instagram, Settings2, Copy, QrCode, Unlink } from "lucide-react"
import { FaWhatsapp, FaFacebookMessenger } from "react-icons/fa"
import { toast } from "sonner"

type Platform = "whatsapp" | "instagram" | "messenger"

interface MetaConnectionCardProps {
  platform: Platform
  onStatusChange?: (platform: Platform, connected: boolean) => void
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

/**
 * Diálogo de conexión vía Evolution API (WhatsApp Web, QR).
 * Tercera opción de conexión, junto a Manual y Embedded Signup.
 * Puente temporal mientras se resuelve el Tech Provider de Meta.
 */
function EvolutionConnectDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onSaved: () => void
}) {
  const [qr, setQr] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const [state, setState] = useState<string>("idle")

  useEffect(() => {
    if (!open) {
      setQr(null)
      setState("idle")
      return
    }

    let cancelled = false
    let pollTimer: ReturnType<typeof setInterval> | null = null

    const start = async () => {
      setStarting(true)
      try {
        const res = await fetch("/api/integrations/whatsapp/evolution", { method: "POST" })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || "No se pudo iniciar Evolution")
        if (cancelled) return
        setQr(json.qr || null)
        setState("connecting")

        // Poll de estado hasta que el usuario escanee el QR
        pollTimer = setInterval(async () => {
          try {
            const sRes = await fetch("/api/integrations/whatsapp/evolution")
            const sJson = await sRes.json()
            if (cancelled) return
            setState(sJson.state || "unknown")
            if (sJson.state === "open") {
              if (pollTimer) clearInterval(pollTimer)
              toast.success("WhatsApp conectado vía Evolution")
              onSaved()
              onOpenChange(false)
            }
          } catch {
            /* seguir pollando */
          }
        }, 3000)
      } catch (err: any) {
        if (!cancelled) toast.error(err?.message || "Error iniciando Evolution")
        onOpenChange(false)
      } finally {
        if (!cancelled) setStarting(false)
      }
    }

    start()
    return () => {
      cancelled = true
      if (pollTimer) clearInterval(pollTimer)
    }
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Conectar mediante Evolution API</DialogTitle>
          <DialogDescription>
            Escaneá el QR desde WhatsApp → Dispositivos vinculados. Esta conexión usa
            WhatsApp Web (no oficial): recomendada solo como solución temporal.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-3 py-2">
          {starting && (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin" /> Creando instancia…
            </div>
          )}
          {qr ? (
            // El QR viene como data URI base64 desde Evolution
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr} alt="QR de WhatsApp" className="w-64 h-64 rounded-lg border" />
          ) : (
            !starting && (
              <p className="text-sm text-muted-foreground text-center">
                Esperando QR… Si no aparece en unos segundos, cerrá y reintentá.
              </p>
            )
          )}
          <p className="text-xs text-muted-foreground">
            Estado: {state === "open" ? "Conectado" : state === "connecting" ? "Esperando escaneo" : state}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Alta de WhatsApp vía YCloud (BSP oficial).
 *
 * El Embedded Signup corre en la consola white-label de YCloud (dominio propio),
 * que es OTRO origen: no nos puede mandar un postMessage al terminar. Por eso el
 * flujo es: abrir popup → detectar que lo cerraron (popup.closed sí se puede leer
 * cross-origin) → preguntarle a YCloud qué números aparecieron → vincular.
 */
function YCloudConnectDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onSaved: () => void
}) {
  type YCloudNumber = {
    phone_number: string
    key: string
    waba_id: string
    verified_name: string | null
    state: "free" | "mine"
  }

  const [numbers, setNumbers] = useState<YCloudNumber[]>([])
  const [loading, setLoading] = useState(false)
  const [linking, setLinking] = useState<string | null>(null)
  const [checked, setChecked] = useState(false)
  const [onboardingUrl, setOnboardingUrl] = useState<string | null>(null)
  // Cada cliente conecta SU cuenta de YCloud, así que lo primero que hace falta es
  // su API key: sin ella no hay números que listar.
  const [needsApiKey, setNeedsApiKey] = useState(false)
  const [apiKey, setApiKey] = useState("")
  const [savingKey, setSavingKey] = useState(false)

  /**
   * Guarda la credencial y recién después lista los números.
   *
   * Son dos pasos separados a propósito: si la cuenta de YCloud es nueva y todavía
   * no tiene ningún número, la lista sale vacía — pero la clave ya quedó guardada,
   * que es lo que antes se perdía al cerrar el diálogo.
   */
  const saveKeyAndLoad = async () => {
    const typedKey = apiKey.trim()
    if (!typedKey) return

    setSavingKey(true)
    try {
      const res = await fetch("/api/integrations/whatsapp/ycloud/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: typedKey }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || "No se pudo guardar la API key")
        return
      }

      if (json.webhook_error) {
        toast.warning("Clave guardada, pero el webhook quedó sin configurar", {
          description: json.webhook_error,
        })
      } else if (json.numbers_found === 0) {
        toast.success("API key guardada", {
          description: "Todavía no hay números en esa cuenta. Dalos de alta y volvé acá.",
        })
      } else {
        toast.success("API key guardada")
      }

      await loadNumbers()
    } catch {
      toast.error("Error de red al guardar la API key")
    } finally {
      setSavingKey(false)
    }
  }

  const loadNumbers = async () => {
    setLoading(true)
    try {
      // Con una key recién pegada hay que probarla POR POST: todavía no está
      // guardada, y una credencial no se manda por la URL.
      const typedKey = apiKey.trim()
      const res = typedKey
        ? await fetch("/api/integrations/whatsapp/ycloud/numbers", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ api_key: typedKey }),
          })
        : await fetch("/api/integrations/whatsapp/ycloud")
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || "No se pudieron listar los números")
        return
      }
      // El endpoint de prueba no devuelve estos dos: se conservan los que ya había.
      if (json.onboarding_url) setOnboardingUrl(json.onboarding_url)
      if ("needs_api_key" in json) setNeedsApiKey(!!json.needs_api_key)
      setNumbers(json.numbers || [])
      setChecked(true)
    } catch {
      toast.error("Error de red al consultar YCloud")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!open) {
      setNumbers([])
      setChecked(false)
      setApiKey("")
      return
    }
    loadNumbers()
  }, [open])

  const openSignup = () => {
    if (!onboardingUrl) return
    const popup = window.open(onboardingUrl, "ycloud-signup", "width=1100,height=780")
    if (!popup) {
      toast.error("El navegador bloqueó la ventana. Permití los popups y reintentá.")
      return
    }
    // No podemos leer nada de adentro (otro origen), pero sí saber si la cerraron.
    const timer = setInterval(() => {
      if (popup.closed) {
        clearInterval(timer)
        loadNumbers()
      }
    }, 1000)
  }

  const link = async (phone: string) => {
    setLinking(phone)
    try {
      const res = await fetch("/api/integrations/whatsapp/ycloud", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone_number: phone, api_key: apiKey || undefined }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || "No se pudo vincular el número")
        return
      }

      // El webhook se configura solo con la API key. Cuando no se puede, hay que
      // decirlo: sin webhook el número envía pero no recibe NADA, que es el
      // síntoma más confuso de todos.
      if (json.webhook_error) {
        toast.warning("Número conectado, pero el webhook quedó sin configurar", {
          description: json.webhook_error,
        })
      } else if (json.webhook_secret_missing) {
        toast.warning("Webhook ya existente", {
          description:
            "No pudimos leer su clave de firma. Copiala de YCloud o rotala para validar los mensajes.",
        })
      }

      toast.success(`Número ${json.integration?.display_phone_number || phone} conectado`)
      onSaved()
      onOpenChange(false)
    } catch {
      toast.error("Error de red al vincular el número")
    } finally {
      setLinking(null)
    }
  }

  // Se listan los libres Y el que ya es de esta cuenta: si lo desconectaron,
  // tiene que poder volver a vincularse desde acá.
  const selectable = numbers.filter((n) => n.state === "free" || n.state === "mine")

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Conectar WhatsApp Business</DialogTitle>
          <DialogDescription>
            Elegí el número que querés usar. Si todavía no tenés ninguno dado de alta en
            Meta, primero creá uno con el botón de abajo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Paso 1: la credencial de la cuenta de YCloud del cliente. Va primero
              porque sin ella no hay números que mostrar. */}
          {needsApiKey && (
            <div className="rounded-xl border border-border/60 bg-muted/30 p-4 space-y-3">
              <div>
                <label htmlFor="ycloud-key" className="text-sm font-semibold">
                  Conectar con tu propia cuenta de YCloud
                </label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Pegá la API key de tu cuenta. Está en la consola de YCloud, en
                  Developers → API keys.
                </p>
              </div>
              <Input
                id="ycloud-key"
                type="password"
                autoComplete="off"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Pegá acá tu API key"
              />
              <Button
                size="sm"
                className="w-full"
                disabled={!apiKey.trim() || loading || savingKey}
                onClick={saveKeyAndLoad}
              >
                {savingKey ? "Guardando…" : "Guardar y buscar mis números"}
              </Button>
              <p className="text-xs text-muted-foreground">
                Queda guardada en tu cuenta y se usa para enviar y recibir tus mensajes.
                El webhook lo configuramos nosotros. Si dejás el campo vacío, se usa la
                cuenta de la plataforma.
              </p>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              Consultando números…
            </div>
          ) : selectable.length === 0 ? (
            // Sin key todavía no se buscó nada: el vacío lo explica el bloque de
            // arriba, no hace falta repetirlo acá.
            needsApiKey && !checked ? null : (
            <div className="rounded-lg border border-border/50 bg-muted/40 p-4 text-center space-y-2">
              <p className="text-sm text-muted-foreground">
                {checked
                  ? "Todavía no aparece ningún número. Dalo de alta y volvé a buscar."
                  : "Sin números disponibles."}
              </p>
              <Button variant="outline" size="sm" className="gap-2" onClick={loadNumbers}>
                <RefreshCw className="w-3.5 h-3.5" />
                Buscar de nuevo
              </Button>
            </div>
            )
          ) : (
            <div className="space-y-2">
              {selectable.map((n) => (
                <button
                  key={n.key}
                  onClick={() => link(n.phone_number)}
                  disabled={linking !== null}
                  className="w-full flex items-center gap-3 rounded-xl border border-border/60 hover:border-[#D1F366] hover:bg-muted/50 p-3 text-left transition-colors disabled:opacity-60"
                >
                  <div className="w-9 h-9 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center flex-shrink-0">
                    <FaWhatsapp className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold truncate">{n.phone_number}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {n.verified_name || "Sin nombre verificado"}
                    </p>
                  </div>
                  {linking === n.phone_number ? (
                    <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />
                  ) : (
                    <span className="text-xs font-semibold text-[#1C1C28] bg-[#D1F366] rounded-lg px-2 py-1 flex-shrink-0">
                      {n.state === "mine" ? "Reconectar" : "Vincular"}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">¿no está tu número?</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <Button
            variant="outline"
            onClick={openSignup}
            disabled={!onboardingUrl || loading}
            className="w-full gap-2"
          >
            <Link2 className="w-4 h-4" />
            Dar de alta un número nuevo
          </Button>
          <p className="text-xs text-muted-foreground text-center">
            Se abre el alta oficial de Meta en otra ventana. Necesitás tu Facebook
            Business y un número que no esté en uso en la app de WhatsApp. Al cerrarla,
            el número aparece acá solo.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function MetaConnectionCard({ platform, onStatusChange }: MetaConnectionCardProps) {
  const [status, setStatus] = useState<IntegrationStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState(false)
  const [manualOpen, setManualOpen] = useState(false)
  const [evolutionOpen, setEvolutionOpen] = useState(false)
  const [ycloudOpen, setYcloudOpen] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)

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
      onStatusChange?.(platform, found?.connected === true)
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

      // OJO: FB.login NO acepta un callback async (tira "Expression is of type
      // asyncfunction, not function"). El callback es una función común y la parte
      // async va adentro, en un IIFE.
      window.FB.login(
        (loginResponse: any) => {
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

          ;(async () => {
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
          })()
        },
        {
          config_id: configId,
          response_type: "code",
          override_default_response_type: true,
          // Alineado a lo que genera Meta en la URL de onboarding (v4 / sessionInfoVersion 3).
          // La coexistencia se habilita en la config de Embedded Signup (config_id), no acá.
          extras: { sessionInfoVersion: "3", version: "v4" },
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

  const handleDisconnect = async () => {
    if (!confirm("¿Desconectar WhatsApp? Vas a dejar de recibir y enviar mensajes hasta que lo reconectes. El historial de conversaciones se conserva.")) {
      return
    }
    setDisconnecting(true)
    try {
      const res = await fetch("/api/integrations/whatsapp/disconnect", { method: "POST" })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "No se pudo desconectar")
      toast.success("WhatsApp desconectado")
      await fetchStatus()
    } catch (err: any) {
      toast.error(err?.message || "Error al desconectar")
    } finally {
      setDisconnecting(false)
    }
  }

  const handleConnect = () => {
    // WhatsApp entra por YCloud (BSP oficial): no requiere app de Meta propia.
    // El Embedded Signup propio queda como opción secundaria.
    if (platform === "whatsapp") return setYcloudOpen(true)
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
            {platform === "whatsapp" && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-xs gap-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                onClick={handleDisconnect}
                disabled={disconnecting}
              >
                {disconnecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Unlink className="w-3.5 h-3.5" />}
                Desconectar WhatsApp
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
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-xs gap-2"
                  onClick={connectWhatsApp}
                  disabled={connecting}
                >
                  <Link2 className="w-3.5 h-3.5" />
                  Conectar con mi propia app de Meta
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-xs gap-2"
                  onClick={() => setManualOpen(true)}
                >
                  <Settings2 className="w-3.5 h-3.5" />
                  Configurar manualmente
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-xs gap-2"
                  onClick={() => setEvolutionOpen(true)}
                >
                  <QrCode className="w-3.5 h-3.5" />
                  Conectar mediante Evolution API
                </Button>
              </>
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
      {platform === "whatsapp" && (
        <EvolutionConnectDialog
          open={evolutionOpen}
          onOpenChange={setEvolutionOpen}
          onSaved={fetchStatus}
        />
      )}
      {platform === "whatsapp" && (
        <YCloudConnectDialog
          open={ycloudOpen}
          onOpenChange={setYcloudOpen}
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
