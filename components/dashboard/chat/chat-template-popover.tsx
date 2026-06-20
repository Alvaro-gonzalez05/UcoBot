"use client"

import { useEffect, useState } from "react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { FileText, Loader2, Send, ChevronLeft, MessageSquareText } from "lucide-react"
import { toast } from "sonner"

interface MetaTemplate {
  id: string
  name: string
  status: string
  language: string
  category: string
  components: any[]
}

const bodyText = (t: MetaTemplate) => t.components?.find((c) => c.type === "BODY")?.text || ""
const varCount = (text: string) => new Set(text.match(/\{\{\d+\}\}/g) || []).size
const prettify = (name: string) => name.replaceAll("_", " ").replace(/^\w/, (c) => c.toUpperCase())
const render = (text: string, vars: string[]) =>
  text.replace(/\{\{(\d+)\}\}/g, (_, n) => vars[parseInt(n, 10) - 1] || `{{${n}}}`)

/**
 * Botón + popover (hacia arriba) para que el agente envíe una plantilla
 * aprobada manualmente desde el chat, en cualquier momento.
 */
export function ChatTemplatePopover({
  conversationId,
  clientName,
  onSent,
}: {
  conversationId: string
  clientName: string
  onSent: () => void
}) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [templates, setTemplates] = useState<MetaTemplate[]>([])
  const [selected, setSelected] = useState<MetaTemplate | null>(null)
  const [vars, setVars] = useState<string[]>([])
  const [sending, setSending] = useState(false)

  useEffect(() => {
    if (!open) {
      setSelected(null)
      return
    }
    setLoading(true)
    fetch("/api/templates/manage")
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        setTemplates(ok ? (j.templates || []).filter((t: MetaTemplate) => t.status === "APPROVED") : [])
      })
      .catch(() => setTemplates([]))
      .finally(() => setLoading(false))
  }, [open])

  const pickTemplate = (t: MetaTemplate) => {
    setSelected(t)
    const count = varCount(bodyText(t))
    setVars(Array.from({ length: count }, (_, i) => (i === 0 ? clientName : "")))
  }

  const handleSend = async () => {
    if (!selected) return
    setSending(true)
    try {
      const res = await fetch("/api/chat/send-template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId,
          template_name: selected.name,
          language: selected.language,
          variables: vars,
          rendered_text: render(bodyText(selected), vars),
        }),
      })
      const j = await res.json()
      if (!res.ok) {
        toast.error(j.error || "No se pudo enviar la plantilla")
        return
      }
      toast.success("Plantilla enviada")
      onSent()
      setOpen(false)
    } catch {
      toast.error("Error de red al enviar")
    } finally {
      setSending(false)
    }
  }

  const count = selected ? varCount(bodyText(selected)) : 0

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="text-muted-foreground" title="Enviar plantilla">
          <FileText className="h-5 w-5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-80 p-0 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : templates.length === 0 ? (
          <div className="p-4 text-center text-xs text-muted-foreground">
            No tenés plantillas aprobadas. Crealas en la configuración del bot y esperá la
            aprobación de Meta.
          </div>
        ) : !selected ? (
          <div className="max-h-72 overflow-y-auto p-2">
            <p className="px-1 pb-2 text-xs font-semibold text-muted-foreground">Enviar plantilla</p>
            <div className="space-y-1">
              {templates.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => pickTemplate(t)}
                  className="flex w-full items-start gap-2.5 rounded-lg p-2 text-left transition-colors hover:bg-muted"
                >
                  <MessageSquareText className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#D1F366]" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{prettify(t.name)}</p>
                    <p className="line-clamp-2 text-xs text-muted-foreground">{bodyText(t)}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-3 p-3">
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground"
            >
              <ChevronLeft className="h-4 w-4" /> Volver
            </button>

            <div className="rounded-xl border border-border/40 bg-[#0a1014] p-3">
              <div className="max-w-[90%] rounded-lg rounded-tl-sm bg-[#1f2c33] p-2.5">
                <p className="whitespace-pre-line break-words text-sm text-[#e9edef]">
                  {render(bodyText(selected), vars)}
                </p>
              </div>
            </div>

            {count > 0 && (
              <div className="space-y-2">
                {Array.from({ length: count }, (_, i) => (
                  <div key={i} className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">{`Variable {{${i + 1}}}`}</Label>
                    <Input
                      value={vars[i] || ""}
                      onChange={(e) => {
                        const next = [...vars]
                        next[i] = e.target.value
                        setVars(next)
                      }}
                      className="h-8 text-sm"
                      placeholder={i === 0 ? "Nombre del cliente" : "Valor"}
                    />
                  </div>
                ))}
              </div>
            )}

            <Button
              onClick={handleSend}
              disabled={sending}
              className="w-full gap-2 bg-[#D1F366] text-[#1C1C28] hover:bg-[#B3D93C] font-bold"
              size="sm"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Enviar plantilla
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
