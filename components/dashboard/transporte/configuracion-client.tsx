"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Building2, Truck, ShieldCheck, Save, Lock } from "lucide-react"

interface Vehicle { id: string; patente: string; kind: string }
interface Driver { id: string; nombre: string }
interface Corridor { id: string; name: string }

const NONE = "none"
const sel = (v: string | null | undefined) => v ?? NONE
const toNull = (v: string) => (v === NONE ? null : v)

export function ConfiguracionClient({
  userId, settings, carrier, vehicles, drivers, corridors,
}: {
  userId: string
  settings: any
  carrier: any
  vehicles: Vehicle[]
  drivers: Driver[]
  corridors: Corridor[]
}) {
  const supabase = createClient()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [tipo, setTipo] = useState(carrier?.tipo || "regular")
  const [singleTruck, setSingleTruck] = useState(!!settings?.single_truck_mode)
  const [tractor, setTractor] = useState(sel(settings?.default_tractor_id))
  const [semi, setSemi] = useState(sel(settings?.default_semi_id))
  const [driver, setDriver] = useState(sel(settings?.default_driver_id))
  const [corridor, setCorridor] = useState(sel(settings?.default_corridor_id))

  const tractores = vehicles.filter((v) => v.kind === "tractor")
  const semis = vehicles.filter((v) => v.kind === "semirremolque")

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    const f = new FormData(e.currentTarget)
    const razon = String(f.get("razon_social") || "").trim()

    try {
      // 1) Transportista (carrier) — solo si hay razón social
      let carrierId: string | null = carrier?.id ?? null
      if (razon) {
        const carrierPayload: any = {
          user_id: userId,
          cnrt_number: f.get("cnrt_number") || null,
          intl_permit_number: f.get("intl_permit_number") || null,
          cuit: f.get("cuit") || null,
          razon_social: razon,
          domicilio: f.get("domicilio") || null,
          pais_code: f.get("pais_code") || null,
          tipo,
          is_default: true,
        }
        if (carrierId) {
          const { error } = await supabase.from("transport_carriers").update(carrierPayload).eq("id", carrierId)
          if (error) throw error
        } else {
          const { data, error } = await supabase.from("transport_carriers").insert(carrierPayload).select("id").single()
          if (error) throw error
          carrierId = data?.id ?? null
        }
      }

      // 2) Settings (upsert por user_id)
      const { error: sErr } = await supabase.from("transport_settings").upsert({
        user_id: userId,
        default_carrier_id: carrierId,
        default_tractor_id: toNull(tractor),
        default_semi_id: toNull(semi),
        default_driver_id: toNull(driver),
        default_corridor_id: toNull(corridor),
        single_truck_mode: singleTruck,
        malvina_username: f.get("malvina_username") || null,
      }, { onConflict: "user_id" })
      if (sErr) throw sErr

      toast.success("Configuración guardada.")
      router.refresh()
    } catch {
      toast.error("No se pudo guardar la configuración.")
    } finally { setLoading(false) }
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6 px-1 pt-2">
        <h2 className="text-3xl font-bold tracking-tight">Configuración del kit</h2>
        <p className="text-muted-foreground text-sm mt-1">Datos del transportista y preferencias de la operación.</p>
      </div>

      <form onSubmit={handleSubmit} className="grid lg:grid-cols-3 gap-4 items-start">
        {/* Transportista */}
        <div className="lg:col-span-2">
        <Card icon={<Building2 className="h-5 w-5" />} title="Transportista" desc="Lo que MALVINA autocompleta al validar el CNRT.">
          <div className="grid sm:grid-cols-2 gap-4">
            <F label="Razón social" name="razon_social" def={carrier?.razon_social} placeholder="Mi Transporte S.A." />
            <F label="CUIT" name="cuit" def={carrier?.cuit} />
            <F label="N° Registro CNRT" name="cnrt_number" def={carrier?.cnrt_number} />
            <F label="N° Permiso Internacional" name="intl_permit_number" def={carrier?.intl_permit_number} />
            <F label="Domicilio" name="domicilio" def={carrier?.domicilio} />
            <F label="País (código)" name="pais_code" def={carrier?.pais_code} placeholder="200" />
            <div className="space-y-2">
              <Label>Tipo de transportista</Label>
              <Select value={tipo} onValueChange={setTipo}>
                <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="regular">Regular</SelectItem>
                  <SelectItem value="ocasional">Ocasional</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </Card>
        </div>

        {/* Columna derecha: MALVINA + guardar */}
        <div className="space-y-4">
          <Card icon={<ShieldCheck className="h-5 w-5" />} title="MALVINA" desc="Solo el usuario. La contraseña nunca se guarda.">
            <F label="Usuario de MALVINA" name="malvina_username" def={settings?.malvina_username} />
            <p className="mt-3 text-xs text-muted-foreground flex items-center gap-1.5">
              <Lock className="h-3.5 w-3.5" /> La contraseña se ingresa siempre a mano en MALVINA.
            </p>
          </Card>
          <Button type="submit" disabled={loading} className="w-full rounded-xl bg-[#D1F366] text-[#1C1C28] font-bold hover:bg-[#B3D93C] h-12">
            <Save className="h-4 w-4 mr-1.5" /> {loading ? "Guardando…" : "Guardar configuración"}
          </Button>
        </div>

        {/* Valores por defecto */}
        <div className="lg:col-span-3">
        <Card icon={<Truck className="h-5 w-5" />} title="Valores por defecto" desc="Se usan al armar cada viaje para ir más rápido.">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <SelectField label="Tractor por defecto" value={tractor} onChange={setTractor} options={tractores.map((v) => ({ id: v.id, label: v.patente }))} />
            <SelectField label="Semirremolque por defecto" value={semi} onChange={setSemi} options={semis.map((v) => ({ id: v.id, label: v.patente }))} />
            <SelectField label="Chofer por defecto" value={driver} onChange={setDriver} options={drivers.map((d) => ({ id: d.id, label: d.nombre }))} />
            <SelectField label="Corredor por defecto" value={corridor} onChange={setCorridor} options={corridors.map((c) => ({ id: c.id, label: c.name }))} />
          </div>
          <div className="mt-4 flex items-center justify-between rounded-2xl bg-muted/40 p-4">
            <div>
              <p className="font-medium text-sm">Modo "un solo camión"</p>
              <p className="text-xs text-muted-foreground">Saltea el paso de elegir camión al cargar un viaje (queda "subir y listo").</p>
            </div>
            <Switch checked={singleTruck} onCheckedChange={setSingleTruck} />
          </div>
        </Card>
        </div>
      </form>
    </div>
  )
}

function Card({ icon, title, desc, children }: { icon: React.ReactNode; title: string; desc: string; children: React.ReactNode }) {
  return (
    <div className="bg-card rounded-3xl p-6 card-elevated border border-border/60">
      <div className="flex items-center gap-3 mb-4">
        <div className="h-10 w-10 rounded-xl bg-primary/15 text-foreground grid place-items-center">{icon}</div>
        <div>
          <h3 className="font-bold">{title}</h3>
          <p className="text-xs text-muted-foreground">{desc}</p>
        </div>
      </div>
      {children}
    </div>
  )
}

function F({ label, name, def, placeholder }: { label: string; name: string; def?: string | null; placeholder?: string }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} defaultValue={def ?? undefined} placeholder={placeholder} className="rounded-xl" />
    </div>
  )
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { id: string; label: string }[] }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="rounded-xl"><SelectValue placeholder="Sin asignar" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="none">Sin asignar</SelectItem>
          {options.map((o) => <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  )
}
