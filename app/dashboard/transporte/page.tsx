import Link from "next/link"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { Card } from "@/components/ui/card"
import {
  Upload, Truck, FileText, Wrench, Users, AlertTriangle,
  ArrowRight, Route, Clock, CheckCircle2,
} from "lucide-react"
import { TripsChart } from "@/components/dashboard/transporte/trips-chart"

export const dynamic = "force-dynamic"

function startOfMonth() {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString()
}

const ESTADO_LABEL: Record<string, { label: string; cls: string }> = {
  borrador: { label: "Borrador", cls: "bg-muted text-muted-foreground" },
  listo: { label: "Listo", cls: "bg-blue-100 text-blue-700" },
  volcado: { label: "Volcado", cls: "bg-amber-100 text-amber-700" },
  oficializado: { label: "Oficializado", cls: "bg-emerald-100 text-emerald-700" },
  anulado: { label: "Anulado", cls: "bg-red-100 text-red-700" },
}

export default async function TransporteHome() {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) redirect("/login")

  const { data: profile } = await supabase
    .from("user_profiles").select("full_name, business_name, vertical").eq("id", auth.user.id).single()
  if (profile?.vertical !== "transporte") redirect("/dashboard")

  const in30 = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const today = new Date().toISOString().slice(0, 10)

  const [
    tripsTotal, tripsMonth, permitsTotal, vehicles, drivers, expiring, recent, last6m,
  ] = await Promise.all([
    supabase.from("transport_trips").select("*", { count: "exact", head: true }),
    supabase.from("transport_trips").select("*", { count: "exact", head: true }).gte("created_at", startOfMonth()),
    supabase.from("transport_shipping_permits").select("*", { count: "exact", head: true }),
    supabase.from("transport_vehicles").select("*", { count: "exact", head: true }).eq("is_active", true),
    supabase.from("transport_drivers").select("*", { count: "exact", head: true }).eq("is_active", true),
    supabase.from("transport_vehicles").select("id, patente, poliza_vencimiento")
      .not("poliza_vencimiento", "is", null).gte("poliza_vencimiento", today).lte("poliza_vencimiento", in30)
      .order("poliza_vencimiento", { ascending: true }),
    supabase.from("transport_trips").select("id, estado, mic_clave, consolidado, created_at")
      .order("created_at", { ascending: false }).limit(6),
    supabase.from("transport_trips").select("created_at")
      .gte("created_at", new Date(Date.now() - 183 * 24 * 60 * 60 * 1000).toISOString()),
  ])

  // bucket por mes (últimos 6)
  const months: { label: string; key: string; value: number }[] = []
  const fmt = new Intl.DateTimeFormat("es-AR", { month: "short" })
  for (let i = 5; i >= 0; i--) {
    const d = new Date(); d.setMonth(d.getMonth() - i)
    months.push({ label: fmt.format(d), key: `${d.getFullYear()}-${d.getMonth()}`, value: 0 })
  }
  ;(last6m.data || []).forEach((t: any) => {
    const d = new Date(t.created_at); const k = `${d.getFullYear()}-${d.getMonth()}`
    const m = months.find((x) => x.key === k); if (m) m.value++
  })

  const expiringList = expiring.data || []
  const recentList = recent.data || []
  const firstName = (profile?.full_name || profile?.business_name || "").split(" ")[0]

  const metrics = [
    { icon: Truck, label: "Viajes este mes", value: tripsMonth.count ?? 0, sub: `${tripsTotal.count ?? 0} en total`, accent: true },
    { icon: FileText, label: "Permisos procesados", value: permitsTotal.count ?? 0, sub: "con extracción IA" },
    { icon: Wrench, label: "Flota activa", value: vehicles.count ?? 0, sub: "vehículos" },
    { icon: Users, label: "Choferes", value: drivers.count ?? 0, sub: "activos" },
  ]

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            Hola{firstName ? `, ${firstName}` : ""} 👋
          </h1>
          <p className="text-muted-foreground mt-1">Resumen de tu operación de transporte internacional.</p>
        </div>
        <Link
          href="/dashboard/transporte/cargar-viaje"
          className="inline-flex items-center gap-2 rounded-2xl bg-primary text-primary-foreground font-semibold px-5 py-3 shadow-lg shadow-primary/20 hover:brightness-105 active:scale-95 transition"
        >
          <Upload className="h-5 w-5" /> Cargar viaje
        </Link>
      </div>

      {/* Bento grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {metrics.map((m) => (
          <Card key={m.label} className="p-5 rounded-2xl border-border/70 card-elevated">
            <div className="flex items-center justify-between">
              <div className={`h-10 w-10 rounded-xl grid place-items-center ${m.accent ? "bg-primary/20 text-foreground" : "bg-muted text-muted-foreground"}`}>
                <m.icon className="h-5 w-5" />
              </div>
            </div>
            <div className="mt-4 text-3xl font-bold tabular-nums">{m.value}</div>
            <div className="text-sm font-medium mt-0.5">{m.label}</div>
            <div className="text-xs text-muted-foreground">{m.sub}</div>
          </Card>
        ))}
      </div>

      {/* Fila: gráfico + CTA hero */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 p-5 rounded-2xl border-border/70 card-elevated">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold">Viajes por mes</h3>
              <p className="text-sm text-muted-foreground">Últimos 6 meses</p>
            </div>
          </div>
          {(tripsTotal.count ?? 0) === 0 ? (
            <div className="h-56 grid place-items-center text-center">
              <div>
                <Route className="h-8 w-8 mx-auto text-muted-foreground/50" />
                <p className="mt-2 text-sm text-muted-foreground">Todavía no hay viajes cargados.</p>
                <Link href="/dashboard/transporte/cargar-viaje" className="text-sm font-semibold text-foreground underline underline-offset-4">
                  Cargá el primero
                </Link>
              </div>
            </div>
          ) : (
            <TripsChart data={months} />
          )}
        </Card>

        {/* CTA hero (dark, marca) */}
        <Link
          href="/dashboard/transporte/cargar-viaje"
          className="group relative overflow-hidden rounded-2xl bg-[#1C1C28] text-white p-6 flex flex-col justify-between shadow-xl"
        >
          <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-primary/20 blur-2xl" />
          <div className="relative">
            <div className="h-11 w-11 rounded-xl bg-primary/20 grid place-items-center">
              <Upload className="h-6 w-6 text-primary" />
            </div>
            <h3 className="mt-4 text-lg font-bold leading-snug">Armar un viaje nuevo</h3>
            <p className="mt-1 text-sm text-white/70">
              Subí el permiso de embarque (y la factura si el cliente es nuevo) y generamos el MIC/DTA y los CRT solos.
            </p>
          </div>
          <div className="relative mt-6 inline-flex items-center gap-2 font-semibold text-primary">
            Empezar <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition" />
          </div>
        </Link>
      </div>

      {/* Fila: vencimientos + actividad reciente */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Vencimientos */}
        <Card className="p-5 rounded-2xl border-border/70 card-elevated">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            <h3 className="font-semibold">Vencimientos próximos (30 días)</h3>
          </div>
          {expiringList.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              <CheckCircle2 className="h-7 w-7 mx-auto text-emerald-400" />
              <p className="mt-2">Sin pólizas por vencer. Todo en regla.</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {expiringList.map((v: any) => (
                <li key={v.id} className="flex items-center justify-between rounded-xl bg-amber-50 border border-amber-100 px-3 py-2">
                  <span className="text-sm font-medium">Patente {v.patente || "—"}</span>
                  <span className="text-xs text-amber-700">vence {v.poliza_vencimiento}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Actividad reciente */}
        <Card className="p-5 rounded-2xl border-border/70 card-elevated">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="h-5 w-5 text-muted-foreground" />
            <h3 className="font-semibold">Viajes recientes</h3>
          </div>
          {recentList.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              <Truck className="h-7 w-7 mx-auto text-muted-foreground/40" />
              <p className="mt-2">Acá vas a ver tus últimos viajes.</p>
            </div>
          ) : (
            <ul className="divide-y divide-border/70">
              {recentList.map((t: any) => {
                const e = ESTADO_LABEL[t.estado] || ESTADO_LABEL.borrador
                return (
                  <li key={t.id} className="flex items-center justify-between py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{t.mic_clave || "MIC/DTA sin oficializar"}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(t.created_at).toLocaleDateString("es-AR")}{t.consolidado ? " · consolidado" : ""}
                      </p>
                    </div>
                    <span className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full ${e.cls}`}>{e.label}</span>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}
