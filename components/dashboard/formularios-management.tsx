"use client"

import React, { useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { toast } from "sonner"
import {
  Plus, FileText, Globe, MessageSquare, MoreHorizontal,
  Trash2, Eye, Copy, Loader2, ArrowLeft, ClipboardList,
  TrendingUp, CheckCircle, Pencil, GripVertical, X,
  Link2, ExternalLink, Settings, ListChecks, BarChart3,
  AlignLeft, CircleDot, CheckSquare, SlidersHorizontal,
  Hash, Mail, Phone, Type, Calendar, Clock, ChevronDown,
} from "lucide-react"
import { formatDistanceToNow, format } from "date-fns"
import { es } from "date-fns/locale"

// ─── Types ───────────────────────────────────────────────────────────────────
interface FormField {
  label: string
  type: "text" | "email" | "phone" | "textarea" | "radio" | "checkbox" | "slider" | "number" | "date" | "time" | "select"
  required: boolean
  placeholder?: string
  options?: string[]
  min?: number
  max?: number
  step?: number
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

const FIELD_TYPE_CONFIG: Record<string, {
  label: string
  icon: React.ElementType
  border: string
  badge: string
  badgeText: string
  iconColor: string
}> = {
  text:     { label: "Texto corto",      icon: Type,               border: "border-l-blue-400",   badge: "bg-blue-100 dark:bg-blue-900/40",   badgeText: "text-blue-600 dark:text-blue-400",   iconColor: "text-blue-500" },
  textarea: { label: "Desarrollo",       icon: AlignLeft,          border: "border-l-orange-400", badge: "bg-orange-100 dark:bg-orange-900/40", badgeText: "text-orange-600 dark:text-orange-400", iconColor: "text-orange-500" },
  email:    { label: "Email",            icon: Mail,               border: "border-l-purple-400", badge: "bg-purple-100 dark:bg-purple-900/40", badgeText: "text-purple-600 dark:text-purple-400", iconColor: "text-purple-500" },
  phone:    { label: "Teléfono",         icon: Phone,              border: "border-l-green-400",  badge: "bg-green-100 dark:bg-green-900/40",  badgeText: "text-green-600 dark:text-green-400",  iconColor: "text-green-500" },
  radio:    { label: "Una opción",       icon: CircleDot,          border: "border-l-amber-400",  badge: "bg-amber-100 dark:bg-amber-900/40",  badgeText: "text-amber-600 dark:text-amber-400",  iconColor: "text-amber-500" },
  checkbox: { label: "Varias opciones",  icon: CheckSquare,        border: "border-l-indigo-400", badge: "bg-indigo-100 dark:bg-indigo-900/40", badgeText: "text-indigo-600 dark:text-indigo-400", iconColor: "text-indigo-500" },
  slider:   { label: "Barra deslizante", icon: SlidersHorizontal,  border: "border-l-rose-400",   badge: "bg-rose-100 dark:bg-rose-900/40",   badgeText: "text-rose-600 dark:text-rose-400",   iconColor: "text-rose-500" },
  number:   { label: "Número",           icon: Hash,               border: "border-l-teal-400",   badge: "bg-teal-100 dark:bg-teal-900/40",   badgeText: "text-teal-600 dark:text-teal-400",   iconColor: "text-teal-500" },
  date:     { label: "Fecha",            icon: Calendar,           border: "border-l-sky-400",    badge: "bg-sky-100 dark:bg-sky-900/40",     badgeText: "text-sky-600 dark:text-sky-400",     iconColor: "text-sky-500" },
  time:     { label: "Hora",             icon: Clock,              border: "border-l-violet-400", badge: "bg-violet-100 dark:bg-violet-900/40", badgeText: "text-violet-600 dark:text-violet-400", iconColor: "text-violet-500" },
  select:   { label: "Lista desplegable",icon: ChevronDown,        border: "border-l-pink-400",   badge: "bg-pink-100 dark:bg-pink-900/40",   badgeText: "text-pink-600 dark:text-pink-400",   iconColor: "text-pink-500" },
}

export function FormulariosManagement({ initialForms, initialSubmissions, userId }: FormulariosManagementProps) {
  const [forms, setForms] = useState<Form[]>(initialForms)
  const [submissions, setSubmissions] = useState<FormSubmission[]>(initialSubmissions)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [responseView, setResponseView] = useState<Form | null>(null)
  const [editingForm, setEditingForm] = useState<Form | null>(null)
  const [editFields, setEditFields] = useState<FormField[]>([])
  const [editMeta, setEditMeta] = useState({ name: "", description: "" })
  const [isSaving, setIsSaving] = useState(false)
  const supabase = createClient()

  const [newFormData, setNewFormData] = useState({ name: "", type: "link" as "link" | "conversacional" })

  const generateSlug = (name: string) =>
    name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").trim()

  // ── Create ────────────────────────────────────────────────────────────────
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newFormData.name.trim()) return
    setIsLoading(true)
    try {
      const slug = generateSlug(newFormData.name)
      const defaultFields: FormField[] = [
        { label: "Nombre", type: "text", required: true, placeholder: "Ej: Juan García" },
        { label: "Email", type: "email", required: true, placeholder: "tu@email.com" },
      ]
      const { data, error } = await supabase
        .from("forms")
        .insert([{
          user_id: userId,
          name: newFormData.name.trim(),
          type: newFormData.type,
          description: null,
          fields: defaultFields,
          slug,
          is_active: true,
          submissions_count: 0,
        }])
        .select()
        .single()
      if (error) throw error
      setForms([data, ...forms])
      setIsDialogOpen(false)
      setNewFormData({ name: "", type: "link" })
      toast.success(`Formulario "${newFormData.name}" creado`, {
        description: "Hacé clic en Editar para agregar tus preguntas.",
        duration: 4000,
      })
    } catch (err) {
      console.error(err)
      toast.error("Error al crear el formulario", { duration: 4000 })
    } finally {
      setIsLoading(false)
    }
  }

  const handleToggle = async (formId: string, isActive: boolean) => {
    try {
      const { error } = await supabase.from("forms").update({ is_active: isActive }).eq("id", formId)
      if (error) throw error
      setForms(forms.map(f => f.id === formId ? { ...f, is_active: isActive } : f))
      if (editingForm?.id === formId) setEditingForm(prev => prev ? { ...prev, is_active: isActive } : null)
      const form = forms.find(f => f.id === formId)
      toast.success(`Formulario ${isActive ? "activado" : "desactivado"}`, {
        description: `"${form?.name}" fue ${isActive ? "activado" : "desactivado"}.`,
        duration: 3000,
      })
    } catch {
      toast.error("No se pudo cambiar el estado.")
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

  // ── Editor ────────────────────────────────────────────────────────────────
  const openEditor = (form: Form) => {
    setEditingForm(form)
    setEditMeta({ name: form.name, description: form.description || "" })
    setEditFields(
      form.fields?.length
        ? form.fields.map(f => ({ ...f, options: f.options ? [...f.options] : [] }))
        : [
            { label: "Nombre", type: "text", required: true, placeholder: "" },
            { label: "Email", type: "email", required: true, placeholder: "" },
          ]
    )
  }

  const addEditField = () => {
    setEditFields([...editFields, { label: "", type: "text", required: false, placeholder: "" }])
  }

  const removeEditField = (idx: number) => {
    setEditFields(editFields.filter((_, i) => i !== idx))
  }

  const updateEditField = (idx: number, updates: Partial<FormField>) => {
    setEditFields(editFields.map((f, i) => (i === idx ? { ...f, ...updates } : f)))
  }

  const addOption = (fieldIdx: number) => {
    const opts = [...(editFields[fieldIdx].options || []), ""]
    updateEditField(fieldIdx, { options: opts })
  }

  const updateOption = (fieldIdx: number, optIdx: number, value: string) => {
    const opts = (editFields[fieldIdx].options || []).map((o, i) => (i === optIdx ? value : o))
    updateEditField(fieldIdx, { options: opts })
  }

  const removeOption = (fieldIdx: number, optIdx: number) => {
    const opts = (editFields[fieldIdx].options || []).filter((_, i) => i !== optIdx)
    updateEditField(fieldIdx, { options: opts })
  }

  const handleSaveEdit = async () => {
    if (!editingForm || !editMeta.name.trim()) return
    setIsSaving(true)
    try {
      const cleanFields = editFields.filter(f => f.label.trim())
      const { data, error } = await supabase
        .from("forms")
        .update({
          name: editMeta.name.trim(),
          description: editMeta.description || null,
          fields: cleanFields,
          updated_at: new Date().toISOString(),
        })
        .eq("id", editingForm.id)
        .select()
        .single()
      if (error) throw error
      setForms(forms.map(f => f.id === editingForm.id ? data : f))
      setEditingForm(data)
      toast.success("Formulario guardado", { description: "Los cambios fueron guardados correctamente.", duration: 3000 })
    } catch (err) {
      console.error(err)
      toast.error("Error al guardar el formulario.")
    } finally {
      setIsSaving(false)
    }
  }

  const formSubmissions = (formId: string) => submissions.filter(s => s.form_id === formId)
  const totalSubmissions = submissions.length
  const activeForms = forms.filter(f => f.is_active).length

  // ── Editor view ───────────────────────────────────────────────────────────
  if (editingForm) {
    const formLink = typeof window !== "undefined"
      ? `${window.location.origin}/f/${editingForm.slug}`
      : `/f/${editingForm.slug}`

    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 px-1 pt-2">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setEditingForm(null)}
              className="p-2 rounded-xl hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h2 className="text-3xl font-bold dark:text-white">Editar Formulario</h2>
              <p className="text-muted-foreground text-sm mt-0.5">
                {editingForm.is_active
                  ? <span className="text-green-500 font-semibold">● Activo</span>
                  : <span className="text-muted-foreground">● Inactivo</span>
                }
                {" · "}{editingForm.type === "link" ? "Formulario web" : "Conversacional"}
              </p>
            </div>
          </div>
          <Button
            onClick={handleSaveEdit}
            disabled={isSaving || !editMeta.name.trim()}
            className="bg-[#D1F366] text-[#1C1C28] hover:bg-[#B3D93C] font-bold rounded-xl px-6 gap-2 shadow-lg"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            Guardar cambios
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Left — questions */}
          <div className="lg:col-span-2 space-y-5">
            {/* Form info */}
            <div className="executive-card space-y-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-[#D1F366]/10 text-[#D1F366] rounded-2xl flex items-center justify-center flex-shrink-0">
                  <FileText className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">Información General</p>
                  <input
                    className="text-lg font-bold bg-transparent border-none outline-none w-full text-foreground placeholder:text-muted-foreground mt-0.5 focus:ring-0"
                    value={editMeta.name}
                    onChange={e => setEditMeta({ ...editMeta, name: e.target.value })}
                    placeholder="Nombre del formulario"
                  />
                </div>
              </div>
              <Textarea
                placeholder="Descripción del formulario (opcional)"
                value={editMeta.description}
                onChange={e => setEditMeta({ ...editMeta, description: e.target.value })}
                rows={2}
                className="resize-none text-sm rounded-2xl"
              />
              <div className="flex items-center gap-2">
                <span className="text-xs bg-muted px-3 py-1.5 rounded-full font-medium capitalize">{editingForm.type}</span>
                <span className="text-xs text-muted-foreground">
                  {editFields.filter(f => f.label).length} preguntas
                </span>
                <span className="text-xs text-muted-foreground">
                  {editingForm.submissions_count || formSubmissions(editingForm.id).length} respuestas
                </span>
              </div>
            </div>

            {/* Questions */}
            <div className="executive-card space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-blue-50 dark:bg-blue-900/30 text-blue-500 rounded-2xl flex items-center justify-center flex-shrink-0">
                    <ListChecks className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">Preguntas</p>
                    <p className="font-bold dark:text-white">Constructor de campos</p>
                  </div>
                </div>
                <button
                  onClick={addEditField}
                  className="flex items-center gap-1.5 text-sm font-semibold text-[#D1F366] hover:text-[#B3D93C] transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Agregar
                </button>
              </div>

              {editFields.length === 0 ? (
                <div className="bg-muted/40 rounded-2xl py-12 flex flex-col items-center justify-center text-center">
                  <ListChecks className="w-10 h-10 text-muted-foreground mb-3" />
                  <p className="font-semibold mb-1">Sin preguntas todavía</p>
                  <p className="text-sm text-muted-foreground mb-4">Agregá la primera pregunta de tu formulario.</p>
                  <button onClick={addEditField} className="text-sm font-semibold text-[#D1F366] hover:underline">
                    + Agregar pregunta
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {editFields.map((field, i) => {
                    const cfg = FIELD_TYPE_CONFIG[field.type] ?? FIELD_TYPE_CONFIG.text
                    const TypeIcon = cfg.icon
                    const hasOptions = field.type === "radio" || field.type === "checkbox" || field.type === "select"
                    const isSlider = field.type === "slider"
                    const isDateOrTime = field.type === "date" || field.type === "time"
                    const hasPlaceholder = !hasOptions && !isSlider && !isDateOrTime

                    return (
                      <div
                        key={i}
                        className={`rounded-2xl overflow-hidden border border-border border-l-4 bg-card shadow-md transition-all hover:shadow-lg ${cfg.border}`}
                      >
                        {/* ── Header ── */}
                        <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-muted/30">
                          <GripVertical className="w-4 h-4 text-muted-foreground/30 flex-shrink-0" />
                          <span className={`w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0 ${cfg.badge}`}>
                            <TypeIcon className={`w-3.5 h-3.5 ${cfg.badgeText}`} />
                          </span>
                          <Input
                            placeholder="Escribí la pregunta aquí..."
                            value={field.label}
                            onChange={e => updateEditField(i, { label: e.target.value })}
                            className="flex-1 h-9 text-sm font-semibold border-0 bg-transparent focus-visible:ring-0 px-1"
                          />
                          <Select
                            value={field.type}
                            onValueChange={v => {
                              const t = v as FormField["type"]
                              const needsOptions = t === "radio" || t === "checkbox" || t === "select"
                              updateEditField(i, {
                                type: t,
                                options: needsOptions ? (field.options?.length ? field.options : [""]) : [],
                                min: t === "slider" ? (field.min ?? 0) : undefined,
                                max: t === "slider" ? (field.max ?? 100) : undefined,
                                step: t === "slider" ? (field.step ?? 1) : undefined,
                              })
                            }}
                          >
                            <SelectTrigger className="w-44 h-8 text-xs rounded-xl shrink-0">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Object.entries(FIELD_TYPE_CONFIG).map(([val, c]) => {
                                const Ic = c.icon
                                return (
                                  <SelectItem key={val} value={val} className="text-xs">
                                    <div className="flex items-center gap-2">
                                      <Ic className={`w-3.5 h-3.5 ${c.iconColor}`} />
                                      {c.label}
                                    </div>
                                  </SelectItem>
                                )
                              })}
                            </SelectContent>
                          </Select>
                          <button
                            onClick={() => removeEditField(i)}
                            className="text-muted-foreground hover:text-destructive transition-colors flex-shrink-0"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>

                        {/* ── Body ── */}
                        <div className="px-4 pb-4 pt-3 space-y-3">

                          {/* Placeholder — text-like fields */}
                          {hasPlaceholder && (
                            <Input
                              placeholder="Texto de ayuda en el campo (opcional)"
                              value={field.placeholder || ""}
                              onChange={e => updateEditField(i, { placeholder: e.target.value })}
                              className="h-8 text-xs rounded-xl"
                            />
                          )}

                          {/* Preview — date / time */}
                          {isDateOrTime && (
                            <div className="bg-muted/50 rounded-xl px-4 py-3">
                              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Vista previa</p>
                              <input
                                type={field.type}
                                disabled
                                className={`w-full bg-background border border-border rounded-xl px-3 py-2 text-sm text-muted-foreground cursor-not-allowed ${field.type === "time" ? "w-40" : ""}`}
                              />
                            </div>
                          )}

                          {/* Options — radio, checkbox & select */}
                          {hasOptions && (
                            <div className="space-y-2">
                              {field.type === "select" && (
                                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                                  Opciones de la lista
                                </p>
                              )}
                              {(field.options || [""]).map((opt, oi) => (
                                <div key={oi} className="flex items-center gap-2">
                                  {/* Visual indicator */}
                                  {field.type === "radio"
                                    ? <div className="w-4 h-4 rounded-full border-2 border-muted-foreground/40 flex-shrink-0" />
                                    : field.type === "checkbox"
                                      ? <div className="w-4 h-4 rounded border-2 border-muted-foreground/40 flex-shrink-0" />
                                      : <ChevronDown className="w-4 h-4 text-muted-foreground/40 flex-shrink-0" />
                                  }
                                  <Input
                                    placeholder={`Opción ${oi + 1}`}
                                    value={opt}
                                    onChange={e => updateOption(i, oi, e.target.value)}
                                    className="h-8 text-sm flex-1 rounded-xl"
                                  />
                                  {(field.options || []).length > 1 && (
                                    <button
                                      onClick={() => removeOption(i, oi)}
                                      className="text-muted-foreground hover:text-destructive transition-colors flex-shrink-0"
                                    >
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              ))}
                              <button
                                onClick={() => addOption(i)}
                                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors font-medium pl-6"
                              >
                                <Plus className="w-3 h-3" />
                                Agregar opción
                              </button>
                            </div>
                          )}

                          {/* Slider config */}
                          {isSlider && (
                            <div className="space-y-3">
                              <div className="grid grid-cols-3 gap-2">
                                {[
                                  { label: "Mínimo", key: "min", default: 0 },
                                  { label: "Máximo", key: "max", default: 100 },
                                  { label: "Paso",   key: "step", default: 1 },
                                ].map(({ label, key, default: def }) => (
                                  <div key={key} className="space-y-1">
                                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{label}</p>
                                    <Input
                                      type="number"
                                      value={(field as any)[key] ?? def}
                                      onChange={e => updateEditField(i, { [key]: Number(e.target.value) } as any)}
                                      className="h-8 text-xs rounded-xl text-center"
                                    />
                                  </div>
                                ))}
                              </div>
                              {/* Visual preview of slider */}
                              <div className="bg-muted/50 rounded-xl px-4 py-3 space-y-1.5">
                                <div className="flex justify-between text-[10px] text-muted-foreground font-semibold">
                                  <span>{field.min ?? 0}</span>
                                  <span className={`font-bold text-xs ${cfg.badgeText}`}>
                                    {Math.round(((field.min ?? 0) + (field.max ?? 100)) / 2)}
                                  </span>
                                  <span>{field.max ?? 100}</span>
                                </div>
                                <input
                                  type="range"
                                  min={field.min ?? 0}
                                  max={field.max ?? 100}
                                  step={field.step ?? 1}
                                  defaultValue={Math.round(((field.min ?? 0) + (field.max ?? 100)) / 2)}
                                  className="w-full accent-rose-400 h-1.5 cursor-pointer"
                                  readOnly
                                />
                              </div>
                            </div>
                          )}

                          {/* Required toggle */}
                          <div className="flex items-center gap-2 pt-1">
                            <Switch
                              checked={field.required}
                              onCheckedChange={v => updateEditField(i, { required: v })}
                              className="scale-75 origin-left"
                            />
                            <span className="text-xs text-muted-foreground">Respuesta obligatoria</span>
                          </div>
                        </div>
                      </div>
                    )
                  })}

                  <button
                    onClick={addEditField}
                    className="w-full border border-dashed border-border rounded-2xl py-3.5 text-sm text-muted-foreground hover:text-foreground hover:border-muted-foreground/40 hover:bg-muted/30 transition-all flex items-center justify-center gap-2 font-medium"
                  >
                    <Plus className="w-4 h-4" />
                    Agregar pregunta
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Right — settings */}
          <div className="space-y-5">
            {/* Active / config */}
            <div className="bg-[#1C1C28] text-white p-6 rounded-3xl shadow-[0_8px_32px_rgba(0,0,0,0.14)] border border-white/5 space-y-5">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-amber-900/30 text-amber-400 rounded-2xl flex items-center justify-center flex-shrink-0">
                  <Settings className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-xs text-white/40 font-semibold uppercase tracking-wide">Configuración</p>
                  <p className="font-bold text-white">Estado y tipo</p>
                </div>
              </div>

              <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl">
                <div>
                  <p className="text-sm font-semibold text-white">Formulario activo</p>
                  <p className="text-xs text-white/40 mt-0.5">
                    {editingForm.is_active ? "Visible y recibiendo respuestas" : "Desactivado temporalmente"}
                  </p>
                </div>
                <Switch
                  checked={editingForm.is_active}
                  onCheckedChange={v => handleToggle(editingForm.id, v)}
                />
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="bg-white/5 rounded-2xl p-3">
                  <p className="text-xs text-white/40 font-semibold uppercase tracking-wide mb-1">Tipo</p>
                  <div className="flex items-center gap-1.5">
                    {editingForm.type === "link"
                      ? <Globe className="w-4 h-4 text-[#D1F366]" />
                      : <MessageSquare className="w-4 h-4 text-[#D1F366]" />
                    }
                    <span className="font-semibold text-white capitalize">{editingForm.type}</span>
                  </div>
                </div>
                <div className="bg-white/5 rounded-2xl p-3">
                  <p className="text-xs text-white/40 font-semibold uppercase tracking-wide mb-1">Creado</p>
                  <p className="font-semibold text-white">
                    {format(new Date(editingForm.created_at), "d MMM yyyy", { locale: es })}
                  </p>
                </div>
              </div>
            </div>

            {/* Link */}
            {editingForm.type === "link" && (
              <div className="bg-[#1C1C28] text-white p-6 rounded-3xl shadow-[0_8px_32px_rgba(0,0,0,0.14)] border border-white/5 space-y-4">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-green-900/30 text-green-400 rounded-2xl flex items-center justify-center flex-shrink-0">
                    <Link2 className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-xs text-white/40 font-semibold uppercase tracking-wide">Link del formulario</p>
                    <p className="font-bold text-white">Compartir con clientes</p>
                  </div>
                </div>
                <div className="bg-white/5 rounded-2xl px-4 py-3 text-xs text-white/50 break-all font-mono select-all">
                  {formLink}
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="flex-1 gap-1.5 text-xs h-9 rounded-xl font-semibold bg-white/10 text-white hover:bg-white/20 border-0"
                    onClick={() => copyFormLink(editingForm.slug)}
                  >
                    <Copy className="w-3.5 h-3.5" />
                    Copiar link
                  </Button>
                  <Button
                    size="sm"
                    className="gap-1.5 text-xs h-9 px-3 rounded-xl bg-white/10 text-white hover:bg-white/20 border-0"
                    onClick={() => window.open(formLink, "_blank")}
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            )}

            {/* Save CTA */}
            <div className="bg-[#D1F366]/10 border border-[#D1F366]/20 rounded-3xl p-6 space-y-4">
              <p className="font-bold dark:text-white">Confirmar cambios</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Los cambios se aplican de inmediato al formulario publicado.
              </p>
              <button
                onClick={handleSaveEdit}
                disabled={isSaving || !editMeta.name.trim()}
                className="w-full bg-[#D1F366] text-[#1C1C28] font-black text-xs uppercase tracking-widest py-4 rounded-2xl hover:bg-white transition-all shadow-xl shadow-[#D1F366]/5 active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Guardar →
              </button>
              <p className="text-xs text-center text-muted-foreground">
                Estado: <span className={editingForm.is_active ? "text-green-500 font-semibold" : "text-muted-foreground font-semibold"}>
                  {editingForm.is_active ? "Activo" : "Inactivo"}
                </span>
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Response detail view ──────────────────────────────────────────────────
  if (responseView) {
    const these = formSubmissions(responseView.id)
    const cols = responseView.fields.map(f => f.label)
    const displayCount = responseView.submissions_count || these.length

    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3 px-1 pt-2">
          <button
            onClick={() => setResponseView(null)}
            className="p-2 rounded-xl hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-3xl font-bold dark:text-white">{responseView.name}</h2>
            <p className="text-muted-foreground text-sm mt-0.5">
              {displayCount} respuesta{displayCount !== 1 ? "s" : ""} · {responseView.type}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="bg-card rounded-3xl p-5 shadow-lg border border-border flex items-center gap-4">
            <div className="w-12 h-12 bg-[#D1F366]/10 text-[#D1F366] rounded-2xl flex items-center justify-center flex-shrink-0">
              <BarChart3 className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">Respuestas</p>
              <p className="text-2xl font-bold dark:text-white">{displayCount}</p>
            </div>
          </div>
          <div className="bg-card rounded-3xl p-5 shadow-lg border border-border flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-50 dark:bg-blue-900/30 text-blue-500 rounded-2xl flex items-center justify-center flex-shrink-0">
              <ListChecks className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">Campos</p>
              <p className="text-2xl font-bold dark:text-white">{responseView.fields.length}</p>
            </div>
          </div>
          <div className="bg-card rounded-3xl p-5 shadow-lg border border-border flex items-center gap-4">
            <div className="w-12 h-12 bg-amber-50 dark:bg-amber-900/30 text-amber-500 rounded-2xl flex items-center justify-center flex-shrink-0">
              <ClipboardList className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">Última</p>
              <p className="text-2xl font-bold dark:text-white">
                {these.length > 0
                  ? format(new Date(these[0].created_at), "d/M", { locale: es })
                  : "--"
                }
              </p>
            </div>
          </div>
        </div>

        <div className="executive-card overflow-hidden p-0">
          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
            <p className="font-bold dark:text-white">Respuestas recibidas</p>
          </div>
          {these.length === 0 ? (
            <div className="py-16 text-center">
              <ClipboardList className="w-10 h-10 text-muted-foreground mx-auto mb-4" />
              <h3 className="font-semibold mb-1">Sin respuestas cargadas</h3>
              <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                {displayCount > 0
                  ? `Hay ${displayCount} respuestas registradas. Recargá la página para verlas.`
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
                      <th key={col} className="text-left text-muted-foreground text-xs px-6 py-3 font-semibold uppercase tracking-wide whitespace-nowrap">
                        {col}
                      </th>
                    ))}
                    <th className="text-left text-muted-foreground text-xs px-6 py-3 font-semibold uppercase tracking-wide whitespace-nowrap">Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {these.map(s => (
                    <tr key={s.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                      {cols.map(col => (
                        <td key={col} className="px-6 py-4 text-sm whitespace-nowrap">
                          {s.data?.[col] ?? <span className="text-muted-foreground">--</span>}
                        </td>
                      ))}
                      <td className="px-6 py-4 text-sm text-muted-foreground whitespace-nowrap">
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

  // ── Main list view ─────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6 px-1 pt-2">
        <div>
          <h2 className="text-3xl font-bold dark:text-white">Formularios</h2>
          <p className="text-muted-foreground text-sm mt-1">
            Formularios web (link) o conversacionales para captar información de tus clientes.
          </p>
        </div>
        <button
          onClick={() => setIsDialogOpen(true)}
          className="bg-[#D1F366] text-[#1C1C28] font-black text-xs uppercase tracking-widest py-3 px-5 rounded-2xl hover:bg-white transition-all shadow-xl shadow-[#D1F366]/5 active:scale-95 flex items-center gap-2 whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          Nuevo formulario
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-card rounded-3xl p-5 shadow-lg border border-border flex items-center gap-4">
          <div className="w-12 h-12 bg-[#D1F366]/10 text-[#D1F366] rounded-2xl flex items-center justify-center flex-shrink-0">
            <FileText className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">Total</p>
            <p className="text-2xl font-bold dark:text-white">{forms.length}</p>
          </div>
        </div>
        <div className="bg-card rounded-3xl p-5 shadow-lg border border-border flex items-center gap-4">
          <div className="w-12 h-12 bg-blue-50 dark:bg-blue-900/30 text-blue-500 rounded-2xl flex items-center justify-center flex-shrink-0">
            <TrendingUp className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">Respuestas</p>
            <p className="text-2xl font-bold dark:text-white">
              {forms.reduce((acc, f) => acc + (f.submissions_count || 0), 0) || totalSubmissions}
            </p>
          </div>
        </div>
        <div className="bg-card rounded-3xl p-5 shadow-lg border border-border flex items-center gap-4">
          <div className="w-12 h-12 bg-green-50 dark:bg-green-900/30 text-green-500 rounded-2xl flex items-center justify-center flex-shrink-0">
            <CheckCircle className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">Activos</p>
            <p className="text-2xl font-bold dark:text-white">{activeForms}</p>
          </div>
        </div>
      </div>

      <Tabs defaultValue="formularios">
        <TabsList className="rounded-2xl">
          <TabsTrigger value="formularios" className="rounded-xl">Formularios</TabsTrigger>
          <TabsTrigger value="respuestas" className="rounded-xl">Todas las respuestas</TabsTrigger>
        </TabsList>

        {/* ── Forms list ── */}
        <TabsContent value="formularios" className="mt-5">
          {forms.length === 0 ? (
            <div className="bg-card rounded-3xl border border-border p-12 flex flex-col items-center justify-center text-center shadow-lg">
              <FileText className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-1">Sin formularios aún</h3>
              <p className="text-sm text-muted-foreground mb-6">
                Creá tu primer formulario de link o conversacional para captar datos de clientes.
              </p>
              <button
                onClick={() => setIsDialogOpen(true)}
                className="bg-[#D1F366] text-[#1C1C28] font-black text-xs uppercase tracking-widest py-3 px-6 rounded-2xl hover:bg-white transition-all shadow-xl shadow-[#D1F366]/5 active:scale-95 flex items-center gap-2"
              >
                <Plus className="w-4 h-4" /> Crear formulario
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {forms.map(form => {
                const count = form.submissions_count || formSubmissions(form.id).length
                return (
                  <div
                    key={form.id}
                    className="bg-card rounded-3xl p-5 shadow-lg border border-border flex items-center justify-between gap-4 hover:shadow-lg hover:-translate-y-0.5 transition-all"
                  >
                    {/* Icon + info */}
                    <div className="flex items-center gap-5 flex-1 min-w-0">
                      <div className={`w-14 h-14 rounded-2xl flex-shrink-0 flex items-center justify-center ${
                        form.is_active
                          ? "bg-[#D1F366]/10 text-[#D1F366]"
                          : "bg-muted text-muted-foreground"
                      }`}>
                        {form.type === "link"
                          ? <Globe className="h-7 w-7" />
                          : <MessageSquare className="h-7 w-7" />
                        }
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2.5 mb-1 flex-wrap">
                          <h4 className="font-bold text-lg dark:text-white truncate">{form.name}</h4>
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                            form.is_active
                              ? "bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800"
                              : "bg-muted text-muted-foreground border-border"
                          }`}>
                            {form.is_active ? "Activo" : "Inactivo"}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <span className="capitalize">{form.type}</span>
                          <span>{form.fields?.length ?? 0} campos</span>
                          <span>{count} respuesta{count !== 1 ? "s" : ""}</span>
                        </div>
                        {form.description && (
                          <p className="text-xs text-muted-foreground mt-1 truncate">{form.description}</p>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Switch
                        checked={form.is_active}
                        onCheckedChange={v => handleToggle(form.id, v)}
                      />
                      <Button
                        onClick={() => openEditor(form)}
                        className="px-5 py-2.5 h-auto rounded-xl font-bold text-sm bg-[#D1F366] text-[#1C1C28] hover:bg-[#B3D93C] shadow-lg gap-1.5"
                      >
                        <Pencil className="w-4 h-4" />
                        Editar
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => setResponseView(form)}
                        className="px-5 py-2.5 h-auto rounded-xl font-bold text-sm bg-muted text-muted-foreground hover:bg-muted/80 gap-1.5"
                      >
                        <Eye className="w-4 h-4" />
                        Respuestas
                      </Button>
                      <DropdownMenu modal={false}>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-9 w-9 p-0 rounded-xl">
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {form.type === "link" && (
                            <DropdownMenuItem onClick={() => copyFormLink(form.slug)} className="gap-2">
                              <Copy className="w-4 h-4" /> Copiar link
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
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
                )
              })}
            </div>
          )}
        </TabsContent>

        {/* ── All submissions ── */}
        <TabsContent value="respuestas" className="mt-5">
          {submissions.length === 0 && forms.every(f => !f.submissions_count) ? (
            <div className="bg-card rounded-3xl border border-border p-12 flex flex-col items-center justify-center text-center shadow-lg">
              <ClipboardList className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-1">Sin respuestas aún</h3>
              <p className="text-sm text-muted-foreground">
                Las respuestas aparecerán aquí cuando alguien complete un formulario.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {forms.filter(f => (f.submissions_count || 0) > 0 || formSubmissions(f.id).length > 0).map(form => {
                const fSubmissions = formSubmissions(form.id)
                const total = form.submissions_count || fSubmissions.length
                return (
                  <div key={form.id} className="bg-card rounded-3xl border border-border shadow-lg overflow-hidden hover:shadow-lg transition-all">
                    <div
                      className="flex items-center justify-between px-5 py-4 border-b border-border cursor-pointer hover:bg-muted/30 transition-colors"
                      onClick={() => setResponseView(form)}
                    >
                      <div className="flex items-center gap-3">
                        {form.type === "link"
                          ? <Globe className="w-4 h-4 text-muted-foreground" />
                          : <MessageSquare className="w-4 h-4 text-muted-foreground" />
                        }
                        <p className="font-bold dark:text-white">{form.name}</p>
                        <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full font-medium">
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
                            <div key={s.id} className="px-5 py-3 flex items-center gap-4">
                              <div className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center flex-shrink-0 text-xs font-bold text-muted-foreground uppercase">
                                {displayName[0]}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold truncate">{displayName}</p>
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
                            className="w-full text-center text-xs text-muted-foreground hover:text-foreground py-3 transition-colors font-medium"
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
      <Dialog open={isDialogOpen} onOpenChange={(open) => {
        setIsDialogOpen(open)
        if (!open) setNewFormData({ name: "", type: "link" })
      }}>
        <DialogContent className="max-w-md rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Nuevo formulario</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-5 mt-2">
            <div className="space-y-2">
              <label className="block text-xs font-bold text-muted-foreground uppercase tracking-widest">
                Nombre del formulario
              </label>
              <Input
                placeholder="Ej: Solicitud de presupuesto"
                value={newFormData.name}
                onChange={e => setNewFormData({ ...newFormData, name: e.target.value })}
                autoFocus
                required
                className="rounded-xl h-11"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-bold text-muted-foreground uppercase tracking-widest">
                Tipo de formulario
              </label>
              <div className="grid grid-cols-2 gap-3">
                {(["link", "conversacional"] as const).map(type => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setNewFormData({ ...newFormData, type })}
                    className={`flex flex-col items-start gap-3 rounded-2xl p-4 text-left transition-all ${
                      newFormData.type === type
                        ? "border-2 border-[#D1F366] bg-[#D1F366]/5"
                        : "border border-border hover:border-muted-foreground/40 bg-gray-50 dark:bg-white/5"
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                      newFormData.type === type
                        ? "bg-[#D1F366]/20 text-[#D1F366]"
                        : "bg-muted text-muted-foreground"
                    }`}>
                      {type === "link"
                        ? <Globe className="w-5 h-5" />
                        : <MessageSquare className="w-5 h-5" />
                      }
                    </div>
                    <div>
                      <p className="text-sm font-bold capitalize">{type}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {type === "link" ? "URL para compartir" : "El bot lo completa en el chat"}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-gray-50 dark:bg-white/5 rounded-2xl p-4 text-xs text-muted-foreground flex items-start gap-2.5">
              <span className="text-[#D1F366] font-bold mt-0.5">✓</span>
              <span>Una vez creado, usá el botón <strong className="text-foreground">Editar</strong> para agregar y configurar las preguntas del formulario.</span>
            </div>

            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" className="rounded-xl" onClick={() => setIsDialogOpen(false)}>
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={isLoading || !newFormData.name.trim()}
                className="rounded-xl bg-[#D1F366] text-[#1C1C28] font-bold hover:bg-[#B3D93C] gap-2"
              >
                {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                Crear formulario →
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
