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
  DialogTrigger,
} from "@/components/ui/dialog"
import { SlidersHorizontal, Plus, Trash2, X, ChevronLeft, Loader2, Search, Package, GripVertical, Link2 } from "lucide-react"
import { toast } from "sonner"
import { cn, normalizeSearchText } from "@/lib/utils"

export interface OptionItem {
  id?: string
  name: string
  price_delta: number
}

export interface OptionGroup {
  id: string
  name: string
  required: boolean
  multi: boolean
  items: OptionItem[]
  productIds: string[]
}

const formatCurrency = (v: number) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 2 }).format(v)

const switchClass =
  "border border-border data-[state=checked]:bg-[#B3D93C] data-[state=unchecked]:bg-slate-300 dark:data-[state=unchecked]:bg-slate-600 [&>span]:bg-white [&>span]:shadow-md"

export function ProductOptionsManager({
  userId,
  products,
  onChanged,
}: {
  userId: string
  products: { id: string; name: string }[]
  onChanged?: () => void
}) {
  const supabase = createClient()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [groups, setGroups] = useState<OptionGroup[]>([])
  const [view, setView] = useState<"list" | "editor">("list")

  // Campos del editor
  const [editingId, setEditingId] = useState<string | null>(null)
  const [name, setName] = useState("")
  const [required, setRequired] = useState(false)
  const [multi, setMulti] = useState(false)
  const [items, setItems] = useState<OptionItem[]>([{ name: "", price_delta: 0 }])
  const [linkedIds, setLinkedIds] = useState<Set<string>>(new Set())
  const [productSearch, setProductSearch] = useState("")

  const loadGroups = async () => {
    setLoading(true)
    try {
      const [{ data: g }, { data: it }, { data: lk }] = await Promise.all([
        supabase.from("product_option_groups").select("*").order("created_at", { ascending: true }),
        supabase.from("product_option_items").select("*").order("sort_order", { ascending: true }),
        supabase.from("product_option_links").select("*"),
      ])
      const assembled: OptionGroup[] = (g || []).map((grp: any) => ({
        id: grp.id,
        name: grp.name,
        required: grp.required,
        multi: grp.multi,
        items: (it || [])
          .filter((i: any) => i.group_id === grp.id)
          .map((i: any) => ({ id: i.id, name: i.name, price_delta: Number(i.price_delta) || 0 })),
        productIds: (lk || []).filter((l: any) => l.group_id === grp.id).map((l: any) => l.product_id),
      }))
      setGroups(assembled)
    } catch (e) {
      console.error("Error loading option groups:", e)
      toast.error("No se pudieron cargar las opciones")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open) loadGroups()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const openNew = () => {
    setEditingId(null)
    setName("")
    setRequired(false)
    setMulti(false)
    setItems([{ name: "", price_delta: 0 }])
    setLinkedIds(new Set())
    setProductSearch("")
    setView("editor")
  }

  const openEdit = (grp: OptionGroup) => {
    setEditingId(grp.id)
    setName(grp.name)
    setRequired(grp.required)
    setMulti(grp.multi)
    setItems(grp.items.length ? grp.items.map((i) => ({ ...i })) : [{ name: "", price_delta: 0 }])
    setLinkedIds(new Set(grp.productIds))
    setProductSearch("")
    setView("editor")
  }

  const updateItem = (idx: number, patch: Partial<OptionItem>) =>
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)))
  const addItemRow = () => setItems((prev) => [...prev, { name: "", price_delta: 0 }])
  const removeItemRow = (idx: number) => setItems((prev) => prev.filter((_, i) => i !== idx))

  const toggleLink = (productId: string) =>
    setLinkedIds((prev) => {
      const next = new Set(prev)
      if (next.has(productId)) next.delete(productId)
      else next.add(productId)
      return next
    })

  const handleSave = async () => {
    const cleanName = name.trim()
    if (!cleanName) {
      toast.error("Ponele un nombre a la opción")
      return
    }
    const cleanItems = items
      .map((it) => ({ ...it, name: it.name.trim(), price_delta: Number(it.price_delta) || 0 }))
      .filter((it) => it.name)
    if (cleanItems.length === 0) {
      toast.error("Agregá al menos una opción (ej: Coca, Coca Zero)")
      return
    }

    setSaving(true)
    try {
      let groupId = editingId
      if (groupId) {
        const { error } = await supabase
          .from("product_option_groups")
          .update({ name: cleanName, required, multi, updated_at: new Date().toISOString() })
          .eq("id", groupId)
        if (error) throw error
      } else {
        const { data, error } = await supabase
          .from("product_option_groups")
          .insert({ user_id: userId, name: cleanName, required, multi })
          .select("id")
          .single()
        if (error) throw error
        groupId = data.id
      }

      // Reemplazo total de items y links (simple y consistente)
      await supabase.from("product_option_items").delete().eq("group_id", groupId)
      await supabase.from("product_option_links").delete().eq("group_id", groupId)

      if (cleanItems.length > 0) {
        const { error: e1 } = await supabase.from("product_option_items").insert(
          cleanItems.map((it, i) => ({
            user_id: userId,
            group_id: groupId,
            name: it.name,
            price_delta: it.price_delta,
            sort_order: i,
          }))
        )
        if (e1) throw e1
      }
      if (linkedIds.size > 0) {
        const { error: e2 } = await supabase.from("product_option_links").insert(
          Array.from(linkedIds).map((pid) => ({ user_id: userId, group_id: groupId, product_id: pid }))
        )
        if (e2) throw e2
      }

      toast.success(editingId ? "Opción actualizada" : "Opción creada")
      await loadGroups()
      setView("list")
      onChanged?.()
    } catch (e) {
      console.error("Error saving option group:", e)
      toast.error("No se pudo guardar la opción")
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (groupId: string) => {
    try {
      const { error } = await supabase.from("product_option_groups").delete().eq("id", groupId)
      if (error) throw error
      setGroups((prev) => prev.filter((g) => g.id !== groupId))
      onChanged?.()
    } catch (e) {
      console.error("Error deleting option group:", e)
      toast.error("No se pudo eliminar la opción")
    }
  }

  const filteredProducts = products.filter((p) => {
    const q = normalizeSearchText(productSearch.trim())
    return !q || normalizeSearchText(p.name).includes(q)
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <SlidersHorizontal className="h-4 w-4 text-[#D1F366]" />
          <span className="hidden sm:inline">Opciones</span>
          <span className="sm:hidden">Opc.</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {view === "editor" && (
              <button type="button" onClick={() => setView("list")} className="rounded-lg p-1 hover:bg-muted">
                <ChevronLeft className="h-4 w-4" />
              </button>
            )}
            {view === "editor" ? (editingId ? "Editar opción" : "Nueva opción de producto") : "Opciones de productos"}
          </DialogTitle>
          <DialogDescription>
            {view === "editor"
              ? "Definí las opciones (ej: Coca, Coca Zero), si es obligatoria y a qué productos se aplica."
              : "Creá grupos de opciones (ej: “Tipo de bebida”) y vinculalos a tus productos."}
          </DialogDescription>
        </DialogHeader>

        {view === "list" ? (
          <div className="space-y-3">
            <Button onClick={openNew} className="w-full gap-2 rounded-xl bg-[#D1F366] text-[#1C1C28] font-bold hover:bg-[#B3D93C]">
              <Plus className="h-4 w-4" /> Nueva opción
            </Button>

            {loading ? (
              <div className="flex justify-center py-10 text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : groups.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                Todavía no tenés opciones. Creá una para agregar variantes o extras a tus productos.
              </div>
            ) : (
              <div className="space-y-2">
                {groups.map((g) => (
                  <div key={g.id} className="rounded-2xl border border-border bg-card p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-bold">{g.name}</span>
                          <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", g.required ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" : "bg-muted text-muted-foreground")}>
                            {g.required ? "Obligatoria" : "Opcional"}
                          </span>
                          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
                            {g.multi ? "Varias" : "Una"}
                          </span>
                        </div>
                        <p className="mt-1 truncate text-xs text-muted-foreground">
                          {g.items.map((i) => i.name).join(", ") || "Sin opciones"}
                        </p>
                        <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                          <Link2 className="h-3 w-3" /> {g.productIds.length} producto{g.productIds.length === 1 ? "" : "s"}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <Button variant="ghost" size="sm" className="h-8 rounded-lg" onClick={() => openEdit(g)}>Editar</Button>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-lg text-red-500 hover:text-red-600" onClick={() => handleDelete(g.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {/* Nombre */}
            <div className="space-y-1.5">
              <Label className="text-sm font-semibold">Nombre de la opción</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Tipo de bebida" className="rounded-xl" />
            </div>

            {/* Reglas */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="flex items-center justify-between rounded-xl border border-border p-3">
                <div>
                  <Label className="text-sm font-semibold">Obligatoria</Label>
                  <p className="text-[11px] text-muted-foreground">Hay que elegir sí o sí</p>
                </div>
                <Switch checked={required} onCheckedChange={setRequired} className={switchClass} />
              </div>
              <div className="flex items-center justify-between rounded-xl border border-border p-3">
                <div>
                  <Label className="text-sm font-semibold">Varias opciones</Label>
                  <p className="text-[11px] text-muted-foreground">{multi ? "Puede elegir varias" : "Elige solo una"}</p>
                </div>
                <Switch checked={multi} onCheckedChange={setMulti} className={switchClass} />
              </div>
            </div>

            {/* Items */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Opciones disponibles</Label>
              <div className="space-y-2">
                {items.map((it, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground/50" />
                    <Input
                      value={it.name}
                      onChange={(e) => updateItem(idx, { name: e.target.value })}
                      placeholder={idx === 0 ? "Ej: Coca" : "Otra opción..."}
                      className="h-9 flex-1 rounded-lg"
                    />
                    <div className="relative w-28 shrink-0">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">+$</span>
                      <Input
                        type="number"
                        value={it.price_delta || ""}
                        onChange={(e) => updateItem(idx, { price_delta: parseFloat(e.target.value) || 0 })}
                        placeholder="0"
                        className="h-9 rounded-lg pl-6 text-sm"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removeItemRow(idx)}
                      disabled={items.length === 1}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted disabled:opacity-30"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
              <Button type="button" variant="outline" size="sm" onClick={addItemRow} className="gap-1 rounded-lg">
                <Plus className="h-3.5 w-3.5" /> Agregar opción
              </Button>
              <p className="text-[11px] text-muted-foreground">El “+$” es lo que suma al precio del producto (dejalo en 0 si no cambia el precio).</p>
            </div>

            {/* Vincular productos */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold flex items-center gap-1.5">
                <Link2 className="h-4 w-4" /> Aplicar a productos
                {linkedIds.size > 0 && <span className="rounded-full bg-[#D1F366] px-2 py-0.5 text-[10px] font-black text-[#1C1C28]">{linkedIds.size}</span>}
              </Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input value={productSearch} onChange={(e) => setProductSearch(e.target.value)} placeholder="Buscar producto..." className="h-9 pl-8 rounded-lg" />
              </div>
              <div className="max-h-52 space-y-1 overflow-y-auto rounded-xl border border-border p-1">
                {filteredProducts.length === 0 ? (
                  <p className="py-4 text-center text-xs text-muted-foreground">Sin productos.</p>
                ) : (
                  filteredProducts.map((p) => {
                    const active = linkedIds.has(p.id)
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => toggleLink(p.id)}
                        className={cn(
                          "flex w-full items-center gap-2.5 rounded-lg p-2 text-left transition-colors",
                          active ? "bg-[#D1F366]/15 ring-1 ring-[#D1F366]" : "hover:bg-muted"
                        )}
                      >
                        <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-md border", active ? "border-[#D1F366] bg-[#D1F366] text-[#1C1C28]" : "border-muted-foreground/40")}>
                          {active && <span className="text-[11px] font-black">✓</span>}
                        </span>
                        <Package className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.name}</span>
                      </button>
                    )
                  })
                )}
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setView("list")}>Cancelar</Button>
              <Button onClick={handleSave} disabled={saving} className="flex-1 rounded-xl bg-[#D1F366] text-[#1C1C28] font-bold hover:bg-[#B3D93C] gap-2">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {editingId ? "Guardar cambios" : "Crear opción"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
