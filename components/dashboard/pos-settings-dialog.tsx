"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Banknote, CreditCard, Landmark, QrCode, Smartphone, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { PAYMENT_METHOD_LABELS } from "@/lib/payment-methods"

export interface PosSettings {
  payment_methods: string[]
  tip_enabled: boolean
  tip_percent: number
  ticket_width: number
  /** Cierre automático de caja: 'off' | 'hours' (tras N horas) | 'daily' (hora fija) */
  cash_auto_close_mode: "off" | "hours" | "daily"
  cash_auto_close_hours: number
  cash_auto_close_time: string
}

export const DEFAULT_POS_SETTINGS: PosSettings = {
  payment_methods: ["cash", "card", "transfer", "qr"],
  tip_enabled: false,
  tip_percent: 10,
  ticket_width: 80,
  cash_auto_close_mode: "off",
  cash_auto_close_hours: 12,
  cash_auto_close_time: "23:59",
}

/** Columnas de pos_settings que necesita el POS (evita repetir el select en cada pantalla). */
export const POS_SETTINGS_COLUMNS =
  "payment_methods, tip_enabled, tip_percent, ticket_width, cash_auto_close_mode, cash_auto_close_hours, cash_auto_close_time"

const PAYMENT_METHODS = [
  { id: "cash", label: PAYMENT_METHOD_LABELS.cash, icon: Banknote },
  { id: "card", label: PAYMENT_METHOD_LABELS.card, icon: CreditCard },
  { id: "transfer", label: PAYMENT_METHOD_LABELS.transfer, icon: Landmark },
  { id: "qr", label: PAYMENT_METHOD_LABELS.qr, icon: QrCode },
  { id: "nave", label: PAYMENT_METHOD_LABELS.nave, icon: Smartphone },
]

export function PosSettingsDialog({
  open,
  onOpenChange,
  userId,
  settings,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  userId: string
  settings: PosSettings
  onSaved: (s: PosSettings) => void
}) {
  const supabase = createClient()
  const [methods, setMethods] = useState<string[]>(settings.payment_methods)
  const [tipEnabled, setTipEnabled] = useState(settings.tip_enabled)
  const [tipPercent, setTipPercent] = useState(String(settings.tip_percent))
  const [ticketWidth, setTicketWidth] = useState<number>(settings.ticket_width || 80)
  const [autoCloseMode, setAutoCloseMode] = useState<PosSettings["cash_auto_close_mode"]>(settings.cash_auto_close_mode || "off")
  const [autoCloseHours, setAutoCloseHours] = useState(String(settings.cash_auto_close_hours ?? 12))
  const [autoCloseTime, setAutoCloseTime] = useState((settings.cash_auto_close_time || "23:59").slice(0, 5))
  const [saving, setSaving] = useState(false)

  // La config del POS llega async (arranca en los valores por defecto). Al abrir el
  // diálogo resincronizamos desde settings para no mostrar un estado viejo (ej: la
  // propina apareciendo apagada cuando en realidad está activada).
  useEffect(() => {
    if (!open) return
    setMethods(settings.payment_methods)
    setTipEnabled(settings.tip_enabled)
    setTipPercent(String(settings.tip_percent))
    setTicketWidth(settings.ticket_width || 80)
    setAutoCloseMode(settings.cash_auto_close_mode || "off")
    setAutoCloseHours(String(settings.cash_auto_close_hours ?? 12))
    setAutoCloseTime((settings.cash_auto_close_time || "23:59").slice(0, 5))
  }, [open, settings])

  const toggleMethod = (id: string) => {
    setMethods((prev) => (prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]))
  }

  const handleSave = async () => {
    if (methods.length === 0) {
      toast.error("Tenés que dejar al menos un medio de pago activo")
      return
    }
    const percent = parseFloat(tipPercent.replace(",", ".")) || 0
    if (percent < 0 || percent > 100) {
      toast.error("El porcentaje de propina debe estar entre 0 y 100")
      return
    }

    setSaving(true)
    try {
      // Ordenar según el orden canónico para que se vean consistentes
      const ordered = PAYMENT_METHODS.filter((p) => methods.includes(p.id)).map((p) => p.id)
      const hours = Math.min(72, Math.max(1, parseInt(autoCloseHours) || 12))
      const payload: PosSettings = {
        payment_methods: ordered,
        tip_enabled: tipEnabled,
        tip_percent: percent,
        ticket_width: ticketWidth,
        cash_auto_close_mode: autoCloseMode,
        cash_auto_close_hours: hours,
        cash_auto_close_time: `${autoCloseTime}:00`,
      }
      const { error } = await supabase.from("pos_settings").upsert({
        user_id: userId,
        ...payload,
        updated_at: new Date().toISOString(),
      })
      if (error) throw error
      toast.success("Configuración del punto de venta guardada")
      onSaved(payload)
      onOpenChange(false)
    } catch (err) {
      console.error("Error saving POS settings:", err)
      toast.error("No se pudo guardar la configuración")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Configuración del punto de venta</DialogTitle>
          <DialogDescription>
            Medios de pago, propina, impresora y cierre automático de caja.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Medios de pago */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Medios de pago aceptados</Label>
            <div className="grid grid-cols-2 gap-2">
              {PAYMENT_METHODS.map((m) => {
                const Icon = m.icon
                const active = methods.includes(m.id)
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => toggleMethod(m.id)}
                    className={cn(
                      "flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors",
                      active
                        ? "border-[#D1F366] bg-[#D1F366]/10"
                        : "border-border/60 bg-muted/20 text-muted-foreground hover:border-border"
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-5 w-5 items-center justify-center rounded-md border flex-shrink-0",
                        active ? "bg-[#D1F366] border-[#D1F366] text-[#1C1C28]" : "border-muted-foreground/40"
                      )}
                    >
                      {active && <span className="text-[11px] font-black">✓</span>}
                    </span>
                    <Icon className={cn("w-4 h-4 flex-shrink-0", active ? "text-[#1C1C28] dark:text-[#D1F366]" : "")} />
                    <span className="truncate">{m.label}</span>
                  </button>
                )
              })}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Solo los seleccionados aparecen al cobrar.
            </p>
          </div>

          {/* Propina */}
          <div className="space-y-2 rounded-xl border border-border/60 p-3">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-semibold">Propina / extra</Label>
                <p className="text-[11px] text-muted-foreground">Permite sumar un porcentaje a la cuenta al cobrar</p>
              </div>
              {/* Colores explícitos: el switch por default se camuflaba con el fondo */}
              <Switch
                checked={tipEnabled}
                onCheckedChange={setTipEnabled}
                className="border border-border data-[state=checked]:bg-[#B3D93C] data-[state=unchecked]:bg-slate-300 dark:data-[state=unchecked]:bg-slate-600 [&>span]:bg-white [&>span]:shadow-md"
              />
            </div>
            {tipEnabled && (
              <div className="flex items-center gap-2 pt-1">
                <span className="text-sm text-muted-foreground">Propina sugerida:</span>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={tipPercent}
                  onChange={(e) => setTipPercent(e.target.value)}
                  className="w-20 h-9"
                />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
            )}
          </div>

          {/* Ancho del ticket */}
          <div className="space-y-2 rounded-xl border border-border/60 p-3">
            <div>
              <Label className="text-sm font-semibold">Ancho del ticket</Label>
              <p className="text-[11px] text-muted-foreground">Elegí según tu impresora térmica (80mm es lo más común).</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[80, 58].map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => setTicketWidth(w)}
                  className={cn(
                    "rounded-xl border px-3 py-2.5 text-sm font-semibold transition-colors",
                    ticketWidth === w
                      ? "border-[#D1F366] bg-[#D1F366]/10 text-foreground"
                      : "border-border/60 bg-muted/20 text-muted-foreground hover:border-border"
                  )}
                >
                  {w}mm
                </button>
              ))}
            </div>
          </div>

          {/* Cierre automático de caja */}
          <div className="space-y-2 rounded-xl border border-border/60 p-3">
            <div>
              <Label className="text-sm font-semibold">Cierre automático de caja</Label>
              <p className="text-[11px] text-muted-foreground">
                Si alguien se olvida de cerrarla, se cierra sola con el total esperado (queda anotado como cierre automático).
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: "off", label: "Nunca" },
                { id: "hours", label: "Por horas" },
                { id: "daily", label: "Diario" },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setAutoCloseMode(opt.id as PosSettings["cash_auto_close_mode"])}
                  className={cn(
                    "rounded-xl border px-2 py-2.5 text-sm font-semibold transition-colors",
                    autoCloseMode === opt.id
                      ? "border-[#D1F366] bg-[#D1F366]/10 text-foreground"
                      : "border-border/60 bg-muted/20 text-muted-foreground hover:border-border"
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {autoCloseMode === "hours" && (
              <div className="flex items-center gap-2 pt-1">
                <span className="text-sm text-muted-foreground">Cerrar tras</span>
                <Input
                  type="number"
                  min="1"
                  max="72"
                  value={autoCloseHours}
                  onChange={(e) => setAutoCloseHours(e.target.value)}
                  className="h-9 w-20"
                />
                <span className="text-sm text-muted-foreground">horas abierta</span>
              </div>
            )}
            {autoCloseMode === "daily" && (
              <div className="flex items-center gap-2 pt-1">
                <span className="text-sm text-muted-foreground">Todos los días a las</span>
                <Input
                  type="time"
                  value={autoCloseTime}
                  onChange={(e) => setAutoCloseTime(e.target.value)}
                  className="h-9 w-32"
                />
              </div>
            )}
          </div>

          <Button
            onClick={handleSave}
            disabled={saving}
            className="w-full bg-[#D1F366] text-[#1C1C28] hover:bg-[#B3D93C] font-bold rounded-xl gap-2"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Guardando…
              </>
            ) : (
              "Guardar configuración"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
