"use client"

import { useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { toast } from "sonner"
import {
  Plus, FileText, Globe, MessageSquare, MoreVertical,
  Trash2, Eye, Copy, Loader2, ArrowLeft, ClipboardList,
  TrendingUp, CheckCircle2,
} from "lucide-react"
import { formatDistanceToNow, format } from "date-fns"
import { es } from "date-fns/locale"

// ─── Types (matches Supabase schema) ─────────────────────────────────────────
interface FormField {
  label: string
  type: "text" | "email" | "phone" | "textarea" | "select"
  required: boolean
  placeholder?: string
  options?: string[]
}

interface Form {
  id: string
  user_id: string
  name: string
  description?: string
  type: "link" | "conversacional"
  fields: FormField[]
  slug: string
  is_active: boolean
  submissions_count: number
  settings?: Record<string, any>
  created_at: string
  updated_at: string
}

interface FormSubmission {
  id: string
  form_id: string
  user_id: string
  client_id?: string
  data: Record<string, string>
  created_at: string
}

interface FormulariosManagementProps {
  initialForms: Form[]
  initialSubmissions: FormSubmission[]
  userId: string
}

const FIELD_TYPE_LABELS: Record<string, string> = {
  text: "Texto corto",
  email: "Email",
  phone: "Teléfono",
  textarea: "Texto largo",
  select: "Opción múltiple",
}

export function FormulariosManagement({ initialForms, initialSubmissions, userId }: FormulariosManagementProps) {
  const [forms, setForms] = useState<Form[]>(initialForms)
  const [submissions, setSubmissions] = useState<FormSubmission[]>(initialSubmissions)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [responseView, setResponseView] = useState<Form | null>(null)
  const supabase = createClient()

  const [formData, setFormData] = useState({
    name: "",
    type: "link" as "link" | "conversacional",
    description: "",
  })

  const [fields, setFields] = useState<FormField[]>([
    { label: "Nombre", type: "text", required: true, placeholder: "Ej: Juan García" },
    { label: "Email", type: "email", required: true, placeholder: "tu@email.com" },
    { label: "Teléfono / WhatsApp", type: "phone", required: false, placeholder: "+54 9 11 0000-0000" },
  ])

  const resetDialog = () => {
    setFormData({ name: "", type: "link", description: "" })
    setFields([
      { label: "Nombre", type: "text", required: true, placeholder: "" },
      { label: "Email", type: "email", required: true, placeholder: "" },
    ])
  }

  const generateSlug = (name: string) =>
    name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").trim()

  const addField = () => {
    setFields([...fields, { label: "", type: "text", required: false, placeholder: "" }])
  }

  const removeField = (index: number) => {
    setFields(fields.filter((_, i) => i !== index))
  }

  const updateField = (index: number, updates: Partial<FormField>) => {
    setFields(fields.map((f, i) => (i === index ? { ...f, ...updates } : f)))
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name.trim()) return
    setIsLoading(true)
    try {
      const slug = generateSlug(formData.name)
      const { data, error } = await supabase
        .from("forms")
        .insert([{
          user_id: userId,
          name: formData.name.trim(),
          type: formData.type,
          description: formData.description || null,
          fields: fields.filter(f => f.label.trim()),
          slug,
          is_active: true,
          submissions_count: 0,
        }])
        .select()
        .single()
      if (error) throw error
      setForms([data, ...forms])
      setIsDialogOpen(false)
      resetDialog()
      toast.success(`Formulario "${formData.name}" creado`, {
        description: formData.type === "link"
          ? "Podés compartir el link con tus clientes."
          : "El bot ya puede usar este formulario en conversaciones.",
        duration: 4000,
      })
    } catch (err) {
      console.error(err)
      toast.error("Error al crear el formulario", { description: "Verificá los datos e intentá de nuevo.", duration: 4000 })
    } finally {
      setIsLoading(false)
    }
  }

  const handleToggle = async (formId: string, isActive: boolean) => {
    try {
      const { error } = await supabase.from("forms").update({ is_active: isActive }).eq("id", formId)
      if (error) throw error
      setForms(forms.map(f => f.id === formId ? { ...f, is_active: isActive } : f))
      const form = forms.find(f => f.id === formId)
      toast.success(`Formulario ${isActive ? "activado" : "desactivado"}`, {
        description: `"${form?.name}" fue ${isActive ? "activado" : "desactivado"}.`,
        duration: 3000,
      })
    } catch {
      toast.error("No se pudo cambiar el estado del formulario.")
    }
  }

  const handleDelete = async (formId: string) => {
    try {
      const { error } = await supabase.from("forms").delete().eq("id", formId)
      if (error) throw error
      const form = forms.find(f => f.id === formId)
      setForms(forms.filter(f => f.id !== formId))
      setSubmissions(submissions.filter(s => s.form_id !== formId))
      toast.success("Formulario eliminado", { description: `"${form?.name}" fue eliminado.`, duration: 3000 })
    } catch {
      toast.error("No se pudo eliminar el formulario.")
    }
  }

  const copyFormLink = (slug: string) => {
    const url = `${window.location.origin}/f/${slug}`
    navigator.clipboard.writeText(url)
    toast.success("Link copiado", { description: url, duration: 3000 })
  }

  const formSubmissions = (formId: string) => submissions.filter(s => s.form_id === formId)
  const totalSubmissions = submissions.length
  const activeForms = forms.filter(f => f.is_active).length

  // ── Response detail view ──────────────────────────────────────────────────────
  if (responseView) {
    const these = formSubmissions(responseView.id)
    const cols = responseView.fields.map(f => f.label)
    const displayCount = responseView.submissions_count || these.length

    return (
      <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-4">
        <button
          onClick={() => setResponseView(null)}
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground text-sm transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Volver a Formularios
        </button>

        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#D1F366]/10 flex items-center justify-center">
            {responseView.type === "link"
              ? <Globe className="w-5 h-5 text-[#D1F366]" />
              : <MessageSquare className="w-5 h-5 text-[#D1F366]" />
            }
          </div>
          <div>
            <h2 className="font-bold text-foreground">{responseView.name}</h2>
            <p className="text-muted-foreground text-xs">
              {displayCount} respuesta{displayCount !== 1 ? "s" : ""} · {responseView.type}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="border border-border rounded-xl p-3.5 bg-card">
            <p className="text-2xl font-bold">{displayCount}</p>
            <p className="text-muted-foreground text-xs mt-0.5">Respuestas totales</p>
          </div>
          <div className="border border-border rounded-xl p-3.5 bg-card">
            <p className="text-2xl font-bold text-[#D1F366]">{responseView.fields.length}</p>
            <p className="text-muted-foreground text-xs mt-0.5">Campos</p>
          </div>
          <div className="border border-border rounded-xl p-3.5 bg-card">
            <p className="text-2xl font-bold">
              {these.length > 0
                ? format(new Date(these[0].created_at), "d/M", { locale: es })
                : "--"
              }
            </p>
            <p className="text-muted-foreground text-xs mt-0.5">Última respuesta</p>
          </div>
        </div>

        <div className="border border-border rounded-xl overflow-hidden bg-card">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <p className="font-semibold text-sm">Respuestas</p>
          </div>
          {these.length === 0 ? (
            <div className="py-16 text-center">
              <ClipboardList className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground text-sm">Sin respuestas cargadas</p>
              <p className="text-muted-foreground text-xs mt-1">
                {displayCount > 0
                  ? `Hay ${displayCount} respuestas registradas — recargá la página para ver las más recientes.`
                  : responseView.type === "link"
                    ? "Compartí el link del formulario para recibir respuestas."
                    : "El bot completará este formulario durante las conversaciones."
                }
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    {cols.map(col => (
                      <th key={col} className="text-left text-muted-foreground text-xs px-4 py-2.5 font-medium whitespace-nowrap">
                        {col}
                      </th>
                    ))}
                    <th className="text-left text-muted-foreground text-xs px-4 py-2.5 font-medium whitespace-nowrap">Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {these.map(s => (
                    <tr key={s.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                      {cols.map(col => (
                        <td key={col} className="px-4 py-3 text-sm whitespace-nowrap">
                          {s.data?.[col] ?? <span className="text-muted-foreground">--</span>}
                        </td>
                      ))}
                      <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">
                        {formatDistanceToNow(new Date(s.created_at), { addSuffix: true, locale: es })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── Main view ─────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Formularios</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Formularios conversacionales (el bot los completa en el chat) o de link (URL para compartir).
          </p>
        </div>
        <Button onClick={() => setIsDialogOpen(true)} className="flex items-center gap-2 shrink-0">
          <Plus className="w-4 h-4" />
          Nuevo formulario
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="border border-border rounded-xl p-4 bg-card">
          <div className="flex items-center gap-2 mb-1">
            <FileText className="w-4 h-4 text-muted-foreground" />
            <span className="text-muted-foreground text-xs">Total</span>
          </div>
          <p className="text-2xl font-bold">{forms.length}</p>
          <p className="text-muted-foreground text-xs mt-0.5">formularios</p>
        </div>
        <div className="border border-border rounded-xl p-4 bg-card">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-4 h-4 text-muted-foreground" />
            <span className="text-muted-foreground text-xs">Respuestas</span>
          </div>
          <p className="text-2xl font-bold text-[#D1F366]">
            {forms.reduce((acc, f) => acc + (f.submissions_count || 0), 0) || totalSubmissions}
          </p>
          <p className="text-muted-foreground text-xs mt-0.5">en total</p>
        </div>
        <div className="border border-border rounded-xl p-4 bg-card">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle2 className="w-4 h-4 text-muted-foreground" />
            <span className="text-muted-foreground text-xs">Activos</span>
          </div>
          <p className="text-2xl font-bold">{activeForms}</p>
          <p className="text-muted-foreground text-xs mt-0.5">de {forms.length}</p>
        </div>
      </div>

      <Tabs defaultValue="formularios">
        <TabsList>
          <TabsTrigger value="formularios">Formularios</TabsTrigger>
          <TabsTrigger value="respuestas">Todas las respuestas</TabsTrigger>
        </TabsList>

        {/* ── Forms list ── */}
        <TabsContent value="formularios" className="mt-4">
          {forms.length === 0 ? (
            <div className="border border-border rounded-2xl py-20 text-center bg-card">
              <FileText className="w-10 h-10 text-muted-foreground mx-auto mb-4" />
              <h3 className="font-semibold mb-1">Sin formularios aún</h3>
              <p className="text-muted-foreground text-sm mb-4">
                Creá tu primer formulario de link o conversacional.
              </p>
              <Button onClick={() => setIsDialogOpen(true)} variant="outline" size="sm" className="gap-2">
                <Plus className="w-4 h-4" /> Crear formulario
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {forms.map(form => {
                const count = form.submissions_count || formSubmissions(form.id).length
                return (
                  <div key={form.id} className="border border-border rounded-xl px-4 py-4 bg-card hover:border-muted-foreground/30 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center shrink-0">
                        {form.type === "link"
                          ? <Globe className={`w-5 h-5 ${form.is_active ? "text-[#D1F366]" : "text-muted-foreground"}`} />
                          : <MessageSquare className={`w-5 h-5 ${form.is_active ? "text-[#D1F366]" : "text-muted-foreground"}`} />
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold truncate">{form.name}</p>
                          <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${form.is_active ? "bg-[#D1F366]" : "bg-muted-foreground/40"}`} />
                        </div>
                        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                          <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded capitalize">
                            {form.type}
                          </span>
                          <span className="text-xs text-muted-foreground">{form.fields?.length ?? 0} campos</span>
                          <span className="text-xs text-muted-foreground">{count} respuesta{count !== 1 ? "s" : ""}</span>
                        </div>
                        {form.description && (
                          <p className="text-xs text-muted-foreground mt-1 truncate">{form.description}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Switch
                          checked={form.is_active}
                          onCheckedChange={(v) => handleToggle(form.id, v)}
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5 text-xs h-8"
                          onClick={() => setResponseView(form)}
                        >
                          <Eye className="w-3.5 h-3.5" />
                          Respuestas
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {form.type === "link" && (
                              <DropdownMenuItem onClick={() => copyFormLink(form.slug)} className="gap-2">
                                <Copy className="w-4 h-4" /> Copiar link
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                              onClick={() => handleDelete(form.id)}
                              className="gap-2 text-destructive focus:text-destructive"
                            >
                              <Trash2 className="w-4 h-4" /> Eliminar
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </TabsContent>

        {/* ── All submissions ── */}
        <TabsContent value="respuestas" className="mt-4">
          {submissions.length === 0 && forms.every(f => !f.submissions_count) ? (
            <div className="border border-border rounded-2xl py-20 text-center bg-card">
              <ClipboardList className="w-10 h-10 text-muted-foreground mx-auto mb-4" />
              <h3 className="font-semibold mb-1">Sin respuestas aún</h3>
              <p className="text-muted-foreground text-sm">
                Las respuestas aparecerán aquí cuando alguien complete un formulario.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {forms.filter(f => (f.submissions_count || 0) > 0 || formSubmissions(f.id).length > 0).map(form => {
                const fSubmissions = formSubmissions(form.id)
                const total = form.submissions_count || fSubmissions.length
                return (
                  <div key={form.id} className="border border-border rounded-xl overflow-hidden bg-card">
                    <div
                      className="flex items-center justify-between px-4 py-3 border-b border-border cursor-pointer hover:bg-muted/30 transition-colors"
                      onClick={() => setResponseView(form)}
                    >
                      <div className="flex items-center gap-2">
                        {form.type === "link"
                          ? <Globe className="w-4 h-4 text-muted-foreground" />
                          : <MessageSquare className="w-4 h-4 text-muted-foreground" />
                        }
                        <p className="font-semibold text-sm">{form.name}</p>
                        <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                          {total} respuesta{total !== 1 ? "s" : ""}
                        </span>
                      </div>
                      <Eye className="w-4 h-4 text-muted-foreground" />
                    </div>
                    {fSubmissions.length > 0 && (
                      <div className="divide-y divide-border">
                        {fSubmissions.slice(0, 3).map(s => {
                          const displayName = s.data?.["Nombre"] || s.data?.["nombre"] || s.data?.["name"] || "Sin nombre"
                          return (
                            <div key={s.id} className="px-4 py-2.5 flex items-center gap-3">
                              <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center shrink-0 text-xs font-semibold text-muted-foreground uppercase">
                                {displayName[0]}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{displayName}</p>
                                <p className="text-xs text-muted-foreground">
                                  {formatDistanceToNow(new Date(s.created_at), { addSuffix: true, locale: es })}
                                </p>
                              </div>
                            </div>
                          )
                        })}
                        {fSubmissions.length > 3 && (
                          <button
                            onClick={() => setResponseView(form)}
                            className="w-full text-center text-xs text-muted-foreground hover:text-foreground py-2.5 transition-colors"
                          >
                            Ver las {fSubmissions.length - 3} restantes →
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ── Create dialog ── */}
      <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) resetDialog() }}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nuevo formulario</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-5">
            <div className="space-y-1.5">
              <Label>Nombre del formulario</Label>
              <Input
                placeholder="Ej: Solicitud de presupuesto"
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select
                value={formData.type}
                onValueChange={v => setFormData({ ...formData, type: v as "link" | "conversacional" })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="link">
                    <div className="flex items-center gap-2">
                      <Globe className="w-4 h-4" />
                      <span>Link — formulario web que se comparte como URL</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="conversacional">
                    <div className="flex items-center gap-2">
                      <MessageSquare className="w-4 h-4" />
                      <span>Conversacional — el bot lo completa en el chat</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Descripción <span className="text-muted-foreground font-normal">(opcional)</span></Label>
              <Textarea
                placeholder="Para qué sirve este formulario..."
                value={formData.description}
                onChange={e => setFormData({ ...formData, description: e.target.value })}
                rows={2}
              />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Campos del formulario</Label>
                <button
                  type="button"
                  onClick={addField}
                  className="text-xs text-[#D1F366] hover:text-[#D1F366]/80 flex items-center gap-1 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" /> Agregar campo
                </button>
              </div>
              <div className="space-y-2">
                {fields.map((field, i) => (
                  <div key={i} className="border border-border rounded-xl p-3 space-y-2.5 bg-muted/30">
                    <div className="flex items-center gap-2">
                      <Input
                        placeholder="Nombre del campo"
                        value={field.label}
                        onChange={e => updateField(i, { label: e.target.value })}
                        className="flex-1 h-8 text-sm"
                      />
                      <Select
                        value={field.type}
                        onValueChange={v => updateField(i, { type: v as FormField["type"] })}
                      >
                        <SelectTrigger className="w-36 h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(FIELD_TYPE_LABELS).map(([val, label]) => (
                            <SelectItem key={val} value={val} className="text-xs">{label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-xs text-muted-foreground">Req.</span>
                        <Switch
                          checked={field.required}
                          onCheckedChange={v => updateField(i, { required: v })}
                          className="scale-75"
                        />
                      </div>
                      {fields.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeField(i)}
                          className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    {field.type !== "select" && (
                      <Input
                        placeholder="Placeholder (texto de ejemplo en el campo)"
                        value={field.placeholder || ""}
                        onChange={e => updateField(i, { placeholder: e.target.value })}
                        className="h-7 text-xs"
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { setIsDialogOpen(false); resetDialog() }}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isLoading || !formData.name.trim()} className="gap-2">
                {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                Crear formulario
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
