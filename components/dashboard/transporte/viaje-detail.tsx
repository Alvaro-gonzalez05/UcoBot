"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  ArrowLeft, Truck, Container, IdCard, FileText, CheckCircle2, Send, RotateCcw,
  Package, Building2, Route, AlertTriangle, Scissors,
} from "lucide-react"

interface PermitItem {
  id: string
  item_number: number | null
  descripcion: string | null
  cantidad: number | null
  kg_neto: number | null
  unidad: string | null
}

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

export function ViajeDetail({ userId, trip, vehicles, drivers, settings, permitItems = [], fracciones = [] }: {
  userId: string
  trip: any
  vehicles: { id: string; patente: string; kind: string; capacidad_traccion_ton?: number | null }[]
  drivers: { id: string; nombre: string }[]
  settings: any
  permitItems?: PermitItem[]
  fracciones?: any[]
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

  // ── Fraccionado: repartir la carga de este permiso entre camiones ──
  const [fracOpen, setFracOpen] = useState(false)
  const [fracQty, setFracQty] = useState<Record<string, string>>({})
  const [fracBultos, setFracBultos] = useState("")
  const [fracPeso, setFracPeso] = useState("")
  const [fracLoading, setFracLoading] = useState(false)

  const e = ESTADO[estado] || ESTADO.borrador
  const isReady = ["listo", "volcado", "oficializado"].includes(estado)
  const isFraccionado = !!crt?.fraccion || !!trip.fraccionado

  // Base para fraccionar: si este viaje ES el "resto" de una fracción anterior,
  // las cantidades disponibles son las restantes (guardadas en comentarios),
  // no las totales del permiso. Permite encadenar 3, 4, N camiones.
  const restanteBase: { id: string; descripcion: string | null; cantidad: number | null }[] | null =
    crt?.comentarios && Array.isArray(crt.comentarios.fraccion_restante) && crt.comentarios.fraccion_restante.length > 0
      ? crt.comentarios.fraccion_restante
      : null
  const fracItems: { id: string; descripcion: string | null; cantidad: number | null }[] =
    restanteBase ?? permitItems.map((it) => ({ id: it.id, descripcion: it.descripcion, cantidad: it.cantidad }))
  const puedeFraccionar =
    (!isFraccionado && permitItems.length > 0) ||
    (crt?.fraccion_tipo === "ultima" && !!restanteBase)

  // Sugerencia: la carga supera la capacidad del tractor asignado
  const tractorSel = vehicles.find((v) => v.id === (tractor === NONE ? null : tractor))
  const capacidadKg = tractorSel?.capacidad_traccion_ton != null ? Number(tractorSel.capacidad_traccion_ton) * 1000 : null
  const pesoCarga = crt?.peso_bruto != null ? Number(crt.peso_bruto) : null
  const sugerirFraccion = !isFraccionado && capacidadKg != null && pesoCarga != null && pesoCarga > capacidadKg

  const openFraccionar = () => {
    const init: Record<string, string> = {}
    fracItems.forEach((it) => { init[it.id] = it.cantidad != null ? String(it.cantidad) : "" })
    setFracQty(init); setFracBultos(""); setFracPeso(""); setFracOpen(true)
  }

  const buildDetalle = (bultos: string, rows: { cantidad: number; descripcion: string }[]) => {
    const header = bultos ? `${bultos} BULTOS DICIENDO CONTENER:` : "DICIENDO CONTENER:"
    return [header, ...rows.map((r) => `${r.cantidad.toLocaleString("es-AR")} ${r.descripcion}`)].join("\n").slice(0, 2000)
  }

  const guardarFraccion = async () => {
    const rows = fracItems.map((it) => ({
      item: it,
      enCamion: Math.max(0, Number(fracQty[it.id] || 0)),
      total: it.cantidad != null ? Number(it.cantidad) : 0,
    }))
    const cargados = rows.filter((r) => r.enCamion > 0)
    if (cargados.length === 0) { toast.error("Indicá qué cantidades van en este camión."); return }
    if (!fracBultos || Number(fracBultos) <= 0) { toast.error("Indicá los bultos de esta fracción."); return }

    setFracLoading(true)
    try {
      // ¿Es la primera vez que se fracciona, o estamos re-fraccionando el "resto"?
      const esRefraccion = !!crt?.fraccion
      const detalleTotal = crt.descripcion_fraccionados ?? crt.descripcion_mercaderia
      const pesoTotal = crt.peso_bruto_total ?? crt.peso_bruto

      const detalleFraccion = buildDetalle(fracBultos, cargados.map((r) => ({ cantidad: r.enCamion, descripcion: (r.item.descripcion || "").trim() })))
      const restantes = rows
        .filter((r) => r.total - r.enCamion > 0)
        .map((r) => ({ id: r.item.id, descripcion: r.item.descripcion, cantidad: r.total - r.enCamion }))

      // 1) Este viaje pasa a ser una fracción (primera, o intermedia si venía del resto)
      const { error: crtErr } = await supabase.from("transport_crts").update({
        fraccion: true,
        fraccion_tipo: esRefraccion ? (restantes.length > 0 ? "intermedia" : "ultima") : "primera",
        cantidad: Number(fracBultos),
        peso_bruto: fracPeso ? Number(fracPeso) : crt.peso_bruto,
        peso_bruto_total: pesoTotal,
        descripcion_fraccionados: detalleTotal,
        descripcion_mercaderia: detalleFraccion,
        comentarios: {}, // este camión ya tiene su parte asignada
      }).eq("id", crt.id)
      if (crtErr) throw crtErr
      await supabase.from("transport_trips").update({ fraccionado: true }).eq("id", trip.id)

      // 2) Crear el viaje con el RESTO (si queda carga sin asignar)
      if (restantes.length > 0) {
        const { data: nextTrip } = await supabase.from("transport_trips").insert({
          user_id: userId, corridor_id: trip.corridor_id ?? null,
          fecha_emision: new Date().toISOString().slice(0, 10),
          estado: "borrador", via_transporte: 4, fraccionado: true,
          metadata: { fraccion_de: trip.id },
        }).select("id").single()
        if (nextTrip?.id) {
          const detalleResto = buildDetalle("", restantes.map((r) => ({ cantidad: r.cantidad, descripcion: (r.descripcion || "").trim() })))
          await supabase.from("transport_crts").insert({
            user_id: userId, trip_id: nextTrip.id, permit_id: crt.permit_id,
            remitente_client_id: crt.remitente_client_id, consignatario_client_id: crt.consignatario_client_id,
            destinatario_client_id: crt.destinatario_client_id, destino_pais: crt.destino_pais,
            embalaje_code: crt.embalaje_code, cond_venta: crt.cond_venta, divisa: crt.divisa,
            fraccion: true, fraccion_tipo: "ultima",
            peso_bruto_total: pesoTotal,
            descripcion_fraccionados: detalleTotal,
            descripcion_mercaderia: detalleResto,
            // Guarda las cantidades restantes para poder volver a fraccionar (3+, N camiones)
            comentarios: { fraccion_restante: restantes },
          })
        }
      }

      await supabase.from("transport_trip_events").insert({
        user_id: userId, trip_id: trip.id, event_type: "fraccionado",
        detail: { bultos_fraccion: Number(fracBultos), con_resto: restantes.length > 0, refraccion: esRefraccion },
      })
      toast.success(restantes.length > 0
        ? "Fracción guardada. Se creó el viaje con el resto de la carga."
        : "Fracción guardada. La carga quedó completa.")
      setFracOpen(false); router.refresh()
    } catch {
      toast.error("No se pudo guardar la fracción.")
    } finally { setFracLoading(false) }
  }

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
          {trip.consolidado && <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-blue-100 text-blue-700 border border-blue-200">consolidado</span>}
          {isFraccionado && (
            <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-violet-100 text-violet-700 border border-violet-200">
              fraccionado{crt?.fraccion_tipo && crt.fraccion_tipo !== "none" ? ` · ${crt.fraccion_tipo} fracción` : ""}
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Resumen */}
        <div className="lg:col-span-2 bg-card rounded-3xl p-6 card-elevated border border-border/60">
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
              <p className="text-xs text-muted-foreground flex items-center gap-1.5 mb-1"><Package className="h-3.5 w-3.5" /> Detalle de la mercadería</p>
              <p className="text-sm whitespace-pre-line">{crt.descripcion_mercaderia}</p>
            </div>
          )}

          {/* Fraccionado: sugerencia + acción */}
          {sugerirFraccion && (
            <div className="mt-4 rounded-2xl bg-amber-50 border border-amber-100 p-3.5 text-sm text-amber-700 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>La carga ({pesoCarga?.toLocaleString("es-AR")} kg) supera la capacidad del tractor asignado ({capacidadKg?.toLocaleString("es-AR")} kg). Te conviene <strong>fraccionarla</strong> en más de un camión.</span>
            </div>
          )}
          {puedeFraccionar && (
            <Button onClick={openFraccionar} variant="outline" className="mt-4 rounded-xl">
              <Scissors className="h-4 w-4 mr-1.5" /> {restanteBase ? "Fraccionar de nuevo (no entra en un camión)" : "Fraccionar carga"}
            </Button>
          )}
        </div>

        {/* Asignación */}
        <div className="bg-card rounded-3xl p-6 card-elevated border border-border/60">
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

      {/* ── Fracciones de esta carga: un camión por card, asignable acá mismo ── */}
      {fracciones.length > 1 && (
        <div>
          <h3 className="font-bold text-lg mb-3 flex items-center gap-2">
            <Scissors className="h-5 w-5 text-violet-500" /> Fracciones de esta carga
            <span className="text-sm font-medium text-muted-foreground">({fracciones.length} camiones)</span>
          </h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {fracciones.map((f: any, i: number) => (
              <FraccionCard
                key={f.id}
                frac={f}
                numero={i + 1}
                esEste={f.trip?.id === trip.id}
                vehicles={vehicles}
                drivers={drivers}
              />
            ))}
          </div>
        </div>
      )}

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

      {/* ── Diálogo: fraccionar la carga ── */}
      <Dialog open={fracOpen} onOpenChange={setFracOpen}>
        <DialogContent className="p-0 border-0 overflow-hidden sm:max-w-2xl rounded-3xl max-h-[90vh] overflow-y-auto">
          <div className="bg-[#1C1C28] text-white px-6 py-5">
            <DialogHeader>
              <DialogTitle className="text-white flex items-center gap-2">
                <Scissors className="h-5 w-5 text-[#D1F366]" /> Fraccionar carga
              </DialogTitle>
              <DialogDescription className="text-white/60">
                Indicá qué cantidad de cada ítem va en ESTE camión. El resto se arma como otro viaje automáticamente.
              </DialogDescription>
            </DialogHeader>
          </div>
          <div className="px-6 pb-6 pt-5 space-y-4">
            <div className="rounded-2xl bg-muted/40 p-4 space-y-2">
              <div className="grid grid-cols-[1fr_90px_110px] gap-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground px-1">
                <span>Ítem</span><span className="text-right">Total</span><span className="text-right">En este camión</span>
              </div>
              {fracItems.map((it) => (
                <div key={it.id} className="grid grid-cols-[1fr_90px_110px] gap-2 items-center bg-card border border-border rounded-xl px-3 py-2">
                  <span className="text-sm truncate" title={it.descripcion || ""}>{it.descripcion || "Ítem"}</span>
                  <span className="text-sm text-muted-foreground text-right tabular-nums">{it.cantidad != null ? Number(it.cantidad).toLocaleString("es-AR") : "—"}</span>
                  <Input
                    type="number" min={0} max={it.cantidad ?? undefined}
                    value={fracQty[it.id] ?? ""}
                    onChange={(ev) => setFracQty((p) => ({ ...p, [it.id]: ev.target.value }))}
                    className="rounded-lg h-9 text-right"
                  />
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="frac-bultos" className="text-xs">Bultos de esta fracción *</Label>
                <Input id="frac-bultos" type="number" min={1} value={fracBultos} onChange={(ev) => setFracBultos(ev.target.value)} placeholder="19" className="rounded-xl" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="frac-peso" className="text-xs">Peso bruto de la fracción (kg)</Label>
                <Input id="frac-peso" type="number" min={0} step="0.01" value={fracPeso} onChange={(ev) => setFracPeso(ev.target.value)} placeholder="Opcional" className="rounded-xl" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Este viaje queda como <strong>primera fracción</strong> y el detalle se genera con el formato "N BULTOS DICIENDO CONTENER…". Si queda carga sin asignar, se crea otro viaje (última fracción) con el resto.
            </p>
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" className="rounded-xl" onClick={() => setFracOpen(false)}>Cancelar</Button>
              <Button onClick={guardarFraccion} disabled={fracLoading} className="rounded-xl bg-[#D1F366] text-[#1C1C28] font-bold hover:bg-[#B3D93C]">
                {fracLoading ? "Guardando…" : "Guardar fracción"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
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

function FraccionCard({ frac, numero, esEste, vehicles, drivers }: {
  frac: any
  numero: number
  esEste: boolean
  vehicles: { id: string; patente: string; kind: string }[]
  drivers: { id: string; nombre: string }[]
}) {
  const supabase = createClient()
  const router = useRouter()
  const t = frac.trip || {}
  const [tractor, setTractor] = useState(sel(t.tractor_id))
  const [semi, setSemi] = useState(sel(t.semi_id))
  const [driver, setDriver] = useState(sel(t.driver_id))
  const [saving, setSaving] = useState(false)

  const est = ESTADO[t.estado] || ESTADO.borrador
  const tractores = vehicles.filter((v) => v.kind === "tractor")
  const semis = vehicles.filter((v) => v.kind === "semirremolque")
  const tipo = frac.fraccion_tipo && frac.fraccion_tipo !== "none" ? frac.fraccion_tipo : null

  const guardar = async () => {
    setSaving(true)
    const { error } = await supabase.from("transport_trips").update({
      tractor_id: toNull(tractor), semi_id: toNull(semi), driver_id: toNull(driver),
    }).eq("id", t.id)
    setSaving(false)
    if (error) return toast.error("No se pudo guardar.")
    toast.success(`Fracción ${numero} actualizada.`)
    router.refresh()
  }

  return (
    <div className={`bg-card rounded-3xl p-5 card-elevated border ${esEste ? "border-primary" : "border-border/60"}`}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center justify-center h-8 px-3 rounded-xl bg-violet-100 text-violet-700 font-bold text-sm">
            Fracción {numero}
          </span>
          {tipo && <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{tipo}</span>}
          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${est.cls}`}>{est.label}</span>
          {esEste && <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-primary/20 text-foreground">este viaje</span>}
        </div>
        {!esEste && (
          <Link href={`/dashboard/transporte/viajes/${t.id}`} className="text-xs font-semibold text-muted-foreground hover:text-foreground underline underline-offset-4">
            Abrir viaje
          </Link>
        )}
      </div>

      <p className="mt-3 text-sm text-muted-foreground">
        {frac.cantidad != null ? `${Number(frac.cantidad).toLocaleString("es-AR")} bultos` : "Bultos a definir"}
        {frac.peso_bruto != null ? ` · ${Number(frac.peso_bruto).toLocaleString("es-AR")} kg` : ""}
      </p>
      {frac.descripcion_mercaderia && (
        <p className="mt-1.5 text-xs text-muted-foreground whitespace-pre-line line-clamp-4">{frac.descripcion_mercaderia}</p>
      )}

      {esEste ? (
        <p className="mt-4 pt-3 border-t border-border/60 text-xs text-muted-foreground">
          El camión y el chofer de esta fracción se asignan en el panel de arriba.
        </p>
      ) : (
        <div className="mt-4 pt-4 border-t border-border/60">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <AssignSelect label="Tractor" icon={<Truck className="h-4 w-4" />} value={tractor} onChange={setTractor} options={tractores.map((v) => ({ id: v.id, label: v.patente }))} empty="Sin asignar" />
            <AssignSelect label="Semi" icon={<Container className="h-4 w-4" />} value={semi} onChange={setSemi} options={semis.map((v) => ({ id: v.id, label: v.patente }))} empty="Sin asignar" />
            <AssignSelect label="Chofer" icon={<IdCard className="h-4 w-4" />} value={driver} onChange={setDriver} options={drivers.map((d) => ({ id: d.id, label: d.nombre }))} empty="Sin asignar" />
          </div>
          <Button onClick={guardar} disabled={saving} size="sm" className="mt-3 rounded-xl bg-[#D1F366] text-[#1C1C28] font-bold hover:bg-[#B3D93C]">
            {saving ? "Guardando…" : `Guardar fracción ${numero}`}
          </Button>
        </div>
      )}
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
