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
import { Truck, Plus, ShieldCheck, ShieldAlert, Container } from "lucide-react"
import { RowActions } from "./row-actions"

interface Vehicle {
  id: string
  kind: string
  patente: string
  pais_code?: string | null
  marca?: string | null
  chasis_numero?: string | null
  modelo?: string | null
  anio?: number | null
  capacidad_traccion_ton?: number | null
  poliza_numero?: string | null
  poliza_vencimiento?: string | null
  owner_razon_social?: string | null
  owner_cuit?: string | null
  is_active: boolean
}

const KIND_LABEL: Record<string, string> = { tractor: "Tractor", semirremolque: "Semirremolque" }

function vencStatus(date?: string | null): "ok" | "soon" | "expired" | "none" {
  if (!date) return "none"
  const d = new Date(date + "T00:00:00").getTime()
  const now = Date.now()
  if (d < now) return "expired"
  if (d < now + 30 * 24 * 60 * 60 * 1000) return "soon"
  return "ok"
}

export function FlotaClient({ userId, vehicles }: { userId: string; vehicles: Vehicle[] }) {
  const supabase = createClient()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Vehicle | null>(null)
  const [kind, setKind] = useState("tractor")
  const [loading, setLoading] = useState(false)

  const tractores = vehicles.filter((v) => v.kind === "tractor").length
  const semis = vehicles.filter((v) => v.kind === "semirremolque").length
  const porVencer = vehicles.filter((v) => ["soon", "expired"].includes(vencStatus(v.poliza_vencimiento))).length

  const openNew = () => { setEditing(null); setKind("tractor"); setOpen(true) }
  const openEdit = (v: Vehicle) => { setEditing(v); setKind(v.kind); setOpen(true) }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    const f = new FormData(e.currentTarget)
    const payload: any = {
      user_id: userId,
      kind,
      patente: String(f.get("patente") || "").trim().toUpperCase(),
      pais_code: f.get("pais_code") || null,
      marca: f.get("marca") || null,
      chasis_numero: f.get("chasis_numero") || null,
      modelo: f.get("modelo") || null,
      anio: f.get("anio") ? Number(f.get("anio")) : null,
      capacidad_traccion_ton: f.get("capacidad") ? Number(f.get("capacidad")) : null,
      poliza_numero: f.get("poliza_numero") || null,
      poliza_vencimiento: f.get("poliza_vencimiento") || null,
      owner_razon_social: f.get("owner_razon_social") || null,
      owner_cuit: f.get("owner_cuit") || null,
    }
    if (!payload.patente) { toast.error("La patente es obligatoria."); setLoading(false); return }
    try {
      const res = editing
        ? await supabase.from("transport_vehicles").update(payload).eq("id", editing.id)
        : await supabase.from("transport_vehicles").insert(payload)
      if (res.error) throw res.error
      toast.success(editing ? "Vehículo actualizado." : "Vehículo agregado.")
      setOpen(false); router.refresh()
    } catch {
      toast.error("No se pudo guardar el vehículo.")
    } finally { setLoading(false) }
  }

  const handleDelete = (v: Vehicle) => {
    toast("¿Eliminar este vehículo?", {
      description: `Patente ${v.patente}. No se puede deshacer.`,
      action: {
        label: "Eliminar",
        onClick: async () => {
          const { error } = await supabase.from("transport_vehicles").delete().eq("id", v.id)
          if (error) return toast.error("No se pudo eliminar.")
          toast.success("Vehículo eliminado."); router.refresh()
        },
      },
    })
  }

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-end justify-between gap-4 mb-6 px-1 pt-2 flex-wrap">
        <div>
          <h2 className="text-3xl font-bold">Flota</h2>
          <p className="text-muted-foreground text-sm mt-1">Tractores y semirremolques que se reutilizan en cada viaje.</p>
        </div>
        <Button onClick={openNew} className="rounded-xl bg-[#D1F366] text-[#1C1C28] font-bold hover:bg-[#B3D93C]">
          <Plus className="h-4 w-4 mr-1.5" /> Agregar vehículo
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <Stat icon={<Truck className="h-6 w-6" />} color="bg-indigo-50 text-indigo-500" label="Tractores" value={tractores} />
        <Stat icon={<Container className="h-6 w-6" />} color="bg-teal-50 text-teal-500" label="Semirremolques" value={semis} />
        <Stat icon={<ShieldAlert className="h-6 w-6" />} color="bg-amber-50 text-amber-500" label="Pólizas por vencer" value={porVencer} />
      </div>

      {/* List */}
      {vehicles.length === 0 ? (
        <div className="bg-card rounded-3xl border border-border p-12 flex flex-col items-center text-center shadow-sm">
          <Truck className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-1">Todavía no cargaste vehículos</h3>
          <p className="text-sm text-muted-foreground mb-4">Agregá tus tractores y semis para reutilizarlos en cada viaje.</p>
          <Button onClick={openNew} className="rounded-xl bg-[#D1F366] text-[#1C1C28] font-bold hover:bg-[#B3D93C]">
            <Plus className="h-4 w-4 mr-1.5" /> Agregar el primero
          </Button>
        </div>
      ) : (
        <div className="grid gap-4">
          {vehicles.map((v) => {
            const vs = vencStatus(v.poliza_vencimiento)
            return (
              <div key={v.id} className="bg-card rounded-3xl p-5 shadow-sm border border-border flex items-center justify-between gap-4 hover:shadow-md hover:-translate-y-0.5 transition-all">
                <div className="flex items-center gap-5 min-w-0">
                  <div className="w-16 h-16 rounded-2xl bg-[#1C1C28] text-[#D1F366] flex items-center justify-center flex-shrink-0">
                    {v.kind === "tractor" ? <Truck className="h-7 w-7" /> : <Container className="h-7 w-7" />}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-3 flex-wrap">
                      <h4 className="font-bold text-lg">{v.patente}</h4>
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-muted text-muted-foreground">{KIND_LABEL[v.kind] || v.kind}</span>
                      {vs !== "none" && (
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border inline-flex items-center gap-1
                          ${vs === "expired" ? "bg-red-100 text-red-700 border-red-200" : vs === "soon" ? "bg-amber-100 text-amber-700 border-amber-200" : "bg-green-100 text-green-700 border-green-200"}`}>
                          {vs === "ok" ? <ShieldCheck className="h-3 w-3" /> : <ShieldAlert className="h-3 w-3" />}
                          {vs === "expired" ? "Póliza vencida" : vs === "soon" ? `Vence ${v.poliza_vencimiento}` : "Póliza al día"}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {[v.marca, v.modelo, v.anio].filter(Boolean).join(" · ") || "Sin datos de chasis"}
                      {v.capacidad_traccion_ton ? ` · ${v.capacidad_traccion_ton} t` : ""}
                    </p>
                  </div>
                </div>
                <RowActions onEdit={() => openEdit(v)} onDelete={() => handleDelete(v)} />
              </div>
            )
          })}
        </div>
      )}

      {/* Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar vehículo" : "Agregar vehículo"}</DialogTitle>
            <DialogDescription>Estos datos se reutilizan al armar cada viaje.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select value={kind} onValueChange={setKind}>
                  <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tractor">Tractor</SelectItem>
                    <SelectItem value="semirremolque">Semirremolque</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Field label="Patente *" name="patente" def={editing?.patente} placeholder="AB123CD" />
              <Field label="País (código)" name="pais_code" def={editing?.pais_code} placeholder="200" />
              <Field label="Capacidad tracción (t)" name="capacidad" type="number" def={editing?.capacidad_traccion_ton ?? undefined} />
            </div>
            {kind === "tractor" && (
              <div className="grid grid-cols-2 gap-4">
                <Field label="Marca" name="marca" def={editing?.marca} />
                <Field label="N° chasis" name="chasis_numero" def={editing?.chasis_numero} />
                <Field label="Modelo" name="modelo" def={editing?.modelo} />
                <Field label="Año" name="anio" type="number" def={editing?.anio ?? undefined} placeholder="2020" />
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <Field label="N° póliza" name="poliza_numero" def={editing?.poliza_numero} />
              <Field label="Vencimiento póliza" name="poliza_vencimiento" type="date" def={editing?.poliza_vencimiento ?? undefined} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Propietario (razón social)" name="owner_razon_social" def={editing?.owner_razon_social} placeholder="Si difiere del transportista" />
              <Field label="CUIT propietario" name="owner_cuit" def={editing?.owner_cuit} />
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

function Stat({ icon, color, label, value }: { icon: React.ReactNode; color: string; label: string; value: number }) {
  return (
    <div className="bg-card rounded-3xl p-5 shadow-sm border border-border flex items-center gap-4">
      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 ${color}`}>{icon}</div>
      <div>
        <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">{label}</p>
        <p className="text-2xl font-bold">{value}</p>
      </div>
    </div>
  )
}

function Field({ label, name, def, type = "text", placeholder }: { label: string; name: string; def?: string | number | null; type?: string; placeholder?: string }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} type={type} defaultValue={def ?? undefined} placeholder={placeholder} className="rounded-xl" />
    </div>
  )
}
