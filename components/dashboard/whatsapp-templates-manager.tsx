"use client"

import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Loader2,
  Plus,
  Pencil,
  Trash2,
  RefreshCw,
  LayoutTemplate,
  MessageSquareText,
  Braces,
} from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

interface MetaTemplate {
  id: string
  name: string
  status: string
  language: string
  category: string
  components: any[]
  quality_score?: { score: string }
}

const statusConfig: Record<string, { label: string; className: string; dot: string }> = {
  APPROVED: {
    label: "Aprobada",
    className: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
    dot: "bg-emerald-500",
  },
  PENDING: {
    label: "En revisión",
    className: "bg-amber-500/15 text-amber-500 border-amber-500/30",
    dot: "bg-amber-500",
  },
  REJECTED: {
    label: "Rechazada",
    className: "bg-red-500/15 text-red-500 border-red-500/30",
    dot: "bg-red-500",
  },
  PAUSED: {
    label: "Pausada",
    className: "bg-slate-500/15 text-slate-400 border-slate-500/30",
    dot: "bg-slate-400",
  },
}

const categoryLabels: Record<string, string> = {
  MARKETING: "Marketing",
  UTILITY: "Utilidad",
  AUTHENTICATION: "Autenticación",
}

const languageOptions = [
  { id: "es_AR", label: "Español (Argentina)" },
  { id: "es", label: "Español" },
  { id: "es_MX", label: "Español (México)" },
  { id: "en_US", label: "Inglés (EE.UU.)" },
]

function getComponentText(components: any[] | undefined, type: string): string {
  return components?.find((c) => c.type === type)?.text || ""
}

function prettifyName(name: string) {
  return name.replaceAll("_", " ").replace(/^\w/, (c) => c.toUpperCase())
}

function countVariables(text: string): number {
  return new Set(text.match(/\{\{\d+\}\}/g) || []).size
}

const emptyForm = {
  name: "",
  language: "es_AR",
  category: "MARKETING",
  header_text: "",
  body_text: "",
  footer_text: "",
  example_values: [] as string[],
}

export function WhatsAppTemplatesManager() {
  const [templates, setTemplates] = useState<MetaTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [notConnected, setNotConnected] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<MetaTemplate | null>(null)
  const [form, setForm] = useState({ ...emptyForm })
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<MetaTemplate | null>(null)

  const fetchTemplates = async (silent = false) => {
    if (!silent) setLoading(true)
    else setRefreshing(true)
    try {
      const res = await fetch("/api/templates/manage")
      const json = await res.json()
      if (!res.ok) {
        if (res.status === 400) setNotConnected(true)
        else toast.error(json.error || "No se pudieron cargar las plantillas")
        return
      }
      setNotConnected(false)
      setTemplates(json.templates || [])
    } catch {
      toast.error("Error de red al cargar plantillas")
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    fetchTemplates()
  }, [])

  const stats = useMemo(() => {
    const count = (s: string) => templates.filter((t) => t.status === s).length
    return {
      total: templates.length,
      approved: count("APPROVED"),
      pending: count("PENDING"),
      rejected: count("REJECTED"),
    }
  }, [templates])

  const variableCount = countVariables(form.body_text)

  const openCreate = () => {
    setEditingTemplate(null)
    setForm({ ...emptyForm })
    setDialogOpen(true)
  }

  const openEdit = (template: MetaTemplate) => {
    if (template.status === "PENDING") {
      toast.info("Las plantillas en revisión no se pueden editar hasta que Meta las procese.")
      return
    }
    setEditingTemplate(template)
    setForm({
      name: template.name,
      language: template.language,
      category: template.category,
      header_text: getComponentText(template.components, "HEADER"),
      body_text: getComponentText(template.components, "BODY"),
      footer_text: getComponentText(template.components, "FOOTER"),
      example_values: [],
    })
    setDialogOpen(true)
  }

  const insertVariable = () => {
    const next = variableCount + 1
    setForm((f) => ({ ...f, body_text: `${f.body_text}{{${next}}}` }))
  }

  const handleSave = async () => {
    if (!editingTemplate && !/^[a-z0-9_]+$/.test(form.name.trim())) {
      toast.error("El nombre solo puede tener minúsculas, números y guiones bajos")
      return
    }
    if (!form.body_text.trim()) {
      toast.error("Escribí el cuerpo del mensaje")
      return
    }

    setSaving(true)
    try {
      const payload: any = {
        header_text: form.header_text,
        body_text: form.body_text,
        footer_text: form.footer_text,
        example_values: form.example_values.slice(0, variableCount),
      }

      let res: Response
      if (editingTemplate) {
        res = await fetch("/api/templates/manage", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, template_id: editingTemplate.id }),
        })
      } else {
        res = await fetch("/api/templates/manage", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...payload,
            name: form.name.trim(),
            language: form.language,
            category: form.category,
          }),
        })
      }

      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || "No se pudo guardar la plantilla")
        return
      }

      toast.success(
        editingTemplate
          ? "Plantilla actualizada — Meta la volverá a revisar"
          : "Plantilla enviada a revisión de Meta (suele tardar de minutos a 24 hs)"
      )
      setDialogOpen(false)
      fetchTemplates(true)
    } catch {
      toast.error("Error de red al guardar la plantilla")
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      const res = await fetch(
        `/api/templates/manage?name=${encodeURIComponent(deleteTarget.name)}`,
        { method: "DELETE" }
      )
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || "No se pudo eliminar la plantilla")
        return
      }
      toast.success("Plantilla eliminada")
      setTemplates((prev) => prev.filter((t) => t.name !== deleteTarget.name))
    } catch {
      toast.error("Error de red al eliminar")
    } finally {
      setDeleteTarget(null)
    }
  }

  if (notConnected) {
    return (
      <div className="executive-card">
        <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide mb-3">
          Plantillas de WhatsApp
        </p>
        <div className="flex items-center gap-3 text-sm text-muted-foreground py-4">
          <LayoutTemplate className="w-5 h-5 flex-shrink-0" />
          <span>
            Conectá tu cuenta de WhatsApp (arriba, en "Conexión con Meta") para crear y gestionar
            las plantillas de mensaje de tu negocio.
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between px-1">
        <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">
          Plantillas de WhatsApp
        </p>
        <Button
          variant="ghost"
          size="sm"
          className="text-xs gap-1.5 text-muted-foreground"
          onClick={() => fetchTemplates(true)}
          disabled={refreshing}
        >
          <RefreshCw className={cn("w-3.5 h-3.5", refreshing && "animate-spin")} />
          Sincronizar
        </Button>
      </div>

      {loading ? (
        <div className="executive-card flex items-center justify-center py-16">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 auto-rows-fr">
          {/* Tile: stats */}
          <div className="sm:col-span-2 executive-card bg-gradient-to-br from-[#D1F366]/10 via-transparent to-transparent flex flex-col justify-between">
            <div className="flex items-start justify-between">
              <div className="w-11 h-11 bg-[#D1F366]/15 rounded-2xl flex items-center justify-center text-[#D1F366]">
                <LayoutTemplate className="w-5 h-5" />
              </div>
              <p className="text-4xl font-black">{stats.total}</p>
            </div>
            <div className="mt-4">
              <h3 className="text-sm font-bold">Tus plantillas</h3>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                Mensajes pre-aprobados por Meta para iniciar conversaciones: recordatorios,
                promociones y seguimientos.
              </p>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-xs">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  {stats.approved} aprobada{stats.approved === 1 ? "" : "s"}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  {stats.pending} en revisión
                </span>
                {stats.rejected > 0 && (
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-red-500" />
                    {stats.rejected} rechazada{stats.rejected === 1 ? "" : "s"}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Tile: crear nueva */}
          <button
            onClick={openCreate}
            className="sm:col-span-2 rounded-2xl border-2 border-dashed border-[#D1F366]/40 hover:border-[#D1F366] bg-[#D1F366]/[0.03] hover:bg-[#D1F366]/[0.08] transition-colors p-5 flex flex-col items-center justify-center gap-2 text-center group min-h-[160px]"
          >
            <div className="w-12 h-12 rounded-2xl bg-[#D1F366] text-[#1C1C28] flex items-center justify-center group-hover:scale-110 transition-transform">
              <Plus className="w-6 h-6" />
            </div>
            <p className="text-sm font-bold mt-1">Nueva plantilla</p>
            <p className="text-xs text-muted-foreground max-w-[260px]">
              Creala acá y se envía directo a revisión de Meta, sin salir de UcoBot
            </p>
          </button>

          {/* Template cards */}
          {templates.map((template, index) => {
            const status = statusConfig[template.status] || {
              label: template.status,
              className: "bg-slate-500/15 text-slate-400 border-slate-500/30",
              dot: "bg-slate-400",
            }
            const body = getComponentText(template.components, "BODY")
            const header = getComponentText(template.components, "HEADER")
            const wide = index % 5 === 0

            return (
              <div
                key={template.id}
                className={cn(
                  "executive-card group relative flex flex-col hover:translate-y-[-2px] transition-transform",
                  wide && "sm:col-span-2"
                )}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <Badge className={cn("border text-[10px]", status.className)}>{status.label}</Badge>
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground"
                      onClick={() => openEdit(template)}
                      title="Editar"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-red-500"
                      onClick={() => setDeleteTarget(template)}
                      title="Eliminar"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>

                <h4 className="text-sm font-bold truncate">{prettifyName(template.name)}</h4>
                <p className="text-[10px] text-muted-foreground font-mono truncate">{template.name}</p>

                <div className="mt-3 rounded-xl bg-muted/40 border border-border/40 p-3 flex-1">
                  {header && <p className="text-xs font-bold mb-1 line-clamp-1">{header}</p>}
                  <p className={cn("text-xs text-muted-foreground whitespace-pre-line", wide ? "line-clamp-4" : "line-clamp-3")}>
                    {body || "(sin contenido)"}
                  </p>
                </div>

                <div className="flex items-center gap-2 mt-3 text-[10px] text-muted-foreground">
                  <span className="px-1.5 py-0.5 rounded-md bg-muted/60">
                    {categoryLabels[template.category] || template.category}
                  </span>
                  <span className="px-1.5 py-0.5 rounded-md bg-muted/60 uppercase">{template.language}</span>
                  {countVariables(body) > 0 && (
                    <span className="px-1.5 py-0.5 rounded-md bg-muted/60 flex items-center gap-1">
                      <Braces className="w-2.5 h-2.5" />
                      {countVariables(body)} variable{countVariables(body) === 1 ? "" : "s"}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Dialog crear/editar */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingTemplate ? `Editar "${prettifyName(editingTemplate.name)}"` : "Nueva plantilla de WhatsApp"}
            </DialogTitle>
            <DialogDescription>
              {editingTemplate
                ? "Al guardar, Meta vuelve a revisar la plantilla antes de aprobarla."
                : "Se envía a revisión de Meta. La aprobación suele tardar de minutos a 24 horas."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Form */}
            <div className="space-y-4">
              {!editingTemplate && (
                <>
                  <div className="space-y-1.5">
                    <Label>Nombre interno *</Label>
                    <Input
                      placeholder="ej: recordatorio_reserva"
                      value={form.name}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          name: e.target.value.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, ""),
                        })
                      }
                      className="input-field font-mono text-sm"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Solo minúsculas, números y guiones bajos. No se puede cambiar después.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Categoría</Label>
                      <Select
                        value={form.category}
                        onValueChange={(v) => setForm({ ...form, category: v })}
                      >
                        <SelectTrigger className="input-field">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="MARKETING">Marketing</SelectItem>
                          <SelectItem value="UTILITY">Utilidad</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Idioma</Label>
                      <Select
                        value={form.language}
                        onValueChange={(v) => setForm({ ...form, language: v })}
                      >
                        <SelectTrigger className="input-field">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {languageOptions.map((l) => (
                            <SelectItem key={l.id} value={l.id}>
                              {l.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </>
              )}

              <div className="space-y-1.5">
                <Label>Encabezado (opcional)</Label>
                <Input
                  placeholder="ej: ¡Tenemos novedades! 🎉"
                  value={form.header_text}
                  onChange={(e) => setForm({ ...form, header_text: e.target.value })}
                  className="input-field"
                  maxLength={60}
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label>Cuerpo del mensaje *</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[11px] gap-1 text-[#D1F366]"
                    onClick={insertVariable}
                  >
                    <Braces className="w-3 h-3" />
                    Insertar variable
                  </Button>
                </div>
                <Textarea
                  placeholder={"Hola {{1}}, te recordamos tu reserva para el {{2}}. ¡Te esperamos!"}
                  value={form.body_text}
                  onChange={(e) => setForm({ ...form, body_text: e.target.value })}
                  className="input-field min-h-[120px]"
                  maxLength={1024}
                />
                <p className="text-[11px] text-muted-foreground">
                  Usá {"{{1}}"}, {"{{2}}"}… como variables que se completan al enviar (nombre, fecha, etc.)
                </p>
              </div>

              {variableCount > 0 && (
                <div className="space-y-2 rounded-xl bg-muted/40 border border-border/40 p-3">
                  <p className="text-[11px] font-semibold text-muted-foreground">
                    Valores de ejemplo (Meta los pide para revisar la plantilla)
                  </p>
                  {Array.from({ length: variableCount }, (_, i) => (
                    <Input
                      key={i}
                      placeholder={`Ejemplo para {{${i + 1}}} — ej: ${i === 0 ? "Juan" : "viernes 20 hs"}`}
                      value={form.example_values[i] || ""}
                      onChange={(e) => {
                        const next = [...form.example_values]
                        next[i] = e.target.value
                        setForm({ ...form, example_values: next })
                      }}
                      className="input-field text-sm"
                    />
                  ))}
                </div>
              )}

              <div className="space-y-1.5">
                <Label>Pie (opcional)</Label>
                <Input
                  placeholder="ej: Respondé STOP para no recibir más mensajes"
                  value={form.footer_text}
                  onChange={(e) => setForm({ ...form, footer_text: e.target.value })}
                  className="input-field"
                  maxLength={60}
                />
              </div>
            </div>

            {/* Vista previa estilo WhatsApp */}
            <div className="flex flex-col">
              <Label className="mb-1.5">Vista previa</Label>
              <div className="flex-1 rounded-2xl bg-[#0a1014] border border-border/40 p-4 flex items-start min-h-[280px]"
                style={{
                  backgroundImage:
                    "radial-gradient(circle at 20% 30%, rgba(209,243,102,0.03) 0%, transparent 50%), radial-gradient(circle at 80% 70%, rgba(37,211,102,0.03) 0%, transparent 50%)",
                }}
              >
                <div className="bg-[#1f2c33] rounded-xl rounded-tl-sm p-3 max-w-[90%] shadow-lg">
                  {form.header_text && (
                    <p className="text-sm font-bold text-white mb-1">{form.header_text}</p>
                  )}
                  <p className="text-sm text-[#e9edef] whitespace-pre-line break-words">
                    {form.body_text || (
                      <span className="text-[#8696a0] italic">El mensaje aparece acá…</span>
                    )}
                  </p>
                  {form.footer_text && (
                    <p className="text-[11px] text-[#8696a0] mt-1.5">{form.footer_text}</p>
                  )}
                  <p className="text-[10px] text-[#8696a0] text-right mt-1">
                    {new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground mt-2 flex items-start gap-1.5">
                <MessageSquareText className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                Las plantillas aprobadas se usan en Automatizaciones para iniciar conversaciones
                fuera de la ventana de 24 hs.
              </p>
            </div>
          </div>

          <Button
            onClick={handleSave}
            disabled={saving}
            className="w-full bg-[#D1F366] text-[#1C1C28] hover:bg-[#B3D93C] font-bold rounded-xl gap-2 mt-2"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Enviando a Meta…
              </>
            ) : editingTemplate ? (
              "Guardar y reenviar a revisión"
            ) : (
              "Crear y enviar a revisión"
            )}
          </Button>
        </DialogContent>
      </Dialog>

      {/* Confirmación de borrado */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar "{deleteTarget ? prettifyName(deleteTarget.name) : ""}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Se elimina de tu cuenta de WhatsApp Business en Meta. Las automatizaciones que la
              usen dejarán de poder enviarla. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-500 hover:bg-red-600 text-white">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
