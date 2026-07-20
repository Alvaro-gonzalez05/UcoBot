"use client"

import { useMemo, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Loader2, Plus, Pencil, Trash2, PackageOpen, AlertTriangle, ArrowUpDown, Beef, GlassWater, History } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

export interface Supply {
  id: string
  name: string
  unit: string
  stock_quantity: number
  low_stock_threshold: number | null
  cost: number | null
  is_active: boolean
}

interface TrackedProduct {
  id: string
  name: string
  category: string | null
  track_stock: boolean
  stock_quantity: number | null
  low_stock_threshold: number | null
}

interface Movement {
  id: string
  supply_id: string | null
  product_id: string | null
  order_id: string | null
  quantity: number
  reason: string
  notes: string | null
  created_at: string
  supply?: { name: string; unit: string } | null
  product?: { name: string } | null
}

const UNITS = ["un", "kg", "g", "l", "ml"]

const REASON_LABELS: Record<string, string> = {
  sale: "Venta",
  cancel_restock: "Reposición por cancelación",
  manual_adjust: "Ajuste manual",
  purchase: "Compra / reposición",
  waste: "Merma / desperdicio",
}

const fmtQty = (v: number) => {
  const n = Number(v) || 0
  return Number.isInteger(n) ? String(n) : n.toFixed(3).replace(/\.?0+$/, "")
}

const isLow = (qty: number | null, threshold: number | null) =>
  threshold != null && qty != null && Number(qty) <= Number(threshold)

/**
 * Sección Stock: insumos con stock (materia prima de las recetas), stock directo
 * de productos (bebidas), ajustes manuales con motivo y auditoría de movimientos.
 */
export function StockClient({
  userId,
  initialSupplies,
  initialMovements,
  initialTrackedProducts,
}: {
  userId: string
  initialSupplies: Supply[]
  initialMovements: Movement[]
  initialTrackedProducts: TrackedProduct[]
}) {
  const supabase = createClient()
  const [supplies, setSupplies] = useState<Supply[]>(initialSupplies)
  const [movements, setMovements] = useState<Movement[]>(initialMovements)
  const [trackedProducts, setTrackedProducts] = useState<TrackedProduct[]>(initialTrackedProducts)

  // Alta / edición de insumo
  const [supplyDialogOpen, setSupplyDialogOpen] = useState(false)
  const [editingSupply, setEditingSupply] = useState<Supply | null>(null)
  const [supplyForm, setSupplyForm] = useState({ name: "", unit: "un", stock: "", threshold: "", cost: "" })
  const [saving, setSaving] = useState(false)

  // Ajuste de stock (insumo o producto)
  const [adjustTarget, setAdjustTarget] = useState<{ type: "supply" | "product"; id: string; name: string; unit?: string } | null>(null)
  const [adjustQty, setAdjustQty] = useState("")
  const [adjustReason, setAdjustReason] = useState<"purchase" | "manual_adjust" | "waste">("purchase")
  const [adjustNotes, setAdjustNotes] = useState("")

  const lowSupplies = useMemo(
    () => supplies.filter((s) => s.is_active && isLow(s.stock_quantity, s.low_stock_threshold)),
    [supplies]
  )
  const lowProducts = useMemo(
    () => trackedProducts.filter((p) => isLow(p.stock_quantity, p.low_stock_threshold)),
    [trackedProducts]
  )

  const openSupplyDialog = (supply?: Supply) => {
    setEditingSupply(supply || null)
    setSupplyForm(
      supply
        ? {
            name: supply.name,
            unit: supply.unit,
            stock: String(supply.stock_quantity ?? 0),
            threshold: supply.low_stock_threshold != null ? String(supply.low_stock_threshold) : "",
            cost: supply.cost != null ? String(supply.cost) : "",
          }
        : { name: "", unit: "un", stock: "", threshold: "", cost: "" }
    )
    setSupplyDialogOpen(true)
  }

  const saveSupply = async () => {
    if (!supplyForm.name.trim()) {
      toast.error("Ingresá el nombre del insumo")
      return
    }
    setSaving(true)
    const payload = {
      name: supplyForm.name.trim(),
      unit: supplyForm.unit,
      stock_quantity: Number(supplyForm.stock.replace(",", ".")) || 0,
      low_stock_threshold: supplyForm.threshold.trim() === "" ? null : Number(supplyForm.threshold.replace(",", ".")) || 0,
      cost: supplyForm.cost.trim() === "" ? null : Number(supplyForm.cost.replace(",", ".")) || 0,
    }
    try {
      if (editingSupply) {
        const { data, error } = await supabase
          .from("supplies")
          .update(payload)
          .eq("id", editingSupply.id)
          .select()
          .single()
        if (error) throw error
        setSupplies((prev) => prev.map((s) => (s.id === editingSupply.id ? (data as Supply) : s)))
        toast.success("Insumo actualizado")
      } else {
        const { data, error } = await supabase
          .from("supplies")
          .insert({ ...payload, user_id: userId })
          .select()
          .single()
        if (error) throw error
        setSupplies((prev) => [...prev, data as Supply].sort((a, b) => a.name.localeCompare(b.name)))
        toast.success("Insumo creado")
      }
      setSupplyDialogOpen(false)
    } catch (err) {
      console.error("Error saving supply:", err)
      toast.error("No se pudo guardar el insumo")
    } finally {
      setSaving(false)
    }
  }

  const deleteSupply = async (supply: Supply) => {
    if (!confirm(`¿Eliminar el insumo "${supply.name}"? También se elimina de las recetas que lo usan.`)) return
    try {
      const { error } = await supabase.from("supplies").delete().eq("id", supply.id)
      if (error) throw error
      setSupplies((prev) => prev.filter((s) => s.id !== supply.id))
      toast.success("Insumo eliminado")
    } catch (err) {
      console.error("Error deleting supply:", err)
      toast.error("No se pudo eliminar el insumo")
    }
  }

  const openAdjust = (target: { type: "supply" | "product"; id: string; name: string; unit?: string }) => {
    setAdjustTarget(target)
    setAdjustQty("")
    setAdjustReason("purchase")
    setAdjustNotes("")
  }

  const applyAdjust = async () => {
    if (!adjustTarget) return
    const qty = Number(adjustQty.replace(",", "."))
    if (!qty || Number.isNaN(qty)) {
      toast.error("Ingresá la cantidad (positiva para sumar, negativa para restar)")
      return
    }
    // Merma siempre resta, compra siempre suma; ajuste manual respeta el signo
    const signedQty = adjustReason === "waste" ? -Math.abs(qty) : adjustReason === "purchase" ? Math.abs(qty) : qty
    setSaving(true)
    try {
      if (adjustTarget.type === "supply") {
        const supply = supplies.find((s) => s.id === adjustTarget.id)
        if (!supply) return
        const newQty = Number((Number(supply.stock_quantity) + signedQty).toFixed(3))
        const { error } = await supabase.from("supplies").update({ stock_quantity: newQty }).eq("id", adjustTarget.id)
        if (error) throw error
        setSupplies((prev) => prev.map((s) => (s.id === adjustTarget.id ? { ...s, stock_quantity: newQty } : s)))
      } else {
        const product = trackedProducts.find((p) => p.id === adjustTarget.id)
        if (!product) return
        const newQty = Number(((Number(product.stock_quantity) || 0) + signedQty).toFixed(3))
        const { error } = await supabase.from("products").update({ stock_quantity: newQty }).eq("id", adjustTarget.id)
        if (error) throw error
        setTrackedProducts((prev) => prev.map((p) => (p.id === adjustTarget.id ? { ...p, stock_quantity: newQty } : p)))
      }

      const { data: movement, error: mvError } = await supabase
        .from("stock_movements")
        .insert({
          user_id: userId,
          supply_id: adjustTarget.type === "supply" ? adjustTarget.id : null,
          product_id: adjustTarget.type === "product" ? adjustTarget.id : null,
          quantity: signedQty,
          reason: adjustReason,
          notes: adjustNotes.trim() || null,
        })
        .select("*, supply:supply_id(name, unit), product:product_id(name)")
        .single()
      if (mvError) throw mvError
      setMovements((prev) => [movement as Movement, ...prev])
      toast.success("Stock actualizado")
      setAdjustTarget(null)
    } catch (err) {
      console.error("Error adjusting stock:", err)
      toast.error("No se pudo ajustar el stock")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6 pb-24 lg:pb-8">
      {/* Header (mismo patrón que las otras secciones) */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Stock</h1>
          <p className="text-muted-foreground">Insumos, recetas, stock de productos y movimientos</p>
        </div>
        <Button onClick={() => openSupplyDialog()}>
          <Plus className="mr-1.5 h-4 w-4" /> Nuevo insumo
        </Button>
      </div>

      {/* Tarjetas de resumen */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
              <Beef className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-2xl font-bold leading-tight">{supplies.filter((s) => s.is_active).length}</p>
              <p className="truncate text-xs text-muted-foreground">Insumos activos</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sky-500/10">
              <GlassWater className="h-5 w-5 text-sky-500" />
            </div>
            <div className="min-w-0">
              <p className="text-2xl font-bold leading-tight">{trackedProducts.length}</p>
              <p className="truncate text-xs text-muted-foreground">Productos con stock</p>
            </div>
          </CardContent>
        </Card>
        <Card className={lowSupplies.length + lowProducts.length > 0 ? "border-amber-400/60" : undefined}>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-500/10">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
            </div>
            <div className="min-w-0">
              <p className="text-2xl font-bold leading-tight">{lowSupplies.length + lowProducts.length}</p>
              <p className="truncate text-xs text-muted-foreground">Alertas de stock bajo</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/10">
              <History className="h-5 w-5 text-emerald-500" />
            </div>
            <div className="min-w-0">
              <p className="text-2xl font-bold leading-tight">
                {movements.filter((m) => new Date(m.created_at).toDateString() === new Date().toDateString()).length}
              </p>
              <p className="truncate text-xs text-muted-foreground">Movimientos de hoy</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {(lowSupplies.length > 0 || lowProducts.length > 0) && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-300/60 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">Stock bajo</p>
            <p className="text-xs">
              {[...lowSupplies.map((s) => `${s.name} (${fmtQty(s.stock_quantity)} ${s.unit})`), ...lowProducts.map((p) => `${p.name} (${fmtQty(p.stock_quantity || 0)} un)`)].join(" · ")}
            </p>
          </div>
        </div>
      )}

      <Tabs defaultValue="supplies">
        <TabsList>
          <TabsTrigger value="supplies">Insumos</TabsTrigger>
          <TabsTrigger value="products">Productos</TabsTrigger>
          <TabsTrigger value="movements">Movimientos</TabsTrigger>
        </TabsList>

        <TabsContent value="supplies" className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">
          {supplies.length === 0 ? (
            <Card className="md:col-span-2 xl:col-span-3">
              <CardContent className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
                <PackageOpen className="h-8 w-8" />
                <p>Todavía no cargaste insumos.</p>
                <p className="text-xs">Los insumos (harina, carne, pan...) se descuentan solos al vender productos con receta.</p>
              </CardContent>
            </Card>
          ) : (
            supplies.map((supply) => (
              <Card key={supply.id} className={cn(!supply.is_active && "opacity-60")}>
                <CardContent className="flex items-center justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-medium">
                      {supply.name}
                      {isLow(supply.stock_quantity, supply.low_stock_threshold) && (
                        <Badge variant="destructive" className="text-[10px]">Stock bajo</Badge>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {fmtQty(supply.stock_quantity)} {supply.unit}
                      {supply.low_stock_threshold != null && ` · alerta en ${fmtQty(supply.low_stock_threshold)}`}
                      {supply.cost != null && ` · $${supply.cost}/${supply.unit}`}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <Button variant="outline" size="sm" onClick={() => openAdjust({ type: "supply", id: supply.id, name: supply.name, unit: supply.unit })}>
                      <ArrowUpDown className="mr-1 h-3.5 w-3.5" /> Ajustar
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openSupplyDialog(supply)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500" onClick={() => deleteSupply(supply)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="products" className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">
          {trackedProducts.length === 0 ? (
            <Card className="md:col-span-2 xl:col-span-3">
              <CardContent className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
                <PackageOpen className="h-8 w-8" />
                <p>Ningún producto tiene stock directo activado.</p>
                <p className="text-xs">Activalo desde la edición del producto (ideal para bebidas o items comprados).</p>
              </CardContent>
            </Card>
          ) : (
            trackedProducts.map((product) => (
              <Card key={product.id}>
                <CardContent className="flex items-center justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-medium">
                      {product.name}
                      {isLow(product.stock_quantity, product.low_stock_threshold) && (
                        <Badge variant="destructive" className="text-[10px]">Stock bajo</Badge>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {fmtQty(product.stock_quantity || 0)} unidades
                      {product.low_stock_threshold != null && ` · alerta en ${fmtQty(product.low_stock_threshold)}`}
                      {product.category && ` · ${product.category}`}
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => openAdjust({ type: "product", id: product.id, name: product.name })}>
                    <ArrowUpDown className="mr-1 h-3.5 w-3.5" /> Ajustar
                  </Button>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="movements" className="grid gap-1.5 lg:grid-cols-2">
          {movements.length === 0 ? (
            <Card className="lg:col-span-2">
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                Sin movimientos todavía. Acá queda la auditoría de ventas, cancelaciones y ajustes.
              </CardContent>
            </Card>
          ) : (
            movements.map((mv) => (
              <div key={mv.id} className="flex items-center justify-between gap-3 rounded-xl border bg-card p-2.5 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {mv.supply?.name || mv.product?.name || "—"}
                    <span className="ml-2 text-xs font-normal text-muted-foreground">{REASON_LABELS[mv.reason] || mv.reason}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(mv.created_at).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })}
                    {mv.order_id && ` · Pedido #${mv.order_id.slice(0, 8).toUpperCase()}`}
                    {mv.notes && ` · ${mv.notes}`}
                  </p>
                </div>
                <span className={cn("shrink-0 font-semibold", mv.quantity < 0 ? "text-red-500" : "text-emerald-600")}>
                  {mv.quantity > 0 ? "+" : ""}{fmtQty(mv.quantity)} {mv.supply?.unit || "un"}
                </span>
              </div>
            ))
          )}
        </TabsContent>
      </Tabs>

      {/* Alta / edición de insumo */}
      <Dialog open={supplyDialogOpen} onOpenChange={setSupplyDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingSupply ? "Editar insumo" : "Nuevo insumo"}</DialogTitle>
            <DialogDescription>Materia prima que se descuenta con las recetas de tus productos.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Nombre</Label>
              <Input
                placeholder="Ej: Pan de hamburguesa"
                value={supplyForm.name}
                onChange={(e) => setSupplyForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Unidad</Label>
                <Select value={supplyForm.unit} onValueChange={(v) => setSupplyForm((f) => ({ ...f, unit: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {UNITS.map((u) => (
                      <SelectItem key={u} value={u}>{u}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Stock actual</Label>
                <Input
                  inputMode="decimal"
                  placeholder="0"
                  value={supplyForm.stock}
                  onChange={(e) => setSupplyForm((f) => ({ ...f, stock: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Alerta de stock bajo</Label>
                <Input
                  inputMode="decimal"
                  placeholder="Sin alerta"
                  value={supplyForm.threshold}
                  onChange={(e) => setSupplyForm((f) => ({ ...f, threshold: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Costo por unidad (opc.)</Label>
                <Input
                  inputMode="decimal"
                  placeholder="$"
                  value={supplyForm.cost}
                  onChange={(e) => setSupplyForm((f) => ({ ...f, cost: e.target.value }))}
                />
              </div>
            </div>
            <Button className="w-full" onClick={saveSupply} disabled={saving}>
              {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {editingSupply ? "Guardar cambios" : "Crear insumo"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Ajuste rápido de stock */}
      <Dialog open={!!adjustTarget} onOpenChange={(open) => !open && setAdjustTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Ajustar stock · {adjustTarget?.name}</DialogTitle>
            <DialogDescription>El ajuste queda registrado en los movimientos.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Motivo</Label>
              <Select value={adjustReason} onValueChange={(v) => setAdjustReason(v as typeof adjustReason)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="purchase">Compra / reposición (suma)</SelectItem>
                  <SelectItem value="waste">Merma / desperdicio (resta)</SelectItem>
                  <SelectItem value="manual_adjust">Ajuste manual (con signo)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Cantidad{adjustTarget?.unit ? ` (${adjustTarget.unit})` : ""}</Label>
              <Input
                inputMode="decimal"
                placeholder={adjustReason === "manual_adjust" ? "Ej: -2 o 5" : "Ej: 10"}
                value={adjustQty}
                onChange={(e) => setAdjustQty(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Nota (opcional)</Label>
              <Input
                placeholder="Ej: compra al proveedor"
                value={adjustNotes}
                onChange={(e) => setAdjustNotes(e.target.value)}
              />
            </div>
            <Button className="w-full" onClick={applyAdjust} disabled={saving}>
              {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Aplicar ajuste
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
