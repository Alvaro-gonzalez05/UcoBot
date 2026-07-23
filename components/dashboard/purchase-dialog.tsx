"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
import { Loader2, Plus, Trash2, Camera, ShoppingCart, Sparkles } from "lucide-react"
import { toast } from "sonner"
import { PAYMENT_METHOD_LABELS } from "@/lib/payment-methods"

interface SupplyOpt { id: string; name: string; unit: string; cost?: number | null }
interface ProductOpt { id: string; name: string }

export interface LowItemForPrefill {
  id: string
  type: "supply" | "product"
  name: string
  unit: string
  cost?: number | null
  suggested: number // cuánto comprar para volver al mínimo
}

interface Row {
  key: string
  target: string // "s:<id>" | "p:<id>" | "" (sin asignar, viene del ticket)
  name: string   // nombre leído del ticket cuando no hay match
  quantity: string
  unitCost: string
}

const uid = () => Math.random().toString(36).slice(2)

const currency = (v: number) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(v || 0)

/**
 * Registrar una compra de stock. Sube el stock, fija el último costo pagado y
 * genera el gasto en finanzas (todo enlazado). Dos formas de cargar: a mano o
 * leyendo la foto del ticket (IA → borrador para revisar antes de confirmar).
 */
export function PurchaseDialog({
  open,
  onOpenChange,
  accountId,
  branchId = null,
  supplies,
  products = [],
  lowItems = [],
  onSaved,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  /** user_id de la cuenta a la que se carga (sucursal o propia) */
  accountId: string
  /** id de sucursal para el scan del ticket; null si es la cuenta propia */
  branchId?: string | null
  supplies: SupplyOpt[]
  products?: ProductOpt[]
  lowItems?: LowItemForPrefill[]
  onSaved?: () => void
}) {
  const supabase = createClient()
  const [rows, setRows] = useState<Row[]>([{ key: uid(), target: "", name: "", quantity: "", unitCost: "" }])
  const [supplier, setSupplier] = useState("")
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [payment, setPayment] = useState("cash")
  const [saving, setSaving] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [source, setSource] = useState<"manual" | "ticket">("manual")
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setRows([{ key: uid(), target: "", name: "", quantity: "", unitCost: "" }])
    setSupplier("")
    setDate(new Date().toISOString().slice(0, 10))
    setPayment("cash")
    setSource("manual")
  }, [open])

  const targetLabel = (t: string) => {
    if (t.startsWith("s:")) return supplies.find((s) => s.id === t.slice(2))?.name
    if (t.startsWith("p:")) return products.find((p) => p.id === t.slice(2))?.name
    return undefined
  }
  const targetUnit = (t: string) => (t.startsWith("s:") ? supplies.find((s) => s.id === t.slice(2))?.unit || "un" : "un")

  const total = useMemo(
    () => rows.reduce((acc, r) => acc + (Number(r.quantity.replace(",", ".")) || 0) * (Number(r.unitCost.replace(",", ".")) || 0), 0),
    [rows]
  )

  const setRow = (key: string, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  const addRow = () => setRows((prev) => [...prev, { key: uid(), target: "", name: "", quantity: "", unitCost: "" }])
  const removeRow = (key: string) => setRows((prev) => (prev.length === 1 ? prev : prev.filter((r) => r.key !== key)))

  // Prefill con lo que está por agotarse (cantidad sugerida = para volver al mínimo)
  const prefillFromLow = () => {
    if (lowItems.length === 0) return
    setRows(
      lowItems.map((it) => ({
        key: uid(),
        target: `${it.type === "supply" ? "s" : "p"}:${it.id}`,
        name: it.name,
        quantity: it.suggested > 0 ? String(it.suggested) : "",
        unitCost: it.cost != null ? String(it.cost) : "",
      }))
    )
    toast.success("Cargué los faltantes; revisá cantidades y precios")
  }

  // Leer la foto del ticket
  const onPickPhoto = () => fileRef.current?.click()
  const onPhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) await scanTicket(file)
    if (fileRef.current) fileRef.current.value = ""
  }
  const scanTicket = async (file: File) => {
    if (file.size > 6 * 1024 * 1024) {
      toast.error("La foto es muy grande (máx. 6 MB)")
      return
    }
    setScanning(true)
    try {
      const dataUrl: string = await new Promise((resolve, reject) => {
        const r = new FileReader()
        r.onload = () => resolve(String(r.result))
        r.onerror = reject
        r.readAsDataURL(file)
      })
      const res = await fetch("/api/purchases/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: dataUrl, sucursal: branchId }),
      })
      const j = await res.json()
      if (!res.ok) {
        toast.error(j.error || "No se pudo leer el ticket")
        return
      }
      const items = Array.isArray(j.items) ? j.items : []
      if (items.length === 0) {
        toast.warning("No se detectaron productos. Cargalos a mano.")
        return
      }
      if (j.supplier) setSupplier(j.supplier)
      setSource("ticket")
      setRows(
        items.map((it: any) => ({
          key: uid(),
          target: it.supply_id ? `s:${it.supply_id}` : it.product_id ? `p:${it.product_id}` : "",
          name: it.name || "",
          quantity: String(it.quantity || ""),
          unitCost: String(it.unit_cost || ""),
        }))
      )
      const sinMatch = items.filter((it: any) => !it.supply_id && !it.product_id).length
      toast.success(
        sinMatch > 0
          ? `Leí ${items.length} líneas. Asigná las ${sinMatch} que no reconocí y revisá los precios.`
          : `Leí ${items.length} líneas. Revisá cantidades y precios antes de guardar.`
      )
    } catch {
      toast.error("No se pudo procesar la foto")
    } finally {
      setScanning(false)
    }
  }

  const handleSave = async () => {
    const items = rows
      .map((r) => {
        const quantity = Number(r.quantity.replace(",", ".")) || 0
        const unit_cost = Number(r.unitCost.replace(",", ".")) || 0
        const isSupply = r.target.startsWith("s:")
        const isProduct = r.target.startsWith("p:")
        return {
          supply_id: isSupply ? r.target.slice(2) : null,
          product_id: isProduct ? r.target.slice(2) : null,
          name: targetLabel(r.target) || r.name || "Ítem",
          quantity,
          unit_cost,
          subtotal: Number((quantity * unit_cost).toFixed(2)),
        }
      })
      .filter((it) => (it.supply_id || it.product_id) && it.quantity > 0)

    if (items.length === 0) {
      toast.error("Agregá al menos un ítem con cantidad y asignado a un insumo o producto")
      return
    }

    setSaving(true)
    try {
      const { data: purchase, error } = await supabase
        .from("purchases")
        .insert({
          user_id: accountId,
          supplier: supplier.trim() || null,
          total: Number(total.toFixed(2)),
          purchased_at: date,
          payment_method: payment,
          items,
          source,
        })
        .select("id")
        .single()
      if (error) throw error

      const { error: applyError } = await supabase.rpc("apply_purchase", { p_purchase_id: purchase.id })
      if (applyError) throw applyError

      toast.success("Compra registrada: stock actualizado y gasto cargado")
      onSaved?.()
      onOpenChange(false)
    } catch (err) {
      console.error("Error saving purchase:", err)
      toast.error("No se pudo registrar la compra")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] max-w-lg flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-5 pb-4 pt-5">
          <DialogTitle className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5" /> Registrar compra de stock
          </DialogTitle>
          <DialogDescription>
            Sube el stock, guarda el último precio pagado y carga el gasto en finanzas.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {/* Formas rápidas de cargar */}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onPickPhoto} disabled={scanning}>
              {scanning ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Camera className="mr-1.5 h-4 w-4" />}
              {scanning ? "Leyendo ticket…" : "Cargar desde foto"}
            </Button>
            {lowItems.length > 0 && (
              <Button type="button" variant="outline" size="sm" onClick={prefillFromLow}>
                <Sparkles className="mr-1.5 h-4 w-4" /> Traer faltantes ({lowItems.length})
              </Button>
            )}
            <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onPhotoChange} />
          </div>

          {/* Datos de la compra */}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label>Proveedor (opcional)</Label>
              <Input placeholder="Ej: Distribuidora Norte" value={supplier} onChange={(e) => setSupplier(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Fecha</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Pago</Label>
              <Select value={payment} onValueChange={setPayment}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["cash", "transfer", "card", "nave"].map((m) => (
                    <SelectItem key={m} value={m}>{PAYMENT_METHOD_LABELS[m] || m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Líneas */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Productos comprados</Label>
            {rows.map((r) => (
              <div key={r.key} className="rounded-xl border border-border/70 p-2.5">
                <div className="mb-2 flex items-center gap-2">
                  <Select value={r.target} onValueChange={(v) => setRow(r.key, { target: v })}>
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder={r.name ? `¿"${r.name}"? Asigná…` : "Elegí insumo o producto"} />
                    </SelectTrigger>
                    <SelectContent>
                      {supplies.length > 0 && (
                        <>
                          {supplies.map((s) => (
                            <SelectItem key={s.id} value={`s:${s.id}`}>{s.name} ({s.unit})</SelectItem>
                          ))}
                        </>
                      )}
                      {products.map((p) => (
                        <SelectItem key={p.id} value={`p:${p.id}`}>{p.name} · producto</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 text-red-500" onClick={() => removeRow(r.key)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <Input
                      inputMode="decimal"
                      placeholder={`Cant.${r.target ? ` (${targetUnit(r.target)})` : ""}`}
                      value={r.quantity}
                      onChange={(e) => setRow(r.key, { quantity: e.target.value })}
                    />
                  </div>
                  <span className="text-muted-foreground">×</span>
                  <div className="flex-1">
                    <Input
                      inputMode="decimal"
                      placeholder="Precio unit. $"
                      value={r.unitCost}
                      onChange={(e) => setRow(r.key, { unitCost: e.target.value })}
                    />
                  </div>
                  <span className="w-24 shrink-0 text-right text-sm font-semibold">
                    {currency((Number(r.quantity.replace(",", ".")) || 0) * (Number(r.unitCost.replace(",", ".")) || 0))}
                  </span>
                </div>
              </div>
            ))}
            <Button type="button" variant="ghost" size="sm" onClick={addRow} className="text-muted-foreground">
              <Plus className="mr-1.5 h-4 w-4" /> Agregar producto
            </Button>
          </div>
        </div>

        {/* Pie con total + guardar */}
        <div className="shrink-0 border-t border-border bg-muted/30 px-5 py-4">
          <div className="mb-3 flex items-baseline justify-between">
            <span className="text-sm text-muted-foreground">Total de la compra</span>
            <span className="text-2xl font-black">{currency(total)}</span>
          </div>
          <Button className="w-full" onClick={handleSave} disabled={saving || scanning}>
            {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Registrar compra
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
