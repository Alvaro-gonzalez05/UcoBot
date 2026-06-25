"use client"

import type React from "react"
import { useEffect, useRef, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Checkbox } from "@/components/ui/checkbox"
import { toast } from "sonner"
import { MetaConnectionCard } from "./meta-connection-card"
import { WhatsAppTemplatesManager } from "./whatsapp-templates-manager"
import {
  Plus,
  Bot,
  MessageSquare,
  Instagram,
  Mail,
  Play,
  Pause,
  MoreHorizontal,
  Edit,
  Trash2,
  Eye,
  EyeOff,
  Zap,
  X,
  ArrowLeft,
  CheckCircle,
  Loader2,
  Target,
} from "lucide-react"
import { ScrollFadeIn, ScrollSlideUp, ScrollStaggeredChildren, ScrollStaggerChild, ScrollScaleIn } from "@/components/ui/scroll-animations"
import { motion, AnimatePresence } from "framer-motion"
import { FaWhatsapp, FaFacebookMessenger } from "react-icons/fa"
import { cn } from "@/lib/utils"

interface BotData {
  id: string
  name: string
  platform: "whatsapp" | "instagram" | "messenger" | "email"
  platforms?: string[]
  personality_prompt?: string
  features: string[]
  feature_config?: any
  allowed_tags?: string[]
  automations: string[]
  gemini_api_key?: string
  is_active: boolean
  created_at: string
  user_id: string
}

interface BotsManagementProps {
  initialBots: BotData[]
  userId: string
  demo?: boolean
}

const platformIcons = {
  whatsapp: FaWhatsapp,
  instagram: Instagram,
  messenger: FaFacebookMessenger,
  email: Mail,
}

const platformLabels = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  messenger: "Messenger",
  email: "Email", // solo para mostrar bots legacy; no es seleccionable
}

const availableFeatures = [
  { id: "take_orders", label: "Tomar pedidos", description: "El bot puede registrar pedidos del catálogo de productos." },
  { id: "take_reservations", label: "Tomar reservas", description: "El bot gestiona reservas de mesas o turnos." },
  { id: "register_clients", label: "Registro de clientes", description: "Identifica y registra clientes nuevos automáticamente." },
  { id: "loyalty_points", label: "Puntos de fidelización", description: "Los clientes pueden consultar su saldo de puntos de fidelidad." },
  { id: "lead_qualification", label: "Calificación de leads", description: "Definí etiquetas para clasificar tus conversaciones. La IA las aplica automáticamente y vos también podés asignarlas a mano desde el chat." },
]

// Funciones que admiten instrucciones personalizadas del negocio (se guardan en feature_config.prompts)
const featurePromptConfig: Record<string, { label: string; placeholder: string }> = {
  take_orders: {
    label: "Instrucciones para tomar pedidos (opcional)",
    placeholder: "Ej: Siempre preguntá si es retiro o envío. El envío cuesta $500 dentro del centro. No tomes pedidos después de las 23h.",
  },
  take_reservations: {
    label: "Instrucciones para reservas (opcional)",
    placeholder: "Ej: Reservas para mínimo 2 personas. Para grupos de +6 pedí una seña por transferencia.",
  },
  loyalty_points: {
    label: "Instrucciones para fidelización (opcional)",
    placeholder: "Ej: Aclará que los puntos se acreditan a las 24hs y se canjean solo en el local.",
  },
  lead_qualification: {
    label: "Cómo calificar leads / cuándo aplicar cada etiqueta (opcional)",
    placeholder: "Ej: Usá 'inversor' si preguntan por rentabilidad o montos grandes; 'comprador' si piden precio o disponibilidad; 'curioso' si solo consultan info general.",
  },
}

function highlightPrompt(text: string): string {
  if (!text) return ''
  const inline = (s: string) => s
    .replace(/\*\*(.+?)\*\*/g, '<span class="pm-mark">**</span><span class="pm-bold">$1</span><span class="pm-mark">**</span>')
    .replace(/\*([^*\n]+?)\*/g, '<span class="pm-mark">*</span><span class="pm-italic">$1</span><span class="pm-mark">*</span>')
    .replace(/`([^`\n]+?)`/g, '<span class="pm-mark">`</span><span class="pm-code">$1</span><span class="pm-mark">`</span>')
  return text.split('\n').map(raw => {
    const e = raw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    if (e.startsWith('### '))
      return `<span class="pm-mark">### </span><span class="pm-h1">${inline(e.slice(4))}</span>`
    if (e.startsWith('## '))
      return `<span class="pm-mark">## </span><span class="pm-h2">${inline(e.slice(3))}</span>`
    if (/^\s{2,}- /.test(e))
      return `<span class="pm-mark">${e.match(/^\s+/)![0]}- </span>${inline(e.replace(/^\s*- /, ''))}`
    if (e.startsWith('- '))
      return `<span class="pm-accent">- </span>${inline(e.slice(2))}`
    const nm = e.match(/^(\d+\.) (.+)$/)
    if (nm) return `<span class="pm-accent">${nm[1]} </span>${inline(nm[2])}`
    if (e.trim() === '') return ''
    return inline(e)
  }).join('\n')
}

type FormState = {
  name: string
  platform: "whatsapp" | "instagram" | "messenger" | "email" | ""
  platforms: string[]
  personality_prompt: string
  features: string[]
  feature_config: {
    prompts?: Record<string, string>
    auto_reactivate_hours?: number // 0 = nunca
    debounce_seconds?: number
    split_long_messages?: boolean
    reservation_mode?: "table" | "appointment"
  }
  allowed_tags: string[]
  automations: string[]
  gemini_api_key: string
  is_active: boolean
}

const DEFAULT_FORM: FormState = {
  name: "",
  platform: "",
  platforms: [],
  personality_prompt: "",
  features: [],
  feature_config: {},
  allowed_tags: [],
  automations: [],
  gemini_api_key: "",
  is_active: false,
}

function botToFormData(bot: BotData): FormState {
  return {
    name: bot.name,
    platform: bot.platform,
    platforms: bot.platforms?.length ? bot.platforms : bot.platform ? [bot.platform] : [],
    personality_prompt: bot.personality_prompt || "",
    features: bot.features || [],
    feature_config: (bot.feature_config as any) || {},
    allowed_tags: bot.allowed_tags || [],
    automations: bot.automations || [],
    gemini_api_key: bot.gemini_api_key || "",
    is_active: bot.is_active,
  }
}

function botToTagsEnabled(bot: BotData): Record<string, boolean> {
  const hasTags = (bot.allowed_tags?.length ?? 0) > 0
  return {
    take_orders: hasTags && (bot.features || []).includes("take_orders"),
    take_reservations: hasTags && (bot.features || []).includes("take_reservations"),
    lead_qualification: hasTags && (bot.features || []).includes("lead_qualification"),
  }
}

export function BotsManagement({ initialBots, userId, demo = false }: BotsManagementProps) {
  const [bots, setBots] = useState<BotData[]>(initialBots)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [selectedBot, setSelectedBot] = useState<BotData | null>(() => (!demo && initialBots.length >= 1 ? initialBots[0] : null))
  const [isLoading, setIsLoading] = useState(false)
  const [showApiKey, setShowApiKey] = useState(false)
  const supabase = createClient()

  const [userSubscription, setUserSubscription] = useState<any>(null)
  const [canCreateBot, setCanCreateBot] = useState(true)
  const [tagInput, setTagInput] = useState("")
  // Auto-abrimos solo si hay UN bot (cuenta normal). Con varios (vista admin) mostramos lista.
  const [editingBot, setEditingBot] = useState<BotData | null>(() => (!demo && initialBots.length === 1 ? initialBots[0] : null))
  const [tagInputsByFeature, setTagInputsByFeature] = useState<Record<string, string>>({
    take_orders: "",
    take_reservations: "",
    lead_qualification: "",
  })
  const [tagsEnabledByFeature, setTagsEnabledByFeature] = useState<Record<string, boolean>>(() =>
    !demo && initialBots[0]
      ? botToTagsEnabled(initialBots[0])
      : { take_orders: false, take_reservations: false, lead_qualification: false }
  )
  const promptTextareaRef = useRef<HTMLTextAreaElement>(null)
  const promptOverlayRef = useRef<HTMLDivElement>(null)

  // Form state — se inicializa con el bot existente para evitar flash al entrar
  const [formData, setFormData] = useState<FormState>(() =>
    !demo && initialBots[0] ? botToFormData(initialBots[0]) : DEFAULT_FORM
  )

  const resetForm = () => {
    setFormData({
      name: "",
      platform: "",
      platforms: [],
      personality_prompt: "",
      features: [],
      feature_config: {},
      allowed_tags: [],
      automations: [],
      gemini_api_key: "",
      is_active: false,
    })
  }

  // Un canal queda activo para el bot cuando su integración con Meta está conectada.
  // Se persiste de inmediato para que los webhooks enruten sin esperar al botón Guardar.
  const handleConnectionStatus = (platformId: string, connected: boolean) => {
    if (!connected) return
    setFormData((prev) => {
      if (prev.platforms.includes(platformId)) return prev
      const next = [...prev.platforms, platformId]
      if (selectedBot) {
        supabase
          .from("bots")
          .update({ platforms: next, platform: next[0] })
          .eq("id", selectedBot.id)
          .then(({ error }) => {
            if (error) console.error("Error syncing bot platforms:", error)
          })
      }
      return { ...prev, platforms: next, platform: (next[0] || "") as typeof prev.platform }
    })
  }

  const handleEditBot = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!selectedBot) return

    setIsLoading(true)

    try {
      const payload = {
        ...formData,
        platforms: formData.platforms,
        platform: formData.platforms[0] || formData.platform,
      }
      const { data, error } = await supabase.from("bots").update(payload).eq("id", selectedBot.id).select().single()

      if (error) throw error

      setBots(bots.map((bot) => (bot.id === selectedBot.id ? data : bot)))
      // Nos quedamos en el formulario de edición con los datos ya guardados
      // (antes se hacía setEditingBot(null), que tiraba al estado vacío "Creá tu bot").
      setSelectedBot(data)
      setEditingBot(data)
      setIsEditDialogOpen(false)

      // Emit custom event to update sidebar navigation
      window.dispatchEvent(new CustomEvent('botUpdated', { detail: data }))
      
      toast.success("Bot actualizado", {
        description: `La configuración de ${data.name} ha sido actualizada exitosamente.`,
        duration: 4000,
      })
    } catch (error) {
      toast.error("Error al actualizar bot", {
        description: "No se pudo actualizar el bot. Inténtalo de nuevo.",
        duration: 4000,
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleToggleBot = async (botId: string, isActive: boolean) => {
    try {
      const { error } = await supabase.from("bots").update({ is_active: isActive }).eq("id", botId)

      if (error) throw error

      setBots(bots.map((bot) => (bot.id === botId ? { ...bot, is_active: isActive } : bot)))
      const botName = bots.find(b => b.id === botId)?.name || "Bot"
      if (isActive) {
        toast.success("Bot activado", {
          description: `${botName} está ahora activo y respondiendo mensajes.`,
          duration: 4000,
        })
      } else {
        toast.info("Bot desactivado", {
          description: `${botName} ha sido pausado y no responderá mensajes.`,
          duration: 4000,
        })
      }
    } catch (error) {
      toast.error("Error al cambiar estado", {
        description: "No se pudo cambiar el estado del bot.",
        duration: 4000,
      })
    }
  }

  const handleDeleteBot = async (botId: string) => {
    try {
      const { error } = await supabase.from("bots").delete().eq("id", botId)

      if (error) throw error

      setBots(bots.filter((bot) => bot.id !== botId))
      const botName = bots.find(b => b.id === botId)?.name || "Bot"
      toast.success("Bot eliminado", {
        description: `${botName} ha sido eliminado permanentemente.`,
        duration: 4000,
      })
    } catch (error) {
      toast.error("Error al eliminar bot", {
        description: "No se pudo eliminar el bot. Inténtalo de nuevo.",
        duration: 4000,
      })
    }
  }

  const openEditDialog = (bot: BotData) => {
    setSelectedBot(bot)
    setFormData(botToFormData(bot))
    setTagInputsByFeature({ take_orders: "", take_reservations: "", lead_qualification: "" })
    setTagsEnabledByFeature(botToTagsEnabled(bot))
    setEditingBot(bot)
  }

  // Creación: 1 bot por cuenta. Inserta un bot mínimo válido y lo abre en edición
  // para que el cliente lo configure y conecte sus integraciones.
  const handleStartCreate = async () => {
    if (demo) return
    if (bots.length >= 1) {
      toast.info("Solo se permite un bot por cuenta", {
        description: "Editá el bot que ya tenés.",
      })
      return
    }
    try {
      const { data, error } = await supabase
        .from("bots")
        .insert([
          {
            name: "Mi Bot",
            platform: "whatsapp",
            platforms: [],
            features: [],
            personality_prompt: "",
            is_active: false,
            user_id: userId,
          },
        ])
        .select()
        .single()

      if (error) throw error

      setBots([data, ...bots])
      window.dispatchEvent(new CustomEvent("botCreated", { detail: data }))
      openEditDialog(data)
    } catch (error) {
      toast.error("Error al crear el bot", {
        description: "No se pudo crear el bot. Inténtalo de nuevo.",
      })
    }
  }

  const handleFeatureChange = (featureId: string, checked: boolean) => {
    if (checked) {
      setFormData({ ...formData, features: [...formData.features, featureId] })
    } else {
      setFormData({ ...formData, features: formData.features.filter((f) => f !== featureId) })
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("es-ES")
  }

  useEffect(() => {
    fetchUserSubscription()
  }, [userId])

  useEffect(() => {
    checkBotLimits()
  }, [bots, userSubscription])


  const fetchUserSubscription = async () => {
    try {
      const { data, error } = await supabase
        .from("user_profiles")
        .select("subscription_status, plan_type, trial_end_date")
        .eq("id", userId)
        .single()

      if (error) {
        console.log("[v0] Subscription columns not found, using defaults:", error.message)
        setUserSubscription({
          subscription_status: "trial",
          plan_type: "trial",
          max_automations: 999,
        })
        return
      }

      setUserSubscription({
        ...data,
        max_automations: 999,
      })
    } catch (error) {
      console.error("Error fetching subscription:", error)
      setUserSubscription({
        subscription_status: "trial",
        plan_type: "trial",
        max_automations: 999,
      })
    }
  }

  const checkBotLimits = () => {
    setCanCreateBot(true)
  }

  // ── Full-page bot editor (replaces modal dialog) ──
  if (editingBot) {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-1 pt-2">
          <div className="flex items-center gap-3">
            {bots.length > 1 && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setEditingBot(null)}
                className="rounded-xl h-9 w-9 flex-shrink-0"
                title="Volver a la lista de bots"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            <div className="min-w-0">
              <h2 className="text-xl sm:text-3xl font-bold dark:text-white truncate">{formData.name || "Bot"}</h2>
              <p className="text-muted-foreground text-xs sm:text-sm mt-0.5">
                {formData.is_active
                  ? <span className="text-green-500 font-semibold">● Activo</span>
                  : <span className="text-muted-foreground">● Inactivo</span>
                }
                {" · "}
                {formData.platforms.length > 0
                  ? formData.platforms.map((p) => platformLabels[p as keyof typeof platformLabels] || p).join(" + ")
                  : platformLabels[formData.platform as keyof typeof platformLabels] || formData.platform}
              </p>
            </div>
          </div>
          <Button
            onClick={() => handleEditBot()}
            disabled={isLoading || !formData.name.trim()}
            className="bg-[#D1F366] text-[#1C1C28] hover:bg-[#B3D93C] font-bold rounded-xl px-6 gap-2 shadow-lg flex-shrink-0"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            Guardar
          </Button>
        </div>

        {/* Grid plano — cada card va directo al grid para alineación real entre columnas */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-5 items-start">

          {/* Card destacada: nombre editable del bot + activar/desactivar */}
          <div className="lg:col-span-3 rounded-2xl p-4 sm:p-5 flex items-center justify-between gap-4 bg-[#D1F366] text-[#1C1C28] shadow-lg">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="h-12 w-12 rounded-xl bg-[#1C1C28]/10 flex items-center justify-center flex-shrink-0">
                <Bot className="h-6 w-6 text-[#1C1C28]" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[#1C1C28]/60">Nombre del bot</p>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Nombre del bot"
                  className="bg-transparent border-0 border-b border-[#1C1C28]/20 rounded-none px-0 h-auto py-0.5 text-lg sm:text-xl font-bold text-[#1C1C28] placeholder:text-[#1C1C28]/40 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-[#1C1C28]"
                />
              </div>
            </div>
          </div>

          {/* Columna izquierda: Personalidad + IA */}
          <div className="lg:col-span-2 space-y-3 sm:space-y-5">

          <div className="executive-card space-y-4">
            <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">Personalidad del Bot</p>
            {/* Overlay editor: div de resaltado + textarea transparente encima */}
            <div
              className="prompt-surface relative rounded-xl overflow-hidden"
              style={{ height: "520px" }}
            >
              <div
                ref={promptOverlayRef}
                aria-hidden="true"
                className="prompt-text absolute inset-0 p-3 font-mono text-sm pointer-events-none overflow-hidden select-none"
                style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", lineHeight: "1.65", tabSize: 2 }}
                dangerouslySetInnerHTML={{
                  __html: formData.personality_prompt
                    ? highlightPrompt(formData.personality_prompt)
                    : '<span class="pm-placeholder">### ROL Y PERSONALIDAD\nActúas como el asistente de [Negocio].\n- **Tono:** Natural y conciso.\n\n### INSTRUCCIONES\n1. Saludá al cliente.\n2. Identificá qué necesita.</span>'
                }}
              />
              <textarea
                ref={promptTextareaRef}
                value={formData.personality_prompt}
                onChange={(e) => setFormData({ ...formData, personality_prompt: e.target.value })}
                onScroll={() => {
                  if (promptTextareaRef.current && promptOverlayRef.current)
                    promptOverlayRef.current.scrollTop = promptTextareaRef.current.scrollTop
                }}
                spellCheck={false}
                autoComplete="off"
                className="prompt-editor prompt-caret absolute inset-0 w-full h-full bg-transparent font-mono text-sm p-3 resize-none outline-none overflow-y-auto"
                style={{ color: "transparent", lineHeight: "1.65", tabSize: 2 }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Formato: <code className="pm-code text-xs">### Sección</code> · <code className="pm-code text-xs">**negrita**</code> · <code className="pm-code text-xs">- ítem</code> · <code className="pm-code text-xs">1. paso</code> · <code className="pm-code text-xs">`código`</code>
            </p>
          </div>

          <div className="executive-card space-y-4">
            <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">Configuración de IA</p>
            <div className="grid gap-2">
              <Label htmlFor="edit-page-gemini-key" className="input-label font-medium">API Key de Gemini</Label>
              <div className="relative">
                <Input
                  id="edit-page-gemini-key"
                  type={showApiKey ? "text" : "password"}
                  value={formData.gemini_api_key}
                  onChange={(e) => setFormData({ ...formData, gemini_api_key: e.target.value })}
                  className="input-field pr-12"
                  placeholder="AIza..."
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3"
                  onClick={() => setShowApiKey(!showApiKey)}
                >
                  {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Obtén tu clave en <span className="underline underline-offset-2">aistudio.google.com</span></p>
            </div>
          </div>

          {/* Funcionalidades — dentro de la columna izquierda (llena el espacio bajo la API key) */}
          <div className="executive-card space-y-2">
            <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide mb-1">Funcionalidades</p>
            {availableFeatures.map((feature) => {
              const isEnabled = formData.features.includes(feature.id)
              const supportsTag = ["take_orders", "take_reservations", "lead_qualification"].includes(feature.id)
              const tagsActive = tagsEnabledByFeature[feature.id] ?? false
              const tagPlaceholder: Record<string, string> = {
                take_orders: "Ej: PEDIDO CONFIRMADO",
                take_reservations: "Ej: RESERVA CONFIRMADA",
                lead_qualification: "Ej: inversor, comprador",
              }
              return (
                <div key={feature.id} className="p-3 rounded-xl hover:bg-muted/50 transition-colors">
                  <div className="grid grid-cols-3 gap-4 items-center">
                  {/* Cols 1-2: feature + "Asignar tags" check */}
                  <div
                    className="col-span-2 flex items-start gap-3 cursor-pointer"
                    onClick={() => handleFeatureChange(feature.id, !isEnabled)}
                  >
                    <Checkbox
                      id={`edit-page-feat-${feature.id}`}
                      checked={isEnabled}
                      onCheckedChange={(checked) => handleFeatureChange(feature.id, checked as boolean)}
                      className="mt-0.5 flex-shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    />
                    <div className="flex-1 min-w-0">
                      <Label htmlFor={`edit-page-feat-${feature.id}`} className="cursor-pointer font-medium">
                        {feature.label}
                      </Label>
                      <p className="text-xs text-muted-foreground mt-0.5">{feature.description}</p>
                    </div>
                    {isEnabled && supportsTag && (
                      <div
                        className="flex items-center gap-1.5 flex-shrink-0 self-center"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Checkbox
                          id={`tags-enabled-${feature.id}`}
                          checked={tagsActive}
                          onCheckedChange={(checked) =>
                            setTagsEnabledByFeature(prev => ({ ...prev, [feature.id]: checked as boolean }))
                          }
                        />
                        <Label
                          htmlFor={`tags-enabled-${feature.id}`}
                          className="text-xs text-muted-foreground cursor-pointer whitespace-nowrap"
                        >
                          Asignar tags
                        </Label>
                      </div>
                    )}
                  </div>
                  {/* Col 3: tag input con animación de entrada/salida */}
                  <div className="col-span-1 overflow-hidden">
                    <AnimatePresence>
                      {isEnabled && supportsTag && tagsActive && (
                        <motion.div
                          key={`tag-input-${feature.id}`}
                          initial={{ opacity: 0, x: 30 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 30 }}
                          transition={{ duration: 0.2, ease: "easeOut" }}
                          className="flex gap-2"
                        >
                          <Input
                            placeholder={tagPlaceholder[feature.id] ?? ""}
                            value={tagInputsByFeature[feature.id] ?? ""}
                            onChange={(e) => setTagInputsByFeature(prev => ({ ...prev, [feature.id]: e.target.value }))}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault()
                                const val = (tagInputsByFeature[feature.id] ?? "").trim()
                                if (val && !formData.allowed_tags.includes(val)) {
                                  setFormData({ ...formData, allowed_tags: [...formData.allowed_tags, val] })
                                  setTagInputsByFeature(prev => ({ ...prev, [feature.id]: "" }))
                                }
                              }
                            }}
                            className="input-field text-sm h-8"
                          />
                          <Button
                            type="button"
                            size="icon"
                            variant="outline"
                            className="h-8 w-8 flex-shrink-0"
                            onClick={() => {
                              const val = (tagInputsByFeature[feature.id] ?? "").trim()
                              if (val && !formData.allowed_tags.includes(val)) {
                                setFormData({ ...formData, allowed_tags: [...formData.allowed_tags, val] })
                                setTagInputsByFeature(prev => ({ ...prev, [feature.id]: "" }))
                              }
                            }}
                          >
                            <Plus className="h-3 w-3" />
                          </Button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                  </div>

                  {isEnabled && featurePromptConfig[feature.id] && (
                    <div className="pt-3 mt-1">
                      <Label className="text-xs text-muted-foreground">
                        {featurePromptConfig[feature.id].label}
                      </Label>
                      <Textarea
                        value={formData.feature_config?.prompts?.[feature.id] ?? ""}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            feature_config: {
                              ...prev.feature_config,
                              prompts: {
                                ...(prev.feature_config?.prompts ?? {}),
                                [feature.id]: e.target.value,
                              },
                            },
                          }))
                        }
                        placeholder={featurePromptConfig[feature.id].placeholder}
                        className="input-field text-sm mt-1 min-h-[70px]"
                      />
                    </div>
                  )}

                  {/* Modo de reservas (solo para la función Tomar reservas) */}
                  {isEnabled && feature.id === "take_reservations" && (
                    <div className="pt-3 mt-1">
                      <Label className="text-xs text-muted-foreground">Tipo de agenda</Label>
                      <p className="text-[11px] text-muted-foreground/80 mb-1">
                        "Mesa/Reserva" pide cantidad de personas (restaurantes). "Turno/Cita" pide servicio y profesional (peluquería, barbería, consultorio).
                      </p>
                      <select
                        value={formData.feature_config?.reservation_mode || "table"}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            feature_config: {
                              ...prev.feature_config,
                              reservation_mode: e.target.value as "table" | "appointment",
                            },
                          }))
                        }
                        className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm"
                      >
                        <option value="table">Mesa / Reserva</option>
                        <option value="appointment">Turno / Cita</option>
                      </select>
                    </div>
                  )}
                </div>
              )
            })}

            {/* Reglas de escalado a humano (handover) — la función está siempre activa */}
            <div className="pt-3 border-t border-border/30">
              <Label className="text-xs text-muted-foreground">Reglas de escalado a humano (handover)</Label>
              <p className="text-[11px] text-muted-foreground/80 mb-1">
                El bot SIEMPRE deriva si el cliente pide explícitamente un humano. Acá agregás tus propias reglas (cuándo escalar o no).
              </p>
              <Textarea
                value={formData.feature_config?.prompts?.handover ?? ""}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    feature_config: {
                      ...prev.feature_config,
                      prompts: {
                        ...(prev.feature_config?.prompts ?? {}),
                        handover: e.target.value,
                      },
                    },
                  }))
                }
                placeholder="Ej: Escalá también si hay un reclamo por un cobro o si piden hablar con el dueño. No escales por consultas de horarios."
                className="input-field text-sm mt-1 min-h-[70px]"
              />
            </div>
            {/* Pool de tags al fondo de la card */}
            <AnimatePresence>
              {formData.allowed_tags.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="pt-3 border-t border-border/30 space-y-2">
                    <div className="flex items-center gap-2">
                      <Target className="w-3 h-3 text-[#D1F366]" />
                      <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">Pool de tags</p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {formData.allowed_tags.map((tag, i) => (
                        <Badge key={i} variant="secondary" className="text-xs flex items-center gap-1 pr-1">
                          {tag}
                          <button
                            type="button"
                            onClick={() => setFormData({ ...formData, allowed_tags: formData.allowed_tags.filter(t => t !== tag) })}
                            className="hover:bg-muted rounded-full p-0.5 transition-colors"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          </div>

          {/* Columna derecha: Estado + conexiones con Meta + guardar */}
          <div className="space-y-3 sm:space-y-5">
            <div className="executive-card space-y-4">
              <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">Estado</p>
              <div className="flex items-center justify-between">
                <Label htmlFor="edit-page-is_active" className="font-medium cursor-pointer">Bot activo</Label>
                <Switch
                  id="edit-page-is_active"
                  checked={formData.is_active}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                />
              </div>
              <div className="pt-2 border-t border-border/50 space-y-3">
                <div className="flex items-center justify-between text-sm gap-2">
                  <span className="text-muted-foreground">Canales</span>
                  <div className="flex flex-wrap justify-end gap-1">
                    {formData.platforms.length > 0 ? (
                      formData.platforms.filter(Boolean).map((p) => (
                        <Badge key={p} variant="outline" className="text-[10px]">
                          {platformLabels[p as keyof typeof platformLabels] || p}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-xs text-muted-foreground">Sin conectar</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Funcionalidades</span>
                  <span className="text-xs font-medium">{formData.features.length} activas</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Creado</span>
                  <span className="text-xs">{formatDate(editingBot.created_at)}</span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground pt-1">
                Los canales se activan automáticamente al conectar cada plataforma acá abajo.
              </p>
            </div>

            {(["whatsapp", "instagram", "messenger"] as const).map((p) => (
              <MetaConnectionCard key={p} platform={p} onStatusChange={handleConnectionStatus} />
            ))}

            <div className="executive-card">
              <Button
                onClick={() => handleEditBot()}
                disabled={isLoading || !formData.name.trim()}
                className="w-full bg-[#D1F366] text-[#1C1C28] hover:bg-[#B3D93C] font-bold rounded-xl gap-2 py-5"
              >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                Guardar Cambios
              </Button>
              <p className="text-xs text-muted-foreground text-center mt-3">Los cambios se aplican inmediatamente</p>
            </div>
          </div>


          {/* Comportamiento del bot — full width */}
          <div className="lg:col-span-3 executive-card space-y-5">
            <div className="flex items-center gap-2">
              <Bot className="w-4 h-4 text-[#D1F366]" />
              <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">Comportamiento del bot</p>
            </div>

            {/* Reactivador automático de IA */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pt-1">
              <div className="min-w-0">
                <Label className="font-medium">Reactivar IA automáticamente</Label>
                <p className="text-[11px] text-muted-foreground/80 mt-0.5">
                  Cuando pausás la IA o se deriva a un humano, vuelve a activarse sola después de este tiempo.
                </p>
              </div>
              <select
                value={formData.feature_config?.auto_reactivate_hours ?? 0}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    feature_config: { ...prev.feature_config, auto_reactivate_hours: Number(e.target.value) },
                  }))
                }
                className="h-9 rounded-lg border border-border bg-background px-3 text-sm flex-shrink-0"
              >
                <option value={0}>Nunca (manual)</option>
                <option value={1}>1 hora</option>
                <option value={3}>3 horas</option>
                <option value={6}>6 horas</option>
                <option value={12}>12 horas</option>
                <option value={24}>24 horas</option>
              </select>
            </div>

            {/* Ventana de escucha (debounce) */}
            <div className="pt-3 border-t border-border/30">
              <Label className="font-medium">Ventana de escucha</Label>
              <p className="text-[11px] text-muted-foreground/80 mt-0.5 mb-2">
                Tiempo que el bot espera para agrupar los mensajes seguidos del cliente en una sola respuesta.
              </p>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={3}
                  max={15}
                  step={1}
                  value={formData.feature_config?.debounce_seconds ?? 7}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      feature_config: { ...prev.feature_config, debounce_seconds: Number(e.target.value) },
                    }))
                  }
                  className="flex-1 accent-[#D1F366]"
                />
                <span className="text-sm font-bold w-12 text-right">{formData.feature_config?.debounce_seconds ?? 7}s</span>
              </div>
            </div>

            {/* Separar mensajes largos */}
            <div className="flex items-center justify-between gap-2 pt-3 border-t border-border/30">
              <div className="min-w-0">
                <Label className="font-medium">Separar mensajes largos</Label>
                <p className="text-[11px] text-muted-foreground/80 mt-0.5">
                  Divide las respuestas largas en varios mensajes (por párrafo) para que se sienta más natural.
                </p>
              </div>
              <Switch
                checked={!!formData.feature_config?.split_long_messages}
                onCheckedChange={(checked) =>
                  setFormData((prev) => ({
                    ...prev,
                    feature_config: { ...prev.feature_config, split_long_messages: checked },
                  }))
                }
              />
            </div>

          </div>

          {/* Plantillas de WhatsApp — bento grid full width */}
          {formData.platforms.includes("whatsapp") && (
            <div className="lg:col-span-3">
              <WhatsAppTemplatesManager />
            </div>
          )}

        </div>
      </div>
    )
  }

  // Hay bots pero ninguno abierto → lista para elegir cuál configurar (ej: cliente con varios)
  if (bots.length > 0) {
    return (
      <div className="space-y-4">
        <div className="px-1 pt-2">
          <h2 className="text-2xl font-bold dark:text-white">Bots ({bots.length})</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Elegí un bot para configurar.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {bots.map((bot) => {
            const channels = (bot.platforms?.length ? bot.platforms : [bot.platform])
              .filter(Boolean)
              .map((p: string) => platformLabels[p as keyof typeof platformLabels] || p)
              .join(" + ")
            return (
              <button
                key={bot.id}
                onClick={() => openEditDialog(bot)}
                className="text-left bg-card rounded-2xl border border-border p-4 hover:border-[#D1F366] hover:shadow-md transition-all flex items-center gap-3"
              >
                <div className="h-11 w-11 rounded-xl bg-[#D1F366]/15 flex items-center justify-center flex-shrink-0">
                  <Bot className="h-5 w-5 text-[#76a609]" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold truncate dark:text-white">{bot.name || "Bot"}</p>
                  <p className="text-xs text-muted-foreground truncate">{channels || "Sin canal"}</p>
                </div>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full border flex-shrink-0 ${
                    bot.is_active
                      ? "bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400"
                      : "bg-gray-100 text-gray-600 border-gray-200"
                  }`}
                >
                  {bot.is_active ? "Activo" : "Inactivo"}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      <div className="bg-muted/50 p-6 rounded-full mb-4">
        <Bot className="h-12 w-12 text-muted-foreground" />
      </div>
      <h2 className="text-xl font-bold mb-2">Creá tu bot</h2>
      <p className="text-sm text-muted-foreground mb-4 max-w-xs">
        Configurá tu asistente de IA y conectá tus integraciones de WhatsApp, Instagram y Messenger.
      </p>
      <Button onClick={demo ? undefined : handleStartCreate} disabled={demo}>
        <Plus className="h-4 w-4 mr-2" />
        Crear mi bot
      </Button>
    </div>
  )
}
