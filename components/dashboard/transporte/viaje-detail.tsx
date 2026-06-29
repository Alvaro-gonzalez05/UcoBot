"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  ArrowLeft, Truck, Container, IdCard, FileText, CheckCircle2, Send, RotateCcw,
  Package, Building2, Route, AlertTriangle,
} from "lucide-react"

const NONE = "none"
const sel = (v: string | null | undefined) => v ?? NONE
const toNull = (v: string) => (v === NONE ? null : v)

const ESTADO: Record<string, { label: string; cls: string }> = {
  borrador: { label: "Borrador", cls: "bg-gray-100 text-gray-600 border-gray-200" },
  listo: { label: "Listo", cls: "bg-blue-100 text-blue-700 border-blue-200" },
  volcado: { label: "Volcado", cls: "bg-amber-100 text-amber-700 border-amber-200" },
  oficializado: { label: "Oficializado", cls: "bg-green-100 text-green-700 border-green-200" },
  anulado: { label: "Anulado", cls: "bg-red-100 text-red-700 border-red-200" },
}

export function ViajeDetail({ userId, trip, vehicles, drivers, settings }: {
  userId: string
  trip: any
  vehicles: { id: string; patente: string; kind: string }[]
  drivers: { id: string; nombre: string }[]
  settings: any
}) {
  const supabase = createClient()
  const router = useRouter()
  const crt = Array.isArray(trip.transport_crts) ? trip.transport_crts[0] : trip.transport_crts
  const permit = crt?.transport_shipping_permits
  const tractores = vehicles.filter((v) => v.kind === "tractor")
  const semis = vehicles.filter((v) => v.kind === "semirremolque")

  const [tractor, setTractor] = useState(sel(trip.tractor_id ?? settings?.default_tractor_id))
  const [semi, setSemi] = useState(sel(trip.semi_id ?? settings?.default_semi_id))
  const [driver, setDriver] = useState(sel(trip.driver_id ?? settings?.default_driver_id))
  const [driver2, setDriver2] = useState(sel(trip.driver2_id))
  const [estado, setEstado] = useState<string>(trip.estado)
  const [loading, setLoading] = useState(false)

  const e = ESTADO[estado] || ESTADO.borrador
  const isReady = ["listo", "volcado", "oficializado"].includes(estado)

  const save = async (markReady: boolean) => {
    if (markReady && (tractor === NONE || driver === NONE)) {
      toast.error("Asigná al menos un camión (tractor) y un chofer para marcar el viaje como listo.")
      return
    }
    setLoading(true)
    const patch: any = {
      tractor_id: toNull(tractor), semi_id: toNull(semi),
      driver_id: toNull(driver), driver2_id: toNull(driver2),
    }
    if (markReady) patch.estado = "listo"
    try {
      const { error } = await supabase.from("transport_trips").update(patch).eq("id", trip.id)
      if (error) throw error
      if (markReady) {
        setEstado("listo")
        await supabase.from("transport_trip_events").insert({
          user_id: userId, trip_id: trip.id, event_type: "validado", detail: {},
        })
      }
      toast.success(markReady ? "Viaje marcado como listo." : "Cambios guardados.")
      router.refresh()
    } catch {
      toast.error("No se pudo guardar.")
    } finally { setLoading(false) }
  }

  const reopen = async () => {
    setLoading(true)
    const { error } = await supabase.from("transport_trips").update({ estado: "borrador" }).eq("id", trip.id)
    if (error) { toast.error("No se pudo reabrir."); setLoading(false); return }
    setEstado("borrador"); toast.success("Viaje reabierto."); router.refresh(); setLoading(false)
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <Link href="/dashboard/transporte/viajes" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Volver a viajes
        </Link>
        <div className="flex items-center gap-3 mt-2 flex-wrap">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">{trip.mic_clave || permit?.permit_number || "Viaje en borrador"}</h2>
          <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border ${e.cls}`}>{e.label}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Resumen */}
        <div className="lg:col-span-2 bg-card rounded-3xl p-6 shadow-sm border border-border">
          <h3 className="font-bold mb-4 flex items-center gap-2"><FileText className="h-4 w-4" /> Datos del viaje</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-4">
            <Field label="Permiso" value={permit?.permit_number} />
            <Field label="Exportador" value={permit?.exporter_razon_social} />
            <Field label="País destino" value={permit?.pais_destino_code} />
            <Field label="Corredor" value={trip.corredor?.name} />
            <Field label="Cond. venta" value={permit?.cond_venta} />
            <Field label="FOB" value={permit?.fob_total != null ? `${permit.fob_divisa || ""} ${Number(permit.fob_total).toLocaleString("es-AR")}` : null} />
            <Field label="Peso bruto" value={permit?.peso_bruto != null ? `${Number(permit.peso_bruto).toLocaleString("es-AR")} kg` : null} />
            <Field label="Consolidado" value={trip.consolidado ? "Sí" : "No"} />
            <Field label="Creado" value={new Date(trip.created_at).toLocaleDateString("es-AR")} />
          </div>
          {crt?.descripcion_mercaderia && (
            <div className="mt-4 pt-4 border-t border-border/70">
              <p className="text-xs text-muted-foreground flex items-center gap-1.5 mb-1"><Package className="h-3.5 w-3.5" /> Mercadería</p>
              <p className="text-sm">{crt.descripcion_mercaderia}</p>
            </div>
          )}
        </div>

        {/* Asignación */}
        <div className="bg-card rounded-3xl p-6 shadow-sm border border-border">
          <h3 className="font-bold mb-4 flex items-center gap-2"><Truck className="h-4 w-4" /> Asignación</h3>
          <div className="space-y-4">
            <AssignSelect label="Tractor" icon={<Truck className="h-4 w-4" />} value={tractor} onChange={setTractor} options={tractores.map((v) => ({ id: v.id, label: v.patente }))} empty="Sin asignar" />
            <AssignSelect label="Semirremolque" icon={<Container className="h-4 w-4" />} value={semi} onChange={setSemi} options={semis.map((v) => ({ id: v.id, label: v.patente }))} empty="Sin asignar" />
            <AssignSelect label="Chofer" icon={<IdCard className="h-4 w-4" />} value={driver} onChange={setDriver} options={drivers.map((d) => ({ id: d.id, label: d.nombre }))} empty="Sin asignar" />
            <AssignSelect label="Chofer 2 (opcional)" icon={<IdCard className="h-4 w-4" />} value={driver2} onChange={setDriver2} options={drivers.map((d) => ({ id: d.id, label: d.nombre }))} empty="Ninguno" />
          </div>

          {(tractores.length === 0 || drivers.length === 0) && (
            <p className="mt-3 text-xs text-amber-600 flex items-start gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              Cargá tu <Link href="/dashboard/transporte/flota" className="underline">flota</Link> y <Link href="/dashboard/transporte/choferes" className="underline">choferes</Link> para asignarlos.
            </p>
          )}

          {!isReady ? (
            <div className="mt-5 space-y-2">
              <Button onClick={() => save(true)} disabled={loading} className="w-full rounded-xl bg-[#D1F366] text-[#1C1C28] font-bold hover:bg-[#B3D93C]">
                <CheckCircle2 className="h-4 w-4 mr-1.5" /> Marcar como listo
              </Button>
              <Button onClick={() => save(false)} disabled={loading} variant="outline" className="w-full rounded-xl">
                Guardar cambios
              </Button>
            </div>
          ) : (
            <div className="mt-5">
              <div className="rounded-2xl bg-emerald-50 border border-emerald-100 p-3 text-sm text-emerald-700 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" /> Viaje validado y listo para MALVINA.
              </div>
              <Button onClick={() => save(false)} disabled={loading} variant="ghost" size="sm" className="mt-2 w-full rounded-xl text-muted-foreground">
                <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Editar asignación
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* CTA MALVINA cuando está listo */}
      {isReady && (
        <div className="bg-[#1C1C28] text-white rounded-3xl p-6 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-2xl bg-primary/20 grid place-items-center"><Route className="h-6 w-6 text-primary" /></div>
            <div>
              <h3 className="font-bold text-lg">Pasar a MALVINA</h3>
              <p className="text-sm text-white/60">La extensión vuelca el viaje pestaña por pestaña. Vos revisás y oficializás.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={reopen} variant="ghost" disabled={loading} className="rounded-xl text-white/70 hover:text-white hover:bg-white/10">Reabrir</Button>
            <Button
              onClick={() => window.dispatchEvent(new CustomEvent("ucobot:malvina-volcar", { detail: { trip_id: trip.id } }))}
              className="rounded-xl bg-[#D1F366] text-[#1C1C28] font-bold hover:bg-[#B3D93C]"
            >
              <Send className="h-4 w-4 mr-1.5" /> Enviar a la extensión
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold mt-0.5 truncate">{value || "—"}</p>
    </div>
  )
}

function AssignSelect({ label, icon, value, onChange, options, empty }: {
  label: string; icon: React.ReactNode; value: string; onChange: (v: string) => void
  options: { id: string; label: string }[]; empty: string
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs flex items-center gap-1.5 text-muted-foreground">{icon} {label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="rounded-xl"><SelectValue placeholder={empty} /></SelectTrigger>
        <SelectContent>
          <SelectItem value="none">{empty}</SelectItem>
          {options.map((o) => <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  )
}
