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
  const [errors, setErrors] = useState<Record<string, string>>({})

  const tractores = vehicles.filter((v) => v.kind === "tractor").length
  const semis = vehicles.filter((v) => v.kind === "semirremolque").length
  const porVencer = vehicles.filter((v) => ["soon", "expired"].includes(vencStatus(v.poliza_vencimiento))).length

  const openNew = () => { setEditing(null); setKind("tractor"); setErrors({}); setOpen(true) }
  const openEdit = (v: Vehicle) => { setEditing(v); setKind(v.kind); setErrors({}); setOpen(true) }

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
    if (!payload.patente) { setErrors({ patente: "Ingresá la patente." }); setLoading(false); return }
    setErrors({})
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
          <h2 className="text-3xl font-bold tracking-tight">Flota</h2>
          <p className="text-muted-foreground text-sm mt-1">Tractores y semirremolques que se reutilizan en cada viaje.</p>
        </div>
        <Button onClick={openNew} className="rounded-xl bg-[#D1F366] text-[#1C1C28] font-bold hover:bg-[#B3D93C]">
          <Plus className="h-4 w-4 mr-1.5" /> Agregar vehículo
        </Button>
      </div>

      {/* Bento: stats + grid de vehículos */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <div className="bg-[#1C1C28] text-white rounded-3xl p-5 col-span-2 lg:col-span-1 flex flex-col justify-between min-h-[120px]">
          <Truck className="h-6 w-6 text-[#D1F366]" />
          <div>
            <p className="text-3xl font-bold leading-none">{vehicles.length}</p>
            <p className="text-xs text-white/60 mt-1">vehículos en total</p>
          </div>
        </div>
        <StatMini label="Tractores" value={tractores} icon={<Truck className="h-5 w-5" />} cls="bg-indigo-50 text-indigo-600" />
        <StatMini label="Semis" value={semis} icon={<Container className="h-5 w-5" />} cls="bg-teal-50 text-teal-600" />
        <StatMini label="Pólizas por vencer" value={porVencer} icon={<ShieldAlert className="h-5 w-5" />} cls="bg-amber-50 text-amber-600" alert={porVencer > 0} />
      </div>

      {vehicles.length === 0 ? (
        <div className="bg-card rounded-3xl border border-border p-12 flex flex-col items-center text-center card-elevated">
          <Truck className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-1">Todavía no cargaste vehículos</h3>
          <p className="text-sm text-muted-foreground mb-4">Agregá tus tractores y semis para reutilizarlos en cada viaje.</p>
          <Button onClick={openNew} className="rounded-xl bg-[#D1F366] text-[#1C1C28] font-bold hover:bg-[#B3D93C]">
            <Plus className="h-4 w-4 mr-1.5" /> Agregar el primero
          </Button>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {vehicles.map((v) => {
            const vs = vencStatus(v.poliza_vencimiento)
            return (
              <div key={v.id} className="bg-card rounded-3xl p-5 card-elevated border border-border/60 hover:-translate-y-0.5 transition-all flex flex-col">
                <div className="flex items-start justify-between">
                  <div className="w-12 h-12 rounded-2xl bg-[#1C1C28] text-[#D1F366] grid place-items-center">
                    {v.kind === "tractor" ? <Truck className="h-6 w-6" /> : <Container className="h-6 w-6" />}
                  </div>
                  <RowActions compact onEdit={() => openEdit(v)} onDelete={() => handleDelete(v)} />
                </div>
                <h4 className="mt-4 font-bold text-xl tracking-tight">{v.patente}</h4>
                <p className="text-sm text-muted-foreground mt-0.5 min-h-[20px]">
                  {[v.marca, v.modelo, v.anio].filter(Boolean).join(" · ") || KIND_LABEL[v.kind]}
                  {v.capacidad_traccion_ton ? ` · ${v.capacidad_traccion_ton} t` : ""}
                </p>
                <div className="mt-3 pt-3 border-t border-border/60 flex items-center gap-1.5 flex-wrap">
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-muted text-muted-foreground">{KIND_LABEL[v.kind] || v.kind}</span>
                  {vs !== "none" && (
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider inline-flex items-center gap-1
                      ${vs === "expired" ? "bg-red-100 text-red-700" : vs === "soon" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>
                      {vs === "ok" ? <ShieldCheck className="h-3 w-3" /> : <ShieldAlert className="h-3 w-3" />}
                      {vs === "expired" ? "Póliza vencida" : vs === "soon" ? `Vence ${v.poliza_vencimiento}` : "Póliza al día"}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Dialog ANCHO, sin borde blanco */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto p-0 border-0 overflow-hidden sm:max-w-2xl rounded-3xl">
          <div className="bg-[#1C1C28] text-white px-6 py-5">
            <DialogHeader>
              <DialogTitle className="text-white flex items-center gap-2">
                <Truck className="h-5 w-5 text-[#D1F366]" /> {editing ? "Editar vehículo" : "Agregar vehículo"}
              </DialogTitle>
              <DialogDescription className="text-white/60">Estos datos se reutilizan al armar cada viaje.</DialogDescription>
            </DialogHeader>
          </div>
          <form onSubmit={handleSubmit} className="px-6 pb-6 pt-5 space-y-5 overflow-y-auto">
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Tipo</Label>
                <Select value={kind} onValueChange={setKind}>
                  <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tractor">Tractor</SelectItem>
                    <SelectItem value="semirremolque">Semirremolque</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="patente" className="text-xs">Patente *</Label>
                <Input id="patente" name="patente" defaultValue={editing?.patente} placeholder="AB123CD"
                  aria-invalid={!!errors.patente} aria-describedby={errors.patente ? "patente-err" : undefined}
                  className={`rounded-xl ${errors.patente ? "border-red-400 focus-visible:ring-red-400" : ""}`} />
                {errors.patente && <p id="patente-err" className="text-xs text-red-600">{errors.patente}</p>}
              </div>
              <F label="País (código)" name="pais_code" def={editing?.pais_code} placeholder="200" />
            </div>

            {kind === "tractor" && (
              <FormGroup title="Chasis">
                <div className="grid grid-cols-3 gap-3">
                  <F label="Marca" name="marca" def={editing?.marca} />
                  <F label="Modelo" name="modelo" def={editing?.modelo} />
                  <F label="Año" name="anio" type="number" def={editing?.anio ?? undefined} placeholder="2020" />
                  <F label="N° de chasis" name="chasis_numero" def={editing?.chasis_numero} className="col-span-2" />
                  <F label="Capacidad (t)" name="capacidad" type="number" def={editing?.capacidad_traccion_ton ?? undefined} />
                </div>
              </FormGroup>
            )}

            <FormGroup title="Póliza de seguro">
              <div className="grid grid-cols-2 gap-3">
                <F label="N° de póliza" name="poliza_numero" def={editing?.poliza_numero} />
                <F label="Vencimiento" name="poliza_vencimiento" type="date" def={editing?.poliza_vencimiento ?? undefined} />
              </div>
            </FormGroup>

            <FormGroup title="Propietario (solo si difiere del transportista)">
              <div className="grid grid-cols-2 gap-3">
                <F label="Razón social" name="owner_razon_social" def={editing?.owner_razon_social} />
                <F label="CUIT" name="owner_cuit" def={editing?.owner_cuit} />
              </div>
            </FormGroup>

            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" className="rounded-xl" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={loading} className="rounded-xl bg-[#D1F366] text-[#1C1C28] font-bold hover:bg-[#B3D93C]">
                {loading ? "Guardando…" : "Guardar vehículo"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function StatMini({ label, value, icon, cls, alert }: { label: string; value: number; icon: React.ReactNode; cls: string; alert?: boolean }) {
  return (
    <div className={`bg-card rounded-3xl p-5 shadow-sm border ${alert ? "border-amber-200" : "border-border"} flex flex-col justify-between min-h-[120px]`}>
      <div className={`w-10 h-10 rounded-xl grid place-items-center ${cls}`}>{icon}</div>
      <div>
        <p className="text-3xl font-bold leading-none">{value}</p>
        <p className="text-xs text-muted-foreground mt-1">{label}</p>
      </div>
    </div>
  )
}

function FormGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-muted/40 p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-3">{title}</p>
      {children}
    </div>
  )
}

function F({ label, name, def, type = "text", placeholder, className }: { label: string; name: string; def?: string | number | null; type?: string; placeholder?: string; className?: string }) {
  return (
    <div className={`space-y-1.5 ${className || ""}`}>
      <Label htmlFor={name} className="text-xs">{label}</Label>
      <Input id={name} name={name} type={type} defaultValue={def ?? undefined} placeholder={placeholder} className="rounded-xl" />
    </div>
  )
}
