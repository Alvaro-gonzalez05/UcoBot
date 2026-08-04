import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import Link from "next/link"
import {
  Activity,
  Database,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Plug,
  ArrowLeft,
  RefreshCw,
} from "lucide-react"
import { Button } from "@/components/ui/button"

/**
 * Salud del sistema.
 *
 * Nace de un problema real: dos tareas programadas (seguimientos y recordatorios
 * de reserva) estuvieron rotas sin que nadie se enterara, porque un cron que falla
 * no avisa — simplemente parece que "no había nada para enviar". Acá se ve.
 *
 * Los datos salen de la función admin_system_health(), que valida adentro que
 * quien llama sea admin.
 */

// Siempre fresco: mostrar métricas cacheadas sería peor que no mostrarlas.
export const dynamic = "force-dynamic"

/** Límite del plan de Supabase, si se configuró. Sin esto no se inventa una barra. */
const DB_LIMIT_MB = Number(process.env.SUPABASE_DB_LIMIT_MB) || null

function bytesToMb(bytes: number): number {
  return bytes / (1024 * 1024)
}

function hace(iso: string | null): string {
  if (!iso) return "nunca"
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return "recién"
  if (mins < 60) return `hace ${mins} min`
  const hs = Math.floor(mins / 60)
  if (hs < 24) return `hace ${hs} h`
  return `hace ${Math.floor(hs / 24)} d`
}

export default async function SaludPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: health, error } = await supabase.rpc("admin_system_health")

  // Fallos del bot: es lo que antes había que ir a buscar a los logs de Vercel.
  const { data: fallos } = await supabase
    .from("bot_failures")
    .select("id, reason, detail, user_message, created_at, user_id, conversation_id")
    .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
    .order("created_at", { ascending: false })
    .limit(30)

  // Nombre del negocio de cada fallo, para no mostrar solo un UUID.
  const userIds = Array.from(new Set((fallos || []).map((f: any) => f.user_id).filter(Boolean)))
  const { data: perfiles } = userIds.length
    ? await supabase.from("user_profiles").select("id, business_name").in("id", userIds)
    : { data: [] as any[] }
  const nombrePorUsuario = new Map((perfiles || []).map((p: any) => [p.id, p.business_name]))

  if (error) {
    return (
      <div className="flex flex-col gap-4">
        <Link href="/dashboard/admin" className="text-sm text-muted-foreground flex items-center gap-1">
          <ArrowLeft className="h-4 w-4" /> Volver al panel
        </Link>
        <div className="bg-card rounded-3xl p-6 border border-border">
          <p className="font-bold">No se pudo leer el estado del sistema</p>
          <p className="text-sm text-muted-foreground mt-1">{error.message}</p>
        </div>
      </div>
    )
  }

  const h = health as any
  const crons: any[] = h?.crons || []
  const tablas: any[] = h?.tablas || []
  const cola = h?.cola_whatsapp || {}
  const conns = h?.conexiones || {}

  const cronsConProblema = crons.filter(
    (c) => !c.activo || c.ultimo_estado === "failed" || (c.fallos_24h || 0) > 0
  )
  const dbMb = bytesToMb(Number(h?.base?.bytes || 0))
  const dbPct = DB_LIMIT_MB ? Math.min(100, (dbMb / DB_LIMIT_MB) * 100) : null
  const connPct = conns.maximo ? (conns.total / conns.maximo) * 100 : 0

  const todoBien = cronsConProblema.length === 0 && (cola.con_error || 0) === 0

  return (
    <div className="flex flex-col gap-6">
      <div className="px-1 pt-2 flex items-start justify-between gap-4">
        <div>
          <Link
            href="/dashboard/admin"
            className="text-sm text-muted-foreground flex items-center gap-1 mb-2 hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Panel
          </Link>
          <h2 className="text-3xl font-bold dark:text-white">Salud del sistema</h2>
          <p className="text-muted-foreground text-sm mt-1">
            Estado de la base, las tareas programadas y las colas.
          </p>
        </div>
        <Button variant="outline" size="sm" asChild className="gap-2 rounded-xl flex-shrink-0">
          <Link href="/dashboard/admin/salud">
            <RefreshCw className="h-3.5 w-3.5" /> Actualizar
          </Link>
        </Button>
      </div>

      {/* Semáforo general */}
      <div
        className={`rounded-3xl p-5 border flex items-center gap-4 ${
          todoBien
            ? "bg-emerald-50 border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-900"
            : "bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-900"
        }`}
      >
        <div
          className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 ${
            todoBien ? "bg-emerald-500/15 text-emerald-600" : "bg-amber-500/15 text-amber-600"
          }`}
        >
          {todoBien ? <CheckCircle2 className="h-6 w-6" /> : <AlertTriangle className="h-6 w-6" />}
        </div>
        <div>
          <p className="font-bold dark:text-white">
            {todoBien ? "Todo funcionando" : `${cronsConProblema.length} tarea(s) con problemas`}
          </p>
          <p className="text-sm text-muted-foreground">
            {todoBien
              ? "No hay tareas fallando ni elementos atascados en cola."
              : "Revisá el detalle abajo: una tarea que falla no avisa por sí sola."}
          </p>
        </div>
      </div>

      {/* Métricas rápidas */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-card rounded-3xl p-5 shadow-sm border border-border">
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <Database className="h-4 w-4" />
            <p className="text-xs font-semibold uppercase tracking-wide">Base de datos</p>
          </div>
          <p className="text-2xl font-bold dark:text-white">{h?.base?.pretty || "—"}</p>
          {dbPct !== null && (
            <>
              <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full ${dbPct > 80 ? "bg-red-500" : dbPct > 60 ? "bg-amber-500" : "bg-emerald-500"}`}
                  style={{ width: `${dbPct}%` }}
                />
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                {dbPct.toFixed(0)}% de {DB_LIMIT_MB} MB
              </p>
            </>
          )}
        </div>

        <div className="bg-card rounded-3xl p-5 shadow-sm border border-border">
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <Plug className="h-4 w-4" />
            <p className="text-xs font-semibold uppercase tracking-wide">Conexiones</p>
          </div>
          <p className="text-2xl font-bold dark:text-white">
            {conns.total ?? "—"}
            <span className="text-sm font-medium text-muted-foreground"> / {conns.maximo ?? "?"}</span>
          </p>
          <p className="text-[11px] text-muted-foreground mt-1">
            {conns.activas ?? 0} activas · {conns.inactivas ?? 0} en espera
            {connPct > 70 && " · saturándose"}
          </p>
        </div>

        <div className="bg-card rounded-3xl p-5 shadow-sm border border-border">
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <Clock className="h-4 w-4" />
            <p className="text-xs font-semibold uppercase tracking-wide">Tareas</p>
          </div>
          <p className="text-2xl font-bold dark:text-white">
            {crons.length - cronsConProblema.length}
            <span className="text-sm font-medium text-muted-foreground"> / {crons.length} OK</span>
          </p>
          <p className="text-[11px] text-muted-foreground mt-1">programadas en la base</p>
        </div>

        <div className="bg-card rounded-3xl p-5 shadow-sm border border-border">
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <Activity className="h-4 w-4" />
            <p className="text-xs font-semibold uppercase tracking-wide">Cola WhatsApp</p>
          </div>
          <p className="text-2xl font-bold dark:text-white">{cola.pendientes ?? 0}</p>
          <p className="text-[11px] text-muted-foreground mt-1">
            {(cola.con_error || 0) > 0 ? `${cola.con_error} con error · ` : ""}
            último {hace(cola.ultimo_ingreso)}
          </p>
        </div>
      </div>

      {/* Tareas programadas — el bloque importante */}
      <div className="bg-card rounded-3xl shadow-sm border border-border overflow-hidden">
        <div className="px-6 pt-5 pb-4 border-b border-border">
          <h3 className="font-bold text-base dark:text-white">Tareas programadas</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Si una falla, deja de ejecutarse en silencio: nada avisa salvo esta pantalla.
          </p>
        </div>
        <div className="divide-y divide-border">
          {crons.map((c) => {
            const falla = c.ultimo_estado === "failed" || (c.fallos_24h || 0) > 0 || !c.activo
            return (
              <div key={c.nombre} className="px-6 py-4 flex items-start gap-4">
                <div
                  className={`w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0 ${
                    !c.activo ? "bg-gray-400" : falla ? "bg-red-500" : "bg-emerald-500"
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold dark:text-white">{c.nombre}</p>
                    <code className="text-[10px] bg-muted rounded px-1.5 py-0.5 text-muted-foreground">
                      {c.frecuencia}
                    </code>
                    {!c.activo && (
                      <span className="text-[10px] font-bold text-gray-500 uppercase">pausada</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Última corrida {hace(c.ultima_corrida)} · {c.ultimo_estado || "sin datos"}
                    {(c.fallos_24h || 0) > 0 && (
                      <span className="text-red-500 font-semibold"> · {c.fallos_24h} fallos en 24 h</span>
                    )}
                  </p>
                  {falla && c.ultimo_mensaje && (
                    <p className="text-[11px] text-red-500 mt-1 break-words font-mono">
                      {c.ultimo_mensaje}
                    </p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Tablas más pesadas */}
      <div className="bg-card rounded-3xl shadow-sm border border-border overflow-hidden">
        <div className="px-6 pt-5 pb-4 border-b border-border">
          <h3 className="font-bold text-base dark:text-white">Tablas más pesadas</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Incluye índices. Sirve para saber qué está haciendo crecer la base antes de cambiar de plan.
          </p>
        </div>
        <div className="divide-y divide-border">
          {tablas.map((t) => (
            <div key={t.tabla} className="px-6 py-3 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate dark:text-white">{t.tabla}</p>
                <p className="text-[11px] text-muted-foreground">
                  ~{Number(t.filas_aprox || 0).toLocaleString("es-AR")} filas
                </p>
              </div>
              <p className="text-sm font-bold flex-shrink-0 dark:text-white">{t.peso}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Fallos del bot: el motivo técnico, sin tener que entrar a Vercel. */}
      <div className="bg-card rounded-3xl shadow-sm border border-border overflow-hidden">
        <div className="px-6 pt-5 pb-4 border-b border-border flex items-center justify-between gap-3">
          <div>
            <h3 className="font-bold text-base dark:text-white">Fallos del bot (7 días)</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Cada vez que un cliente recibió &quot;tengo problemas técnicos&quot;, con el motivo.
            </p>
          </div>
          {(fallos?.length || 0) > 0 && (
            <span className="flex-shrink-0 rounded-full bg-red-100 dark:bg-red-900/30 px-2.5 py-1 text-xs font-bold text-red-700 dark:text-red-400">
              {fallos!.length}
            </span>
          )}
        </div>
        <div className="divide-y divide-border">
          {fallos && fallos.length > 0 ? (
            fallos.map((f: any) => (
              <div key={f.id} className="px-6 py-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold dark:text-white">
                      {nombrePorUsuario.get(f.user_id) || "Cuenta desconocida"}
                      <span className="ml-2 rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-mono font-normal text-muted-foreground">
                        {f.reason}
                      </span>
                    </p>
                    {f.user_message && (
                      <p className="text-xs text-muted-foreground mt-1 truncate">
                        El cliente escribió: &quot;{f.user_message}&quot;
                      </p>
                    )}
                  </div>
                  <span className="text-[11px] text-muted-foreground flex-shrink-0 whitespace-nowrap">
                    {new Date(f.created_at).toLocaleString("es-AR", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                {f.detail && (
                  <pre className="mt-2 max-h-24 overflow-auto rounded-lg bg-muted/60 p-2 text-[11px] whitespace-pre-wrap break-words text-muted-foreground">
                    {f.detail}
                  </pre>
                )}
              </div>
            ))
          ) : (
            <div className="flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground">
              <CheckCircle2 className="h-7 w-7 opacity-30" />
              <p className="text-sm">Ningún fallo en los últimos 7 días.</p>
            </div>
          )}
        </div>
      </div>

      <p className="text-xs text-muted-foreground px-1">
        Generado {h?.generado_en ? new Date(h.generado_en).toLocaleString("es-AR") : "—"}
      </p>
    </div>
  )
}
