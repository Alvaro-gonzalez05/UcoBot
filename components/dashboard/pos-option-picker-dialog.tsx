"use client"

import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Check, ShoppingBag } from "lucide-react"
import { cn } from "@/lib/utils"

export interface PosOptionItem {
  id: string
  name: string
  price_delta: number
}
export interface PosOptionGroup {
  id: string
  name: string
  required: boolean
  multi: boolean
  items: PosOptionItem[]
}
export interface SelectedOption {
  group: string
  name: string
  delta: number
}

const formatCurrency = (v: number) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 2 }).format(v)

/**
 * Modal centrado del POS para elegir las opciones de un producto (ej: tipo de
 * bebida) antes de agregarlo al carrito. Respeta obligatorio/opcional y una/varias.
 */
export function PosOptionPickerDialog({
  open,
  product,
  groups,
  initialSelected,
  onCancel,
  onConfirm,
}: {
  open: boolean
  product: { id: string; name: string; price: number; image_url?: string | null } | null
  groups: PosOptionGroup[]
  /** Opciones ya elegidas, para EDITAR (preselecciona en vez de arrancar de cero) */
  initialSelected?: SelectedOption[]
  onCancel: () => void
  onConfirm: (selected: SelectedOption[], extra: number) => void
}) {
  // Selección: por grupo, set de item ids elegidos
  const [selected, setSelected] = useState<Record<string, Set<string>>>({})

  // Al abrir: si hay opciones previas (editar) las preselecciona; si no, arranca con
  // la 1ra opción de los grupos obligatorios de una sola.
  useEffect(() => {
    if (!open || !product) return
    const hasInitial = Array.isArray(initialSelected) && initialSelected.length > 0
    const init: Record<string, Set<string>> = {}
    for (const g of groups) {
      init[g.id] = new Set<string>()
      if (hasInitial) {
        for (const it of g.items) {
          if (initialSelected!.some((o) => o.group === g.name && o.name === it.name)) init[g.id].add(it.id)
        }
      } else if (g.required && !g.multi && g.items[0]) {
        init[g.id].add(g.items[0].id)
      }
    }
    setSelected(init)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, product?.id])

  const toggle = (g: PosOptionGroup, itemId: string) => {
    setSelected((prev) => {
      const cur = new Set(prev[g.id] ?? [])
      if (g.multi) {
        if (cur.has(itemId)) cur.delete(itemId)
        else cur.add(itemId)
      } else {
        // una sola: reemplaza (permite deseleccionar si es opcional)
        if (cur.has(itemId) && !g.required) cur.clear()
        else {
          cur.clear()
          cur.add(itemId)
        }
      }
      return { ...prev, [g.id]: cur }
    })
  }

  const { selectedList, extra, missing } = useMemo(() => {
    const list: SelectedOption[] = []
    let sum = 0
    let miss = 0
    for (const g of groups) {
      const ids = selected[g.id] ?? new Set<string>()
      if (g.required && ids.size === 0) miss++
      for (const it of g.items) {
        if (ids.has(it.id)) {
          list.push({ group: g.name, name: it.name, delta: it.price_delta })
          sum += it.price_delta
        }
      }
    }
    return { selectedList: list, extra: sum, missing: miss }
  }, [groups, selected])

  if (!product) return null
  const total = product.price + extra

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-md w-full rounded-3xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted">
              {product.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={product.image_url} alt={product.name} className="h-full w-full object-cover" />
              ) : (
                <ShoppingBag className="h-5 w-5 text-muted-foreground" />
              )}
            </div>
            <span className="min-w-0 truncate">{product.name}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {groups.map((g) => {
            const ids = selected[g.id] ?? new Set<string>()
            return (
              <div key={g.id} className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold">{g.name}</span>
                  <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", g.required ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" : "bg-muted text-muted-foreground")}>
                    {g.required ? "Obligatorio" : "Opcional"}
                  </span>
                  <span className="text-[10px] text-muted-foreground">{g.multi ? "Elegí las que quieras" : "Elegí una"}</span>
                </div>
                <div className="grid grid-cols-1 gap-1.5">
                  {g.items.map((it) => {
                    const active = ids.has(it.id)
                    return (
                      <button
                        key={it.id}
                        type="button"
                        onClick={() => toggle(g, it.id)}
                        className={cn(
                          "flex items-center gap-2.5 rounded-xl border p-2.5 text-left transition-all active:scale-[0.99]",
                          active ? "border-[#D1F366] bg-[#D1F366]/15 ring-1 ring-[#D1F366]" : "border-border bg-card hover:border-foreground/30"
                        )}
                      >
                        <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center border", g.multi ? "rounded-md" : "rounded-full", active ? "border-[#D1F366] bg-[#D1F366] text-[#1C1C28]" : "border-muted-foreground/40")}>
                          {active && <Check className="h-3.5 w-3.5" />}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">{it.name}</span>
                        {it.price_delta > 0 && (
                          <span className="shrink-0 text-xs font-bold text-emerald-600 dark:text-emerald-400">+{formatCurrency(it.price_delta)}</span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>

        <div className="mt-1 flex items-center justify-between border-t border-border pt-3">
          <span className="text-sm font-semibold text-muted-foreground">Total</span>
          <span className="text-xl font-black">{formatCurrency(total)}</span>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" className="flex-1 rounded-xl" onClick={onCancel}>Cancelar</Button>
          <Button
            onClick={() => onConfirm(selectedList, extra)}
            disabled={missing > 0}
            className="flex-1 rounded-xl bg-[#D1F366] text-[#1C1C28] font-bold hover:bg-[#B3D93C] disabled:opacity-50"
          >
            {missing > 0 ? "Elegí las obligatorias" : "Agregar al carrito"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
