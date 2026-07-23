"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
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
import { SheetGrabBar } from "@/components/ui/sheet-grab-bar"
import { PurchaseDialog, type LowItemForPrefill } from "@/components/dashboard/purchase-dialog"
import { Loader2, Plus, Pencil, Trash2, PackageOpen, ArrowUpDown, ShoppingCart, Printer, Truck } from "lucide-react"
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

const currency = (v: number) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(v || 0)

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
  branchId = null,
  initialSupplies,
  initialMovements,
  initialTrackedProducts,
}: {
  userId: string
  /** id de sucursal cuando el admin la está gestionando (para leer el ticket) */
  branchId?: string | null
  initialSupplies: Supply[]
  initialMovements: Movement[]
  initialTrackedProducts: TrackedProduct[]
}) {
  const supabase = createClient()
  const router = useRouter()
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
  // En mobile la lista de compras vive en una hoja arrastrable (no en el grid)
  const [listOpen, setListOpen] = useState(false)
  // Registrar compra (sube stock + costo + gasto)
  const [purchaseOpen, setPurchaseOpen] = useState(false)

  // Lista única de todo lo que tiene stock: insumos + productos con stock directo.
  // Los que están por agotarse van primero para no tener que buscarlos.
  const stockItems = useMemo(() => {
    const items = [
      ...supplies
        .filter((s) => s.is_active)
        .map((s) => ({
          key: `s-${s.id}`,
          id: s.id,
          type: "supply" as const,
          name: s.name,
          quantity: Number(s.stock_quantity) || 0,
          unit: s.unit || "un",
          threshold: s.low_stock_threshold,
          cost: s.cost,
          low: isLow(s.stock_quantity, s.low_stock_threshold),
        })),
      ...trackedProducts.map((p) => ({
        key: `p-${p.id}`,
        id: p.id,
        type: "product" as const,
        name: p.name,
        quantity: Number(p.stock_quantity) || 0,
        unit: "un",
        threshold: p.low_stock_threshold,
        cost: null as number | null,
        low: isLow(p.stock_quantity, p.low_stock_threshold),
      })),
    ]
    return items.sort((a, b) => Number(b.low) - Number(a.low) || a.name.localeCompare(b.name))
  }, [supplies, trackedProducts])

  const lowItems = useMemo(() => stockItems.filter((i) => i.low), [stockItems])

  // Faltantes en el formato que espera el diálogo de compra (cantidad sugerida)
  const lowForPurchase: LowItemForPrefill[] = useMemo(
    () =>
      lowItems.map((it) => ({
        id: it.id,
        type: it.type,
        name: it.name,
        unit: it.unit,
        cost: (it as any).cost ?? null,
        suggested: Number(Math.max(0, Number(it.threshold || 0) - it.quantity).toFixed(3)),
      })),
    [lowItems]
  )

  // Recarga los datos de stock tras registrar una compra (server component refetch)
  const refreshAfterPurchase = () => router.refresh()

  // Costo estimado de la reposición: cuánto falta × el costo cargado del insumo.
  // Solo cuenta los que tienen costo (los productos con stock directo no lo tienen).
  const estimate = useMemo(() => {
    let total = 0
    let withCost = 0
    for (const it of lowItems) {
      if (it.cost == null) continue
      total += Math.max(0, Number(it.threshold || 0) - it.quantity) * Number(it.cost)
      withCost += 1
    }
    return { total, withCost }
  }, [lowItems])

  // Imprime la lista de compras en hoja A4 (para llevar al proveedor)
  const printShoppingList = () => {
    const rows = lowItems
      .map((it) => {
        const faltante = Math.max(0, Number(it.threshold || 0) - it.quantity)
        const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        return `<tr>
          <td class="chk"></td>
          <td>${esc(it.name)}</td>
          <td class="num">${fmtQty(it.quantity)} ${esc(it.unit)}</td>
          <td class="num strong">${it.quantity <= 0 ? "sin stock" : `${fmtQty(faltante)} ${esc(it.unit)}`}</td>
        </tr>`
      })
      .join("")

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Lista de compras</title>
<style>
  @page { size: A4; margin: 16mm; }
  * { box-sizing: border-box; }
  body { font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; color: #111; margin: 0; }
  h1 { font-size: 22px; margin: 0 0 2px; }
  .sub { color: #666; font-size: 12px; margin-bottom: 18px; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: .08em; color: #666;
       border-bottom: 2px solid #111; padding: 0 8px 6px; }
  td { padding: 9px 8px; border-bottom: 1px solid #e5e5e5; font-size: 14px; }
  .num { text-align: right; white-space: nowrap; }
  .strong { font-weight: 700; }
  .chk { width: 22px; }
  .chk::before { content: ""; display: block; width: 13px; height: 13px; border: 1.5px solid #999; border-radius: 3px; }
  .foot { margin-top: 22px; font-size: 11px; color: #888; }
  .actions { margin-top: 20px; display: flex; gap: 8px; }
  button { padding: 10px 16px; border: 0; border-radius: 8px; font-weight: 700; font-family: inherit; cursor: pointer; }
  .p { background: #d8ff55; color: #1f2030; }
  .c { background: #eee; color: #333; }
  @media print { .actions { display: none !important; } }
</style></head><body>
  <h1>Lista de compras</h1>
  <div class="sub">${new Date().toLocaleDateString("es-AR", { day: "2-digit", month: "long", year: "numeric" })} · ${lowItems.length} ${lowItems.length === 1 ? "producto" : "productos"}</div>
  <table>
    <thead><tr><th></th><th>Producto</th><th class="num">Queda</th><th class="num">Comprar</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="foot">Generado por UcoBot · la cantidad sugerida es lo que falta para volver al mínimo.</div>
  <div class="actions">
    <button class="p" onclick="window.print()">Imprimir</button>
    <button class="c" onclick="window.close()">Cerrar</button>
  </div>
  <script>window.addEventListener("load", function(){ setTimeout(function(){ try { window.print() } catch(e) {} }, 250) })</script>
</body></html>`

    try {
      const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }))
      const w = window.open(url, "_blank", "noopener,noreferrer,width=760,height=900")
      if (!w) {
        toast.error("Permití las ventanas emergentes para imprimir la lista")
        return
      }
      setTimeout(() => URL.revokeObjectURL(url), 10000)
    } catch {
      toast.error("No se pudo abrir la lista para imprimir")
    }
  }

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

  // Filas de la lista de compras: se usan tal cual en el bento (escritorio) y
  // dentro de la hoja arrastrable (mobile).
  const shoppingRows = lowItems.map((it) => {
    // Cuánto falta para volver al mínimo (lo que conviene comprar)
    const faltante = Math.max(0, Number(it.threshold || 0) - it.quantity)
    return (
      <li key={it.key} className="flex items-center gap-3 px-4 py-3">
        <span className="h-4 w-4 shrink-0 rounded border-2 border-muted-foreground/30" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium leading-tight">{it.name}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            quedan {fmtQty(it.quantity)} {it.unit} · mínimo {fmtQty(Number(it.threshold || 0))}
          </p>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full px-2.5 py-1 text-xs font-bold",
            it.quantity <= 0 ? "bg-red-500/10 text-red-600" : "bg-[#d8ff55]/25 text-[#5c7a00] dark:text-[#d8ff55]"
          )}
        >
          {it.quantity <= 0 ? "sin stock" : `comprar ${fmtQty(faltante)} ${it.unit}`}
        </span>
      </li>
    )
  })

  return (
    <div className="space-y-6 pb-24 lg:pb-8">
      {/* Header: título a la izquierda, acciones a la derecha */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold sm:text-3xl">Stock</h1>
          <p className="text-sm text-muted-foreground">
            Cargá lo que se consume y el sistema lo descuenta solo con cada venta.
          </p>
        </div>
        <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
          {/* En escritorio la lista ya se ve al costado; el botón es solo para mobile */}
          {lowItems.length > 0 && (
            <Button variant="outline" onClick={() => setListOpen(true)} className="lg:hidden">
              <ShoppingCart className="mr-1.5 h-4 w-4" />
              <span className="sm:hidden">Lista</span>
              <span className="hidden sm:inline">Ver lista de compras</span>
              <span className="ml-1.5 rounded-full bg-[#d8ff55] px-1.5 py-0.5 text-[10px] font-bold text-[#1f2030]">
                {lowItems.length}
              </span>
            </Button>
          )}
          <Button onClick={() => setPurchaseOpen(true)}>
            <Truck className="mr-1.5 h-4 w-4" />
            <span className="sm:hidden">Compra</span>
            <span className="hidden sm:inline">Registrar compra</span>
          </Button>
          <Button variant="outline" onClick={() => openSupplyDialog()}>
            <Plus className="mr-1.5 h-4 w-4" />
            <span className="sm:hidden">Insumo</span>
            <span className="hidden sm:inline">Nuevo insumo</span>
          </Button>
        </div>
      </div>

      {/* Bento (solo escritorio): a la izquierda lo que controlo / movimientos,
          a la derecha la lista de compras. En mobile la lista va en una hoja. */}
      <div className="grid items-start gap-4 lg:grid-cols-3">

      {/* Lista de compras: lo que hay que reponer, lista para imprimir y llevar */}
      {lowItems.length > 0 && (
        <div className="hidden overflow-hidden rounded-3xl border border-border bg-card lg:sticky lg:top-4 lg:order-last lg:col-span-1 lg:block">
          <div className="flex items-center justify-between gap-2 border-b border-border bg-[#1f2030] px-4 py-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#d8ff55]">
                <ShoppingCart className="h-4 w-4 text-[#1f2030]" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-bold leading-tight text-white">Lista de compras</p>
                <p className="truncate text-[11px] text-white/60">{lowItems.length} para reponer</p>
              </div>
            </div>
            <button
              type="button"
              onClick={printShoppingList}
              title="Imprimir la lista"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[#d8ff55] px-3 py-1.5 text-xs font-bold text-[#1f2030] transition-colors hover:bg-[#c2e84c]"
            >
              <Printer className="h-4 w-4" />
              Imprimir
            </button>
          </div>

          {/* Si la lista es larga, scrollea adentro y no estira la página */}
          <ul className="divide-y divide-border lg:max-h-[calc(100vh-16rem)] lg:overflow-y-auto">
            {shoppingRows}
          </ul>
        </div>
      )}

      <Tabs
        defaultValue="stock"
        className={cn("min-w-0", lowItems.length > 0 ? "lg:col-span-2" : "lg:col-span-3")}
      >
        {/* En mobile las pestañas scrollean en vez de desbordar/apretarse */}
        <div className="-mx-1 overflow-x-auto px-1 pb-1 hide-scrollbar-mobile">
          <TabsList className="w-max">
            <TabsTrigger value="stock">Lo que controlo</TabsTrigger>
            <TabsTrigger value="movements">Movimientos</TabsTrigger>
          </TabsList>
        </div>

        {/* Lista única: insumos y productos juntos, diferenciados por una etiqueta.
            Separarlos en dos pestañas obligaba a entender el modelo de datos. */}
        <TabsContent value="stock" className="grid gap-2.5 xl:grid-cols-2">
          {stockItems.length === 0 ? (
            <Card className="xl:col-span-2">
              <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
                <PackageOpen className="h-10 w-10 text-muted-foreground/50" />
                <div>
                  <p className="font-medium">Todavía no controlás nada</p>
                  <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                    Empezá cargando un insumo (pan, carne, café). Después, en cada producto del menú,
                    indicá cuánto usa — y con cada venta se descuenta solo.
                  </p>
                </div>
                <Button onClick={() => openSupplyDialog()}>
                  <Plus className="mr-1.5 h-4 w-4" /> Cargar el primero
                </Button>
              </CardContent>
            </Card>
          ) : (
            stockItems.map((item) => (
              <Card key={item.key} className={cn(item.low && "border-[#d8ff55]")}>
                <CardContent className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                  <div className="min-w-0">
                    <p className="break-words font-medium leading-tight">{item.name}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                      <span className={cn("font-semibold", item.low ? "text-[#5c7a00] dark:text-[#d8ff55]" : "text-foreground")}>
                        {fmtQty(item.quantity)} {item.unit}
                      </span>
                      <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        {item.type === "supply" ? "Insumo" : "Producto"}
                      </span>
                      {item.threshold != null && (
                        <span className="hidden text-muted-foreground sm:inline">avisar en {fmtQty(item.threshold)}</span>
                      )}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openAdjust({ type: item.type, id: item.id, name: item.name, unit: item.type === "supply" ? item.unit : undefined })}
                    >
                      <ArrowUpDown className="mr-1 h-3.5 w-3.5" /> Ajustar
                    </Button>
                    {item.type === "supply" && (
                      <>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openSupplyDialog(supplies.find((s) => s.id === item.id))}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-red-500"
                          onClick={() => {
                            const s = supplies.find((x) => x.id === item.id)
                            if (s) deleteSupply(s)
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="movements" className="grid gap-1.5">
          {movements.length === 0 ? (
            <Card>
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

      </div>

      <PurchaseDialog
        open={purchaseOpen}
        onOpenChange={setPurchaseOpen}
        accountId={userId}
        branchId={branchId}
        supplies={supplies.filter((s) => s.is_active).map((s) => ({ id: s.id, name: s.name, unit: s.unit, cost: s.cost }))}
        products={trackedProducts.map((p) => ({ id: p.id, name: p.name }))}
        lowItems={lowForPurchase}
        onSaved={refreshAfterPurchase}
      />

      {/* Lista de compras en mobile: hoja de abajo arrastrable (mismo patrón que
          el panel de perfil). Va con el Dialog de Radix porque portea al <body>. */}
      <Dialog open={listOpen} onOpenChange={setListOpen}>
        {/* min-h en mobile: si no, con pocos ítems la hoja queda pegada al borde
            inferior y parece cortada (y el downbar/home del teléfono la tapa). */}
        <DialogContent className="app-sheet flex max-h-[92vh] w-full max-w-md flex-col gap-0 overflow-hidden rounded-2xl p-0 max-sm:bottom-0 max-sm:left-0 max-sm:top-auto max-sm:max-h-[90dvh] max-sm:min-h-[62dvh] max-sm:max-w-full max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-b-none max-sm:rounded-t-3xl max-sm:border-x-0 max-sm:border-b-0 max-sm:data-[state=closed]:slide-out-to-bottom-10 max-sm:data-[state=open]:slide-in-from-bottom-10">
          <DialogTitle className="sr-only">Lista de compras</DialogTitle>
          <div className="px-4 pt-4">
            <SheetGrabBar onDismiss={() => setListOpen(false)} />
          </div>

          <div className="flex items-center gap-2.5 px-4 pb-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#1f2030]">
              <ShoppingCart className="h-4 w-4 text-[#d8ff55]" />
            </span>
            <div className="min-w-0">
              <p className="font-bold leading-tight">Lista de compras</p>
              <p className="text-xs text-muted-foreground">
                {lowItems.length} {lowItems.length === 1 ? "cosa para reponer" : "cosas para reponer"}
              </p>
            </div>
          </div>

          {/* Filas más aireadas: la hoja es alta y en mobile se toca con el dedo */}
          <ul className="min-h-0 flex-1 divide-y divide-border overflow-y-auto border-t border-border">
            {lowItems.map((it) => {
              const faltante = Math.max(0, Number(it.threshold || 0) - it.quantity)
              return (
                <li key={it.key} className="flex items-center gap-3 px-4 py-4">
                  <span className="h-5 w-5 shrink-0 rounded-md border-2 border-muted-foreground/30" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium leading-tight">{it.name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      quedan {fmtQty(it.quantity)} {it.unit} · mínimo {fmtQty(Number(it.threshold || 0))}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p
                      className={cn(
                        "text-sm font-bold",
                        it.quantity <= 0 ? "text-red-600" : "text-[#5c7a00] dark:text-[#d8ff55]"
                      )}
                    >
                      {it.quantity <= 0 ? "sin stock" : `+${fmtQty(faltante)} ${it.unit}`}
                    </p>
                    {it.cost != null && faltante > 0 && (
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        ≈ {currency(faltante * Number(it.cost))}
                      </p>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>

          {/* Pie fijo: cierra la hoja visualmente y evita el vacío de abajo */}
          <div
            className="shrink-0 border-t border-border bg-muted/30 px-4 pt-3"
            style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
          >
            {estimate.withCost > 0 && (
              <div className="mb-2.5 flex items-baseline justify-between gap-2">
                <span className="text-xs text-muted-foreground">
                  Costo estimado
                  {estimate.withCost < lowItems.length && (
                    <span className="text-[11px]"> ({estimate.withCost} de {lowItems.length} con costo cargado)</span>
                  )}
                </span>
                <span className="text-lg font-black">{currency(estimate.total)}</span>
              </div>
            )}
            <Button
              onClick={printShoppingList}
              className="w-full bg-[#d8ff55] font-bold text-[#1f2030] hover:bg-[#c2e84c]"
            >
              <Printer className="mr-1.5 h-4 w-4" /> Imprimir lista
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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
