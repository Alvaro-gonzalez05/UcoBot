"use client"

import type React from "react"
import { useEffect, useState } from "react"
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
import { MetaBusinessConfig } from "./meta-business-config"
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
} from "lucide-react"
import { ScrollFadeIn, ScrollSlideUp, ScrollStaggeredChildren, ScrollStaggerChild, ScrollScaleIn } from "@/components/ui/scroll-animations"
import { motion } from "framer-motion"
import { FaWhatsapp } from "react-icons/fa"

interface BotData {
  id: string
  name: string
  platform: "whatsapp" | "instagram" | "email"
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
  email: Mail,
}

const platformLabels = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  email: "Email",
}

const availableFeatures = [
  { id: "take_orders", label: "Tomar pedidos" },
  { id: "take_reservations", label: "Tomar reservas" },
  { id: "register_clients", label: "Registro de clientes" },
  { id: "loyalty_points", label: "Consulta de puntos de fidelización" },
]

export function BotsManagement({ initialBots, userId, demo = false }: BotsManagementProps) {
  const [bots, setBots] = useState<BotData[]>(initialBots)
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isMetaConfigDialogOpen, setIsMetaConfigDialogOpen] = useState(false)
  const [selectedBot, setSelectedBot] = useState<BotData | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [showApiKey, setShowApiKey] = useState(false)
  const supabase = createClient()

  const [userSubscription, setUserSubscription] = useState<any>(null)
  const [canCreateBot, setCanCreateBot] = useState(true)
  const [tagInput, setTagInput] = useState("")

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    platform: "" as "whatsapp" | "instagram" | "email" | "",
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
      personality_prompt: "",
      features: [],
      allowed_tags: [],
      automations: [],
      gemini_api_key: "",
      is_active: false,
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

  const handleEditBot = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedBot) return

    setIsLoading(true)

    try {
      const { data, error } = await supabase.from("bots").update(formData).eq("id", selectedBot.id).select().single()

      if (error) throw error

      setBots(bots.map((bot) => (bot.id === selectedBot.id ? data : bot)))
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
      personality_prompt: bot.personality_prompt || "",
      features: bot.features || [],
      allowed_tags: bot.allowed_tags || [],
      automations: bot.automations || [],
      gemini_api_key: bot.gemini_api_key || "",
      is_active: bot.is_active,
    })
    setIsEditDialogOpen(true)
  }

  const openMetaConfigDialog = (bot: BotData) => {
    // Verificar si el usuario tiene un plan de pago
    if (userSubscription?.plan_type === "trial") {
      toast.error("Funcionalidad premium requerida", {
        description: "La configuración de Meta Business Suite está disponible solo para planes de pago. Actualiza tu suscripción.",
        duration: 4000,
      })
      return
    }

    setSelectedBot(bot)
    setIsMetaConfigDialogOpen(true)
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
                      {(bot.platform === "whatsapp" || bot.platform === "instagram") && (
                        <DropdownMenuItem
                          onClick={demo ? undefined : () => openMetaConfigDialog(bot)}
                          disabled={demo}
                          title={demo ? "Activá tu cuenta para empezar a usar" : undefined}
                        >
                          <Zap className="mr-2 h-4 w-4" />
                          {bot.platform === "whatsapp" ? "Configurar Meta Business (WhatsApp)" : "Configurar Meta Business (Instagram)"}
                        </DropdownMenuItem>
                      )}
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
                    <Badge variant="outline" className="text-xs">{platformLabels[bot.platform]}</Badge>
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

      {/* Meta Business Configuration Dialog */}
      <MetaBusinessConfig
        isOpen={isMetaConfigDialogOpen}
        onClose={() => {
          setIsMetaConfigDialogOpen(false)
          setSelectedBot(null)
        }}
        bot={selectedBot}
        onConfigComplete={() => {
          // Actualizar estado si es necesario
        }}
      />

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] sm:max-h-[80vh] overflow-y-auto mx-4 sm:mx-0">
          <DialogHeader className="px-4 sm:px-6 pt-4 sm:pt-6">
            <DialogTitle className="text-lg sm:text-xl">Editar Bot</DialogTitle>
            <DialogDescription className="text-sm sm:text-base">Actualiza la configuración de tu chatbot</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEditBot}>
            <div className="grid gap-4 sm:gap-6 py-4 px-4 sm:px-6">
              {/* Same form fields as create dialog */}
              <div className="space-y-3 sm:space-y-4">
                <h4 className="text-sm sm:text-base font-medium">Información Básica</h4>
                <div className="grid gap-3 sm:gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="edit-name" className="text-sm font-medium">Nombre del Bot *</Label>
                    <Input
                      id="edit-name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      required
                      className="text-sm sm:text-base"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="edit-platform" className="text-sm font-medium">Plataforma *</Label>
                    <Select
                      value={formData.platform}
                      onValueChange={(value: "whatsapp" | "instagram" | "email") =>
                        setFormData({ ...formData, platform: value })
                      }
                    >
                      <SelectTrigger className="text-sm sm:text-base">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="whatsapp">WhatsApp</SelectItem>
                        <SelectItem value="instagram">Instagram</SelectItem>
                        <SelectItem value="email">Email</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <div className="space-y-3 sm:space-y-4">
                <h4 className="text-sm sm:text-base font-medium">Personalidad del Bot</h4>
                <div className="grid gap-2">
                  <Label htmlFor="edit-personality" className="text-sm font-medium">Prompt de Personalidad</Label>
                  <Textarea
                    id="edit-personality"
                    value={formData.personality_prompt}
                    onChange={(e) => setFormData({ ...formData, personality_prompt: e.target.value })}
                    rows={3}
                    className="text-sm sm:text-base min-h-[80px] sm:min-h-[100px]"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="edit-allowed_tags" className="text-sm font-medium">Etiquetas Permitidas</Label>
                  <div className="flex gap-2">
                    <Input
                      id="edit-allowed_tags"
                      placeholder="Ej: TURNO CENA"
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          if (tagInput.trim() && !formData.allowed_tags.includes(tagInput.trim())) {
                            setFormData({
                              ...formData,
                              allowed_tags: [...formData.allowed_tags, tagInput.trim()]
                            });
                            setTagInput("");
                          }
                        }
                      }}
                      className="text-sm sm:text-base"
                    />
                    <Button 
                      type="button"
                      onClick={() => {
                        if (tagInput.trim() && !formData.allowed_tags.includes(tagInput.trim())) {
                          setFormData({
                            ...formData,
                            allowed_tags: [...formData.allowed_tags, tagInput.trim()]
                          });
                          setTagInput("");
                        }
                      }}
                      size="icon"
                      variant="outline"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Define qué etiquetas puede asignar este bot. Si no agregas ninguna, la IA NO asignará etiquetas.
                  </p>
                  {formData.allowed_tags.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-1">
                      {formData.allowed_tags.map((tag, i) => (
                        <Badge key={i} variant="secondary" className="text-xs flex items-center gap-1 pr-1">
                          {tag}
                          <button
                            type="button"
                            onClick={() => {
                              setFormData({
                                ...formData,
                                allowed_tags: formData.allowed_tags.filter(t => t !== tag)
                              });
                            }}
                            className="hover:bg-muted rounded-full p-0.5 transition-colors"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-3 sm:space-y-4">
                <h4 className="text-sm sm:text-base font-medium">Funcionalidades</h4>
                <div className="grid gap-2 sm:gap-3">
                  {availableFeatures.map((feature) => (
                    <div key={feature.id} className="flex items-center space-x-3 p-2 rounded-lg hover:bg-muted/50">
                      <Checkbox
                        id={`edit-${feature.id}`}
                        checked={formData.features.includes(feature.id)}
                        onCheckedChange={(checked) => handleFeatureChange(feature.id, checked as boolean)}
                        className="flex-shrink-0"
                      />
                      <Label htmlFor={`edit-${feature.id}`} className="text-sm sm:text-base cursor-pointer">
                        {feature.label}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-3 sm:space-y-4">
                <h4 className="text-sm sm:text-base font-medium">Configuración de IA</h4>
                <div className="grid gap-2">
                  <Label htmlFor="edit-openai_key" className="text-sm font-medium">API Key de OpenAI</Label>
                  <div className="relative">
                    <Input
                      id="edit-openai_key"
                      type={showApiKey ? "text" : "password"}
                      value={formData.gemini_api_key}
                      onChange={(e) => setFormData({ ...formData, gemini_api_key: e.target.value })}
                      className="text-sm sm:text-base pr-12"
                    />
                    <motion.div
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      className="absolute right-0 top-0 h-full"
                    >
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-full px-2 sm:px-3"
                        onClick={() => setShowApiKey(!showApiKey)}
                      >
                        {showApiKey ? <EyeOff className="h-3 w-3 sm:h-4 sm:w-4" /> : <Eye className="h-3 w-3 sm:h-4 sm:w-4" />}
                      </Button>
                    </motion.div>
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-3 p-3 rounded-lg bg-muted/50">
                <Switch
                  id="edit-is_active"
                  checked={formData.is_active}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                />
                <Label htmlFor="edit-is_active" className="text-sm sm:text-base font-medium cursor-pointer">Bot activo</Label>
              </div>
            </div>
            <DialogFooter className="px-4 sm:px-6 pb-4 sm:pb-6 flex-col sm:flex-row gap-2 sm:gap-0">
              <motion.div
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="w-full sm:w-auto"
              >
                <Button type="button" variant="outline" onClick={() => {
                  setIsEditDialogOpen(false)
                }} className="w-full sm:w-auto text-sm sm:text-base">
                  Cancelar
                </Button>
              </motion.div>
              <motion.div
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="w-full sm:w-auto"
              >
                <Button type="submit" disabled={isLoading} className="w-full sm:w-auto text-sm sm:text-base">
                  {isLoading ? "Actualizando..." : "Actualizar Bot"}
                </Button>
              </motion.div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
