"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Plus, IdCard, Users } from "lucide-react"
import { RowActions } from "./row-actions"

interface Driver {
  id: string
  nombre: string
  tipo_documento?: string | null
  numero_documento?: string | null
  pais_code?: string | null
  is_active: boolean
}

const DOC_TYPES = ["DNI", "Pasaporte", "Cédula de Identidad", "Libreta Cívica", "Libreta de Enrolamiento"]

function initials(n: string) { return n.split(" ").map((x) => x[0]).join("").slice(0, 2).toUpperCase() }

export function ChoferesClient({ userId, drivers }: { userId: string; drivers: Driver[] }) {
  const supabase = createClient()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Driver | null>(null)
  const [tipoDoc, setTipoDoc] = useState("DNI")
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const openNew = () => { setEditing(null); setTipoDoc("DNI"); setErrors({}); setOpen(true) }
  const openEdit = (d: Driver) => { setEditing(d); setTipoDoc(d.tipo_documento || "DNI"); setErrors({}); setOpen(true) }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    const f = new FormData(e.currentTarget)
    const payload: any = {
      user_id: userId,
      nombre: String(f.get("nombre") || "").trim(),
      tipo_documento: tipoDoc,
      numero_documento: f.get("numero_documento") || null,
      pais_code: f.get("pais_code") || null,
    }
    if (!payload.nombre) { setErrors({ nombre: "Ingresá el nombre del chofer." }); setLoading(false); return }
    setErrors({})
    try {
      const res = editing
        ? await supabase.from("transport_drivers").update(payload).eq("id", editing.id)
        : await supabase.from("transport_drivers").insert(payload)
      if (res.error) throw res.error
      toast.success(editing ? "Chofer actualizado." : "Chofer agregado.")
      setOpen(false); router.refresh()
    } catch {
      toast.error("No se pudo guardar el chofer.")
    } finally { setLoading(false) }
  }

  const handleDelete = (d: Driver) => {
    toast("¿Eliminar este chofer?", {
      description: `${d.nombre}. No se puede deshacer.`,
      action: {
        label: "Eliminar",
        onClick: async () => {
          const { error } = await supabase.from("transport_drivers").delete().eq("id", d.id)
          if (error) return toast.error("No se pudo eliminar.")
          toast.success("Chofer eliminado."); router.refresh()
        },
      },
    })
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-end justify-between gap-4 mb-6 px-1 pt-2 flex-wrap">
        <div>
          <h2 className="text-3xl font-bold">Choferes</h2>
          <p className="text-muted-foreground text-sm mt-1">Conductores habilitados para los viajes internacionales.</p>
        </div>
        <Button onClick={openNew} className="rounded-xl bg-[#D1F366] text-[#1C1C28] font-bold hover:bg-[#B3D93C]">
          <Plus className="h-4 w-4 mr-1.5" /> Agregar chofer
        </Button>
      </div>

      {drivers.length === 0 ? (
        <div className="bg-card rounded-3xl border border-border p-12 flex flex-col items-center text-center shadow-sm">
          <Users className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-1">Todavía no cargaste choferes</h3>
          <p className="text-sm text-muted-foreground mb-4">Agregá tus conductores para asignarlos a los viajes.</p>
          <Button onClick={openNew} className="rounded-xl bg-[#D1F366] text-[#1C1C28] font-bold hover:bg-[#B3D93C]">
            <Plus className="h-4 w-4 mr-1.5" /> Agregar el primero
          </Button>
        </div>
      ) : (
        <div className="grid gap-4">
          {drivers.map((d) => (
            <div key={d.id} className="bg-card rounded-3xl p-5 shadow-sm border border-border flex items-center justify-between gap-4 hover:shadow-md hover:-translate-y-0.5 transition-all">
              <div className="flex items-center gap-5 min-w-0">
                <div className="w-14 h-14 rounded-2xl bg-violet-100 text-violet-600 flex items-center justify-center font-bold text-lg flex-shrink-0">
                  {initials(d.nombre)}
                </div>
                <div className="min-w-0">
                  <h4 className="font-bold text-lg truncate">{d.nombre}</h4>
                  <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                    <IdCard className="h-4 w-4" />
                    {[d.tipo_documento, d.numero_documento].filter(Boolean).join(" ") || "Sin documento"}
                  </p>
                </div>
              </div>
              <RowActions onEdit={() => openEdit(d)} onDelete={() => handleDelete(d)} />
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="p-0">
          <div className="bg-[#1C1C28] text-white px-6 py-5">
            <DialogHeader>
              <DialogTitle className="text-white flex items-center gap-2">
                <Users className="h-5 w-5 text-[#D1F366]" /> {editing ? "Editar chofer" : "Agregar chofer"}
              </DialogTitle>
              <DialogDescription className="text-white/60">Hasta dos conductores pueden asignarse a un viaje.</DialogDescription>
            </DialogHeader>
          </div>
          <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="nombre">Nombre completo *</Label>
              <Input id="nombre" name="nombre" defaultValue={editing?.nombre} placeholder="Juan Pérez"
                aria-invalid={!!errors.nombre} aria-describedby={errors.nombre ? "nombre-err" : undefined}
                className={`rounded-xl ${errors.nombre ? "border-red-400 focus-visible:ring-red-400" : ""}`} />
              {errors.nombre && <p id="nombre-err" className="text-xs text-red-600">{errors.nombre}</p>}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tipo de documento</Label>
                <Select value={tipoDoc} onValueChange={setTipoDoc}>
                  <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DOC_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="numero_documento">N° de documento</Label>
                <Input id="numero_documento" name="numero_documento" defaultValue={editing?.numero_documento ?? undefined} className="rounded-xl" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="pais_code">País (código)</Label>
              <Input id="pais_code" name="pais_code" defaultValue={editing?.pais_code ?? undefined} placeholder="200" className="rounded-xl" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" className="rounded-xl" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={loading} className="rounded-xl bg-[#D1F366] text-[#1C1C28] font-bold hover:bg-[#B3D93C]">
                {loading ? "Guardando…" : "Guardar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
