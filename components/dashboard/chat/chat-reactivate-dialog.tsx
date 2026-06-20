"use client"

import { useEffect, useState } from "react"
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
import { Loader2, Send, MessageSquareText, ChevronLeft, AlertCircle } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import {
  getBodyText,
  getTemplateSlots,
  buildTemplateComponents,
  renderBodyPreview,
  type TemplateComponent,
} from "@/lib/whatsapp-template"

interface MetaTemplate {
  id: string
  name: string
  status: string
  language: string
  category: string
  components: TemplateComponent[]
}

const prettify = (name: string) => name.replaceAll("_", " ").replace(/^\w/, (c) => c.toUpperCase())
const groupLabel: Record<string, string> = { header: "Encabezado", body: "Mensaje", button: "Botón" }

export function ChatReactivateDialog({
  open,
  onOpenChange,
  conversationId,
  clientName,
  onSent,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  conversationId: string
  clientName: string
  onSent: () => void
}) {
  const [loading, setLoading] = useState(true)
  const [notConnected, setNotConnected] = useState(false)
  const [templates, setTemplates] = useState<MetaTemplate[]>([])
  const [selected, setSelected] = useState<MetaTemplate | null>(null)
  const [values, setValues] = useState<Record<string, string>>({})
  const [sending, setSending] = useState(false)

  useEffect(() => {
    if (!open) return
    setSelected(null)
    setLoading(true)
    fetch("/api/templates/manage")
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (!ok) {
          if (j?.error?.includes?.("Conectá")) setNotConnected(true)
          setTemplates([])
          return
        }
        setTemplates((j.templates || []).filter((t: MetaTemplate) => t.status === "APPROVED"))
      })
      .catch(() => setTemplates([]))
      .finally(() => setLoading(false))
  }, [open])

  const slots = selected ? getTemplateSlots(selected.components) : []

  const pickTemplate = (t: MetaTemplate) => {
    setSelected(t)
    const s = getTemplateSlots(t.components)
    const firstText = s.find((x) => x.kind === "text")
    setValues(firstText ? { [firstText.key]: clientName } : {})
  }

  const handleSend = async () => {
    if (!selected) return
    if (slots.some((s) => !values[s.key]?.trim())) {
      toast.error("Completá todos los campos de la plantilla")
      return
    }
    setSending(true)
    try {
      const res = await fetch("/api/chat/send-template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId,
          template_name: selected.name,
          language: selected.language,
          components: buildTemplateComponents(selected.components, values),
          rendered_text: renderBodyPreview(selected.components, values),
        }),
      })
      const j = await res.json()
      if (!res.ok) {
        toast.error(j.error || "No se pudo enviar la plantilla")
        return
      }
      toast.success("Plantilla enviada — cuando responda se reabre el chat")
      onSent()
      onOpenChange(false)
    } catch {
      toast.error("Error de red al enviar")
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Reactivar conversación</DialogTitle>
          <DialogDescription>
            Pasaron más de 24 hs desde el último mensaje del cliente, así que WhatsApp solo permite
            enviar una plantilla aprobada. Cuando responda, el chat se reabre normal.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : notConnected ? (
          <div className="flex items-center gap-3 rounded-xl bg-muted/40 p-4 text-sm text-muted-foreground">
            <AlertCircle className="h-5 w-5 flex-shrink-0" />
            Conectá WhatsApp para poder usar plantillas.
          </div>
        ) : templates.length === 0 ? (
          <div className="rounded-xl bg-muted/40 p-4 text-sm text-muted-foreground text-center">
            No tenés plantillas aprobadas todavía. Creá una desde la configuración del bot
            (sección "Plantillas de WhatsApp") y esperá la aprobación de Meta.
          </div>
        ) : !selected ? (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Elegí una plantilla para reenganchar:</p>
            {templates.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => pickTemplate(t)}
                className="flex w-full items-start gap-3 rounded-xl border border-border p-3 text-left transition-colors hover:border-[#D1F366] hover:bg-[#D1F366]/5"
              >
                <MessageSquareText className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#D1F366]" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{prettify(t.name)}</p>
                  <p className="line-clamp-2 text-xs text-muted-foreground">{getBodyText(t.components)}</p>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground"
            >
              <ChevronLeft className="h-4 w-4" /> Elegir otra
            </button>

            {/* Vista previa estilo WhatsApp */}
            <div
              className="rounded-2xl border border-border/40 bg-[#0a1014] p-4"
              style={{ backgroundImage: "radial-gradient(circle at 80% 20%, rgba(37,211,102,0.05), transparent 60%)" }}
            >
              <div className="max-w-[90%] rounded-xl rounded-tl-sm bg-[#1f2c33] p-3">
                <p className="whitespace-pre-line break-words text-sm text-[#e9edef]">
                  {renderBodyPreview(selected.components, values)}
                </p>
              </div>
            </div>

            {slots.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground">Completá los datos:</p>
                {slots.map((slot) => (
                  <div key={slot.key} className="space-y-1">
                    <Label className="text-xs text-muted-foreground">
                      <span className="font-semibold">{groupLabel[slot.group]}:</span> {slot.label}
                    </Label>
                    <Input
                      value={values[slot.key] || ""}
                      onChange={(e) => setValues((v) => ({ ...v, [slot.key]: e.target.value }))}
                      placeholder={slot.placeholder || (slot.group === "body" ? "Valor" : "")}
                      className="h-9"
                    />
                  </div>
                ))}
              </div>
            )}

            <Button
              onClick={handleSend}
              disabled={sending || slots.some((s) => !values[s.key]?.trim())}
              className={cn("w-full gap-2 bg-[#D1F366] text-[#1C1C28] hover:bg-[#B3D93C] font-bold")}
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Enviar y reactivar
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
