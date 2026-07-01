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
import { Building2, BadgeCheck, Plus } from "lucide-react"
import { RowActions } from "./row-actions"

interface Client {
  id: string
  tax_id?: string | null
  tax_id_type?: string | null
  tax_id_country?: string | null
  razon_social: string
  domicilio?: string | null
  pais_code?: string | null
  roles?: string[] | null
  source?: string | null
  needs_review?: boolean
}

const ROLE_CLS: Record<string, string> = {
  exportador: "bg-indigo-50 text-indigo-700",
  consignatario: "bg-teal-50 text-teal-700",
  destinatario: "bg-violet-50 text-violet-700",
  notificar: "bg-amber-50 text-amber-700",
}
const TAX_TYPES = ["CUIT", "RUT", "RUC", "RFC", "OTRO"]

export function ClientesClient({ userId, clients }: { userId: string; clients: Client[] }) {
  const supabase = createClient()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Client | null>(null)
  const [taxType, setTaxType] = useState("CUIT")
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const openNew = () => { setEditing(null); setTaxType("CUIT"); setErrors({}); setOpen(true) }
  const openEdit = (c: Client) => { setEditing(c); setTaxType(c.tax_id_type || "CUIT"); setErrors({}); setOpen(true) }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    const f = new FormData(e.currentTarget)
    const payload: any = {
      user_id: userId,
      razon_social: String(f.get("razon_social") || "").trim(),
      tax_id: f.get("tax_id") || null,
      tax_id_type: taxType,
      tax_id_country: f.get("tax_id_country") || null,
      domicilio: f.get("domicilio") || null,
      pais_code: f.get("pais_code") || null,
    }
    if (!payload.razon_social) { setErrors({ razon_social: "Ingresá la razón social." }); setLoading(false); return }
    setErrors({})
    try {
      const res = editing
        ? await supabase.from("transport_clients").update(payload).eq("id", editing.id)
        : await supabase.from("transport_clients").insert({ ...payload, roles: [], source: "manual" })
      if (res.error) throw res.error
      toast.success(editing ? "Cliente actualizado." : "Cliente agregado.")
      setOpen(false); router.refresh()
    } catch {
      toast.error("No se pudo guardar el cliente.")
    } finally { setLoading(false) }
  }

  const handleDelete = (c: Client) => {
    toast("¿Eliminar este cliente?", {
      description: `${c.razon_social}. No se puede deshacer.`,
      action: {
        label: "Eliminar",
        onClick: async () => {
          const { error } = await supabase.from("transport_clients").delete().eq("id", c.id)
          if (error) return toast.error("No se pudo eliminar (puede estar usado en un viaje).")
          toast.success("Cliente eliminado."); router.refresh()
        },
      },
    })
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-end justify-between gap-4 mb-6 px-1 pt-2 flex-wrap">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Clientes de comercio exterior</h2>
          <p className="text-muted-foreground text-sm mt-1">Exportadores, consignatarios y destinatarios. Se crean solos al cargar viajes.</p>
        </div>
        <Button onClick={openNew} className="rounded-xl bg-[#D1F366] text-[#1C1C28] font-bold hover:bg-[#B3D93C]">
          <Plus className="h-4 w-4 mr-1.5" /> Agregar cliente
        </Button>
      </div>

      {clients.length === 0 ? (
        <div className="bg-card rounded-3xl border border-border p-12 flex flex-col items-center text-center card-elevated">
          <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-1">Todavía no hay clientes</h3>
          <p className="text-sm text-muted-foreground">Al cargar un viaje, el exportador y el cliente del exterior se registran automáticamente.</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {clients.map((c) => (
            <div key={c.id} className="bg-card rounded-3xl p-5 card-elevated border border-border/60 hover:-translate-y-0.5 transition-all">
              <div className="flex items-start justify-between">
                <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 grid place-items-center">
                  <Building2 className="h-6 w-6" />
                </div>
                <div className="flex items-center gap-2">
                  {c.source && c.source !== "manual" && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 bg-emerald-50 rounded-full px-2 py-0.5">
                      <BadgeCheck className="h-3 w-3" /> auto
                    </span>
                  )}
                  <RowActions compact onEdit={() => openEdit(c)} onDelete={() => handleDelete(c)} />
                </div>
              </div>
              <div className="mt-4 flex items-center gap-2 flex-wrap">
                <h4 className="font-bold text-lg leading-tight">{c.razon_social}</h4>
                {c.needs_review && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-amber-100 text-amber-700">revisar</span>
                )}
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                {c.tax_id ? `${c.tax_id_type || "ID"} ${c.tax_id}` : "Sin identificación tributaria"}
              </p>
              {c.domicilio && <p className="text-xs text-muted-foreground mt-0.5 truncate">{c.domicilio}</p>}
              {(c.roles || []).length > 0 && (
                <div className="mt-3 pt-3 border-t border-border/60 flex flex-wrap gap-1.5">
                  {(c.roles || []).map((r) => (
                    <span key={r} className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${ROLE_CLS[r] || "bg-gray-50 text-gray-600"}`}>{r}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="p-0 border-0 overflow-hidden sm:max-w-2xl rounded-3xl">
          <div className="bg-[#1C1C28] text-white px-6 py-5">
            <DialogHeader>
              <DialogTitle className="text-white flex items-center gap-2">
                <Building2 className="h-5 w-5 text-[#D1F366]" /> {editing ? "Editar cliente" : "Agregar cliente"}
              </DialogTitle>
              <DialogDescription className="text-white/60">Datos del exportador o del cliente del exterior.</DialogDescription>
            </DialogHeader>
          </div>
          <form onSubmit={handleSubmit} className="px-6 pb-6 pt-5 space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5 col-span-2">
                <Label htmlFor="razon_social" className="text-xs">Razón social *</Label>
                <Input id="razon_social" name="razon_social" defaultValue={editing?.razon_social}
                  aria-invalid={!!errors.razon_social} aria-describedby={errors.razon_social ? "razon-err" : undefined}
                  className={`rounded-xl ${errors.razon_social ? "border-red-400 focus-visible:ring-red-400" : ""}`} />
                {errors.razon_social && <p id="razon-err" className="text-xs text-red-600">{errors.razon_social}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pais_code" className="text-xs">País (código)</Label>
                <Input id="pais_code" name="pais_code" defaultValue={editing?.pais_code ?? undefined} placeholder="208" className="rounded-xl" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Tipo de ID</Label>
                <Select value={taxType} onValueChange={setTaxType}>
                  <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TAX_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tax_id" className="text-xs">Identificación tributaria</Label>
                <Input id="tax_id" name="tax_id" defaultValue={editing?.tax_id ?? undefined} placeholder="CUIT / RUT / RUC…" className="rounded-xl" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tax_id_country" className="text-xs">País del ID</Label>
                <Input id="tax_id_country" name="tax_id_country" defaultValue={editing?.tax_id_country ?? undefined} placeholder="208" className="rounded-xl" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="domicilio" className="text-xs">Domicilio</Label>
              <Input id="domicilio" name="domicilio" defaultValue={editing?.domicilio ?? undefined} className="rounded-xl" />
            </div>
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" className="rounded-xl" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={loading} className="rounded-xl bg-[#D1F366] text-[#1C1C28] font-bold hover:bg-[#B3D93C]">
                {loading ? "Guardando…" : "Guardar cliente"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
