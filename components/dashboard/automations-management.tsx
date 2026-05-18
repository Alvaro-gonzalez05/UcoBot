"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
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
  DialogTrigger,
} from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { toast } from "sonner"
import {
  Plus,
  Zap,
  Calendar,
  UserX,
  Gift,
  Play,
  Pause,
  MoreHorizontal,
  Edit,
  Trash2,
  Clock,
  MessageSquare,
  Bot,
  ShoppingCart,
  CalendarDays,
  Activity,
  TrendingUp,
  Send,
} from "lucide-react"
import { ScrollFadeIn, ScrollSlideUp, ScrollStaggeredChildren, ScrollStaggerChild, ScrollScaleIn } from "@/components/ui/scroll-animations"
import { motion } from "framer-motion"
import { MultiStepAutomationCreation } from "./multi-step-automation-creation"

interface Automation {
  id: string
  name: string
  trigger_type: "birthday" | "inactive_client" | "new_promotion" | "comment_reply"
  trigger_config: Record<string, any>
  message_template: string
  template_id?: string
  template_variables?: Record<string, any>
  bot_id: string
  promotion_id?: string
  is_active: boolean
  created_at: string
  bots?: {
    id: string
    name: string
    platform: string
  }
  promotions?: {
    id: string
    name: string
  }
}

interface Bot {
  id: string
  name: string
  platform: string
}

interface SystemTemplate {
  id: string
  template_key: string
  name: string
  description: string
  body_content: string
  variables_used: string[]
  automation_types: string[]
}

interface MessageTemplate {
  id: string
  template_name: string
  body_content: string
  status: string
  platform: string
}

interface AutomationStats {
  total_automations: number
  active_automations: number
  pending_messages: number
  sent_today: number
}

interface AutomationsManagementProps {
  initialAutomations: Automation[]
  userId: string
  demo?: boolean
}

const triggerTypes = {
  birthday: {
    icon: Calendar,
    label: "Cumpleaños de Clientes",
    description: "Envía felicitaciones automáticas",
    color: "bg-pink-500",
    platforms: ["whatsapp", "instagram", "email"]
  },
  inactive_client: {
    icon: UserX,
    label: "Cliente Inactivo",
    description: "Reactiva clientes que no compran",
    color: "bg-orange-500",
    platforms: ["whatsapp", "instagram", "email"]
  },
  new_promotion: {
    icon: Gift,
    label: "Nueva Promoción",
    description: "Notifica sobre ofertas especiales",
    color: "bg-purple-500",
    platforms: ["whatsapp", "instagram", "email"]
  },
  comment_reply: {
    icon: MessageSquare,
    label: "Respuesta a Comentario",
    description: "Responde automáticamente a comentarios (Instagram)",
    color: "bg-pink-500",
    platforms: ["instagram"]
  },
}

export function AutomationsManagement({ initialAutomations, userId, demo = false }: AutomationsManagementProps) {
  const [automations, setAutomations] = useState<Automation[]>(initialAutomations)
  const [bots, setBots] = useState<Bot[]>([])
  const [systemTemplates, setSystemTemplates] = useState<SystemTemplate[]>([])
  const [userTemplates, setUserTemplates] = useState<MessageTemplate[]>([])
  const [promotions, setPromotions] = useState<{ id: string; name: string }[]>([])
  const [stats, setStats] = useState<AutomationStats>({
    total_automations: 0,
    active_automations: 0,
    pending_messages: 0,
    sent_today: 0
  })
  
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [selectedAutomation, setSelectedAutomation] = useState<Automation | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  
  // Mock user subscription (en una app real esto vendría de la base de datos)
  const userSubscription = {
    max_automations: 10, // o cualquier límite según el plan del usuario
    plan: 'premium'
  }
  
  const canCreateAutomation = automations.length < userSubscription.max_automations
  
  const supabase = createClient()

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    trigger_type: "" as keyof typeof triggerTypes | "",
    trigger_config: {} as Record<string, any>,
    message_template: "",
    template_id: "",
    template_variables: {} as Record<string, any>,
    bot_id: "",
    promotion_id: "",
    is_active: true,
  })

  useEffect(() => {
    fetchBots()
    fetchSystemTemplates()
    fetchUserTemplates()
    fetchPromotions()
    fetchStats()
  }, [userId])

  useEffect(() => {
    updateStats()
  }, [automations])

  const fetchBots = async () => {
    try {
      const { data, error } = await supabase
        .from("bots")
        .select("id, name, platform")
        .eq("user_id", userId)
        .eq("is_active", true)

      if (error) throw error
      setBots(data || [])
    } catch (error) {
      console.error("Error fetching bots:", error)
    }
  }

  const fetchSystemTemplates = async () => {
    try {
      const { data, error } = await supabase
        .from("system_templates")
        .select("*")
        .order("is_popular", { ascending: false })
        .order("sort_order", { ascending: true })

      if (error) throw error
      setSystemTemplates(data || [])
    } catch (error) {
      console.error("Error fetching system templates:", error)
    }
  }

  const fetchUserTemplates = async () => {
    try {
      const { data, error } = await supabase
        .from("user_templates")
        .select("*")
        .eq("user_id", userId)
        .eq("status", "approved")

      if (error) throw error
      setUserTemplates(data || [])
    } catch (error) {
      console.error("Error fetching user templates:", error)
    }
  }

  const fetchPromotions = async () => {
    try {
      const { data, error } = await supabase
        .from("promotions")
        .select("id, name")
        .eq("user_id", userId)
        .eq("is_active", true)
        .order("created_at", { ascending: false })

      if (error) throw error
      setPromotions(data || [])
    } catch (error) {
      console.error("Error fetching promotions:", error)
    }
  }

  const fetchStats = async () => {
    try {
      // Obtener estadísticas básicas
      const { data: queueStats } = await fetch('/api/automations/process-queue', {
        method: 'GET'
      }).then(res => res.json()).catch(() => ({ by_status: {} }))

      const { data: logsToday, error: logsError } = await supabase
        .from("automation_logs")
        .select("id")
        .gte("created_at", new Date().toISOString().split('T')[0])
        .eq("success", true)

      setStats({
        total_automations: automations.length,
        active_automations: automations.filter(a => a.is_active).length,
        pending_messages: queueStats?.by_status?.pending || 0,
        sent_today: logsToday?.length || 0
      })
    } catch (error) {
      console.error("Error fetching stats:", error)
    }
  }

  const updateStats = () => {
    setStats(prev => ({
      ...prev,
      total_automations: automations.length,
      active_automations: automations.filter(a => a.is_active).length
    }))
  }

  const resetForm = () => {
    setFormData({
      name: "",
      trigger_type: "",
      trigger_config: {},
      message_template: "",
      template_id: "",
      template_variables: {},
      bot_id: "",
      promotion_id: "",
      is_active: true,
    })
  }



  const handleEditAutomation = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedAutomation) return

    setIsLoading(true)

    try {
      const { data, error } = await supabase
        .from("automations")
        .update(formData)
        .eq("id", selectedAutomation.id)
        .select(`
          *,
          bots!inner(id, name, platform)
        `)
        .single()

      if (error) throw error

      setAutomations(automations.map((automation) => 
        automation.id === selectedAutomation.id ? data : automation
      ))
      setIsEditDialogOpen(false)
      setSelectedAutomation(null)
      resetForm()
      toast.success(`Automatización "${formData.name}" actualizada`)
    } catch (error) {
      console.error("Error updating automation:", error)
      toast.error("Error al actualizar automatización")
    } finally {
      setIsLoading(false)
    }
  }

  const handleToggleAutomation = async (automationId: string, isActive: boolean) => {
    try {
      const { error } = await supabase
        .from("automations")
        .update({ is_active: isActive })
        .eq("id", automationId)

      if (error) throw error

      setAutomations(
        automations.map((automation) =>
          automation.id === automationId ? { ...automation, is_active: isActive } : automation,
        ),
      )
      
      const automation = automations.find(a => a.id === automationId)
      toast.success(`Automatización ${isActive ? 'activada' : 'desactivada'}`, {
        description: `"${automation?.name}" ha sido ${isActive ? "activada" : "desactivada"}.`,
      })
    } catch (error) {
      console.error("Error toggling automation:", error)
      toast.error("Error al cambiar estado de la automatización")
    }
  }

  const handleDeleteAutomation = async (automationId: string) => {
    try {
      const { error } = await supabase
        .from("automations")
        .delete()
        .eq("id", automationId)

      if (error) throw error

      setAutomations(automations.filter((automation) => automation.id !== automationId))
      const automation = automations.find(a => a.id === automationId)
      toast.success("Automatización eliminada", {
        description: `"${automation?.name}" ha sido eliminada.`,
      })
    } catch (error) {
      console.error("Error deleting automation:", error)
      toast.error("Error al eliminar automatización")
    }
  }

  const openEditDialog = (automation: Automation) => {
    setSelectedAutomation(automation)
    setFormData({
      name: automation.name,
      trigger_type: automation.trigger_type,
      trigger_config: automation.trigger_config,
      message_template: automation.message_template,
      template_id: automation.template_id || "",
      template_variables: automation.template_variables || {},
      bot_id: automation.bot_id,
      promotion_id: automation.promotion_id || "",
      is_active: automation.is_active,
    })
    setIsEditDialogOpen(true)
  }

  const handleTriggerConfigChange = (key: string, value: any) => {
    setFormData({
      ...formData,
      trigger_config: {
        ...formData.trigger_config,
        [key]: value,
      },
    })
  }

  const handleTemplateSelect = (templateId: string, isSystem = false) => {
    if (isSystem) {
      const template = systemTemplates.find(t => t.id === templateId)
      if (template) {
        setFormData({
          ...formData,
          message_template: template.body_content,
          template_id: "",
        })
      }
    } else {
      const template = userTemplates.find(t => t.id === templateId)
      if (template) {
        setFormData({
          ...formData,
          message_template: template.body_content,
          template_id: templateId,
        })
      }
    }
  }

  const renderTriggerConfig = () => {
    switch (formData.trigger_type) {
      case "birthday":
        return (
          <div className="grid gap-2">
            <Label htmlFor="days_before">Días antes del cumpleaños</Label>
            <Select
              value={formData.trigger_config.days_before?.toString() || "0"}
              onValueChange={(value) => handleTriggerConfigChange("days_before", parseInt(value))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar días" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0">El mismo día</SelectItem>
                <SelectItem value="1">1 día antes</SelectItem>
                <SelectItem value="3">3 días antes</SelectItem>
                <SelectItem value="7">7 días antes</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )
      case "inactive_client":
        return (
          <div className="grid gap-2">
            <Label htmlFor="inactive_days">Días de inactividad</Label>
            <Select
              value={formData.trigger_config.inactive_days?.toString() || "30"}
              onValueChange={(value) => handleTriggerConfigChange("inactive_days", parseInt(value))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar días" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="15">15 días</SelectItem>
                <SelectItem value="30">30 días</SelectItem>
                <SelectItem value="60">60 días</SelectItem>
                <SelectItem value="90">90 días</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )
      case "new_promotion":
        return (
          <div className="grid gap-2">
            <div className="flex items-center space-x-2">
              <Switch
                id="send_immediately"
                checked={formData.trigger_config.send_immediately || false}
                onCheckedChange={(checked) => handleTriggerConfigChange("send_immediately", checked)}
              />
              <Label htmlFor="send_immediately" className="text-sm">
                Enviar inmediatamente al crear promoción
              </Label>
            </div>
          </div>
        )
      case "comment_reply":
        return (
          <div className="p-3 bg-blue-50 rounded-md border border-blue-200">
            <p className="text-sm text-blue-800">
              <strong>Respuesta automática a comentarios:</strong> Se activa cuando un usuario comenta en tus publicaciones de Instagram.
            </p>
          </div>
        )
      default:
        return null
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("es-ES")
  }

  const getMessagePreview = (template: string) => {
    return template.length > 100 ? template.substring(0, 100) + "..." : template
  }

  const getTriggerInfo = (triggerType: string) => {
    return triggerTypes[triggerType as keyof typeof triggerTypes] || {
      icon: Zap,
      label: triggerType,
      description: "Tipo de trigger desconocido",
      color: "bg-gray-500",
      platforms: []
    }
  }

  const getTriggerConfigDescription = (triggerType: string, config: Record<string, any>) => {
    switch (triggerType) {
      case "birthday":
        const daysBefore = config.days_before || 0
        return daysBefore === 0 
          ? "El día del cumpleaños"
          : `${daysBefore} día${daysBefore > 1 ? 's' : ''} antes del cumpleaños`
      
      case "inactive_client":
        const inactiveDays = config.inactive_days || 30
        return `Después de ${inactiveDays} días sin actividad`
      
      case "new_promotion":
        return config.send_immediately 
          ? "Inmediatamente al crear promoción"
          : "Programado al crear promoción"
      
      case "comment_reply":
        return "Al recibir comentario en Instagram"
      
      default:
        return "Sin configuración adicional"
    }
  }

  const getAvailableTemplates = () => {
    if (!formData.trigger_type) return []
    
    return systemTemplates.filter(template => 
      template.automation_types.includes(formData.trigger_type)
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <ScrollSlideUp>
          <div>
            <h1 className="text-3xl font-bold">Automatizaciones de Marketing</h1>
            <p className="text-muted-foreground">Crea campañas automáticas para mejorar la experiencia del cliente</p>
          </div>
        </ScrollSlideUp>
        <ScrollFadeIn delay={0.2}>
          <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
            <Button
              onClick={demo ? undefined : () => { setIsCreateDialogOpen(true) }}
              disabled={demo}
              title={demo ? "Activá tu cuenta para empezar a usar" : undefined}
            >
              <Plus className="h-4 w-4 mr-2" />
              Nueva Automatización
            </Button>
          </motion.div>
        </ScrollFadeIn>
      </div>

      {/* Stats Cards */}
      <ScrollStaggeredChildren className="grid gap-4 md:grid-cols-4">
        <ScrollStaggerChild>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total_automations}</div>
              <p className="text-xs text-muted-foreground">Automatizaciones</p>
            </CardContent>
          </Card>
        </ScrollStaggerChild>
        
        <ScrollStaggerChild>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Activas</CardTitle>
              <Play className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.active_automations}</div>
              <p className="text-xs text-muted-foreground">En funcionamiento</p>
            </CardContent>
          </Card>
        </ScrollStaggerChild>
        
        <ScrollStaggerChild>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pendientes</CardTitle>
              <Clock className="h-4 w-4 text-orange-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.pending_messages}</div>
              <p className="text-xs text-muted-foreground">Mensajes en cola</p>
            </CardContent>
          </Card>
        </ScrollStaggerChild>
        
        <ScrollStaggerChild>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Enviados Hoy</CardTitle>
              <TrendingUp className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.sent_today}</div>
              <p className="text-xs text-muted-foreground">Mensajes enviados</p>
            </CardContent>
          </Card>
        </ScrollStaggerChild>
      </ScrollStaggeredChildren>

      {/* Automatizaciones Grid */}
      <ScrollStaggeredChildren className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {automations.length === 0 ? (
          <div className="col-span-full">
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <Zap className="h-12 w-12 text-muted-foreground mb-4" />
                    <h3 className="text-lg font-medium mb-2">No tienes automatizaciones aún</h3>
                    <p className="text-muted-foreground text-center mb-4">
                      Crea tu primera automatización para comenzar a mejorar la experiencia de tus clientes
                    </p>
                    <Button onClick={() => setIsCreateDialogOpen(true)}>
                      <Plus className="h-4 w-4 mr-2" />
                      Crear primera automatización
                    </Button>
                  </CardContent>
                </Card>
              </div>
            ) : (
              automations.map((automation) => {
                const triggerConfig = getTriggerInfo(automation.trigger_type)
                const TriggerIcon = triggerConfig.icon
                return (
                  <ScrollStaggerChild key={automation.id}>
                    <motion.div whileHover={{ scale: 1.02, y: -2 }} transition={{ duration: 0.2 }}>
                      <Card className="hover:shadow-md transition-shadow">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                          <div className="flex items-center space-x-3">
                            <div className={`p-2 rounded-md ${triggerConfig.color}`}>
                              <TriggerIcon className="h-4 w-4 text-white" />
                            </div>
                            <div>
                              <CardTitle className="text-base">{automation.name}</CardTitle>
                              <p className="text-sm text-muted-foreground">{triggerConfig.label}</p>
                            </div>
                          </div>
                          <DropdownMenu modal={false}>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={demo ? undefined : () => openEditDialog(automation)}
                                disabled={demo}
                                title={demo ? "Activá tu cuenta para empezar a usar" : undefined}
                              >
                                <Edit className="h-4 w-4 mr-2" />
                                Editar
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={demo ? undefined : () => handleToggleAutomation(automation.id, !automation.is_active)}
                                disabled={demo}
                                title={demo ? "Activá tu cuenta para empezar a usar" : undefined}
                              >
                                {automation.is_active ? (
                                  <>
                                    <Pause className="h-4 w-4 mr-2" />
                                    Desactivar
                                  </>
                                ) : (
                                  <>
                                    <Play className="h-4 w-4 mr-2" />
                                    Activar
                                  </>
                                )}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={demo ? undefined : () => handleDeleteAutomation(automation.id)}
                                disabled={demo}
                                title={demo ? "Activá tu cuenta para empezar a usar" : undefined}
                                className="text-red-600"
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Eliminar
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="text-sm text-muted-foreground">Estado</span>
                              <Badge variant={automation.is_active ? "default" : "secondary"}>
                                {automation.is_active ? "Activa" : "Inactiva"}
                              </Badge>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-sm text-muted-foreground">Bot</span>
                              <span className="text-sm">{automation.bots?.name || "Sin bot"}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-sm text-muted-foreground">Promoción</span>
                              <span className="text-sm">{automation.promotions?.name || "Sin promoción"}</span>
                            </div>
                            <div>
                              <span className="text-sm text-muted-foreground">Disparador</span>
                              <div className="flex items-center gap-2 mt-1">
                                {(() => {
                                  const triggerConfig = getTriggerInfo(automation.trigger_type)
                                  const Icon = triggerConfig.icon
                                  return (
                                    <>
                                      <Badge variant="outline" className="flex items-center gap-1">
                                        <Icon className="h-3 w-3" />
                                        <span className="text-xs">{triggerConfig.label}</span>
                                      </Badge>
                                    </>
                                  )
                                })()}
                              </div>
                              {automation.trigger_config && Object.keys(automation.trigger_config).length > 0 && (
                                <div className="text-xs text-muted-foreground mt-1">
                                  {getTriggerConfigDescription(automation.trigger_type, automation.trigger_config)}
                                </div>
                              )}
                            </div>
                            <div>
                              <span className="text-sm text-muted-foreground">Mensaje</span>
                              <p className="text-sm mt-1 line-clamp-2">{getMessagePreview(automation.message_template)}</p>
                            </div>
                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                              <span>Creada: {formatDate(automation.created_at)}</span>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  </ScrollStaggerChild>
                )
              })
            )}
          </ScrollStaggeredChildren>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Automatización</DialogTitle>
            <DialogDescription>Modifica la configuración de tu automatización</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEditAutomation}>
            <div className="grid gap-6 py-4">
              {/* Similar form structure as create dialog */}
              <div className="grid gap-2">
                <Label htmlFor="edit_name">Nombre *</Label>
                <Input
                  id="edit_name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>

              {/* Tipo de Trigger */}
              <div className="grid gap-2">
                <Label htmlFor="edit_trigger_type">Tipo de Disparador *</Label>
                <Select 
                  value={formData.trigger_type || ""} 
                  onValueChange={(value) => setFormData({ ...formData, trigger_type: value as keyof typeof triggerTypes })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona un disparador" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(triggerTypes).map(([key, config]) => {
                      const Icon = config.icon
                      return (
                        <SelectItem key={key} value={key}>
                          <div className="flex items-center gap-2">
                            <Icon className="h-4 w-4" />
                            <span>{config.label}</span>
                          </div>
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>
              </div>

              {/* Configuración del Trigger */}
              {formData.trigger_type && (
                <div className="grid gap-2">
                  <Label>Configuración del Disparador</Label>
                  <div className="p-3 border rounded-md bg-gray-50">
                    {renderTriggerConfig()}
                  </div>
                </div>
              )}
              
              <div className="grid gap-2">
                <Label htmlFor="edit_message_template">Mensaje *</Label>
                <Textarea
                  id="edit_message_template"
                  value={formData.message_template}
                  onChange={(e) => setFormData({ ...formData, message_template: e.target.value })}
                  rows={4}
                  required
                />
              </div>

              {/* Promoción vinculada (opcional) */}
              <div className="grid gap-2">
                <Label htmlFor="edit_promotion">Promoción vinculada (opcional)</Label>
                <Select 
                  value={formData.promotion_id || "none"} 
                  onValueChange={(value) => setFormData({ ...formData, promotion_id: value === "none" ? "" : value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona una promoción (opcional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin promoción</SelectItem>
                    {promotions.map((promotion) => (
                      <SelectItem key={promotion.id} value={promotion.id}>
                        {promotion.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {promotions.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    No hay promociones disponibles. Crea una promoción primero.
                  </p>
                )}
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="edit_is_active"
                  checked={formData.is_active}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                />
                <Label htmlFor="edit_is_active">Automatización activa</Label>
              </div>
            </div>
            
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? "Guardando..." : "Guardar Cambios"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Multi-step Automation Creation */}
      <MultiStepAutomationCreation
        isOpen={isCreateDialogOpen}
        onClose={() => {
          console.log("Cerrando formulario");
          setIsCreateDialogOpen(false);
        }}
        onAutomationCreated={(automation) => {
          console.log("Automatización creada:", automation);
          setAutomations([...automations, automation])
          fetchStats()
        }}
        userId={userId}
      />
    </div>
  )
}
