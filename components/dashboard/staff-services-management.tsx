"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { UserRound, Plus, Trash2, Loader2 } from "lucide-react"
import { toast } from "sonner"

interface Product {
  id: string
  name: string
  category?: string | null
}
interface Staff {
  id: string
  name: string
  is_active: boolean
  service_ids: string[] // ids de productos que hace
}

/**
 * Gestión del Equipo (profesionales) para el modo turno.
 * Los "servicios" son los PRODUCTOS del catálogo: acá solo asignás cuáles hace cada profesional.
 */
export function StaffServicesManagement({ userId }: { userId: string }) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [products, setProducts] = useState<Product[]>([])
  const [staff, setStaff] = useState<Staff[]>([])

  const [staffName, setStaffName] = useState("")
  const [staffProducts, setStaffProducts] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  const load = async () => {
    const [{ data: prods }, { data: stf }] = await Promise.all([
      supabase.from("products").select("id, name, category").eq("user_id", userId).eq("is_service", true).order("name"),
      supabase.from("staff").select("*").eq("user_id", userId).order("created_at"),
    ])
    setProducts((prods as Product[]) || [])
    setStaff((stf as Staff[]) || [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const addStaff = async () => {
    if (!staffName.trim()) return toast.error("Poné un nombre")
    setSaving(true)
    try {
      const { data, error } = await supabase
        .from("staff")
        .insert({ user_id: userId, name: staffName.trim(), service_ids: staffProducts })
        .select()
        .single()
      if (error) throw error
      setStaff((s) => [...s, data as Staff])
      setStaffName("")
      setStaffProducts([])
      toast.success("Profesional agregado")
    } catch {
      toast.error("No se pudo agregar")
    } finally {
      setSaving(false)
    }
  }
  const toggleStaff = async (st: Staff) => {
    await supabase.from("staff").update({ is_active: !st.is_active }).eq("id", st.id)
    setStaff((s) => s.map((x) => (x.id === st.id ? { ...x, is_active: !x.is_active } : x)))
  }
  const deleteStaff = async (id: string) => {
    await supabase.from("staff").delete().eq("id", id)
    setStaff((s) => s.filter((x) => x.id !== id))
    toast.success("Profesional eliminado")
  }
  const productName = (id: string) => products.find((p) => p.id === id)?.name || "—"

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="bg-card rounded-2xl border border-border p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-1">
        <UserRound className="h-5 w-5 text-[#D1F366]" />
        <h3 className="font-bold">Profesionales (turnos)</h3>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Cargá tus profesionales y elegí qué servicios hace cada uno. Los servicios son tus{" "}
        <Link href="/dashboard/pedidos" className="underline hover:text-foreground">productos</Link> (cargalos ahí).
      </p>

      {products.length === 0 && (
        <div className="rounded-xl bg-muted/40 p-3 text-sm text-muted-foreground mb-4">
          Todavía no tenés servicios. Andá a{" "}
          <Link href="/dashboard/pedidos" className="underline">Productos</Link>, creá lo que ofrecés y
          marcalo como <strong>"servicio"</strong> con su duración (ej: "Corte $5000 · 30 min").
        </div>
      )}

      <div className="space-y-2 mb-4">
        {staff.length === 0 && <p className="text-sm text-muted-foreground">Todavía no cargaste profesionales.</p>}
        {staff.map((st) => (
          <div key={st.id} className="flex items-center gap-2 rounded-xl border border-border/60 p-2.5">
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium truncate ${!st.is_active ? "opacity-50" : ""}`}>{st.name}</p>
              <p className="text-xs text-muted-foreground truncate">
                {st.service_ids?.length ? st.service_ids.map(productName).join(", ") : "Todos los servicios"}
              </p>
            </div>
            <Switch checked={st.is_active} onCheckedChange={() => toggleStaff(st)} />
            <button onClick={() => deleteStaff(st.id)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20">
              <Trash2 className="h-4 w-4 text-red-500" />
            </button>
          </div>
        ))}
      </div>

      <div className="border-t border-border/50 pt-3 space-y-2">
        <Input placeholder="Nombre del profesional (ej: Pepe)" value={staffName} onChange={(e) => setStaffName(e.target.value)} />
        {products.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {products.map((p) => {
              const on = staffProducts.includes(p.id)
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setStaffProducts((prev) => (on ? prev.filter((x) => x !== p.id) : [...prev, p.id]))}
                  className={`text-xs px-2 py-1 rounded-full border transition-colors ${
                    on ? "bg-[#D1F366] text-[#1C1C28] border-[#D1F366]" : "border-border hover:bg-muted"
                  }`}
                >
                  {p.name}
                </button>
              )
            })}
            <span className="text-[11px] text-muted-foreground self-center">(vacío = hace todos)</span>
          </div>
        )}
        <Button onClick={addStaff} disabled={saving} className="w-full gap-1.5">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Agregar profesional
        </Button>
      </div>
    </div>
  )
}
