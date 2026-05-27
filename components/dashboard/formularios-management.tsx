"use client"

import React, { useState, useEffect } from "react"
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
  Trash2, Eye, Copy, Loader2, ArrowLeft, ArrowRight, ClipboardList,
  TrendingUp, CheckCircle, Pencil, GripVertical, X,
  Link2, ExternalLink, Settings, ListChecks, BarChart3,
  AlignLeft, CircleDot, CheckSquare, SlidersHorizontal,
  Hash, Mail, Phone, Type, Calendar, Clock, ChevronDown,
  Calculator, CreditCard, Shield, Layers, ImagePlus, Palette, Package,
  Zap, Users,
} from "lucide-react"
import { formatDistanceToNow, format } from "date-fns"
import { es } from "date-fns/locale"

// ─── Types ───────────────────────────────────────────────────────────────────
interface FormField {
  label: string
  type: "text" | "email" | "phone" | "textarea" | "radio" | "checkbox" | "slider" | "number" | "date" | "time" | "select" | "product_selector"
  required: boolean
  placeholder?: string
  options?: string[]
  min?: number
  max?: number
  step?: number
  product_category?: string
  conditional?: { fieldLabel: string; value: string }
}

interface FormStep {
  id: string
  title: string
  fields: FormField[]
}

interface CotizadorConfig {
  enabled: boolean
  showPayment: boolean
}

interface ProductOption {
  id: string
  name: string
  category?: string
}

interface AfterSubmitConfig {
  action: "none" | "message" | "message_handover"
  message: string
}

const DEFAULT_AFTER_SUBMIT: AfterSubmitConfig = { action: "none", message: "" }

interface Form {
  id: string
  user_id: string
  name: string
  description?: string
  type: "link" | "conversacional"
  fields: FormField[]
  steps?: FormStep[]
  cotizador_config?: CotizadorConfig | null
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

const DEFAULT_THEME = {
  color1: "#b4f577", color2: "#00c6b6",
  panelBgType: "default" as "default" | "solid" | "gradient",
  panelBg: "#1e202c", panelBgFrom: "#1e202c", panelBgTo: "#0c0e17", panelBorder: "#424939",
  inputBg: "#0c0e17", inputBorder: "#424939", inputText: "#e1e1ef",
  titleType: "solid" as "solid" | "gradient",
  titleColor: "#ffffff", titleFrom: "#b4f577", titleTo: "#00c6b6",
  bodyColor: "#e1e1ef", labelColor: "#c2c9b5",
}
type ThemeState = typeof DEFAULT_THEME

const DEFAULT_COTIZADOR: CotizadorConfig = {
  enabled: false,
  showPayment: false,
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
  phone:    { label: "Telefono",         icon: Phone,              border: "border-l-green-400",  badge: "bg-green-100 dark:bg-green-900/40",  badgeText: "text-green-600 dark:text-green-400",  iconColor: "text-green-500" },
  radio:    { label: "Una opcion",       icon: CircleDot,          border: "border-l-amber-400",  badge: "bg-amber-100 dark:bg-amber-900/40",  badgeText: "text-amber-600 dark:text-amber-400",  iconColor: "text-amber-500" },
  checkbox: { label: "Varias opciones",  icon: CheckSquare,        border: "border-l-indigo-400", badge: "bg-indigo-100 dark:bg-indigo-900/40", badgeText: "text-indigo-600 dark:text-indigo-400", iconColor: "text-indigo-500" },
  slider:   { label: "Barra deslizante", icon: SlidersHorizontal,  border: "border-l-rose-400",   badge: "bg-rose-100 dark:bg-rose-900/40",   badgeText: "text-rose-600 dark:text-rose-400",   iconColor: "text-rose-500" },
  number:   { label: "Numero",           icon: Hash,               border: "border-l-teal-400",   badge: "bg-teal-100 dark:bg-teal-900/40",   badgeText: "text-teal-600 dark:text-teal-400",   iconColor: "text-teal-500" },
  date:     { label: "Fecha",            icon: Calendar,           border: "border-l-sky-400",    badge: "bg-sky-100 dark:bg-sky-900/40",     badgeText: "text-sky-600 dark:text-sky-400",     iconColor: "text-sky-500" },
  time:     { label: "Hora",             icon: Clock,              border: "border-l-violet-400", badge: "bg-violet-100 dark:bg-violet-900/40", badgeText: "text-violet-600 dark:text-violet-400", iconColor: "text-violet-500" },
  select:            { label: "Lista desplegable",  icon: ChevronDown,  border: "border-l-pink-400",   badge: "bg-pink-100 dark:bg-pink-900/40",   badgeText: "text-pink-600 dark:text-pink-400",   iconColor: "text-pink-500" },
  product_selector:  { label: "Selector de producto", icon: Package,    border: "border-l-lime-400",   badge: "bg-lime-100 dark:bg-lime-900/40",   badgeText: "text-lime-600 dark:text-lime-400",   iconColor: "text-lime-500" },
}

function hexLuminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function darkenHex(hex: string, factor: number): string {
  const r = Math.floor(parseInt(hex.slice(1, 3), 16) * factor)
  const g = Math.floor(parseInt(hex.slice(3, 5), 16) * factor)
  const b = Math.floor(parseInt(hex.slice(5, 7), 16) * factor)
  return `rgb(${r},${g},${b})`
}

export function FormulariosManagement({ initialForms, initialSubmissions, userId }: FormulariosManagementProps) {
  const [forms, setForms] = useState<Form[]>(initialForms)
  const [submissions, setSubmissions] = useState<FormSubmission[]>(initialSubmissions)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [responseView, setResponseView] = useState<Form | null>(null)
  const [editingForm, setEditingForm] = useState<Form | null>(null)
  const [editSteps, setEditSteps] = useState<FormStep[]>([])
  const [editCotizador, setEditCotizador] = useState<CotizadorConfig>(DEFAULT_COTIZADOR)
  const [editMeta, setEditMeta] = useState({ name: "", description: "", logo: "" })
  const [editTheme, setEditTheme] = useState<ThemeState>(DEFAULT_THEME)
  const [editorTab, setEditorTab] = useState<"constructor" | "preview">("constructor")
  const [previewStep, setPreviewStep] = useState(0)
  const [isSaving, setIsSaving] = useState(false)
  const supabase = createClient()

  const [newFormData, setNewFormData] = useState({ name: "", type: "link" as "link" | "conversacional" })
  const [availableProducts, setAvailableProducts] = useState<ProductOption[]>([])
  const [editAfterSubmit, setEditAfterSubmit] = useState<AfterSubmitConfig>(DEFAULT_AFTER_SUBMIT)

  useEffect(() => {
    if (!editingForm) return
    supabase
      .from("products")
      .select("id, name, category")
      .eq("user_id", userId)
      .eq("is_available", true)
      .then(({ data }) => { if (data) setAvailableProducts(data) })
  }, [editingForm?.id])

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
        { label: "Nombre", type: "text", required: true, placeholder: "Ej: Juan Garcia" },
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
        description: "Hace clic en Editar para agregar tus preguntas.",
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
    setEditMeta({ name: form.name, description: form.description || "", logo: form.settings?.logo || "" })
    const t = form.settings?.theme || {}
    setEditTheme({
      color1: t.color1 || "#b4f577", color2: t.color2 || "#00c6b6",
      panelBgType: t.panelBgType || "default",
      panelBg: t.panelBg || "#1e202c", panelBgFrom: t.panelBgFrom || "#1e202c", panelBgTo: t.panelBgTo || "#0c0e17", panelBorder: t.panelBorder || "#424939",
      inputBg: t.inputBg || "#0c0e17", inputBorder: t.inputBorder || "#424939", inputText: t.inputText || "#e1e1ef",
      titleType: t.titleType || "solid",
      titleColor: t.titleColor || "#ffffff", titleFrom: t.titleFrom || "#b4f577", titleTo: t.titleTo || "#00c6b6",
      bodyColor: t.bodyColor || "#e1e1ef", labelColor: t.labelColor || "#c2c9b5",
    })
    setEditorTab("constructor")
    setPreviewStep(0)

    if (form.steps?.length) {
      setEditSteps(form.steps.map(s => ({
        ...s,
        fields: s.fields.map(f => ({ ...f, options: f.options ? [...f.options] : [] })),
      })))
    } else {
      const fields = form.fields?.length
        ? form.fields.map(f => ({ ...f, options: f.options ? [...f.options] : [] }))
        : [
            { label: "Nombre", type: "text" as const, required: true, placeholder: "" },
            { label: "Email", type: "email" as const, required: true, placeholder: "" },
          ]
      setEditSteps([{ id: "step-1", title: "Informacion", fields }])
    }

    setEditCotizador(form.cotizador_config || DEFAULT_COTIZADOR)
    const savedAfterSubmit = (form.settings as any)?.after_submit
    setEditAfterSubmit(savedAfterSubmit || DEFAULT_AFTER_SUBMIT)
  }

  // Step management
  const addStep = () => setEditSteps(prev => [
    ...prev,
    { id: `step-${Date.now()}`, title: `Paso ${prev.length + 1}`, fields: [] },
  ])

  const removeStep = (idx: number) =>
    setEditSteps(prev => prev.filter((_, i) => i !== idx))

  const updateStepTitle = (idx: number, title: string) =>
    setEditSteps(prev => prev.map((s, i) => i === idx ? { ...s, title } : s))

  // Field management (step-aware)
  const addFieldToStep = (stepIdx: number) =>
    setEditSteps(prev => prev.map((s, i) => i === stepIdx
      ? { ...s, fields: [...s.fields, { label: "", type: "text" as const, required: false, placeholder: "" }] }
      : s))

  const removeFieldFromStep = (stepIdx: number, fieldIdx: number) =>
    setEditSteps(prev => prev.map((s, i) => i === stepIdx
      ? { ...s, fields: s.fields.filter((_, fi) => fi !== fieldIdx) }
      : s))

  const updateFieldInStep = (stepIdx: number, fieldIdx: number, updates: Partial<FormField>) =>
    setEditSteps(prev => prev.map((s, i) => i === stepIdx
      ? { ...s, fields: s.fields.map((f, fi) => fi === fieldIdx ? { ...f, ...updates } : f) }
      : s))

  const addOptionInStep = (stepIdx: number, fieldIdx: number) => {
    const opts = [...(editSteps[stepIdx].fields[fieldIdx].options || []), ""]
    updateFieldInStep(stepIdx, fieldIdx, { options: opts })
  }

  const updateOptionInStep = (stepIdx: number, fieldIdx: number, optIdx: number, value: string) => {
    const opts = (editSteps[stepIdx].fields[fieldIdx].options || []).map((o, i) => i === optIdx ? value : o)
    updateFieldInStep(stepIdx, fieldIdx, { options: opts })
  }

  const removeOptionInStep = (stepIdx: number, fieldIdx: number, optIdx: number) => {
    const opts = (editSteps[stepIdx].fields[fieldIdx].options || []).filter((_, i) => i !== optIdx)
    updateFieldInStep(stepIdx, fieldIdx, { options: opts })
  }

  const handleSaveEdit = async () => {
    if (!editingForm || !editMeta.name.trim()) return
    setIsSaving(true)
    try {
      const cleanSteps = editSteps.map(s => ({
        ...s,
        fields: s.fields
          .filter(f => f.label.trim() || f.type === "product_selector")
          .map(f => ({ ...f, label: f.label.trim() || (f.type === "product_selector" ? "Seleccionar producto" : f.label) })),
      }))
      const allFields = cleanSteps.flatMap(s => s.fields)
      const { data, error } = await supabase
        .from("forms")
        .update({
          name: editMeta.name.trim(),
          description: editMeta.description || null,
          steps: cleanSteps,
          fields: allFields,
          cotizador_config: editCotizador.enabled ? editCotizador : null,
          settings: {
            ...(editingForm.settings || {}),
            logo: editMeta.logo || null,
            theme: editTheme,
            after_submit: editAfterSubmit.action !== "none" ? editAfterSubmit : null,
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", editingForm.id)
        .select()
        .single()
      if (error) throw error
      setForms(forms.map(f => f.id === editingForm.id ? data : f))
      setEditingForm(data)
      toast.success("Formulario guardado", { description: "Cambios aplicados correctamente.", duration: 3000 })
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
    const totalFields = editSteps.reduce((acc, s) => acc + s.fields.length, 0)
    const themeGradient = `linear-gradient(135deg, ${editTheme.color1} 0%, ${editTheme.color2} 100%)`
    const themeOnGradient = hexLuminance(editTheme.color1) > 0.35 ? darkenHex(editTheme.color1, 0.25) : "#f0f0f0"
    const themeOnGradientDim = hexLuminance(editTheme.color1) > 0.35 ? darkenHex(editTheme.color1, 0.3) + "cc" : "rgba(240,240,240,0.8)"

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

          <div className="flex items-center gap-3">
            <div className="flex bg-muted rounded-2xl p-1 gap-1">
              <button
                onClick={() => setEditorTab("constructor")}
                className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                  editorTab === "constructor"
                    ? "bg-background shadow text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Constructor
              </button>
              <button
                onClick={() => { setEditorTab("preview"); setPreviewStep(0) }}
                className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all flex items-center gap-1.5 ${
                  editorTab === "preview"
                    ? "bg-background shadow text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                Vista Previa
              </button>
            </div>
            <Button
              onClick={handleSaveEdit}
              disabled={isSaving || !editMeta.name.trim()}
              className="bg-[#D1F366] text-[#1C1C28] hover:bg-[#B3D93C] font-bold rounded-xl px-6 gap-2 shadow-lg"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
              Guardar
            </Button>
          </div>
        </div>

        {/* ── CONSTRUCTOR TAB ── */}
        {editorTab === "constructor" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Left — steps + cotizador */}
            <div className="lg:col-span-2 space-y-5">
              {/* Form info */}
              <div className="executive-card space-y-4">
                <div className="flex items-center gap-4">
                  <label
                    className="relative w-12 h-12 rounded-2xl flex items-center justify-center cursor-pointer overflow-hidden flex-shrink-0 border-2 border-dashed border-[#D1F366]/30 hover:border-[#D1F366]/60 transition-colors"
                    title="Subir logo (JPG, PNG)"
                  >
                    {editMeta.logo ? (
                      <img src={editMeta.logo} alt="Logo" className="w-full h-full object-cover" />
                    ) : (
                      <ImagePlus className="w-5 h-5 text-[#D1F366]/50" />
                    )}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/jpg,image/webp,image/svg+xml"
                      className="hidden"
                      onChange={e => {
                        const file = e.target.files?.[0]
                        if (!file) return
                        const reader = new FileReader()
                        reader.onload = () => setEditMeta(prev => ({ ...prev, logo: reader.result as string }))
                        reader.readAsDataURL(file)
                      }}
                    />
                  </label>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">Informacion General</p>
                    <input
                      className="text-lg font-bold bg-transparent border-none outline-none w-full text-foreground placeholder:text-muted-foreground mt-0.5 focus:ring-0"
                      value={editMeta.name}
                      onChange={e => setEditMeta({ ...editMeta, name: e.target.value })}
                      placeholder="Nombre del formulario"
                    />
                  </div>
                  {editMeta.logo && (
                    <button
                      onClick={() => setEditMeta(prev => ({ ...prev, logo: "" }))}
                      className="text-muted-foreground hover:text-destructive transition-colors flex-shrink-0"
                      title="Quitar logo"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <Textarea
                  placeholder="Descripcion del formulario (opcional)"
                  value={editMeta.description}
                  onChange={e => setEditMeta({ ...editMeta, description: e.target.value })}
                  rows={2}
                  className="resize-none text-sm rounded-2xl"
                />
                <div className="flex items-center gap-2">
                  <span className="text-xs bg-muted px-3 py-1.5 rounded-full font-medium capitalize">{editingForm.type}</span>
                  <span className="text-xs text-muted-foreground">{totalFields} preguntas</span>
                  <span className="text-xs text-muted-foreground">
                    {editingForm.submissions_count || formSubmissions(editingForm.id).length} respuestas
                  </span>
                </div>
              </div>

              {/* Steps */}
              {editSteps.map((step, stepIdx) => (
                <div key={step.id} className="executive-card space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-[#D1F366]/10 text-[#D1F366] rounded-xl flex items-center justify-center text-sm font-black">
                        {stepIdx + 1}
                      </div>
                      <input
                        className="font-bold text-base bg-transparent border-none outline-none text-foreground placeholder:text-muted-foreground focus:ring-0"
                        value={step.title}
                        onChange={e => updateStepTitle(stepIdx, e.target.value)}
                        placeholder={`Paso ${stepIdx + 1}`}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => addFieldToStep(stepIdx)}
                        className="flex items-center gap-1.5 text-sm font-semibold text-[#D1F366] hover:text-[#B3D93C] transition-colors"
                      >
                        <Plus className="w-4 h-4" />
                        Campo
                      </button>
                      {editSteps.length > 1 && (
                        <button
                          onClick={() => removeStep(stepIdx)}
                          className="text-muted-foreground hover:text-destructive transition-colors ml-2"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {step.fields.length === 0 ? (
                    <div className="bg-muted/40 rounded-2xl py-8 flex flex-col items-center justify-center text-center">
                      <ListChecks className="w-8 h-8 text-muted-foreground mb-2" />
                      <p className="font-semibold text-sm mb-1">Sin campos en este paso</p>
                      <button onClick={() => addFieldToStep(stepIdx)} className="text-sm font-semibold text-[#D1F366] hover:underline">
                        + Agregar campo
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {step.fields.map((field, fieldIdx) => {
                        const cfg = FIELD_TYPE_CONFIG[field.type] ?? FIELD_TYPE_CONFIG.text
                        const TypeIcon = cfg.icon
                        const hasOptions = field.type === "radio" || field.type === "checkbox" || field.type === "select"
                        const isSlider = field.type === "slider"
                        const isDateOrTime = field.type === "date" || field.type === "time"
                        const isProductSelector = field.type === "product_selector"
                        const hasPlaceholder = !hasOptions && !isSlider && !isDateOrTime && !isProductSelector

                        return (
                          <div
                            key={fieldIdx}
                            className={`rounded-2xl overflow-hidden border border-border border-l-4 bg-card shadow-md transition-all hover:shadow-lg ${cfg.border}`}
                          >
                            <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-muted/30">
                              <GripVertical className="w-4 h-4 text-muted-foreground/30 flex-shrink-0" />
                              <span className={`w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0 ${cfg.badge}`}>
                                <TypeIcon className={`w-3.5 h-3.5 ${cfg.badgeText}`} />
                              </span>
                              <Input
                                placeholder="Escribe la pregunta aqui..."
                                value={field.label}
                                onChange={e => updateFieldInStep(stepIdx, fieldIdx, { label: e.target.value })}
                                className="flex-1 h-9 text-sm font-semibold border-0 bg-transparent focus-visible:ring-0 px-1"
                              />
                              <Select
                                value={field.type}
                                onValueChange={v => {
                                  const t = v as FormField["type"]
                                  const needsOptions = t === "radio" || t === "checkbox" || t === "select"
                                  updateFieldInStep(stepIdx, fieldIdx, {
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
                                onClick={() => removeFieldFromStep(stepIdx, fieldIdx)}
                                className="text-muted-foreground hover:text-destructive transition-colors flex-shrink-0"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>

                            <div className="px-4 pb-4 pt-3 space-y-3">
                              {hasPlaceholder && (
                                <Input
                                  placeholder="Texto de ayuda en el campo (opcional)"
                                  value={field.placeholder || ""}
                                  onChange={e => updateFieldInStep(stepIdx, fieldIdx, { placeholder: e.target.value })}
                                  className="h-8 text-xs rounded-xl"
                                />
                              )}
                              {isDateOrTime && (
                                <div className="bg-muted/50 rounded-xl px-4 py-3">
                                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Vista previa</p>
                                  <input
                                    type={field.type}
                                    disabled
                                    className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm text-muted-foreground cursor-not-allowed"
                                  />
                                </div>
                              )}
                              {hasOptions && (
                                <div className="space-y-2">
                                  {(field.options || [""]).map((opt, oi) => (
                                    <div key={oi} className="flex items-center gap-2">
                                      {field.type === "radio"
                                        ? <div className="w-4 h-4 rounded-full border-2 border-muted-foreground/40 flex-shrink-0" />
                                        : field.type === "checkbox"
                                          ? <div className="w-4 h-4 rounded border-2 border-muted-foreground/40 flex-shrink-0" />
                                          : <ChevronDown className="w-4 h-4 text-muted-foreground/40 flex-shrink-0" />
                                      }
                                      <Input
                                        placeholder={`Opcion ${oi + 1}`}
                                        value={opt}
                                        onChange={e => updateOptionInStep(stepIdx, fieldIdx, oi, e.target.value)}
                                        className="h-8 text-sm flex-1 rounded-xl"
                                      />
                                      {(field.options || []).length > 1 && (
                                        <button
                                          onClick={() => removeOptionInStep(stepIdx, fieldIdx, oi)}
                                          className="text-muted-foreground hover:text-destructive transition-colors flex-shrink-0"
                                        >
                                          <X className="w-3.5 h-3.5" />
                                        </button>
                                      )}
                                    </div>
                                  ))}
                                  <button
                                    onClick={() => addOptionInStep(stepIdx, fieldIdx)}
                                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors font-medium pl-6"
                                  >
                                    <Plus className="w-3 h-3" />
                                    Agregar opcion
                                  </button>
                                </div>
                              )}
                              {isSlider && (
                                <div className="space-y-3">
                                  <div className="grid grid-cols-3 gap-2">
                                    {[
                                      { label: "Minimo", key: "min", default: 0 },
                                      { label: "Maximo", key: "max", default: 100 },
                                      { label: "Paso",   key: "step", default: 1 },
                                    ].map(({ label, key, default: def }) => (
                                      <div key={key} className="space-y-1">
                                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{label}</p>
                                        <Input
                                          type="number"
                                          value={(field as any)[key] ?? def}
                                          onChange={e => updateFieldInStep(stepIdx, fieldIdx, { [key]: Number(e.target.value) } as any)}
                                          className="h-8 text-xs rounded-xl text-center"
                                        />
                                      </div>
                                    ))}
                                  </div>
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
                              {isProductSelector && (
                                <div className="space-y-3 pt-1">
                                  <div className="space-y-1.5">
                                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Filtrar por categoría</Label>
                                    <Select
                                      value={field.product_category || "__all__"}
                                      onValueChange={v => updateFieldInStep(stepIdx, fieldIdx, { product_category: v === "__all__" ? undefined : v })}
                                    >
                                      <SelectTrigger className="h-8 text-xs rounded-xl">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="__all__" className="text-xs">Todos los productos</SelectItem>
                                        {[...new Set(availableProducts.map(p => p.category).filter(Boolean))].map(cat => (
                                          <SelectItem key={cat!} value={cat!} className="text-xs">{cat}</SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  {availableProducts.length > 0 && (
                                    <p className="text-xs text-muted-foreground">
                                      <span className="font-semibold text-[#D1F366]">{availableProducts.filter(p => !field.product_category || p.category === field.product_category).length}</span> producto(s) disponible(s)
                                    </p>
                                  )}
                                </div>
                              )}
                              <div className="flex items-center gap-2 pt-1">
                                <Switch
                                  checked={field.required}
                                  onCheckedChange={v => updateFieldInStep(stepIdx, fieldIdx, { required: v })}
                                  className="scale-75 origin-left"
                                />
                                <span className="text-xs text-muted-foreground">Respuesta obligatoria</span>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              ))}

              {/* Add step */}
              <button
                onClick={addStep}
                className="w-full border border-dashed border-border rounded-2xl py-4 text-sm text-muted-foreground hover:text-foreground hover:border-muted-foreground/40 hover:bg-muted/30 transition-all flex items-center justify-center gap-2 font-semibold"
              >
                <Layers className="w-4 h-4" />
                Agregar paso
              </button>

              {/* Cotizador config */}
              <div className="executive-card space-y-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-amber-50 dark:bg-amber-900/30 text-amber-500 rounded-2xl flex items-center justify-center flex-shrink-0">
                      <Calculator className="h-6 w-6" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">Panel lateral</p>
                      <p className="font-bold dark:text-white">Cotizador</p>
                    </div>
                  </div>
                  <Switch
                    checked={editCotizador.enabled}
                    onCheckedChange={v => setEditCotizador(prev => ({ ...prev, enabled: v }))}
                  />
                </div>

                {editCotizador.enabled && (
                  <div className="space-y-3 pt-2 border-t border-border">
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      El panel de cotización aparece automáticamente cuando el cliente selecciona un producto en el formulario.
                    </p>
                    <div className="flex items-center justify-between p-3 bg-muted/40 rounded-2xl">
                      <div className="flex items-center gap-2">
                        <CreditCard className="w-4 h-4 text-muted-foreground" />
                        <div>
                          <span className="text-sm font-semibold">Mostrar formulario de pago</span>
                          <p className="text-xs text-muted-foreground">Solicitar datos de tarjeta al cliente</p>
                        </div>
                      </div>
                      <Switch
                        checked={editCotizador.showPayment}
                        onCheckedChange={v => setEditCotizador(p => ({ ...p, showPayment: v }))}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Right — settings sidebar */}
            <div className="space-y-5">
              <div className="bg-[#1C1C28] text-white p-6 rounded-3xl shadow-[0_8px_32px_rgba(0,0,0,0.14)] border border-white/5 space-y-5">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-amber-900/30 text-amber-400 rounded-2xl flex items-center justify-center flex-shrink-0">
                    <Settings className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-xs text-white/40 font-semibold uppercase tracking-wide">Configuracion</p>
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

              {/* ── After Form ── */}
              <div className="bg-[#1C1C28] text-white p-6 rounded-3xl shadow-[0_8px_32px_rgba(0,0,0,0.14)] border border-white/5 space-y-5">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-violet-900/40 text-violet-400 rounded-2xl flex items-center justify-center flex-shrink-0">
                    <Zap className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xs text-white/40 font-semibold uppercase tracking-wide">Acción automática</p>
                    <p className="font-bold text-white">After Form</p>
                  </div>
                </div>

                <p className="text-xs text-white/40 leading-relaxed">
                  Qué hace el bot automáticamente cuando el cliente completa el formulario (la conversación de WhatsApp ya está abierta).
                </p>

                {/* Action selector */}
                <div className="flex flex-col gap-2">
                  {([
                    { value: "none",             icon: null,           label: "Sin acción",                   desc: "Solo guarda la respuesta" },
                    { value: "message",          icon: MessageSquare,  label: "Enviar mensaje",                desc: "El bot envía un mensaje al cliente" },
                    { value: "message_handover", icon: Users,          label: "Mensaje + Derivar a humano",    desc: "Envía mensaje y abre alerta de atención" },
                  ] as const).map(opt => {
                    const isActive = editAfterSubmit.action === opt.value
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setEditAfterSubmit(p => ({ ...p, action: opt.value }))}
                        className="flex items-center gap-3 p-3 rounded-2xl text-left transition-all"
                        style={{
                          backgroundColor: isActive ? "rgba(167,139,250,0.15)" : "rgba(255,255,255,0.04)",
                          border: isActive ? "1px solid rgba(167,139,250,0.4)" : "1px solid rgba(255,255,255,0.06)",
                        }}
                      >
                        <div
                          className="w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center"
                          style={{ borderColor: isActive ? "#a78bfa" : "rgba(255,255,255,0.2)" }}
                        >
                          {isActive && <div className="w-2.5 h-2.5 rounded-full bg-violet-400" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold" style={{ color: isActive ? "#a78bfa" : "#ffffff" }}>
                            {opt.label}
                          </p>
                          <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>
                            {opt.desc}
                          </p>
                        </div>
                        {opt.icon && (
                          <opt.icon className="w-4 h-4 flex-shrink-0" style={{ color: isActive ? "#a78bfa" : "rgba(255,255,255,0.3)" }} />
                        )}
                      </button>
                    )
                  })}
                </div>

                {/* Message textarea */}
                {editAfterSubmit.action !== "none" && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-white/40 uppercase tracking-wide">Mensaje a enviar</p>
                    <textarea
                      rows={4}
                      placeholder={"Ej: ¡Gracias por completar el formulario! En breve nos comunicamos contigo."}
                      value={editAfterSubmit.message}
                      onChange={e => setEditAfterSubmit(p => ({ ...p, message: e.target.value }))}
                      className="w-full rounded-2xl text-sm resize-none focus:outline-none focus:ring-1 focus:ring-violet-500/50 placeholder:text-white/20"
                      style={{ backgroundColor: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "#e1e1ef", padding: "12px 16px" }}
                    />
                    {editAfterSubmit.action === "message_handover" && (
                      <div className="flex items-start gap-2 p-3 rounded-xl" style={{ backgroundColor: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.2)" }}>
                        <span className="text-amber-400 text-xs mt-0.5">⚠</span>
                        <p className="text-xs text-amber-300/80 leading-relaxed">
                          La conversación quedará marcada como <strong className="text-amber-300">necesita atención</strong>. El equipo verá la alerta en el dashboard.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Design / Colors — full */}
              <div className="bg-[#1C1C28] text-white p-6 rounded-3xl shadow-[0_8px_32px_rgba(0,0,0,0.14)] border border-white/5 space-y-5">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: themeGradient }}>
                    <Palette className="h-5 w-5" style={{ color: themeOnGradient }} />
                  </div>
                  <div>
                    <p className="text-xs text-white/40 font-semibold uppercase tracking-wide">Personalización</p>
                    <p className="font-bold text-white">Diseño del formulario</p>
                  </div>
                </div>

                {/* — Botones — */}
                <div className="space-y-3">
                  <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest border-b border-white/10 pb-2">Botones</p>
                  <div className="grid grid-cols-2 gap-2">
                    {([["color1","Color 1"],["color2","Color 2"]] as const).map(([k,l]) => (
                      <div key={k} className="space-y-1">
                        <p className="text-[10px] text-white/40">{l}</p>
                        <div className="flex items-center gap-2 bg-white/5 rounded-xl p-2">
                          <input type="color" value={editTheme[k]} onChange={e => setEditTheme(p => ({ ...p, [k]: e.target.value }))} className="w-8 h-8 rounded-lg cursor-pointer border-0 bg-transparent p-0" />
                          <span className="text-[10px] font-mono text-white/50">{editTheme[k]}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="rounded-xl h-7 w-full" style={{ background: themeGradient }} />
                </div>

                {/* — Paneles — */}
                <div className="space-y-3">
                  <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest border-b border-white/10 pb-2">Paneles</p>
                  <div className="flex gap-1 p-1 bg-white/5 rounded-xl">
                    {(["default","solid","gradient"] as const).map(opt => (
                      <button key={opt} onClick={() => setEditTheme(p => ({ ...p, panelBgType: opt }))}
                        className="flex-1 py-1.5 rounded-lg text-[11px] font-semibold transition-all"
                        style={{ backgroundColor: editTheme.panelBgType === opt ? "rgba(255,255,255,0.15)" : "transparent", color: editTheme.panelBgType === opt ? "#fff" : "rgba(255,255,255,0.35)" }}
                      >
                        {opt === "default" ? "Auto" : opt === "solid" ? "Sólido" : "Gradiente"}
                      </button>
                    ))}
                  </div>
                  {editTheme.panelBgType === "solid" && (
                    <div className="flex items-center gap-2 bg-white/5 rounded-xl p-2">
                      <input type="color" value={editTheme.panelBg} onChange={e => setEditTheme(p => ({ ...p, panelBg: e.target.value }))} className="w-8 h-8 rounded-lg cursor-pointer border-0 bg-transparent p-0" />
                      <span className="text-[10px] font-mono text-white/50 flex-1">{editTheme.panelBg}</span>
                      <div className="w-6 h-6 rounded-lg" style={{ backgroundColor: editTheme.panelBg }} />
                    </div>
                  )}
                  {editTheme.panelBgType === "gradient" && (
                    <div className="grid grid-cols-2 gap-2">
                      {([["panelBgFrom","Desde"],["panelBgTo","Hasta"]] as const).map(([k,l]) => (
                        <div key={k} className="space-y-1">
                          <p className="text-[10px] text-white/40">{l}</p>
                          <div className="flex items-center gap-2 bg-white/5 rounded-xl p-2">
                            <input type="color" value={editTheme[k]} onChange={e => setEditTheme(p => ({ ...p, [k]: e.target.value }))} className="w-7 h-7 rounded-lg cursor-pointer border-0 bg-transparent p-0" />
                            <span className="text-[10px] font-mono text-white/40">{editTheme[k]}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {editTheme.panelBgType !== "default" && editTheme.panelBgType === "gradient" && (
                    <div className="rounded-xl h-6 w-full" style={{ background: `linear-gradient(135deg,${editTheme.panelBgFrom} 0%,${editTheme.panelBgTo} 100%)` }} />
                  )}
                  <div className="space-y-1">
                    <p className="text-[10px] text-white/40">Borde</p>
                    <div className="flex items-center gap-2 bg-white/5 rounded-xl p-2">
                      <input type="color" value={editTheme.panelBorder} onChange={e => setEditTheme(p => ({ ...p, panelBorder: e.target.value }))} className="w-8 h-8 rounded-lg cursor-pointer border-0 bg-transparent p-0" />
                      <span className="text-[10px] font-mono text-white/50 flex-1">{editTheme.panelBorder}</span>
                      <div className="w-full h-px flex-1" style={{ backgroundColor: editTheme.panelBorder }} />
                    </div>
                  </div>
                </div>

                {/* — Inputs — */}
                <div className="space-y-3">
                  <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest border-b border-white/10 pb-2">Inputs</p>
                  {([["inputBg","Fondo"],["inputBorder","Borde"],["inputText","Texto"]] as const).map(([k,l]) => (
                    <div key={k} className="flex items-center gap-2 bg-white/5 rounded-xl p-2">
                      <input type="color" value={editTheme[k]} onChange={e => setEditTheme(p => ({ ...p, [k]: e.target.value }))} className="w-8 h-8 rounded-lg cursor-pointer border-0 bg-transparent p-0" />
                      <span className="text-xs text-white/40 flex-1">{l}</span>
                      <span className="text-[10px] font-mono text-white/30">{editTheme[k]}</span>
                    </div>
                  ))}
                  <div className="rounded-xl p-3 flex items-center gap-3" style={{ backgroundColor: editTheme.inputBg, border: `1px solid ${editTheme.inputBorder}` }}>
                    <span className="text-xs" style={{ color: editTheme.inputText }}>Vista previa del input</span>
                  </div>
                </div>

                {/* — Texto — */}
                <div className="space-y-3">
                  <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest border-b border-white/10 pb-2">Texto</p>
                  <div className="space-y-2">
                    <p className="text-[10px] text-white/40">Título</p>
                    <div className="flex gap-1 p-1 bg-white/5 rounded-xl">
                      {(["solid","gradient"] as const).map(opt => (
                        <button key={opt} onClick={() => setEditTheme(p => ({ ...p, titleType: opt }))}
                          className="flex-1 py-1.5 rounded-lg text-[11px] font-semibold transition-all"
                          style={{ backgroundColor: editTheme.titleType === opt ? "rgba(255,255,255,0.15)" : "transparent", color: editTheme.titleType === opt ? "#fff" : "rgba(255,255,255,0.35)" }}
                        >
                          {opt === "solid" ? "Sólido" : "Gradiente"}
                        </button>
                      ))}
                    </div>
                    {editTheme.titleType === "solid" ? (
                      <div className="flex items-center gap-2 bg-white/5 rounded-xl p-2">
                        <input type="color" value={editTheme.titleColor} onChange={e => setEditTheme(p => ({ ...p, titleColor: e.target.value }))} className="w-8 h-8 rounded-lg cursor-pointer border-0 bg-transparent p-0" />
                        <span className="text-sm font-bold" style={{ color: editTheme.titleColor }}>Título de ejemplo</span>
                      </div>
                    ) : (
                      <>
                        <div className="grid grid-cols-2 gap-2">
                          {([["titleFrom","Desde"],["titleTo","Hasta"]] as const).map(([k,l]) => (
                            <div key={k} className="space-y-1">
                              <p className="text-[10px] text-white/40">{l}</p>
                              <div className="flex items-center gap-2 bg-white/5 rounded-xl p-2">
                                <input type="color" value={editTheme[k]} onChange={e => setEditTheme(p => ({ ...p, [k]: e.target.value }))} className="w-7 h-7 rounded-lg cursor-pointer border-0 bg-transparent p-0" />
                                <span className="text-[10px] font-mono text-white/40">{editTheme[k]}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                        <p className="text-sm font-bold" style={{ background: `linear-gradient(135deg,${editTheme.titleFrom} 0%,${editTheme.titleTo} 100%)`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                          Título de ejemplo
                        </p>
                      </>
                    )}
                  </div>
                  {([["bodyColor","Texto cuerpo"],["labelColor","Labels"]] as const).map(([k,l]) => (
                    <div key={k} className="flex items-center gap-2 bg-white/5 rounded-xl p-2">
                      <input type="color" value={editTheme[k]} onChange={e => setEditTheme(p => ({ ...p, [k]: e.target.value }))} className="w-8 h-8 rounded-lg cursor-pointer border-0 bg-transparent p-0" />
                      <span className="text-xs flex-1" style={{ color: editTheme[k] }}>{l}</span>
                      <span className="text-[10px] font-mono text-white/30">{editTheme[k]}</span>
                    </div>
                  ))}
                </div>
              </div>

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
        )}

        {/* ── PREVIEW TAB ── */}
        {editorTab === "preview" && (
          <div
            className="relative overflow-hidden"
            style={{ backgroundColor: "#11131c", borderRadius: "1.5rem", padding: "2rem", fontFamily: "'Plus Jakarta Sans', 'Inter', sans-serif", color: "#e1e1ef", minHeight: 500 }}
          >
            {/* Background blobs */}
            <div className="absolute rounded-full pointer-events-none" style={{ top: "-20%", left: "-10%", width: "40%", height: "40%", background: "rgba(180,245,119,0.05)", filter: "blur(100px)", zIndex: 0 }} />
            <div className="absolute rounded-full pointer-events-none" style={{ bottom: "-20%", right: "-10%", width: "50%", height: "50%", background: "rgba(0,198,182,0.10)", filter: "blur(120px)", zIndex: 0 }} />

            {/* Main grid */}
            <div className={`relative z-10 grid grid-cols-1 gap-4 ${editCotizador.enabled ? "lg:grid-cols-12" : ""}`}>

              {/* LEFT: Form flow */}
              <div className={`flex flex-col gap-4 ${editCotizador.enabled ? "lg:col-span-8" : ""}`}>

                {/* Header */}
                <header className="glass-panel rounded-2xl p-6 flex flex-wrap justify-between items-center gap-4">
                  <div>
                    <h2 className="text-2xl font-bold flex items-center gap-2" style={{ color: "#ffffff" }}>
                      {editMeta.logo ? (
                        <img src={editMeta.logo} alt="Logo" style={{ width: 32, height: 32, borderRadius: 6, objectFit: "cover", flexShrink: 0 }} />
                      ) : null}
                      {editMeta.name || "Nombre del formulario"}
                    </h2>
                    {editMeta.description && (
                      <p className="text-sm mt-1" style={{ color: "#c2c9b5" }}>{editMeta.description}</p>
                    )}
                  </div>
                  {editSteps.length > 1 && (
                    <div className="flex items-center gap-1">
                      {editSteps.map((_, si) => (
                        <div key={si} className="flex items-center gap-1">
                          <button
                            onClick={() => setPreviewStep(si)}
                            className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium"
                            style={
                              si <= previewStep
                                ? { background: "linear-gradient(135deg,#b4f577 0%,#00c6b6 100%)", color: "#3d7100", border: "none", cursor: "pointer" }
                                : { backgroundColor: "#282933", border: "1px solid #424939", color: "#c2c9b5", cursor: "pointer" }
                            }
                          >
                            {si + 1}
                          </button>
                          {si < editSteps.length - 1 && (
                            <div className="h-1 w-4 rounded-full" style={{ backgroundColor: si < previewStep ? "rgba(180,245,119,0.3)" : "#282933" }} />
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </header>

                {/* Active step */}
                {editSteps[previewStep] && (
                  <section className="glass-panel rounded-2xl p-6 flex flex-col gap-4">
                    <div className="flex items-center gap-3 pb-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                      <h3 className="text-xl font-semibold" style={{ color: "#ffffff", margin: 0 }}>
                        {editSteps[previewStep].title || `Paso ${previewStep + 1}`}
                      </h3>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                      {editSteps[previewStep].fields.length === 0 ? (
                        <div className="md:col-span-2 text-center py-6" style={{ color: "#8c9381", fontSize: 14 }}>
                          Sin campos en este paso
                        </div>
                      ) : (
                        editSteps[previewStep].fields.map((field, fi) => {
                          const isWide = ["textarea","slider","radio","checkbox","product_selector"].includes(field.type)
                          return (
                            <div key={fi} className={`flex flex-col gap-1.5 ${isWide ? "md:col-span-2" : ""}`}>
                              <label className="input-label text-xs font-medium">
                                {field.label || "Sin título"}{field.required && <span className="ml-0.5" style={{ color: "#00c6b6" }}>*</span>}
                              </label>
                              {field.type === "radio" || field.type === "checkbox" ? (
                                <div className="flex flex-col gap-2">
                                  {(field.options || ["Opción 1"]).map((opt, oi) => (
                                    <div key={oi} className="flex items-center gap-3 px-3 py-2.5 rounded-xl" style={{ backgroundColor: "#0c0e17", border: "1px solid #424939" }}>
                                      <div style={{ width: 16, height: 16, borderRadius: field.type === "radio" ? "50%" : 3, border: "2px solid #424939", flexShrink: 0 }} />
                                      <span className="text-sm" style={{ color: "#e1e1ef", opacity: 0.6 }}>{opt}</span>
                                    </div>
                                  ))}
                                </div>
                              ) : field.type === "slider" ? (
                                <div className="input-field rounded-lg px-4 py-3">
                                  <div className="flex justify-between text-xs mb-1.5" style={{ color: "#8c9381" }}>
                                    <span>{field.min ?? 0}</span>
                                    <span style={{ color: "#00c6b6", fontWeight: 700 }}>{Math.round(((field.min ?? 0) + (field.max ?? 100)) / 2)}</span>
                                    <span>{field.max ?? 100}</span>
                                  </div>
                                  <input type="range" min={field.min ?? 0} max={field.max ?? 100} defaultValue={Math.round(((field.min ?? 0) + (field.max ?? 100)) / 2)} style={{ width: "100%", accentColor: "#00c6b6" }} readOnly />
                                </div>
                              ) : field.type === "textarea" ? (
                                <div className="input-field rounded-lg px-4 py-3 text-sm" style={{ minHeight: 80, color: "#c2c9b5", opacity: 0.5 }}>
                                  {field.placeholder || "Escribe aquí..."}
                                </div>
                              ) : field.type === "product_selector" ? (
                                <div className="grid grid-cols-2 gap-2 opacity-60">
                                  {[1,2].map(i => (
                                    <div key={i} className="rounded-xl overflow-hidden" style={{ backgroundColor: "#0c0e17", border: "1px solid #424939" }}>
                                      <div style={{ height: 60, backgroundColor: "#1a1c25" }} />
                                      <div className="p-2">
                                        <div className="h-3 rounded mb-1" style={{ backgroundColor: "#282933", width: "70%" }} />
                                        <div className="h-2 rounded" style={{ backgroundColor: "#282933", width: "40%" }} />
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="input-field rounded-lg px-4 py-3 text-sm" style={{ color: "#c2c9b5", opacity: 0.5 }}>
                                  {field.placeholder || (field.type === "date" ? "DD/MM/AAAA" : field.type === "time" ? "HH:MM" : "Escribe aquí...")}
                                </div>
                              )}
                            </div>
                          )
                        })
                      )}
                    </div>

                    <div className="flex items-center justify-between pt-2">
                      {previewStep > 0 ? (
                        <button
                          onClick={() => setPreviewStep(p => p - 1)}
                          className="flex items-center gap-1.5 px-5 py-2.5 rounded-full text-sm font-medium"
                          style={{ backgroundColor: "#282933", color: "#c2c9b5", border: "1px solid #424939", cursor: "pointer" }}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>arrow_back</span>
                          Atrás
                        </button>
                      ) : <div />}
                      <button
                        onClick={() => previewStep < editSteps.length - 1 && setPreviewStep(p => p + 1)}
                        className="flex items-center gap-2 px-6 py-3 rounded-full text-sm font-semibold shadow-lg"
                        style={{ background: themeGradient, color: themeOnGradient, border: "none", cursor: previewStep < editSteps.length - 1 ? "pointer" : "default" }}
                      >
                        {previewStep === editSteps.length - 1 ? "Enviar formulario" : "Continuar"}
                        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                          {previewStep === editSteps.length - 1 ? "send" : "arrow_forward"}
                        </span>
                      </button>
                    </div>
                  </section>
                )}

                {/* Locked next step */}
                {previewStep < editSteps.length - 1 && (
                  <section
                    className="glass-panel rounded-2xl p-6 flex flex-col gap-4 relative overflow-hidden"
                    style={{ opacity: 0.6, pointerEvents: "none" }}
                  >
                    <div
                      className="absolute inset-0 flex items-center justify-center"
                      style={{ backgroundColor: "rgba(12,14,23,0.5)", backdropFilter: "blur(2px)", zIndex: 10, pointerEvents: "auto" }}
                    >
                      <button
                        onClick={() => setPreviewStep(p => p + 1)}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-medium shadow-lg"
                        style={{ background: themeGradient, color: themeOnGradient, border: "none", cursor: "pointer" }}
                      >
                        Continuar para desbloquear
                        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>arrow_forward</span>
                      </button>
                    </div>
                    <div className="flex items-center gap-3 pb-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                      <h3 className="text-xl font-semibold" style={{ color: "#c2c9b5", margin: 0 }}>
                        {editSteps[previewStep + 1].title}
                      </h3>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                      {editSteps[previewStep + 1].fields.slice(0, 4).map((f, i) => (
                        <div key={i} className="flex flex-col gap-1.5">
                          <label className="input-label text-xs font-medium">{f.label}</label>
                          <div className="input-field rounded-lg" style={{ height: 44 }} />
                        </div>
                      ))}
                    </div>
                  </section>
                )}
              </div>

              {/* RIGHT: Cotizador */}
              {editCotizador.enabled && (
                <div className="lg:col-span-4 flex flex-col gap-4">

                  {/* Price card preview */}
                  <div
                    className="rounded-2xl p-6 flex flex-col gap-4 relative overflow-hidden"
                    style={{ background: themeGradient, boxShadow: `0 8px 32px ${editTheme.color1}1a` }}
                  >
                    <div className="absolute rounded-full pointer-events-none" style={{ top: 0, right: 0, width: 128, height: 128, backgroundColor: "rgba(255,255,255,0.1)", transform: "translate(50%,-50%)", filter: "blur(24px)" }} />
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wider" style={{ color: themeOnGradientDim }}>Cotización estimada</p>
                      <div className="flex items-baseline gap-1 mt-1">
                        <span className="font-bold" style={{ fontSize: 44, color: themeOnGradient, lineHeight: 1.1 }}>$0</span>
                      </div>
                    </div>
                    <div className="rounded-xl p-3 flex flex-col gap-2 border border-white/10" style={{ backgroundColor: "rgba(17,19,28,0.2)", backdropFilter: "blur(8px)" }}>
                      <div className="flex justify-between items-center">
                        <span className="text-xs" style={{ color: themeOnGradient }}>Producto seleccionado</span>
                        <span className="text-xs font-bold" style={{ color: themeOnGradient }}>—</span>
                      </div>
                      <div className="h-px my-1" style={{ backgroundColor: "rgba(0,0,0,0.15)" }} />
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-bold" style={{ color: themeOnGradient }}>Total</span>
                        <span className="text-sm font-bold" style={{ color: themeOnGradient }}>$0</span>
                      </div>
                    </div>
                    <p className="text-xs text-center opacity-60" style={{ color: themeOnGradient }}>El precio se actualiza al seleccionar un producto</p>
                  </div>

                  {/* Payment locked preview */}
                  {editCotizador.showPayment && (
                    <div className="glass-panel rounded-2xl p-6 flex flex-col gap-4" style={{ opacity: 0.5 }}>
                      <div className="flex items-center gap-3 pb-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                        <span className="material-symbols-outlined" style={{ color: "#424939", fontVariationSettings: "'FILL' 1" }}>credit_card</span>
                        <span className="text-lg font-semibold" style={{ color: "#c2c9b5" }}>Datos de pago</span>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        {[["Titular","Juan García"],["Número de tarjeta","•••• •••• •••• ••••"],["Vencimiento","MM/AA"],["CVV","•••"]].map(([lbl,ph]) => (
                          <div key={lbl} className="flex flex-col gap-1.5">
                            <label className="input-label text-xs font-medium">{lbl}</label>
                            <div className="input-field rounded-lg px-4 py-3 text-sm" style={{ color: "#8c9381", opacity: 0.5 }}>{ph}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Trust badge */}
                  <div className="glass-panel rounded-xl p-4 flex items-start gap-3" style={{ borderLeft: "2px solid #00c6b6" }}>
                    <span className="material-symbols-outlined mt-0.5" style={{ color: "#00c6b6" }}>verified_user</span>
                    <div>
                      <p className="text-sm font-semibold" style={{ color: "#ffffff" }}>Seguro y confiable</p>
                      <p className="text-xs mt-1 leading-relaxed" style={{ color: "#c2c9b5" }}>Tus datos están protegidos.</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
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
              <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">Ultima</p>
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
                  ? `Hay ${displayCount} respuestas registradas. Recarga la pagina para verlas.`
                  : responseView.type === "link"
                    ? "Compartie el link del formulario para recibir respuestas."
                    : "El bot completara este formulario durante las conversaciones."
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
      <div className="flex items-start justify-between gap-4 mb-6 px-1 pt-2">
        <div>
          <h2 className="text-3xl font-bold dark:text-white">Formularios</h2>
          <p className="text-muted-foreground text-sm mt-1">
            Formularios web (link) o conversacionales para captar informacion de tus clientes.
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

        <TabsContent value="formularios" className="mt-5">
          {forms.length === 0 ? (
            <div className="bg-card rounded-3xl border border-border p-12 flex flex-col items-center justify-center text-center shadow-lg">
              <FileText className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-1">Sin formularios aun</h3>
              <p className="text-sm text-muted-foreground mb-6">
                Crea tu primer formulario de link o conversacional para captar datos de clientes.
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

        <TabsContent value="respuestas" className="mt-5">
          {submissions.length === 0 && forms.every(f => !f.submissions_count) ? (
            <div className="bg-card rounded-3xl border border-border p-12 flex flex-col items-center justify-center text-center shadow-lg">
              <ClipboardList className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-1">Sin respuestas aun</h3>
              <p className="text-sm text-muted-foreground">
                Las respuestas apareceran aqui cuando alguien complete un formulario.
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
              <span>Una vez creado, usa el boton <strong className="text-foreground">Editar</strong> para agregar y configurar las preguntas del formulario.</span>
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
