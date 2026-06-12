"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Loader2, Star } from "lucide-react"
import { toast } from "sonner"

/**
 * Regla de acumulación del programa de fidelidad:
 * "X puntos por cada $Y de compra" — se aplica en el Punto de Venta
 * cuando la venta tiene un cliente asociado (buscado o escaneado por QR).
 */
export function LoyaltySettingsCard({ userId }: { userId: string }) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [isActive, setIsActive] = useState(true)
  const [pointsPerUnit, setPointsPerUnit] = useState("1")
  const [unitAmount, setUnitAmount] = useState("100")

  useEffect(() => {
    supabase
      .from("loyalty_settings")
      .select("points_per_unit, unit_amount, is_active")
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setIsActive(data.is_active)
          setPointsPerUnit(String(data.points_per_unit))
          setUnitAmount(String(Number(data.unit_amount)))
        }
        setLoading(false)
      })
  }, [userId])

  const handleSave = async () => {
    const points = parseInt(pointsPerUnit, 10)
    const amount = parseFloat(unitAmount.replace(",", "."))
    if (isNaN(points) || points < 0 || !amount || amount <= 0) {
      toast.error("Revisá los valores: los puntos deben ser 0 o más y el monto mayor a 0")
      return
    }

    setSaving(true)
    try {
      const { error } = await supabase.from("loyalty_settings").upsert({
        user_id: userId,
        points_per_unit: points,
        unit_amount: amount,
        is_active: isActive,
        updated_at: new Date().toISOString(),
      })
      if (error) throw error
      toast.success("Regla de puntos guardada")
    } catch (err) {
      console.error("Error saving loyalty settings:", err)
      toast.error("No se pudo guardar la regla de puntos")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-card p-5 rounded-3xl shadow-sm border border-border">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-12 h-12 rounded-2xl bg-[#D1F366]/20 flex items-center justify-center flex-shrink-0">
            <Star className="w-5 h-5 text-[#1C1C28] dark:text-[#D1F366]" />
          </div>
          <div className="min-w-0">
            <p className="font-bold text-sm">Acumulación de puntos</p>
            <p className="text-xs text-muted-foreground">
              Se suman automáticamente en el Punto de Venta al asociar o escanear un cliente
            </p>
          </div>
        </div>

        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        ) : (
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Puntos</Label>
              <Input
                type="number"
                min="0"
                value={pointsPerUnit}
                onChange={(e) => setPointsPerUnit(e.target.value)}
                className="w-20 rounded-xl"
                disabled={!isActive}
              />
            </div>
            <p className="text-sm text-muted-foreground pb-2.5">por cada $</p>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Monto</Label>
              <Input
                type="number"
                min="1"
                value={unitAmount}
                onChange={(e) => setUnitAmount(e.target.value)}
                className="w-24 rounded-xl"
                disabled={!isActive}
              />
            </div>
            <div className="flex items-center gap-2 pb-2">
              <Switch checked={isActive} onCheckedChange={setIsActive} />
            </div>
            <Button
              onClick={handleSave}
              disabled={saving}
              size="sm"
              className="bg-[#D1F366] text-[#1C1C28] hover:bg-[#B3D93C] font-bold rounded-xl"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Guardar"}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
