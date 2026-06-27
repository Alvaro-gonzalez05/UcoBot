"use client"

import { useRef, useState, useCallback } from "react"
import Link from "next/link"
import { Card } from "@/components/ui/card"
import {
  FileText, Receipt, UploadCloud, X, Sparkles, Loader2, CheckCircle2,
  ArrowRight, Truck, Package, Users, Route, AlertTriangle, FileCheck2,
} from "lucide-react"

type Status = "idle" | "processing" | "done" | "error"

interface TripSummary {
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
  warnings?: string[]
}

function Dropzone({
  id, file, onFile, onClear, title, subtitle, required, icon: Icon, tall,
}: {
  id: string
  file: File | null
  onFile: (f: File) => void
  onClear: () => void
  title: string
  subtitle: string
  required?: boolean
  icon: any
  tall?: boolean
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
      onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
      onDragLeave={() => setDrag(false)}
      onDrop={handleDrop}
      onClick={() => !file && inputRef.current?.click()}
      className={[
        "relative rounded-2xl border-2 border-dashed p-5 transition cursor-pointer select-none",
        tall ? "min-h-[260px]" : "min-h-[150px]",
        drag ? "border-primary bg-primary/10" : file ? "border-emerald-300 bg-emerald-50/60" : "border-border hover:border-primary/60 hover:bg-muted/40",
      ].join(" ")}
    >
      <input ref={inputRef} type="file" accept="application/pdf" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f) }} />

      <div className="flex items-start justify-between">
        <span className={`h-11 w-11 rounded-xl grid place-items-center ${file ? "bg-emerald-100 text-emerald-600" : "bg-muted text-muted-foreground"}`}>
          {file ? <FileCheck2 className="h-6 w-6" /> : <Icon className="h-6 w-6" />}
        </span>
        {required
          ? <span className="text-[10px] font-bold uppercase tracking-wide text-primary-foreground bg-primary rounded-full px-2 py-0.5">Requerido</span>
          : <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground bg-muted rounded-full px-2 py-0.5">Opcional</span>}
      </div>

      {!file ? (
        <div className="mt-4">
          <h3 className="font-semibold">{title}</h3>
          <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>
          <div className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-foreground">
            <UploadCloud className="h-4 w-4" /> Arrastrá el PDF o hacé clic
          </div>
        </div>
      ) : (
        <div className="mt-4">
          <h3 className="font-semibold">{title}</h3>
          <div className="mt-3 flex items-center gap-3 rounded-xl bg-white border border-border px-3 py-2">
            <FileText className="h-5 w-5 text-emerald-600 shrink-0" />
            <span className="text-sm font-medium truncate flex-1">{file.name}</span>
            <button
              onClick={(e) => { e.stopPropagation(); onClear() }}
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

export function CargarViajeBento() {
  const [permiso, setPermiso] = useState<File | null>(null)
  const [factura, setFactura] = useState<File | null>(null)
  const [status, setStatus] = useState<Status>("idle")
  const [result, setResult] = useState<TripSummary | null>(null)
  const [error, setError] = useState<string | null>(null)

  const generar = async () => {
    if (!permiso) return
    setStatus("processing"); setError(null); setResult(null)
    try {
      const fd = new FormData()
      fd.append("permiso", permiso)
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

  const reset = () => { setPermiso(null); setFactura(null); setResult(null); setStatus("idle"); setError(null) }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <nav className="text-sm text-muted-foreground">
          <Link href="/dashboard/transporte" className="hover:text-foreground">Inicio</Link>
          <span className="mx-1.5">/</span><span className="text-foreground font-medium">Cargar viaje</span>
        </nav>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mt-1">Cargar viaje</h1>
        <p className="text-muted-foreground mt-1">
          Subí el <strong className="text-foreground">permiso de embarque</strong> y, si el cliente del exterior es nuevo, la <strong className="text-foreground">factura comercial</strong>. Armamos el viaje solo.
        </p>
      </div>

      {/* BENTO GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Permiso — grande, izquierda */}
        <div className="lg:col-span-2">
          <Dropzone
            id="permiso" file={permiso} onFile={setPermiso} onClear={() => setPermiso(null)}
            title="Permiso de embarque" subtitle="OM-1993 SIM. De acá sale todo el lado comercial y de la carga."
            required icon={FileText} tall
          />
        </div>

        {/* Columna derecha: factura + qué extrae */}
        <div className="flex flex-col gap-4">
          <Dropzone
            id="factura" file={factura} onFile={setFactura} onClear={() => setFactura(null)}
            title="Factura comercial" subtitle="Solo si el cliente del exterior es nuevo."
            icon={Receipt}
          />
          <Card className="p-5 rounded-2xl border-border/70 flex-1">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <h3 className="font-semibold text-sm">Qué hacemos por vos</h3>
            </div>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li className="flex gap-2"><Package className="h-4 w-4 mt-0.5 text-foreground/70 shrink-0" /> Extraemos mercadería, pesos, NCM y FOB</li>
              <li className="flex gap-2"><Users className="h-4 w-4 mt-0.5 text-foreground/70 shrink-0" /> Macheamos o creamos el cliente</li>
              <li className="flex gap-2"><Route className="h-4 w-4 mt-0.5 text-foreground/70 shrink-0" /> Inferimos el corredor y armamos el/los CRT</li>
              <li className="flex gap-2"><CheckCircle2 className="h-4 w-4 mt-0.5 text-foreground/70 shrink-0" /> Validamos todo antes del MALVINA</li>
            </ul>
          </Card>
        </div>
      </div>

      {/* Barra de acción */}
      {status !== "done" && (
        <Card className="p-5 rounded-2xl border-border/70 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className={`h-2.5 w-2.5 rounded-full ${permiso ? "bg-emerald-500" : "bg-muted-foreground/40"}`} />
            <p className="text-sm text-muted-foreground">
              {permiso ? "Listo para generar el viaje." : "Subí el permiso de embarque para continuar."}
            </p>
          </div>
          <button
            onClick={generar}
            disabled={!permiso || status === "processing"}
            className="inline-flex items-center gap-2 rounded-2xl bg-primary text-primary-foreground font-semibold px-6 py-3 shadow-lg shadow-primary/20 hover:brightness-105 active:scale-95 transition disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
          >
            {status === "processing"
              ? <><Loader2 className="h-5 w-5 animate-spin" /> Procesando…</>
              : <><Sparkles className="h-5 w-5" /> Generar viaje</>}
          </button>
        </Card>
      )}

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" /> {error}
        </div>
      )}

      {/* RESULTADO */}
      {status === "done" && result && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-emerald-600">
            <CheckCircle2 className="h-5 w-5" />
            <h2 className="font-bold text-lg">Viaje armado y validado</h2>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-2 p-5 rounded-2xl border-border/70">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-4">
                <Field label="Permiso" value={result.permit_number} />
                <Field label="Exportador" value={result.exporter} />
                <Field label="País destino" value={result.pais_destino} />
                <Field label="Corredor" value={result.corredor} />
                <Field label="Ítems" value={result.items != null ? String(result.items) : undefined} />
                <Field label="Peso bruto" value={result.peso_bruto != null ? `${result.peso_bruto} kg` : undefined} />
                <Field label="FOB" value={result.fob != null ? `${result.fob}` : undefined} />
                <Field label="Cond. venta" value={result.cond_venta} />
                <Field label="CRT generados" value={result.crts != null ? String(result.crts) : undefined} />
              </div>

              <div className="mt-5 pt-4 border-t border-border/70 flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Consignatario:</span>
                <span className="text-sm font-medium">{result.consignatario || "—"}</span>
                {result.client_status === "nuevo" && <span className="text-[10px] font-bold uppercase bg-blue-100 text-blue-700 rounded-full px-2 py-0.5">cliente nuevo — creado</span>}
                {result.client_status === "existente" && <span className="text-[10px] font-bold uppercase bg-emerald-100 text-emerald-700 rounded-full px-2 py-0.5">cliente existente</span>}
                {result.client_status === "pendiente" && <span className="text-[10px] font-bold uppercase bg-amber-100 text-amber-700 rounded-full px-2 py-0.5">subí la factura</span>}
              </div>

              {result.warnings && result.warnings.length > 0 && (
                <div className="mt-4 rounded-xl bg-amber-50 border border-amber-100 p-3">
                  <p className="text-xs font-semibold text-amber-700 flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5" /> Revisar antes de oficializar</p>
                  <ul className="mt-1.5 text-xs text-amber-700 list-disc list-inside space-y-0.5">
                    {result.warnings.map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                </div>
              )}
            </Card>

            {/* CTA: pasar a MALVINA */}
            <Card className="p-6 rounded-2xl bg-[#1C1C28] text-white flex flex-col justify-between border-0">
              <div>
                <div className="h-11 w-11 rounded-xl bg-primary/20 grid place-items-center">
                  <Truck className="h-6 w-6 text-primary" />
                </div>
                <h3 className="mt-4 font-bold text-lg leading-snug">Pasar a MALVINA</h3>
                <p className="mt-1 text-sm text-white/70">
                  Abrí el MALVINA y la extensión vuelca el viaje pestaña por pestaña. Vos revisás y oficializás.
                </p>
              </div>
              <button
                onClick={() => window.dispatchEvent(new CustomEvent("ucobot:malvina-volcar", { detail: result }))}
                className="mt-6 inline-flex items-center justify-center gap-2 rounded-2xl bg-primary text-primary-foreground font-semibold px-5 py-3 hover:brightness-105 active:scale-95 transition"
              >
                Enviar a la extensión <ArrowRight className="h-4 w-4" />
              </button>
              <p className="mt-2 text-[11px] text-white/40 text-center">Requiere la extensión de Chrome instalada</p>
            </Card>
          </div>

          <button onClick={reset} className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-4">
            Cargar otro viaje
          </button>
        </div>
      )}
    </div>
  )
}

function Field({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold mt-0.5 truncate">{value || "—"}</p>
    </div>
  )
}
