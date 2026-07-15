"use client"

import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { AlertCircle, CheckCircle2, Loader2, RefreshCw, ShieldAlert, ShieldCheck } from "lucide-react"
import { toast } from "sonner"

/**
 * Estado de calidad del número de WhatsApp.
 *
 * Meta puntúa cada número por tasa de bloqueos y reportes. Cuando baja, primero
 * recorta el límite de mensajería y después inhabilita el número. Esta vista es
 * la señal temprana: sin ella uno se entera cuando ya es tarde.
 */

interface QualityEvent {
  event: string
  quality_rating: string | null
  previous_quality: string | null
  messaging_limit: string | null
  created_at: string
}

interface QualityState {
  quality_rating: string
  messaging_limit: string | null
  is_flagged: boolean
  sends_blocked: boolean
  blocked_reason: string | null
  last_event_at: string | null
}

interface QualityResponse {
  connected: boolean
  display_phone_number?: string | null
  quality?: QualityState | null
  events?: QualityEvent[]
}

const RATING_LABEL: Record<string, string> = {
  GREEN: "Alta",
  YELLOW: "Media",
  RED: "Baja",
  UNKNOWN: "Sin datos",
}

const RATING_STYLE: Record<string, string> = {
  GREEN: "bg-emerald-100 text-emerald-800 border-emerald-200",
  YELLOW: "bg-amber-100 text-amber-900 border-amber-200",
  RED: "bg-red-100 text-red-800 border-red-200",
  UNKNOWN: "bg-muted text-muted-foreground",
}

function formatDate(value: string | null) {
  if (!value) return "—"
  return new Date(value).toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function WhatsappQualityCard() {
  const [data, setData] = useState<QualityResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async (refresh = false) => {
    try {
      const res = await fetch(`/api/whatsapp/quality${refresh ? "?refresh=1" : ""}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "No se pudo leer el estado de calidad")
      setData(json)
    } catch (err: any) {
      toast.error(err?.message || "Error al leer la calidad del número")
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  if (loading) {
    return (
      <div className="executive-card p-6 flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">Cargando calidad del número…</span>
      </div>
    )
  }

  if (!data?.connected) {
    return (
      <div className="executive-card p-6">
        <h3 className="font-semibold">Calidad del número</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Conectá WhatsApp para ver la calidad de tu número.
        </p>
      </div>
    )
  }

  const rating = data.quality?.quality_rating || "UNKNOWN"
  const blocked = Boolean(data.quality?.sends_blocked)
  const flagged = Boolean(data.quality?.is_flagged)

  return (
    <div className="executive-card p-6 space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-semibold flex items-center gap-2">
            {blocked || flagged ? (
              <ShieldAlert className="h-4 w-4 text-red-600" />
            ) : (
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
            )}
            Calidad del número
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            {data.display_phone_number || "Número sin identificar"}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={refreshing}
          onClick={() => {
            setRefreshing(true)
            load(true)
          }}
        >
          {refreshing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          <span className="ml-2">Actualizar</span>
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Badge variant="outline" className={RATING_STYLE[rating] || RATING_STYLE.UNKNOWN}>
          Calidad: {RATING_LABEL[rating] || rating}
        </Badge>
        {data.quality?.messaging_limit && (
          <Badge variant="outline">Límite: {data.quality.messaging_limit.replace("TIER_", "")}</Badge>
        )}
        {flagged && (
          <Badge variant="outline" className={RATING_STYLE.RED}>
            Flaggeado por Meta
          </Badge>
        )}
      </div>

      {blocked ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 flex gap-3">
          <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-red-900">Envíos automáticos cortados</p>
            <p className="text-red-800 mt-1">
              {data.quality?.blocked_reason || "La calidad del número bajó."} Las promociones y
              follow-ups quedan suspendidos hasta que se recupere. Las respuestas a conversaciones
              abiertas siguen funcionando normalmente.
            </p>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 flex gap-3">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-emerald-900">Envíos habilitados</p>
            <p className="text-emerald-800 mt-1">
              El corte automático se activa solo si Meta baja la calidad a media o menos.
            </p>
          </div>
        </div>
      )}

      <div>
        <h4 className="text-sm font-medium mb-2">Historial de calidad</h4>
        {data.events?.length ? (
          <div className="rounded-lg border divide-y">
            {data.events.map((e, i) => (
              <div key={i} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <div className="flex items-center gap-2 min-w-0">
                  <Badge
                    variant="outline"
                    className={`${RATING_STYLE[e.quality_rating || "UNKNOWN"]} shrink-0`}
                  >
                    {RATING_LABEL[e.quality_rating || "UNKNOWN"]}
                  </Badge>
                  <span className="text-muted-foreground truncate">
                    {e.event}
                    {e.previous_quality && e.previous_quality !== e.quality_rating
                      ? ` · desde ${RATING_LABEL[e.previous_quality] || e.previous_quality}`
                      : ""}
                  </span>
                </div>
                <span className="text-muted-foreground shrink-0 text-xs">
                  {formatDate(e.created_at)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Todavía no hay eventos registrados. Meta los envía cuando cambia la calidad del número.
          </p>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Última actualización: {formatDate(data.quality?.last_event_at || null)}
      </p>
    </div>
  )
}
