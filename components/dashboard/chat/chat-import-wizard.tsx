"use client"

import { useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Loader2, Upload, FileText, CheckCircle2, AlertCircle, ChevronRight, ChevronLeft, X } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import {
  parseWhatsAppExport,
  looksLikePhone,
  normalizePhone,
  type ParsedChat,
} from "@/lib/whatsapp-chat-parser"

interface ChatImportWizardProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImported: () => void
}

interface ChatDraft {
  parsed: ParsedChat
  clientName: string
  clientPhone: string
  clientParticipant: string // qué participante del chat es el cliente
}

interface ImportResult {
  client_name: string
  messages_imported: number
  client_created: boolean
  error?: string
}

const STEPS = ["Subir archivos", "Revisar datos", "Importar"]

export function ChatImportWizard({ open, onOpenChange, onImported }: ChatImportWizardProps) {
  const [step, setStep] = useState(0)
  const [drafts, setDrafts] = useState<ChatDraft[]>([])
  const [isParsing, setIsParsing] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [results, setResults] = useState<ImportResult[] | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const reset = () => {
    setStep(0)
    setDrafts([])
    setResults(null)
    setIsImporting(false)
  }

  const handleClose = (value: boolean) => {
    if (!value && !isImporting) reset()
    onOpenChange(value)
  }

  // ── Paso 1: leer y parsear archivos ──────────────────────────────────────
  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setIsParsing(true)

    const newDrafts: ChatDraft[] = []
    for (const file of Array.from(files)) {
      if (!file.name.toLowerCase().endsWith(".txt")) {
        toast.error(`"${file.name}" no es un .txt`, {
          description: "Exportá el chat desde WhatsApp con la opción \"Sin archivos\".",
        })
        continue
      }
      try {
        const content = await file.text()
        const parsed = parseWhatsAppExport(content, file.name)

        if (parsed.messages.length === 0) {
          toast.error(`"${file.name}" no tiene mensajes reconocibles`)
          continue
        }

        // Adivinar quién es el cliente: el participante que coincide con el
        // nombre del archivo, o el que parece un teléfono
        const byChatName = parsed.chatName
          ? parsed.participants.find((p) => p.name === parsed.chatName)
          : undefined
        const byPhone = parsed.participants.find((p) => looksLikePhone(p.name))
        const clientGuess = byChatName || byPhone || parsed.participants[0]

        const guessedName = clientGuess ? clientGuess.name : parsed.chatName || "Cliente"
        const isPhoneName = looksLikePhone(guessedName)

        newDrafts.push({
          parsed,
          clientParticipant: clientGuess?.name || "",
          clientName: isPhoneName ? parsed.chatName || "Cliente" : guessedName,
          clientPhone: isPhoneName ? normalizePhone(guessedName) : "",
        })
      } catch {
        toast.error(`No se pudo leer "${file.name}"`)
      }
    }

    setDrafts((prev) => {
      const existing = new Set(prev.map((d) => d.parsed.fileName))
      return [...prev, ...newDrafts.filter((d) => !existing.has(d.parsed.fileName))]
    })
    setIsParsing(false)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const updateDraft = (index: number, patch: Partial<ChatDraft>) => {
    setDrafts((prev) => prev.map((d, i) => (i === index ? { ...d, ...patch } : d)))
  }

  const removeDraft = (index: number) => {
    setDrafts((prev) => prev.filter((_, i) => i !== index))
  }

  // ── Paso 3: importar ──────────────────────────────────────────────────────
  const handleImport = async () => {
    setIsImporting(true)
    try {
      const payload = {
        conversations: drafts.map((draft) => ({
          client_name: draft.clientName.trim(),
          client_phone: draft.clientPhone.trim(),
          messages: draft.parsed.messages.map((msg) => ({
            sender: msg.sender === draft.clientParticipant ? "client" : "business",
            text: msg.text,
            timestamp: msg.timestamp,
          })),
        })),
      }

      const res = await fetch("/api/chat/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const json = await res.json()

      if (!res.ok) {
        toast.error(json.error || "No se pudo importar")
        setIsImporting(false)
        return
      }

      setResults(json.results || [])
      toast.success(
        `${json.total_messages.toLocaleString("es-AR")} mensajes importados` +
        (json.total_clients_created > 0 ? ` · ${json.total_clients_created} clientes nuevos` : "")
      )
      onImported()
    } catch {
      toast.error("Error de red al importar")
    } finally {
      setIsImporting(false)
    }
  }

  const canContinueStep1 = drafts.length > 0
  const canContinueStep2 = drafts.every((d) => d.clientName.trim() !== "" && d.clientParticipant !== "")

  const formatDate = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "2-digit" }) : "—"

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar chats de WhatsApp</DialogTitle>
          <DialogDescription>
            Traé el historial de la app de WhatsApp a UcoBot: las conversaciones aparecen en Mensajes
            y los contactos se crean como clientes.
          </DialogDescription>
        </DialogHeader>

        {/* Stepper */}
        <div className="flex items-center gap-2 mb-2">
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

        {/* ── Paso 1: subir ── */}
        {step === 0 && (
          <div className="space-y-4">
            <div className="rounded-xl bg-muted/40 border border-border/50 p-3 text-xs text-muted-foreground space-y-1">
              <p className="font-semibold text-foreground">Cómo exportar desde WhatsApp:</p>
              <p>1. Abrí el chat en el celular → ⋮ (menú) → <b>Más</b> → <b>Exportar chat</b>.</p>
              <p>2. Elegí <b>"Sin archivos"</b> — genera un .txt liviano.</p>
              <p>3. Guardalo (o mandátelo por mail) y subilo acá. Podés subir varios a la vez.</p>
            </div>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full rounded-2xl border-2 border-dashed border-[#D1F366]/40 hover:border-[#D1F366] bg-[#D1F366]/[0.03] hover:bg-[#D1F366]/[0.08] transition-colors p-8 flex flex-col items-center gap-2 text-center"
            >
              {isParsing ? (
                <Loader2 className="w-8 h-8 animate-spin text-[#D1F366]" />
              ) : (
                <Upload className="w-8 h-8 text-[#D1F366]" />
              )}
              <p className="text-sm font-bold">Tocá para elegir los archivos .txt</p>
              <p className="text-xs text-muted-foreground">Ej: "Chat de WhatsApp con Juan Pérez.txt"</p>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,text/plain"
              multiple
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />

            {drafts.length > 0 && (
              <div className="space-y-2">
                {drafts.map((draft, i) => (
                  <div key={draft.parsed.fileName} className="flex items-center gap-3 rounded-xl border border-border/50 bg-muted/30 p-3">
                    <FileText className="w-4 h-4 text-[#D1F366] flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold truncate">{draft.parsed.chatName || draft.parsed.fileName}</p>
                      <p className="text-xs text-muted-foreground">
                        {draft.parsed.messages.length.toLocaleString("es-AR")} mensajes · {formatDate(draft.parsed.firstDate)} a {formatDate(draft.parsed.lastDate)}
                      </p>
                    </div>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" onClick={() => removeDraft(i)}>
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Paso 2: revisar ── */}
        {step === 1 && (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Confirmá quién es el cliente en cada chat y completá su teléfono — así los mensajes
              nuevos de WhatsApp se enganchan con este historial.
            </p>
            {drafts.map((draft, i) => (
              <div key={draft.parsed.fileName} className="rounded-xl border border-border/50 p-4 space-y-3">
                <p className="text-xs font-bold text-muted-foreground truncate">{draft.parsed.fileName}</p>
                <div className="grid sm:grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">¿Quién es el cliente?</Label>
                    <Select
                      value={draft.clientParticipant || undefined}
                      onValueChange={(v) => updateDraft(i, { clientParticipant: v })}
                    >
                      <SelectTrigger className="text-xs">
                        <SelectValue placeholder="Elegí el participante" />
                      </SelectTrigger>
                      <SelectContent>
                        {draft.parsed.participants.map((p) => (
                          <SelectItem key={p.name} value={p.name}>
                            {p.name} ({p.count} msjs)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Nombre del cliente *</Label>
                    <Input
                      value={draft.clientName}
                      onChange={(e) => updateDraft(i, { clientName: e.target.value })}
                      placeholder="Juan Pérez"
                      className="text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Teléfono (recomendado)</Label>
                    <Input
                      value={draft.clientPhone}
                      onChange={(e) => updateDraft(i, { clientPhone: e.target.value.replace(/[^\d+\s]/g, "") })}
                      placeholder="5492611234567"
                      className="text-sm"
                    />
                  </div>
                </div>
                {!draft.clientPhone.trim() && (
                  <p className="text-[11px] text-amber-500 flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5" />
                    Sin teléfono, los mensajes futuros de WhatsApp no se van a unir a este historial.
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── Paso 3: importar / resultados ── */}
        {step === 2 && (
          <div className="space-y-4">
            {!results ? (
              <>
                <div className="rounded-xl bg-muted/40 border border-border/50 p-4 text-sm space-y-1">
                  <p className="font-bold">Se va a importar:</p>
                  <p className="text-muted-foreground">
                    {drafts.length} chat{drafts.length === 1 ? "" : "s"} ·{" "}
                    {drafts.reduce((sum, d) => sum + d.parsed.messages.length, 0).toLocaleString("es-AR")} mensajes
                  </p>
                  <p className="text-xs text-muted-foreground pt-1">
                    Los mensajes conservan su fecha original y quedan marcados como historial importado.
                    Los contactos sin cliente existente se crean en la sección Clientes.
                  </p>
                </div>
                <Button
                  onClick={handleImport}
                  disabled={isImporting}
                  className="w-full bg-[#D1F366] text-[#1C1C28] hover:bg-[#B3D93C] font-bold rounded-xl gap-2 py-5"
                >
                  {isImporting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Importando… no cierres esta ventana
                    </>
                  ) : (
                    "Importar ahora"
                  )}
                </Button>
              </>
            ) : (
              <>
                <div className="space-y-2">
                  {results.map((r, i) => (
                    <div key={i} className="flex items-center gap-3 rounded-xl border border-border/50 bg-muted/30 p-3">
                      {r.error ? (
                        <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold truncate">{r.client_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {r.error
                            ? r.error
                            : `${r.messages_imported.toLocaleString("es-AR")} mensajes${r.client_created ? " · cliente creado" : ""}`}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
                <Button
                  onClick={() => handleClose(false)}
                  className="w-full bg-[#D1F366] text-[#1C1C28] hover:bg-[#B3D93C] font-bold rounded-xl"
                >
                  Listo — ver mis chats
                </Button>
              </>
            )}
          </div>
        )}

        {/* Navegación */}
        {!results && (
          <div className="flex items-center justify-between pt-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              disabled={step === 0 || isImporting}
              className="gap-1 text-xs"
            >
              <ChevronLeft className="w-4 h-4" />
              Atrás
            </Button>
            {step < 2 && (
              <Button
                size="sm"
                onClick={() => setStep((s) => s + 1)}
                disabled={step === 0 ? !canContinueStep1 : !canContinueStep2}
                className="gap-1 text-xs bg-[#1C1C28] text-[#D1F366] hover:bg-[#1C1C28]/90 dark:bg-[#D1F366] dark:text-[#1C1C28] dark:hover:bg-[#B3D93C]"
              >
                Siguiente
                <ChevronRight className="w-4 h-4" />
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
