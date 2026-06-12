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
import { MultiStepBotCreation } from "./multi-step-bot-creation"
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
  { id: "lead_qualification", label: "Calificación de leads", description: "La IA clasifica automáticamente los leads según las etiquetas configuradas." },
]

function highlightPrompt(text: string): string {
  if (!text) return ''
  const inline = (s: string) => s
    .replace(/\*\*(.+?)\*\*/g, '<span style="color:#4d5c40">**</span><span style="color:#ffffff;font-weight:700">$1</span><span style="color:#4d5c40">**</span>')
    .replace(/\*([^*\n]+?)\*/g, '<span style="color:#4d5c40">*</span><span style="color:#c2c9b5;font-style:italic">$1</span><span style="color:#4d5c40">*</span>')
    .replace(/`([^`\n]+?)`/g, '<span style="color:#4d5c40">`</span><span style="color:#D1F366;background:rgba(209,243,102,0.08);border-radius:2px;padding:0 2px">$1</span><span style="color:#4d5c40">`</span>')
  return text.split('\n').map(raw => {
    const e = raw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    if (e.startsWith('### '))
      return `<span style="color:#4d5c40">### </span><span style="color:#D1F366;font-weight:700">${inline(e.slice(4))}</span>`
    if (e.startsWith('## '))
      return `<span style="color:#4d5c40">## </span><span style="color:#b4d96b;font-weight:600">${inline(e.slice(3))}</span>`
    if (/^\s{2,}- /.test(e))
      return `<span style="color:#4d5c40">${e.match(/^\s+/)![0]}- </span>${inline(e.replace(/^\s*- /, ''))}`
    if (e.startsWith('- '))
      return `<span style="color:#D1F366">- </span>${inline(e.slice(2))}`
    const nm = e.match(/^(\d+\.) (.+)$/)
    if (nm) return `<span style="color:#D1F366">${nm[1]} </span>${inline(nm[2])}`
    if (e.trim() === '') return ''
    return inline(e)
  }).join('\n')
}

export function BotsManagement({ initialBots, userId, demo = false }: BotsManagementProps) {
  const [bots, setBots] = useState<BotData[]>(initialBots)
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [selectedBot, setSelectedBot] = useState<BotData | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [showApiKey, setShowApiKey] = useState(false)
  const supabase = createClient()

  const [userSubscription, setUserSubscription] = useState<any>(null)
  const [canCreateBot, setCanCreateBot] = useState(true)
  const [tagInput, setTagInput] = useState("")
  const [editingBot, setEditingBot] = useState<BotData | null>(null)
  const [tagInputsByFeature, setTagInputsByFeature] = useState<Record<string, string>>({
    take_orders: "",
    take_reservations: "",
    lead_qualification: "",
  })
  const [tagsEnabledByFeature, setTagsEnabledByFeature] = useState<Record<string, boolean>>({
    take_orders: false,
    take_reservations: false,
    lead_qualification: false,
  })
  const promptTextareaRef = useRef<HTMLTextAreaElement>(null)
  const promptOverlayRef = useRef<HTMLDivElement>(null)

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    platform: "" as "whatsapp" | "instagram" | "messenger" | "email" | "",
    platforms: [] as string[],
    personality_prompt: "",
    features: [] as string[],
    allowed_tags: [] as string[],
    automations: [] as string[],
    gemini_api_key: "",
    is_active: false,
  })

  const resetForm = () => {
    setFormData({
      name: "",
      platform: "",
      platforms: [],
      personality_prompt: "",
      features: [],
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

  const handleCreateBot = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      const { data, error } = await supabase
        .from("bots")
        .insert([
          {
            ...formData,
            user_id: userId,
          },
        ])
        .select()
        .single()

      if (error) throw error

      setBots([data, ...bots])
      setIsCreateDialogOpen(false)
      resetForm()
      
      // Emit custom event to update sidebar navigation
      window.dispatchEvent(new CustomEvent('botCreated', { detail: data }))
      
      toast.success("Bot creado exitosamente", {
        description: `${formData.name} ha sido configurado y está listo para usar.`,
        duration: 4000,
      })
    } catch (error) {
      toast.error("Error al crear bot", {
        description: "No se pudo crear el bot. Inténtalo de nuevo.",
        duration: 4000,
      })
    } finally {
      setIsLoading(false)
    }
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
      setEditingBot(null)
      setIsEditDialogOpen(false)
      setSelectedBot(null)
      resetForm()
      
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
    setFormData({
      name: bot.name,
      platform: bot.platform,
      platforms: bot.platforms?.length ? bot.platforms : bot.platform ? [bot.platform] : [],
      personality_prompt: bot.personality_prompt || "",
      features: bot.features || [],
      allowed_tags: bot.allowed_tags || [],
      automations: bot.automations || [],
      gemini_api_key: bot.gemini_api_key || "",
      is_active: bot.is_active,
    })
    setTagInputsByFeature({ take_orders: "", take_reservations: "", lead_qualification: "" })
    const hasTags = (bot.allowed_tags?.length ?? 0) > 0
    setTagsEnabledByFeature({
      take_orders: hasTags && (bot.features || []).includes("take_orders"),
      take_reservations: hasTags && (bot.features || []).includes("take_reservations"),
      lead_qualification: hasTags && (bot.features || []).includes("lead_qualification"),
    })
    setEditingBot(bot)
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

  const handleBotCreated = (newBot: BotData) => {
    setBots([newBot, ...bots])
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
            <button
              onClick={() => { setEditingBot(null); setSelectedBot(null); resetForm() }}
              className="p-2 rounded-xl hover:bg-muted transition-colors text-muted-foreground hover:text-foreground flex-shrink-0"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <h2 className="text-xl sm:text-3xl font-bold dark:text-white truncate">Editar Bot</h2>
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

          {/* Columna izquierda: Información General + Personalidad + IA */}
          <div className="lg:col-span-2 space-y-3 sm:space-y-5">

          <div className="executive-card space-y-4">
            <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">Información General</p>
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-page-name" className="input-label font-medium">Nombre del Bot *</Label>
                <Input
                  id="edit-page-name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="input-field"
                  required
                />
              </div>
            </div>
          </div>

          <div className="executive-card space-y-4">
            <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">Personalidad del Bot</p>
            {/* Overlay editor: div de resaltado + textarea transparente encima */}
            <div
              className="relative rounded-xl overflow-hidden"
              style={{ background: "#0c0e17", border: "1px solid #424939", height: "520px" }}
            >
              <div
                ref={promptOverlayRef}
                aria-hidden="true"
                className="absolute inset-0 p-3 font-mono text-sm pointer-events-none overflow-hidden select-none"
                style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", color: "#c2c9b5", lineHeight: "1.65", tabSize: 2 }}
                dangerouslySetInnerHTML={{
                  __html: formData.personality_prompt
                    ? highlightPrompt(formData.personality_prompt)
                    : '<span style="color:#2e3520">### ROL Y PERSONALIDAD\nActúas como el asistente de [Negocio].\n- **Tono:** Natural y conciso.\n\n### INSTRUCCIONES\n1. Saludá al cliente.\n2. Identificá qué necesita.</span>'
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
                className="prompt-editor absolute inset-0 w-full h-full bg-transparent font-mono text-sm p-3 resize-none outline-none overflow-y-auto"
                style={{ color: "transparent", caretColor: "#D1F366", lineHeight: "1.65", tabSize: 2 }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Formato: <code className="text-[#D1F366]/70 text-xs">### Sección</code> · <code className="text-[#D1F366]/70 text-xs">**negrita**</code> · <code className="text-[#D1F366]/70 text-xs">- ítem</code> · <code className="text-[#D1F366]/70 text-xs">1. paso</code> · <code className="text-[#D1F366]/70 text-xs">`código`</code>
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
              <p className="text-xs text-muted-foreground">Obtén tu clave en <span className="text-[#D1F366]/80">aistudio.google.com</span></p>
            </div>
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

          {/* Funcionalidades — col-span-3, tag input en col 3 de cada fila */}
          <div className="lg:col-span-3 executive-card space-y-2">
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
                <div key={feature.id} className="grid grid-cols-3 gap-4 items-center p-3 rounded-xl hover:bg-muted/50 transition-colors">
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
                        {feature.id === "lead_qualification" && (
                          <Badge variant="outline" className="ml-2 text-xs text-[#D1F366] border-[#D1F366]/40">IA</Badge>
                        )}
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
              )
            })}
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

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <ScrollSlideUp>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">Configuración de Bots</h1>
            <p className="text-sm sm:text-base text-muted-foreground">Crea y gestiona tus chatbots con IA</p>
          </div>
        </ScrollSlideUp>
        <ScrollFadeIn delay={0.2}>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            {!canCreateBot && (
              <Badge variant="outline" className="text-amber-600 border-amber-600 text-xs">
                Límite alcanzado
              </Badge>
            )}
            <motion.div
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="flex-1 sm:flex-initial"
            >
              <Button
                onClick={demo ? undefined : () => setIsCreateDialogOpen(true)}
                disabled={demo || !canCreateBot}
                title={demo ? "Activá tu cuenta para empezar a usar" : undefined}
                className="w-full sm:w-auto"
              >
                <Plus className="h-4 w-4 mr-2" />
                <span className="hidden sm:inline">Crear Bot</span>
                <span className="sm:hidden">Nuevo Bot</span>
              </Button>
            </motion.div>
          </div>
        </ScrollFadeIn>
      </div>


      {/* Stats */}
      <ScrollStaggeredChildren className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-3">
        <ScrollStaggerChild>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 px-3 sm:px-6 pt-3 sm:pt-6">
              <CardTitle className="text-xs sm:text-sm font-medium">Total Bots</CardTitle>
              <Bot className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
              <ScrollScaleIn delay={0.3}>
                <div className="text-xl sm:text-2xl font-bold">{bots.length}</div>
              </ScrollScaleIn>
              <p className="text-xs text-muted-foreground">Bots configurados</p>
            </CardContent>
          </Card>
        </ScrollStaggerChild>

        <ScrollStaggerChild>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 px-3 sm:px-6 pt-3 sm:pt-6">
              <CardTitle className="text-xs sm:text-sm font-medium">Bots Activos</CardTitle>
              <Play className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
              <ScrollScaleIn delay={0.4}>
                <div className="text-xl sm:text-2xl font-bold">{bots.filter((bot) => bot.is_active).length}</div>
              </ScrollScaleIn>
              <p className="text-xs text-muted-foreground">En funcionamiento</p>
            </CardContent>
          </Card>
        </ScrollStaggerChild>

        <ScrollStaggerChild>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 px-3 sm:px-6 pt-3 sm:pt-6">
              <CardTitle className="text-xs sm:text-sm font-medium">Plataformas</CardTitle>
              <Zap className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
              <ScrollScaleIn delay={0.5}>
                <div className="text-xl sm:text-2xl font-bold">{new Set(bots.map((bot) => bot.platform)).size}</div>
              </ScrollScaleIn>
              <p className="text-xs text-muted-foreground">Conectadas</p>
            </CardContent>
          </Card>
        </ScrollStaggerChild>
      </ScrollStaggeredChildren>

      {/* Bots Grid */}
      <ScrollStaggeredChildren className="grid gap-4 sm:gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        {bots.length === 0 ? (
          <ScrollStaggerChild>
            <Card className="col-span-full">
              <CardContent className="flex flex-col items-center justify-center py-8 sm:py-12 px-4 sm:px-6">
                <Bot className="h-10 w-10 sm:h-12 sm:w-12 text-muted-foreground mb-4" />
                <h3 className="text-base sm:text-lg font-medium mb-2 text-center">No tienes bots aún</h3>
                <p className="text-sm sm:text-base text-muted-foreground text-center mb-4">
                  Crea tu primer chatbot para comenzar a automatizar la atención al cliente
                </p>
                <motion.div
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <Button
                    onClick={demo ? undefined : () => setIsCreateDialogOpen(true)}
                    disabled={demo}
                    title={demo ? "Activá tu cuenta para empezar a usar" : undefined}
                    className="w-full sm:w-auto"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    <span className="hidden sm:inline">Crear mi primer bot</span>
                    <span className="sm:hidden">Crear bot</span>
                  </Button>
                </motion.div>
              </CardContent>
            </Card>
          </ScrollStaggerChild>
        ) : (
          bots.map((bot) => {
            const PlatformIcon = platformIcons[bot.platform]
            return (
              <ScrollStaggerChild key={bot.id}>
                <motion.div
                  whileHover={{ scale: 1.02, y: -4 }}
                  transition={{ duration: 0.2 }}
                >
                  <Card className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 px-3 sm:px-6 pt-3 sm:pt-6">
                  <div className="flex items-center space-x-2 min-w-0 flex-1">
                    <PlatformIcon className="h-4 w-4 sm:h-5 sm:w-5 text-primary flex-shrink-0" />
                    <CardTitle className="text-sm sm:text-lg truncate">{bot.name}</CardTitle>
                  </div>
                  <DropdownMenu modal={false}>
                    <DropdownMenuTrigger asChild>
                      <motion.div
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                      >
                        <Button variant="ghost" className="h-8 w-8 p-0">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </motion.div>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={demo ? undefined : () => openEditDialog(bot)}
                        disabled={demo}
                        title={demo ? "Activá tu cuenta para empezar a usar" : undefined}
                      >
                        <Edit className="mr-2 h-4 w-4" />
                        Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={demo ? undefined : () => handleToggleBot(bot.id, !bot.is_active)}
                        disabled={demo}
                        title={demo ? "Activá tu cuenta para empezar a usar" : undefined}
                      >
                        {bot.is_active ? (
                          <>
                            <Pause className="mr-2 h-4 w-4" />
                            Desactivar
                          </>
                        ) : (
                          <>
                            <Play className="mr-2 h-4 w-4" />
                            Activar
                          </>
                        )}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={demo ? undefined : () => handleDeleteBot(bot.id)}
                        disabled={demo}
                        title={demo ? "Activá tu cuenta para empezar a usar" : undefined}
                        className="text-destructive"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Eliminar
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </CardHeader>
                <CardContent className="space-y-3 sm:space-y-4 px-3 sm:px-6 pb-3 sm:pb-6">
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant={bot.is_active ? "default" : "secondary"} className="text-xs">
                      {bot.is_active ? "Activo" : "Inactivo"}
                    </Badge>
                    {(bot.platforms?.length ? bot.platforms : [bot.platform]).map((p) => (
                      <Badge key={p} variant="outline" className="text-xs">
                        {platformLabels[p as keyof typeof platformLabels] || p}
                      </Badge>
                    ))}
                  </div>

                  <div className="space-y-2">
                    <div className="text-xs sm:text-sm">
                      <span className="font-medium">Funcionalidades:</span>
                      <div className="mt-1">
                        {bot.features.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {bot.features.slice(0, 2).map((featureId) => {
                              const feature = availableFeatures.find((f) => f.id === featureId)
                              return (
                                <Badge key={featureId} variant="outline" className="text-xs">
                                  {feature?.label}
                                </Badge>
                              )
                            })}
                            {bot.features.length > 2 && (
                              <Badge variant="outline" className="text-xs">
                                +{bot.features.length - 2} más
                              </Badge>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-xs">Sin funcionalidades</span>
                        )}
                      </div>
                    </div>

                    <div className="text-sm">
                      <span className="font-medium">IA:</span>
                      <span
                        className={`ml-2 text-xs ${bot.gemini_api_key ? "text-green-600" : "text-muted-foreground"}`}
                      >
                        {bot.gemini_api_key ? "Configurada" : "No configurada"}
                      </span>
                    </div>

                    <div className="text-xs text-muted-foreground">Creado el {formatDate(bot.created_at)}</div>
                  </div>
                  </CardContent>
                  </Card>
                </motion.div>
              </ScrollStaggerChild>
            )
          })
        )}
      </ScrollStaggeredChildren>

      {/* Multi-step Bot Creation Dialog */}
      <MultiStepBotCreation
        isOpen={isCreateDialogOpen}
        onClose={() => setIsCreateDialogOpen(false)}
        onBotCreated={handleBotCreated}
        userId={userId}
      />

    </div>
  )
}
