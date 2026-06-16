"use client"

import { useState } from "react"
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
import { Banknote, CreditCard, Landmark, Link2, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

export interface PosSettings {
  payment_methods: string[]
  tip_enabled: boolean
  tip_percent: number
}

const PAYMENT_METHODS = [
  { id: "cash", label: "Efectivo", icon: Banknote },
  { id: "card", label: "Tarjeta", icon: CreditCard },
  { id: "transfer", label: "Transferencia", icon: Landmark },
  { id: "link", label: "Link Pago", icon: Link2 },
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
  const [saving, setSaving] = useState(false)

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
      const payload: PosSettings = {
        payment_methods: ordered,
        tip_enabled: tipEnabled,
        tip_percent: percent,
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
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Configuración del punto de venta</DialogTitle>
          <DialogDescription>
            Elegí qué medios de pago acepta tu negocio y configurá la propina.
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
              <Switch checked={tipEnabled} onCheckedChange={setTipEnabled} />
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
