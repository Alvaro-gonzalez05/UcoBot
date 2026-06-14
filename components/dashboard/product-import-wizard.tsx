"use client"

import { useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Sparkles, Upload, Loader2, FileText, ImageIcon, Trash2, CheckCircle2, ChevronLeft } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

interface DraftProduct {
  name: string
  description: string
  price: number
  category: string
  include: boolean
}

interface ProductImportWizardProps {
  onImported: () => void
}

const STEPS = ["Subir archivo", "Revisar", "Importar"]

export function ProductImportWizard({ onImported }: ProductImportWizardProps) {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState(0)
  const [extracting, setExtracting] = useState(false)
  const [importing, setImporting] = useState(false)
  const [drafts, setDrafts] = useState<DraftProduct[]>([])
  const [fileName, setFileName] = useState("")
  const fileInputRef = useRef<HTMLInputElement>(null)

  const reset = () => {
    setStep(0)
    setDrafts([])
    setFileName("")
    setExtracting(false)
    setImporting(false)
  }

  const handleOpenChange = (v: boolean) => {
    if (!v && !importing) reset()
    setOpen(v)
  }

  const handleFile = async (file: File | undefined) => {
    if (!file) return
    setFileName(file.name)
    setExtracting(true)
    try {
      const fd = new FormData()
      fd.append("file", file)
      const res = await fetch("/api/products/import", { method: "POST", body: fd })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || "No se pudo leer el archivo")
        setExtracting(false)
        return
      }
      if (!json.products || json.products.length === 0) {
        toast.error("No se detectaron productos en el archivo")
        setExtracting(false)
        return
      }
      setDrafts(
        json.products.map((p: any) => ({
          name: p.name,
          description: p.description || "",
          price: p.price || 0,
          category: p.category || "",
          include: true,
        }))
      )
      toast.success(`${json.products.length} productos detectados`)
      setStep(1)
    } catch {
      toast.error("Error de red al procesar el archivo")
    } finally {
      setExtracting(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  const updateDraft = (i: number, patch: Partial<DraftProduct>) => {
    setDrafts((prev) => prev.map((d, idx) => (idx === i ? { ...d, ...patch } : d)))
  }

  const includedCount = drafts.filter((d) => d.include).length

  const handleImport = async () => {
    const toImport = drafts.filter((d) => d.include && d.name.trim())
    if (toImport.length === 0) {
      toast.error("Seleccioná al menos un producto")
      return
    }
    setImporting(true)
    try {
      const res = await fetch("/api/products/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          products: toImport.map((d) => ({
            name: d.name.trim(),
            description: d.description.trim(),
            price: d.price,
            category: d.category.trim(),
            is_available: true,
          })),
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || "No se pudieron importar los productos")
        setImporting(false)
        return
      }
      toast.success(`${json.imported} productos agregados a tu catálogo`)
      onImported()
      handleOpenChange(false)
    } catch {
      toast.error("Error de red al importar")
      setImporting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Sparkles className="h-4 w-4 text-[#D1F366]" />
          <span className="hidden sm:inline">Importar con IA</span>
          <span className="sm:hidden">Importar</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar catálogo con IA</DialogTitle>
          <DialogDescription>
            Subí el PDF o la foto de tu menú y la IA carga los productos con nombre, descripción y precio.
          </DialogDescription>
        </DialogHeader>

        {/* Stepper */}
        <div className="flex items-center gap-2 mb-1">
          {STEPS.map((label, i) => (
            <div key={label} className="flex items-center gap-2 flex-1">
              <div
                className={cn(
                  "w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-black flex-shrink-0",
                  i < step ? "bg-[#D1F366] text-[#1C1C28]"
                    : i === step ? "bg-[#1C1C28] text-[#D1F366] dark:bg-[#D1F366] dark:text-[#1C1C28]"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {i < step ? "✓" : i + 1}
              </div>
              <span className={cn("text-xs font-semibold hidden sm:block", i === step ? "" : "text-muted-foreground")}>
                {label}
              </span>
              {i < STEPS.length - 1 && <div className="flex-1 h-px bg-border" />}
            </div>
          ))}
        </div>

        {/* Paso 1: subir */}
        {step === 0 && (
          <div className="space-y-4">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={extracting}
              className="w-full rounded-2xl border-2 border-dashed border-[#D1F366]/40 hover:border-[#D1F366] bg-[#D1F366]/[0.03] hover:bg-[#D1F366]/[0.08] transition-colors p-10 flex flex-col items-center gap-3 text-center disabled:opacity-60"
            >
              {extracting ? (
                <>
                  <Loader2 className="w-9 h-9 animate-spin text-[#D1F366]" />
                  <p className="text-sm font-bold">Leyendo tu catálogo con IA…</p>
                  <p className="text-xs text-muted-foreground">{fileName}</p>
                </>
              ) : (
                <>
                  <div className="flex gap-2">
                    <FileText className="w-8 h-8 text-[#D1F366]" />
                    <ImageIcon className="w-8 h-8 text-[#D1F366]" />
                  </div>
                  <p className="text-sm font-bold">Tocá para elegir un PDF o una imagen</p>
                  <p className="text-xs text-muted-foreground">
                    Menú, carta o lista de precios · PDF, JPG, PNG o WebP (máx. 15MB)
                  </p>
                </>
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
            <div className="rounded-xl bg-muted/40 border border-border/50 p-3 text-xs text-muted-foreground">
              <p className="font-semibold text-foreground mb-1">Consejos para mejores resultados:</p>
              <p>• Que el texto y los precios se lean nítidos.</p>
              <p>• Si tu menú tiene varias páginas, mejor un PDF que varias fotos sueltas.</p>
              <p>• Después vas a poder revisar y corregir todo antes de guardar.</p>
            </div>
          </div>
        )}

        {/* Paso 2: revisar */}
        {step === 1 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Revisá, corregí y destildá lo que no quieras importar.
              </p>
              <span className="text-xs font-semibold">{includedCount} seleccionados</span>
            </div>

            <div className="space-y-2 max-h-[46vh] overflow-y-auto pr-1">
              {drafts.map((d, i) => (
                <div
                  key={i}
                  className={cn(
                    "rounded-xl border p-3 transition-opacity",
                    d.include ? "border-border bg-card" : "border-border/40 bg-muted/20 opacity-50"
                  )}
                >
                  <div className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={d.include}
                      onChange={(e) => updateDraft(i, { include: e.target.checked })}
                      className="mt-2.5 h-4 w-4 flex-shrink-0 accent-[#D1F366]"
                    />
                    <div className="flex-1 min-w-0 grid grid-cols-12 gap-2">
                      <Input
                        value={d.name}
                        onChange={(e) => updateDraft(i, { name: e.target.value })}
                        placeholder="Nombre"
                        className="col-span-12 sm:col-span-5 h-9 text-sm font-medium"
                      />
                      <Input
                        value={d.category}
                        onChange={(e) => updateDraft(i, { category: e.target.value })}
                        placeholder="Categoría"
                        className="col-span-7 sm:col-span-4 h-9 text-sm"
                      />
                      <div className="col-span-5 sm:col-span-3 relative">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
                        <Input
                          type="number"
                          value={String(d.price)}
                          onChange={(e) => updateDraft(i, { price: parseFloat(e.target.value) || 0 })}
                          placeholder="0"
                          className="h-9 text-sm pl-5"
                        />
                      </div>
                      <Input
                        value={d.description}
                        onChange={(e) => updateDraft(i, { description: e.target.value })}
                        placeholder="Descripción (opcional)"
                        className="col-span-12 h-9 text-xs text-muted-foreground"
                      />
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 flex-shrink-0 text-muted-foreground hover:text-red-500"
                      onClick={() => setDrafts((prev) => prev.filter((_, idx) => idx !== i))}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between pt-1">
              <Button variant="ghost" size="sm" className="gap-1 text-xs" onClick={() => setStep(0)}>
                <ChevronLeft className="w-4 h-4" />
                Otro archivo
              </Button>
              <Button
                onClick={handleImport}
                disabled={importing || includedCount === 0}
                className="gap-2 bg-[#D1F366] text-[#1C1C28] hover:bg-[#B3D93C] font-bold"
              >
                {importing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Importando…
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    Importar {includedCount} producto{includedCount === 1 ? "" : "s"}
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
