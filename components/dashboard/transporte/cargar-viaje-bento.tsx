"use client"

import { useRef, useState, useCallback, useEffect } from "react"
import Link from "next/link"
import {
  FileText, Receipt, UploadCloud, X, Sparkles, Loader2, CheckCircle2,
  ArrowRight, Truck, Package, Users, Route, AlertTriangle, FileCheck2,
} from "lucide-react"

type Status = "idle" | "processing" | "done" | "error"

const PROCESSING_STEPS = [
  "Leyendo el documento…",
  "Extrayendo mercadería y montos…",
  "Identificando el cliente del exterior…",
  "Infiriendo la ruta…",
  "Armando y validando el viaje…",
]

interface TripSummary {
  trip_id?: string
  permit_number?: string
  exporter?: string
  pais_destino?: string
  corredor?: string
  consignatario?: string
  client_status?: "existente" | "nuevo" | "pendiente"
  items?: number
  peso_bruto?: string | number
  fob?: string | number
  cond_venta?: string
  crts?: number
  consolidado?: boolean
  warnings?: string[]
}

/** Dropzone que acepta VARIOS permisos: subir 2+ = carga consolidada (automático). */
function PermisosDropzone({ files, onAdd, onRemove }: {
  files: File[]
  onAdd: (fs: File[]) => void
  onRemove: (i: number) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [drag, setDrag] = useState(false)
  const accept = (list: FileList | File[]) => {
    const pdfs = Array.from(list).filter((f) => f.type === "application/pdf")
    if (pdfs.length) onAdd(pdfs)
  }
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Subir permisos de embarque"
      onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); accept(e.dataTransfer.files) }}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); inputRef.current?.click() } }}
      className={[
        "relative rounded-2xl border-2 border-dashed p-6 cursor-pointer select-none min-h-[190px]",
        "transition-colors duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]",
        "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        drag ? "border-primary bg-primary/10" : files.length ? "border-emerald-300 bg-emerald-50/60" : "border-border hover:border-primary/60 hover:bg-muted/40",
      ].join(" ")}
    >
      <input ref={inputRef} type="file" accept="application/pdf" multiple className="hidden"
        onChange={(e) => { if (e.target.files) accept(e.target.files); e.target.value = "" }} />

      {files.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center h-full">
          <div className="w-14 h-14 rounded-2xl bg-muted text-muted-foreground grid place-items-center mb-3">
            <FileText className="h-7 w-7" />
          </div>
          <p className="text-sm font-semibold">
            Permiso de embarque
            <span className="ml-2 align-middle text-[10px] font-bold uppercase tracking-wide text-primary-foreground bg-primary rounded-full px-2 py-0.5">Requerido</span>
          </p>
          <p className="text-xs text-muted-foreground mt-1">Subí varios permisos si el camión lleva carga consolidada.</p>
          <p className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-foreground">
            <UploadCloud className="h-4 w-4" /> Arrastrá los PDF o hacé clic
          </p>
        </div>
      ) : (
        <div className="flex flex-col h-full">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2 text-emerald-600">
              <FileCheck2 className="h-5 w-5" />
              <p className="text-sm font-semibold">{files.length === 1 ? "Permiso de embarque" : `${files.length} permisos`}</p>
            </div>
            {files.length > 1 && (
              <span className="text-[10px] font-bold uppercase tracking-wide bg-blue-100 text-blue-700 rounded-full px-2 py-0.5">consolidado</span>
            )}
          </div>
          <div className="space-y-2">
            {files.map((f, i) => (
              <div key={`${f.name}-${i}`} className="flex items-center gap-3 rounded-xl bg-card border border-border px-3 py-2">
                <FileText className="h-4 w-4 text-emerald-600 shrink-0" />
                <span className="text-sm font-medium truncate flex-1">{f.name}</span>
                <span className="text-[11px] text-muted-foreground shrink-0">{(f.size / 1024).toFixed(0)} KB</span>
                <button
                  onClick={(e) => { e.stopPropagation(); onRemove(i) }}
                  aria-label={`Quitar ${f.name}`}
                  className="h-7 w-7 rounded-lg grid place-items-center text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-2 inline-flex items-center gap-1"><UploadCloud className="h-3.5 w-3.5" /> Podés agregar otro permiso (consolidado)</p>
        </div>
      )}
    </div>
  )
}

function Dropzone({
  file, onFile, onClear, title, subtitle, required, icon: Icon,
}: {
  file: File | null
  onFile: (f: File) => void
  onClear: () => void
  title: string
  subtitle: string
  required?: boolean
  icon: any
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [drag, setDrag] = useState(false)

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDrag(false)
    const f = e.dataTransfer.files?.[0]
    if (f && f.type === "application/pdf") onFile(f)
  }, [onFile])

  return (
    <div
      role="button"
      tabIndex={file ? -1 : 0}
      aria-label={`Subir ${title}`}
      onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
      onDragLeave={() => setDrag(false)}
      onDrop={handleDrop}
      onClick={() => !file && inputRef.current?.click()}
      onKeyDown={(e) => { if (!file && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); inputRef.current?.click() } }}
      className={[
        "relative rounded-2xl border-2 border-dashed p-6 cursor-pointer select-none min-h-[190px]",
        "transition-colors duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]",
        "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        drag ? "border-primary bg-primary/10" : file ? "border-emerald-300 bg-emerald-50/60" : "border-border hover:border-primary/60 hover:bg-muted/40",
      ].join(" ")}
    >
      <input ref={inputRef} type="file" accept="application/pdf" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f) }} />

      {!file ? (
        <div className="flex flex-col items-center justify-center text-center h-full">
          <div className="w-14 h-14 rounded-2xl bg-muted text-muted-foreground grid place-items-center mb-3 transition-transform duration-200 group-hover:scale-110">
            <Icon className="h-7 w-7" />
          </div>
          <p className="text-sm font-semibold">
            {title}
            {required
              ? <span className="ml-2 align-middle text-[10px] font-bold uppercase tracking-wide text-primary-foreground bg-primary rounded-full px-2 py-0.5">Requerido</span>
              : <span className="ml-2 align-middle text-[10px] font-bold uppercase tracking-wide text-muted-foreground bg-muted rounded-full px-2 py-0.5">Opcional</span>}
          </p>
          <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
          <p className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-foreground">
            <UploadCloud className="h-4 w-4" /> Arrastrá el PDF o hacé clic
          </p>
        </div>
      ) : (
        <div className="flex flex-col justify-center h-full">
          <div className="flex items-center gap-2 text-emerald-600 mb-3">
            <FileCheck2 className="h-5 w-5" />
            <p className="text-sm font-semibold">{title}</p>
          </div>
          <div className="flex items-center gap-3 rounded-xl bg-card border border-border px-3 py-2.5">
            <FileText className="h-5 w-5 text-emerald-600 shrink-0" />
            <span className="text-sm font-medium truncate flex-1">{file.name}</span>
            <button
              onClick={(e) => { e.stopPropagation(); onClear() }}
              aria-label="Quitar archivo"
              className="h-7 w-7 rounded-lg grid place-items-center text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">{(file.size / 1024).toFixed(0)} KB · PDF</p>
        </div>
      )}
    </div>
  )
}

/** Toggle visual (solo lectura): se enciende cuando el documento está cargado. */
function DocToggle({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      className={`relative inline-block w-12 h-6 rounded-full transition-colors duration-300 ${on ? "bg-primary" : "bg-white/15"}`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all duration-300 ${on ? "left-[26px]" : "left-0.5"}`}
      />
    </span>
  )
}

function StepBadge({ n }: { n: number }) {
  return (
    <div className="w-8 h-8 rounded-full bg-muted grid place-items-center font-bold text-sm shrink-0">{n}</div>
  )
}

function ExtractedField({ label, value }: { label: string; value?: string }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide ml-1">{label}</p>
      <div className="relative">
        <div className="w-full bg-muted/50 border border-border/60 rounded-xl px-4 py-2.5 pr-9 text-sm font-medium truncate">
          {value || "—"}
        </div>
        {value && <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-500" />}
      </div>
    </div>
  )
}

export function CargarViajeBento() {
  const [permisos, setPermisos] = useState<File[]>([])
  const [factura, setFactura] = useState<File | null>(null)
  const [status, setStatus] = useState<Status>("idle")
  const [result, setResult] = useState<TripSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [step, setStep] = useState(0)

  // Progreso "simulado" por pasos mientras la IA procesa (avanza y se queda en el último).
  useEffect(() => {
    if (status !== "processing") { setStep(0); return }
    setStep(0)
    const id = setInterval(() => {
      setStep((s) => Math.min(s + 1, PROCESSING_STEPS.length - 1))
    }, 1800)
    return () => clearInterval(id)
  }, [status])

  const generar = async () => {
    if (permisos.length === 0) return
    setStatus("processing"); setError(null); setResult(null)
    try {
      const fd = new FormData()
      permisos.forEach((p) => fd.append("permiso", p))
      if (factura) fd.append("factura", factura)
      const res = await fetch("/api/transporte/extraer", { method: "POST", body: fd })
      if (!res.ok) throw new Error("No se pudo procesar el documento")
      const data = await res.json()
      setResult(data.trip as TripSummary)
      setStatus("done")
    } catch (e: any) {
      setError(e?.message || "Error inesperado")
      setStatus("error")
    }
  }

  const reset = () => { setPermisos([]); setFactura(null); setResult(null); setStatus("idle"); setError(null) }

  const progressPct = Math.round(((step + 1) / PROCESSING_STEPS.length) * 100)

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <nav className="text-sm text-muted-foreground">
            <Link href="/dashboard/transporte" className="hover:text-foreground">Inicio</Link>
            <span className="mx-1.5">/</span><span className="text-foreground font-medium">Cargar viaje</span>
          </nav>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mt-1">Cargar viaje</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Subí los documentos y generamos el MIC/DTA y los CRT automáticamente con IA.
          </p>
        </div>
        <div className="px-4 py-1.5 bg-primary/10 rounded-full border border-primary/20 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
          <span className="text-xs font-bold text-[#7A9410]">Sistema IA activo</span>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
        {/* ── Columna principal ── */}
        <div className="xl:col-span-2 space-y-6">
          {/* Paso 1: Carga de documentos */}
          <div className="bg-card rounded-3xl p-6 sm:p-8 card-elevated border border-border/60">
            <div className="flex items-center gap-3 mb-6">
              <StepBadge n={1} />
              <h3 className="text-lg font-bold">Carga de documentos</h3>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <PermisosDropzone
                files={permisos}
                onAdd={(fs) => setPermisos((prev) => [...prev, ...fs])}
                onRemove={(i) => setPermisos((prev) => prev.filter((_, idx) => idx !== i))}
              />
              <Dropzone
                file={factura} onFile={setFactura} onClear={() => setFactura(null)}
                title="Factura o proforma" subtitle="Trae el consignatario. Solo si el cliente es nuevo."
                icon={Receipt}
              />
            </div>

            {/* Analizando con IA (inline) */}
            {status === "processing" && (
              <div className="mt-5 rounded-2xl bg-muted/40 p-4 flex items-center gap-4">
                <style>{`@keyframes ucoLoad{0%{transform:translateX(-110%)}100%{transform:translateX(360%)}}`}</style>
                <div className="w-11 h-11 rounded-xl bg-[#1C1C28] grid place-items-center shrink-0">
                  <Sparkles className="h-5 w-5 text-primary animate-pulse" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="text-sm font-bold truncate">{PROCESSING_STEPS[step]}</span>
                    <span className="text-xs font-mono text-muted-foreground shrink-0 ml-2">{progressPct}%</span>
                  </div>
                  <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                    <div className="h-full w-1/3 rounded-full bg-primary" style={{ animation: "ucoLoad 1.1s ease-in-out infinite" }} />
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1.5 truncate">
                    Extrayendo: exportador, consignatario, mercadería, pesos y valores…
                  </p>
                </div>
              </div>
            )}

          </div>

          {/* Paso 2: Información extraída */}
          {status === "done" && result && (
            <div className="bg-card rounded-3xl p-6 sm:p-8 card-elevated border border-border/60">
              <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
                <div className="flex items-center gap-3">
                  <StepBadge n={2} />
                  <h3 className="text-lg font-bold">Información extraída</h3>
                </div>
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-full px-3 py-1">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Viaje armado y validado
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <ExtractedField label="Permiso" value={result.permit_number} />
                <ExtractedField label="Exportador" value={result.exporter} />
                <ExtractedField label="País destino" value={result.pais_destino} />
                <ExtractedField label="Corredor" value={result.corredor} />
                <ExtractedField label="Peso bruto" value={result.peso_bruto != null ? `${result.peso_bruto} kg` : undefined} />
                <ExtractedField label="FOB" value={result.fob != null ? `${result.fob}` : undefined} />
                <ExtractedField label="Cond. venta" value={result.cond_venta} />
                <ExtractedField label="Ítems" value={result.items != null ? String(result.items) : undefined} />
                <ExtractedField label="CRT generados" value={result.crts != null ? String(result.crts) : undefined} />
              </div>

              <div className="mt-5 pt-4 border-t border-border/60 flex items-center gap-2 flex-wrap">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Consignatario:</span>
                <span className="text-sm font-semibold">{result.consignatario || "—"}</span>
                {result.client_status === "nuevo" && <span className="text-[10px] font-bold uppercase bg-blue-100 text-blue-700 rounded-full px-2 py-0.5">cliente nuevo · creado</span>}
                {result.client_status === "existente" && <span className="text-[10px] font-bold uppercase bg-emerald-100 text-emerald-700 rounded-full px-2 py-0.5">cliente existente</span>}
                {result.client_status === "pendiente" && <span className="text-[10px] font-bold uppercase bg-amber-100 text-amber-700 rounded-full px-2 py-0.5">subí la factura</span>}
              </div>

              {result.warnings && result.warnings.length > 0 && (
                <div className="mt-4 rounded-xl bg-amber-50 border border-amber-100 p-3.5">
                  <p className="text-xs font-semibold text-amber-700 flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5" /> Revisar antes de oficializar</p>
                  <ul className="mt-1.5 text-xs text-amber-700 list-disc list-inside space-y-0.5">
                    {result.warnings.map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                </div>
              )}

              <button onClick={reset} className="mt-4 text-sm text-muted-foreground hover:text-foreground underline underline-offset-4">
                Cargar otro viaje
              </button>
            </div>
          )}
        </div>

        {/* ── Columna derecha ── */}
        <div className="space-y-6">
          {/* Qué hacemos por vos — PRINCIPAL */}
          <div className="relative overflow-hidden bg-[#1C1C28] text-white rounded-3xl p-6 sm:p-8 shadow-lg">
            <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-primary/20 blur-2xl" />
            <div className="relative">
              <div className="w-11 h-11 rounded-xl bg-primary/20 grid place-items-center mb-4">
                <Sparkles className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-lg font-bold leading-snug">Qué hacemos por vos</h3>
              <p className="mt-1 text-sm text-white/60">Subís los documentos y la IA arma todo el viaje.</p>
              <ul className="mt-5 space-y-3.5 text-sm">
                <li className="flex gap-3">
                  <Package className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                  <span className="text-white/80">Extraemos mercadería, pesos, NCM y FOB</span>
                </li>
                <li className="flex gap-3">
                  <Users className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                  <span className="text-white/80">Macheamos o creamos el cliente del exterior</span>
                </li>
                <li className="flex gap-3">
                  <Route className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                  <span className="text-white/80">Inferimos el corredor y armamos el/los CRT</span>
                </li>
                <li className="flex gap-3">
                  <CheckCircle2 className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                  <span className="text-white/80">Validamos todo antes del MALVINA</span>
                </li>
              </ul>
            </div>
          </div>

          {/* Generación de documentos (estilo mockup: filas con toggle + botón grande) */}
          {status !== "done" && (
            <div className="bg-[#1C1C28] text-white rounded-3xl p-6 sm:p-8 shadow-lg">
              <h3 className="text-lg font-bold mb-6">Generación de documentos</h3>
              <div className="space-y-4 mb-8">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-white/70">
                    Permiso de embarque{permisos.length > 1 ? ` (${permisos.length})` : ""}
                  </span>
                  <DocToggle on={permisos.length > 0} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-white/70">Factura o proforma</span>
                  <DocToggle on={!!factura} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-white/70">Carga consolidada</span>
                  <DocToggle on={permisos.length > 1} />
                </div>
              </div>
              <button
                onClick={generar}
                disabled={permisos.length === 0 || status === "processing"}
                className="w-full py-4 bg-primary text-primary-foreground rounded-xl font-bold text-lg hover:brightness-105 transition-[transform,filter] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97] shadow-lg shadow-primary/20 flex items-center justify-center gap-2 outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-[#1C1C28] disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
              >
                {status === "processing"
                  ? <><Loader2 className="h-5 w-5 animate-spin" /> Generando…</>
                  : <><span>Generar viaje</span><ArrowRight className="h-5 w-5" /></>}
              </button>
              <p className="text-center text-xs text-white/40 mt-4">
                {permisos.length > 0
                  ? `El viaje se crea en estado "Borrador"${permisos.length > 1 ? ` con ${permisos.length} CRT (consolidado)` : ""}`
                  : "Subí el permiso de embarque para continuar"}
              </p>
              {error && (
                <div className="mt-4 rounded-xl bg-red-500/10 border border-red-400/20 px-4 py-3 text-sm text-red-300 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
                </div>
              )}
            </div>
          )}

          {/* Paso 3: Completar el viaje */}
          {status === "done" && result && (
            <div className="bg-card rounded-3xl p-6 sm:p-8 card-elevated border border-border/60">
              <div className="flex items-center gap-3 mb-4">
                <StepBadge n={3} />
                <h3 className="text-lg font-bold">Completar el viaje</h3>
              </div>
              <div className="flex items-start gap-3 rounded-2xl bg-muted/40 p-4 mb-5">
                <div className="w-11 h-11 rounded-xl bg-card border border-border grid place-items-center shrink-0">
                  <Truck className="h-5 w-5 text-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">
                  Asigná el camión y el chofer, marcá el viaje como listo y mandalo a la extensión de MALVINA.
                </p>
              </div>
              {result.trip_id ? (
                <Link
                  href={`/dashboard/transporte/viajes/${result.trip_id}`}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground font-bold text-base py-3.5 shadow-lg shadow-primary/20 transition-[transform,filter] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] hover:brightness-105 active:scale-[0.97]"
                >
                  Completar viaje <ArrowRight className="h-5 w-5" />
                </Link>
              ) : (
                <p className="text-sm text-muted-foreground text-center">El viaje se guardó como borrador.</p>
              )}
              <p className="text-center text-xs text-muted-foreground mt-3">Después se envía a MALVINA desde el viaje</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
