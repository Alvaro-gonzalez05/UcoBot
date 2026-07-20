"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Plus, Trash2, Loader2, ChefHat } from "lucide-react"
import { toast } from "sonner"

interface SupplyOption {
  id: string
  name: string
  unit: string
}

interface RecipeRow {
  id: string
  supply_id: string
  quantity: number
  supply?: { name: string; unit: string } | null
}

/**
 * Bloque "Receta / Stock" del producto: insumos que consume cada unidad vendida
 * (se descuentan solos con apply_order_stock) y stock directo del producto
 * (para bebidas o items comprados). Guarda cada cambio al toque.
 */
export function ProductRecipeEditor({ productId }: { productId: string }) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [ownerId, setOwnerId] = useState<string | null>(null)
  const [supplies, setSupplies] = useState<SupplyOption[]>([])
  const [recipe, setRecipe] = useState<RecipeRow[]>([])
  const [trackStock, setTrackStock] = useState(false)
  const [stockQty, setStockQty] = useState("")
  const [threshold, setThreshold] = useState("")
  const [newSupplyId, setNewSupplyId] = useState("")
  const [newQty, setNewQty] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const load = async () => {
      try {
        const { data: product } = await supabase
          .from("products")
          .select("user_id, track_stock, stock_quantity, low_stock_threshold")
          .eq("id", productId)
          .single()
        if (!product) return
        setOwnerId(product.user_id)
        setTrackStock(product.track_stock ?? false)
        setStockQty(product.stock_quantity != null ? String(product.stock_quantity) : "")
        setThreshold(product.low_stock_threshold != null ? String(product.low_stock_threshold) : "")

        const [{ data: supplyRows }, { data: recipeRows }] = await Promise.all([
          supabase.from("supplies").select("id, name, unit").eq("user_id", product.user_id).eq("is_active", true).order("name"),
          supabase.from("product_supplies").select("id, supply_id, quantity, supply:supply_id(name, unit)").eq("product_id", productId),
        ])
        setSupplies((supplyRows as SupplyOption[]) || [])
        setRecipe((recipeRows as unknown as RecipeRow[]) || [])
      } catch (err) {
        console.error("Error loading recipe:", err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [productId])

  const saveProductStock = async (patch: { track_stock?: boolean; stock_quantity?: number | null; low_stock_threshold?: number | null }) => {
    const { error } = await supabase.from("products").update(patch).eq("id", productId)
    if (error) {
      console.error("Error updating product stock:", error)
      toast.error("No se pudo guardar el stock del producto")
    }
  }

  const addRecipeRow = async () => {
    if (!newSupplyId || !ownerId) return
    const qty = Number(newQty.replace(",", "."))
    if (!qty || qty <= 0) {
      toast.error("Ingresá la cantidad que consume cada unidad vendida")
      return
    }
    setSaving(true)
    try {
      const { data, error } = await supabase
        .from("product_supplies")
        .insert({ user_id: ownerId, product_id: productId, supply_id: newSupplyId, quantity: qty })
        .select("id, supply_id, quantity, supply:supply_id(name, unit)")
        .single()
      if (error) throw error
      setRecipe((prev) => [...prev, data as unknown as RecipeRow])
      setNewSupplyId("")
      setNewQty("")
    } catch (err: any) {
      toast.error(err?.code === "23505" ? "Ese insumo ya está en la receta" : "No se pudo agregar el insumo")
    } finally {
      setSaving(false)
    }
  }

  const removeRecipeRow = async (rowId: string) => {
    const { error } = await supabase.from("product_supplies").delete().eq("id", rowId)
    if (error) {
      toast.error("No se pudo quitar el insumo")
      return
    }
    setRecipe((prev) => prev.filter((r) => r.id !== rowId))
  }

  const availableSupplies = supplies.filter((s) => !recipe.some((r) => r.supply_id === s.id))

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-lg border p-3 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Cargando receta y stock...
      </div>
    )
  }

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <p className="flex items-center gap-2 text-sm font-medium">
        <ChefHat className="h-4 w-4" /> Receta / Stock
      </p>

      {/* Stock directo (bebidas, items comprados) */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Switch
            id="track-stock"
            checked={trackStock}
            onCheckedChange={(checked) => {
              setTrackStock(checked)
              saveProductStock({ track_stock: checked })
            }}
          />
          <Label htmlFor="track-stock" className="text-sm">Stock directo del producto</Label>
        </div>
      </div>
      {trackStock && (
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Stock actual</Label>
            <Input
              inputMode="decimal"
              placeholder="0"
              value={stockQty}
              onChange={(e) => setStockQty(e.target.value)}
              onBlur={() => saveProductStock({ stock_quantity: stockQty.trim() === "" ? null : Number(stockQty.replace(",", ".")) || 0 })}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Alerta de stock bajo</Label>
            <Input
              inputMode="decimal"
              placeholder="Sin alerta"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              onBlur={() => saveProductStock({ low_stock_threshold: threshold.trim() === "" ? null : Number(threshold.replace(",", ".")) || 0 })}
            />
          </div>
        </div>
      )}

      {/* Receta: insumos por unidad vendida */}
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">
          Insumos que consume cada unidad vendida (se descuentan solos)
        </Label>
        {recipe.map((row) => (
          <div key={row.id} className="flex items-center justify-between gap-2 rounded-md bg-muted/60 px-2.5 py-1.5 text-sm">
            <span className="min-w-0 truncate">{row.supply?.name || "Insumo"}</span>
            <span className="flex shrink-0 items-center gap-1.5 text-muted-foreground">
              {Number(row.quantity)} {row.supply?.unit || ""}
              <button type="button" onClick={() => removeRecipeRow(row.id)} className="text-red-500 hover:text-red-600">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </span>
          </div>
        ))}
        {supplies.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Cargá insumos en la sección <span className="font-medium">Stock</span> para armar la receta.
          </p>
        ) : (
          <div className="flex items-center gap-2">
            <Select value={newSupplyId} onValueChange={setNewSupplyId}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Agregar insumo..." />
              </SelectTrigger>
              <SelectContent>
                {availableSupplies.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name} ({s.unit})</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              inputMode="decimal"
              placeholder="Cant."
              className="w-20"
              value={newQty}
              onChange={(e) => setNewQty(e.target.value)}
            />
            <Button type="button" size="icon" variant="outline" className="h-9 w-9 shrink-0" onClick={addRecipeRow} disabled={saving || !newSupplyId}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
