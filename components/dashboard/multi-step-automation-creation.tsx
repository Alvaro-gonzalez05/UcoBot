"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { motion, AnimatePresence } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import {
  ChevronLeft,
  ChevronRight,
  CheckCircle,
  Sparkles,
  Calendar,
  Clock,
  Target,
  MessageSquare,
  Zap,
  Bot,
  Loader2,
  Check,
  Gift,
  UserX,
  Settings,
  Eye,
  Send,
  Users,
  Info,
  Plus,
  Search,
} from "lucide-react"
import { 
  extractVariablesFromText, 
  validateVariables, 
  getAllAvailableVariables, 
  getVariableSuggestions,
  type TemplateVariable 
} from "@/lib/template-variables"

interface AutomationFormData {
  name: string
  trigger_type: "birthday" | "inactive_client" | "new_promotion" | "comment_reply" | "new_order" | "order_ready" | ""
  trigger_config: Record<string, any>
  message_template: string
  template_id?: string
  template_source: "meta_api" | "local_db" | "create_new" | ""
  selected_template?: MessageTemplate | null
  custom_template?: {
    subject?: string
    body_content: string
    html_content?: string
    variables?: string[]
  }
  variable_mapping: Record<string, string>
  bot_id: string
  promotion_id?: string
  is_active: boolean
}

interface MessageTemplate {
  id: string
  name: string
  platform: string
  platforms?: string[]
  body_content: string
  subject?: string
  html_content?: string
  variables: string[]
  status: string
  language?: string
  can_use: boolean
  source: 'local_db' | 'meta_api' | 'create_new'
}

interface Bot {
  id: string
  name: string
  platform: "whatsapp" | "instagram" | "email"
  is_active: boolean
}

interface UserSubscription {
  subscription_status: string
  plan_type: string
  max_automations: number
}

interface Promotion {
  id: string
  name: string
  description?: string
  start_date: string
  end_date: string
  is_active: boolean
  image_url?: string
}

interface Client {
  id: string
  name: string
  phone: string
}

interface MultiStepAutomationCreationProps {
  isOpen: boolean
  onClose: () => void
  onAutomationCreated: (automation: any) => void
  userId: string
}

const triggerTypes = {
  birthday: {
    icon: Calendar,
    label: "Cumpleaños de Clientes",
    description: "Envía felicitaciones automáticas",
    color: "bg-pink-500",
    platforms: ["whatsapp"] // Instagram/Messenger no permiten mensajes proactivos
  },
  inactive_client: {
    icon: UserX,
    label: "Cliente Inactivo",
    description: "Reactiva clientes que no compran",
    color: "bg-orange-500",
    platforms: ["whatsapp"] // Instagram/Messenger no permiten mensajes proactivos
  },
  new_promotion: {
    icon: Gift,
    label: "Nueva Promoción",
    description: "Notifica sobre ofertas especiales",
    color: "bg-purple-500",
    platforms: ["whatsapp"] // Instagram/Messenger no permiten broadcast masivo
  },
  comment_reply: {
    icon: MessageSquare,
    label: "Respuesta a Comentario",
    description: "Responde automáticamente a comentarios (Instagram)",
    color: "bg-pink-500",
    platforms: ["instagram"] // Exclusivo de Instagram
  },
}

const steps = [
  { id: "basic", title: "Información Básica", description: "Configura los datos principales" },
  { id: "trigger", title: "Disparador", description: "Define cuándo se ejecuta" },
  { id: "promotion", title: "Promoción", description: "Vincula una promoción (opcional)" },
  { id: "template", title: "Plantilla", description: "Selecciona o crea el mensaje" },
  { id: "variables", title: "Variables", description: "Configura los datos dinámicos" },
  { id: "review", title: "Revisión", description: "Confirma la configuración" },
]

const fadeInUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
}

const contentVariants = {
  hidden: { opacity: 0, x: 50 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.3 } },
  exit: { opacity: 0, x: -50, transition: { duration: 0.2 } },
}

export function MultiStepAutomationCreation({ isOpen, onClose, onAutomationCreated, userId }: MultiStepAutomationCreationProps) {
  const [currentStep, setCurrentStep] = useState(1)
  const [isLoading, setIsLoading] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const [bots, setBots] = useState<Bot[]>([])
  const [templates, setTemplates] = useState<MessageTemplate[]>([])
  const [loadingTemplates, setLoadingTemplates] = useState(false)
  const [selectedBotPlatform, setSelectedBotPlatform] = useState<string>("")
  const [selectedChannel, setSelectedChannel] = useState<string>("")
  const [promotions, setPromotions] = useState<Promotion[]>([])
  const [loadingPromotions, setLoadingPromotions] = useState(false)
  const [canCreateCustomTemplate, setCanCreateCustomTemplate] = useState(false)
  const [showCustomTemplateForm, setShowCustomTemplateForm] = useState(false)
  const [userSubscription, setUserSubscription] = useState<UserSubscription | null>(null)
  const [currentAutomationCount, setCurrentAutomationCount] = useState(0)
  const [canCreateAutomation, setCanCreateAutomation] = useState(true)
  const [needsBusinessAccountId, setNeedsBusinessAccountId] = useState(false)
  const [businessAccountId, setBusinessAccountId] = useState("")
  const [accessToken, setAccessToken] = useState("")
  const [detectedVariables, setDetectedVariables] = useState<string[]>([])
  const [availableVariables, setAvailableVariables] = useState<TemplateVariable[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [clientSearchTerm, setClientSearchTerm] = useState("")
  const [isSearchingClients, setIsSearchingClients] = useState(false)
  const supabase = createClient()

  const [formData, setFormData] = useState<AutomationFormData>({
    name: "",
    trigger_type: "",
    trigger_config: {},
    message_template: "",
    template_id: "",
    template_source: "",
    selected_template: null,
    custom_template: {
      body_content: "",
      variables: []
    },
    variable_mapping: {},
    bot_id: "",
    promotion_id: "",
    is_active: true,
  })

  useEffect(() => {
    if (isOpen && userId) {
      // Resetear formulario cuando se abre el modal
      setFormData({
        name: "",
        trigger_type: "",
        trigger_config: {},
        message_template: "",
        template_id: "",
        template_source: "",
        selected_template: null,
        custom_template: {
          body_content: "",
          variables: []
        },
        variable_mapping: {},
        bot_id: "",
        promotion_id: "",
        is_active: true,
      })
      setCurrentStep(1)
      setShowSuccess(false)
      
      fetchBots()
      fetchPromotions()
      // Primero cargar la suscripción, luego verificar límites se hará automáticamente
      fetchUserSubscription()
      setClientSearchTerm("")
    }
  }, [isOpen, userId])

  // Verificar límites cuando cambie la suscripción
  useEffect(() => {
    if (userSubscription && userId) {
      checkAutomationLimits()
    }
  }, [userSubscription, userId])

  // Canales que atiende un bot (multicanal con fallback al campo legacy)
  const getBotChannels = (bot?: Bot): string[] => {
    if (!bot) return []
    return bot.platforms?.length ? bot.platforms : bot.platform ? [bot.platform] : []
  }

  // Cargar plantillas cuando cambia el bot o el canal seleccionado
  useEffect(() => {
    if (!formData.bot_id || bots.length === 0) return
    const bot = bots.find((b) => b.id === formData.bot_id)
    const channels = getBotChannels(bot)

    if (channels.length === 1) {
      // Bot de un solo canal: comportamiento clásico
      if (selectedChannel !== channels[0]) setSelectedChannel(channels[0])
      fetchTemplatesForBot(formData.bot_id, channels[0])
    } else if (selectedChannel && channels.includes(selectedChannel)) {
      // Bot multicanal con canal ya elegido
      fetchTemplatesForBot(formData.bot_id, selectedChannel)
    } else {
      // Bot multicanal: esperar a que el usuario elija el canal
      setSelectedBotPlatform("")
      setTemplates([])
    }
  }, [formData.bot_id, bots, selectedChannel])

  // Actualizar el mensaje inicial cuando se selecciona una plantilla
  useEffect(() => {
    if (formData.template_source === "create_new" && formData.custom_template?.body_content) {
      // Para plantillas personalizadas, usar el contenido como base
      setFormData(prev => ({
        ...prev,
        message_template: prev.message_template || formData.custom_template?.body_content || ""
      }))
    } else if (formData.selected_template && formData.template_source !== "create_new") {
      // Para plantillas existentes, limpiar personalización adicional
      setFormData(prev => ({
        ...prev,
        message_template: ""
      }))
    }
  }, [formData.selected_template, formData.template_source, formData.custom_template])

  // Detectar variables automáticamente cuando cambie el contenido
  useEffect(() => {
    const content = formData.template_source === "create_new" 
      ? formData.custom_template?.body_content || ""
      : formData.selected_template?.body_content || ""
    
    if (content) {
      const variables = extractVariablesFromText(content)
      setDetectedVariables(variables)
      
      // Actualizar variables disponibles según el contexto
      const available = getAllAvailableVariables(
        formData.trigger_type, 
        !!formData.promotion_id
      )
      setAvailableVariables(available)
      
      // Actualizar las variables en el custom_template si es una plantilla personalizada
      if (formData.template_source === "create_new" && formData.custom_template) {
        setFormData(prev => ({
          ...prev,
          custom_template: {
            ...prev.custom_template!,
            variables
          }
        }))
      }
    }
  }, [
    formData.custom_template?.body_content, 
    formData.selected_template?.body_content, 
    formData.template_source,
    formData.trigger_type,
    formData.promotion_id
  ])

  // Effect for client search debounce
  useEffect(() => {
    if (isOpen) {
      const delayDebounceFn = setTimeout(() => {
        fetchClients(clientSearchTerm)
      }, 500)

      return () => clearTimeout(delayDebounceFn)
    }
  }, [clientSearchTerm, isOpen, selectedBotPlatform])

  const fetchClients = async (searchTerm = "") => {
    setIsSearchingClients(true)
    const supabase = createClient()
    
    let query = supabase
      .from("clients")
      .select("id, name, phone")
      .eq("user_id", userId)

    // Si es WhatsApp, filtrar clientes que tengan teléfono
    if (selectedBotPlatform === 'whatsapp') {
       query = query.not('phone', 'is', null).neq('phone', '')
    }

    if (searchTerm) {
      // Search by name or phone
      query = query.or(`name.ilike.%${searchTerm}%,phone.ilike.%${searchTerm}%`)
      query = query.order("name", { ascending: true })
    } else {
      // If no search, get last 10 created
      query = query.order("created_at", { ascending: false }).limit(10)
    }
    
    const { data } = await query
    
    if (data) setClients(data)
    setIsSearchingClients(false)
  }

  const fetchBots = async () => {
    try {
      const { data, error } = await supabase
        .from("bots")
        .select("id, name, platform, platforms, is_active")
        .eq("user_id", userId)
        .eq("is_active", true)
        .order("name")

      if (error) throw error
      setBots(data || [])
    } catch (error) {
      console.error("Error fetching bots:", error)
      setBots([])
    }
  }

  const fetchPromotions = async () => {
    try {
      setLoadingPromotions(true)
      const { data, error } = await supabase
        .from("promotions")
        .select("id, name, description, start_date, end_date, is_active, image_url")
        .eq("user_id", userId)
        .eq("is_active", true)
        .order("created_at", { ascending: false })

      if (error) throw error
      setPromotions(data || [])
    } catch (error) {
      console.error("Error fetching promotions:", error)
      setPromotions([])
    } finally {
      setLoadingPromotions(false)
    }
  }

  // Cargar plantillas cuando se selecciona un bot
  // Crear plantilla personalizada de email
  const createCustomTemplate = async (customTemplate: any, botId: string) => {
    try {
      const response = await fetch('/api/templates/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          bot_id: botId,
          platform: selectedBotPlatform,
          name: `Plantilla_${formData.name}_${Date.now()}`,
          subject: customTemplate.subject,
          body_text: customTemplate.body_content,
          html_content: customTemplate.html_content,
          variables: customTemplate.variables || []
        })
      })

      if (!response.ok) throw new Error('Failed to create template')

      const data = await response.json()
      if (data.success) {
        return data.template.id
      }
      throw new Error('Template creation failed')
    } catch (error) {
      console.error('Error creating custom template:', error)
      throw error
    }
  }

  /* 
   * ESTRUCTURA ESPERADA DE INTEGRATIONS JSONB EN LA TABLA BOTS:
   * 
   * Para WhatsApp:
   * {
   *   "access_token": "EAAjYLYimS1EBPucE3...",
   *   "phone_number_id": "793528520499781",
   *   "business_account_id": "1222850426258356",
   *   "webhook_url": "http://localhost:3000/api/whatsapp/webhook",
   *   "webhook_verify_token": "verify_f3edab4d-a751-4049-a815-1152330bc7dd_1761098514862"
   * }
   *
   * Para Instagram:
   * {
   *   "access_token": "EAAjYLYimS1EBPucE3...",
   *   "instagram_business_account_id": "17841405309211844",
   *   "app_id": "23849583679124",
   *   "app_secret": "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6",
   *   "business_account_id": "1222850426258356", // Opcional, para templates si está conectado a WhatsApp Business
   *   "webhook_url": "http://localhost:3000/api/instagram/webhook",
   *   "webhook_verify_token": "verify_instagram_f3edab4d..."
   * }
   *
   * Para Email:
   * {
   *   "provider": "sendgrid", // o "mailgun", "ses", "smtp"
   *   "api_key": "SG.xyz123...",
   *   "from_email": "noreply@tudominio.com",
   *   "from_name": "Tu Negocio"
   * }
   */
  
  const fetchTemplatesForBot = async (botId: string, channel?: string) => {
    if (!botId) return

    setLoadingTemplates(true)
    setNeedsBusinessAccountId(false)
    setAccessToken("") // Limpiar token temporal

    try {
      const selectedBot = bots.find(b => b.id === botId)
      if (!selectedBot) return

      // Canal elegido (bot multicanal) o el único canal del bot
      const effectiveChannel = channel || getBotChannels(selectedBot)[0] || selectedBot.platform

      setSelectedBotPlatform(effectiveChannel)
      setCanCreateCustomTemplate(effectiveChannel === 'email' || effectiveChannel === 'instagram')

      // La API de templates usa 'gmail' para el canal de email
      const apiPlatform = effectiveChannel === 'email' ? 'gmail' : effectiveChannel

      // La API ya maneja plantillas de Meta para Instagram y WhatsApp
      const response = await fetch(`/api/templates?bot_id=${botId}&platform=${apiPlatform}`)
      if (!response.ok) throw new Error('Failed to fetch templates')

      const data = await response.json()
      if (data.success) {
        // La API devuelve { success: true, data: { templates: [...] } }
        const templates = data.data?.templates || data.templates || []
        setTemplates(templates)

        // Si es Instagram y no hay plantillas, mostrar input para business_account_id
        if (effectiveChannel === 'instagram' && templates.length === 0) {
          setNeedsBusinessAccountId(true)
        }
      }
    } catch (error) {
      console.error('Error fetching templates:', error)
      toast.error('Error al cargar plantillas')
    } finally {
      setLoadingTemplates(false)
    }
  }

  const fetchUserSubscription = async () => {
    try {
      console.log("[DEBUG] Fetching subscription for user:", userId)
      const { data, error } = await supabase
        .from("user_profiles")
        .select("subscription_status, plan_type")
        .eq("id", userId)
        .single()

      if (error) {
        console.log("[v0] Subscription columns not found, using trial defaults:", error.message)
        setUserSubscription({
          subscription_status: "trial",
          plan_type: "trial",
          max_automations: 0,
        })
        return
      }

      console.log("[DEBUG] User subscription data:", data)

      const planLimits = {
        trial: { max_automations: 0 },
        basic: { max_automations: 1 },
        premium: { max_automations: 10 },
        enterprise: { max_automations: -1 }, // unlimited
      }

      const limits = planLimits[data.plan_type as keyof typeof planLimits] || planLimits.trial
      
      const subscription = {
        ...data,
        ...limits,
      }
      
      console.log("[DEBUG] Final subscription object:", subscription)
      setUserSubscription(subscription)
    } catch (error) {
      console.error("Error fetching subscription:", error)
      setUserSubscription({
        subscription_status: "trial",
        plan_type: "trial",
        max_automations: 0,
      })
    }
  }

  const fetchTemplatesWithBusinessId = async () => {
    if (!businessAccountId.trim() || !formData.bot_id || !accessToken.trim()) {
      toast.error('Por favor ingresa el WABA ID y el Access Token')
      return
    }

    try {
      setLoadingTemplates(true)
      
      const selectedBot = bots.find(b => b.id === formData.bot_id)
      if (!selectedBot) return

      // Obtener plantillas pasando tanto el business_account_id como el access_token como parámetros
      const url = `/api/templates?bot_id=${formData.bot_id}&platform=${selectedBot.platform}&business_account_id=${businessAccountId.trim()}&access_token=${encodeURIComponent(accessToken.trim())}`
      console.log('Fetching templates with URL:', url.replace(accessToken.trim(), 'TOKEN_HIDDEN'))
      
      const response = await fetch(url)
      console.log('Response status:', response.status)
      
      if (!response.ok) {
        const errorText = await response.text()
        console.error('API Error:', errorText)
        throw new Error(`API Error ${response.status}: ${errorText}`)
      }

      const data = await response.json()
      console.log('API Response:', data)
      
      if (data.success) {
        const templates = data.data?.templates || []
        console.log(`Found ${templates.length} templates:`, templates.map((t: any) => t.name))
        setTemplates(templates)
        toast.success(`Se encontraron ${templates.length} plantillas`)
        setNeedsBusinessAccountId(false)
        setBusinessAccountId("")
        setAccessToken("")
      } else {
        console.error('API returned success=false:', data)
        toast.error(data.error || 'No se pudieron obtener las plantillas')
      }
      
    } catch (error) {
      console.error('Error fetching templates with business ID:', error)
      toast.error('Error al obtener plantillas')
    } finally {
      setLoadingTemplates(false)
    }
  }

  const checkAutomationLimits = async () => {
    try {
      console.log("[DEBUG] Checking automation limits...")
      const { data: automations, error } = await supabase
        .from("automations")
        .select("id")
        .eq("user_id", userId)

      if (error) throw error

      const automationCount = automations?.length || 0
      console.log("[DEBUG] Current automation count:", automationCount)
      setCurrentAutomationCount(automationCount)

      const maxAutomations = userSubscription?.max_automations || 0
      console.log("[DEBUG] Max automations allowed:", maxAutomations)
      console.log("[DEBUG] User subscription:", userSubscription)

      const canCreate = maxAutomations === -1 || automationCount < maxAutomations
      console.log("[DEBUG] Can create automation?", canCreate)
      setCanCreateAutomation(canCreate)
    } catch (error) {
      console.error("Error checking automation limits:", error)
      setCanCreateAutomation(false)
    }
  }

  const resetForm = () => {
    setFormData({
      name: "",
      trigger_type: "",
      trigger_config: {},
      message_template: "",
      template_id: "",
      template_source: "",
      selected_template: null,
      custom_template: {
        body_content: "",
        variables: []
      },
      variable_mapping: {},
      bot_id: "",
      is_active: true,
    })
    setCurrentStep(1)
    setShowSuccess(false)
  }

  // Agrupar variables por tipo para el selector
  const groupedVariables = availableVariables.reduce((acc, variable) => {
    if (!acc[variable.type]) {
      acc[variable.type] = []
    }
    acc[variable.type].push(variable)
    return acc
  }, {} as Record<string, TemplateVariable[]>)

  const getVariableTypeLabel = (type: string) => {
    switch (type) {
      case 'client': return 'Datos del Cliente'
      case 'business': return 'Datos del Negocio'
      case 'promotion': return 'Datos de la Promoción'
      case 'order': return 'Datos del Pedido'
      case 'custom': return 'Otros'
      default: return type
    }
  }

  const handleClose = () => {
    resetForm()
    onClose()
  }

  const nextStep = () => {
    if (currentStep === 4) {
      // Si estamos en el paso de plantilla, verificar si necesitamos ir al paso de variables
      const hasVariables = formData.selected_template?.variables && formData.selected_template.variables.length > 0
      
      if (hasVariables) {
        setCurrentStep(5) // Ir a variables
      } else {
        setCurrentStep(6) // Saltar a revisión
      }
    } else if (currentStep < steps.length) {
      setCurrentStep(currentStep + 1)
    }
  }

  const prevStep = () => {
    if (currentStep === 6) {
      // Si estamos en revisión, verificar si venimos de variables o plantilla
      const hasVariables = formData.selected_template?.variables && formData.selected_template.variables.length > 0
      
      if (hasVariables) {
        setCurrentStep(5) // Volver a variables
      } else {
        setCurrentStep(4) // Volver a plantilla
      }
    } else if (currentStep > 1) {
      setCurrentStep(currentStep - 1)
    }
  }

  const handleCreateAutomation = async () => {
    if (!canCreateAutomation) {
      toast.error("Límite de automatizaciones alcanzado", {
        description: `Has alcanzado el límite de ${userSubscription?.max_automations || 0} automatización(es) para tu plan. Actualiza tu suscripción.`,
        duration: 4000,
      })
      return
    }

    setIsLoading(true)

    try {
      let templateId = formData.template_id
      
      // Si es una plantilla personalizada, crearla primero
      if (formData.template_source === "create_new" && formData.custom_template && (selectedBotPlatform === 'email' || selectedBotPlatform === 'instagram')) {
        try {
          templateId = await createCustomTemplate(formData.custom_template, formData.bot_id)
        } catch (error) {
          throw new Error("No se pudo crear la plantilla personalizada")
        }
      }

      // Generar el mensaje final basado en la plantilla seleccionada
      let finalMessage = ""
      
      // Usar directamente el contenido de la plantilla
      if (formData.template_source === "create_new" && formData.custom_template?.body_content) {
        finalMessage = formData.custom_template.body_content
      } else if (formData.selected_template?.body_content) {
        finalMessage = formData.selected_template.body_content
      }

      const automationData = {
        name: formData.name,
        trigger_type: formData.trigger_type,
        trigger_config: formData.trigger_config,
        message_template: finalMessage.trim(),
        // Solo enviar template_id si es un UUID válido (local), si es de Meta (numérico) enviar null
        template_id: (templateId && templateId.includes('-')) ? templateId : (formData.selected_template?.id && formData.selected_template.id.includes('-') ? formData.selected_template.id : null),
        template_variables: {
          source: formData.template_source,
          template_data: formData.selected_template || formData.custom_template,
          variable_mapping: formData.variable_mapping, // Corregido: usar variable_mapping en lugar de mapping
          meta_template_name: formData.selected_template?.name?.replace(' (WhatsApp)', ''), // Guardar nombre limpio
          meta_template_language: formData.selected_template?.language,
          // Guardar el ID externo si existe
          external_template_id: formData.selected_template?.id
        },
        bot_id: formData.bot_id,
        promotion_id: formData.promotion_id || null,
        is_active: formData.is_active,
        user_id: userId,
        created_at: new Date().toISOString(),
      }

      const { data: automation, error } = await supabase
        .from("automations")
        .insert([automationData])
        .select()
        .single()

      if (error) throw error

      // Si es una automatización de tipo new_promotion, disparar el broadcast inmediatamente
      // (incluso si no tiene promoción vinculada, puede ser un mensaje masivo simple)
      if (automation.trigger_type === 'new_promotion' && automation.is_active) {
        try {
          let promotion = null;
          
          // Si tiene promoción vinculada, obtener sus datos
          if (automation.promotion_id) {
            const { data } = await supabase
              .from('promotions')
              .select('*')
              .eq('id', automation.promotion_id)
              .single()
            promotion = data;
          }

          // Llamar al endpoint de webhook para procesar el broadcast
          // NO esperar la respuesta (fire and forget) para evitar bloquear la UI
          fetch('/api/automations/webhook', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'INSERT',
              table: 'automations',
              record: {
                ...automation,
                promotion: promotion
              }
            })
          }).catch(err => console.error('Error triggering background webhook:', err))
          
        } catch (webhookError) {
          console.error('Error preparing promotion broadcast:', webhookError)
          // No lanzamos error para no bloquear la creación de la automatización
        }
      }

      setShowSuccess(true)

      setTimeout(() => {
        onAutomationCreated(automation)
        handleClose()
        
        toast.success(`Automatización "${automation.name}" creada exitosamente`, {
          description: "Tu automatización está configurada y lista para funcionar.",
          duration: 4000,
        })
      }, 3000)
    } catch (error) {
      console.error("Error creating automation:", error)
      toast.error("Error al crear automatización", {
        description: error instanceof Error ? error.message : "No se pudo crear la automatización. Inténtalo de nuevo.",
        duration: 4000,
      })
    } finally {
      setIsLoading(false)
    }
  }

  const isStepValid = () => {
    switch (currentStep) {
      case 1: {
        if (formData.name.trim() === "" || formData.bot_id === "") return false
        // Bot multicanal: exigir que se haya elegido el canal de envío
        const selBot = bots.find((b) => b.id === formData.bot_id)
        const channels = getBotChannels(selBot)
        return channels.length <= 1 || selectedChannel !== ""
      }
      case 2:
        return formData.trigger_type !== ""
      case 3:
        // Paso 3: Selección de promoción (opcional)
        return true // Siempre válido ya que la promoción es opcional
      case 4:
        // Paso 4: Selección de plantilla
        if (formData.template_source === "create_new") {
          return formData.custom_template?.body_content.trim() !== ""
        } else {
          return formData.selected_template !== null
        }
      case 5:
        // Paso 5: Variables
        if (formData.template_source === "meta_api" && formData.selected_template?.variables && formData.selected_template.variables.length > 0) {
            const mappedCount = Object.keys(formData.variable_mapping).length
            return mappedCount === formData.selected_template.variables.length
        }
        return true
      case 6:
        // Paso 6: Revisión final
        return true
      default:
        return false
    }
  }

  const renderTriggerConfig = () => {
    if (!formData.trigger_type) return null

    switch (formData.trigger_type) {
      case "birthday":
        return (
          <div className="space-y-4">
            <div>
              <Label htmlFor="days_before" className="text-sm font-medium">
                Días antes del cumpleaños
              </Label>
              <Select
                value={formData.trigger_config.days_before?.toString() || "0"}
                onValueChange={(value) =>
                  setFormData({
                    ...formData,
                    trigger_config: { ...formData.trigger_config, days_before: parseInt(value) },
                  })
                }
              >
                <SelectTrigger className="mt-1">
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
          </div>
        )

      case "inactive_client":
        return (
          <div className="space-y-4">
            <div>
              <Label htmlFor="inactive_days" className="text-sm font-medium">
                Días de inactividad
              </Label>
              <Select
                value={formData.trigger_config.inactive_days?.toString() || "30"}
                onValueChange={(value) =>
                  setFormData({
                    ...formData,
                    trigger_config: { ...formData.trigger_config, inactive_days: parseInt(value) },
                  })
                }
              >
                <SelectTrigger className="mt-1">
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
          </div>
        )

      case "new_promotion":
        return (
          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="send_immediately"
                checked={formData.trigger_config.send_immediately || false}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    trigger_config: { ...formData.trigger_config, send_immediately: e.target.checked },
                  })
                }
                className="rounded border-gray-300"
              />
              <Label htmlFor="send_immediately" className="text-sm">
                Enviar inmediatamente al crear promoción
              </Label>
            </div>

            <div className="space-y-2 pt-2 border-t">
                <Label className="text-sm font-medium">Audiencia</Label>
                <div className="flex flex-col gap-2">
                    <div className="flex items-center space-x-2">
                        <input 
                            type="radio" 
                            id="audience_all" 
                            name="audience" 
                            checked={!formData.trigger_config.target_audience || formData.trigger_config.target_audience === 'all'}
                            onChange={() => setFormData({
                                ...formData,
                                trigger_config: { ...formData.trigger_config, target_audience: 'all' }
                            })}
                            className="rounded-full border-gray-300"
                        />
                        <Label htmlFor="audience_all" className="font-normal">Todos los clientes</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                        <input 
                            type="radio" 
                            id="audience_specific" 
                            name="audience" 
                            checked={formData.trigger_config.target_audience === 'specific'}
                            onChange={() => setFormData({
                                ...formData,
                                trigger_config: { ...formData.trigger_config, target_audience: 'specific' }
                            })}
                            className="rounded-full border-gray-300"
                        />
                        <Label htmlFor="audience_specific" className="font-normal">Seleccionar clientes específicos</Label>
                    </div>
                </div>
            </div>

            {formData.trigger_config.target_audience === 'specific' && (
                <div className="space-y-2">
                  <div className="relative">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Buscar cliente por nombre o teléfono..."
                      value={clientSearchTerm}
                      onChange={(e) => setClientSearchTerm(e.target.value)}
                      className="pl-8"
                    />
                  </div>

                  <div className="border rounded-md p-2 max-h-60 overflow-y-auto bg-slate-50">
                    {isSearchingClients ? (
                      <div className="flex items-center justify-center py-4">
                        <Loader2 className="h-6 w-6 animate-spin text-primary" />
                      </div>
                    ) : clients.length > 0 ? (
                        clients.map(client => (
                            <div key={client.id} className="flex items-center space-x-2 p-2 hover:bg-white rounded transition-colors border-b last:border-0 border-slate-100">
                                <input 
                                    type="checkbox"
                                    id={`client_${client.id}`}
                                    checked={(formData.trigger_config.selected_clients || []).includes(client.id)}
                                    onChange={(e) => {
                                        const currentSelected = formData.trigger_config.selected_clients || [];
                                        let newSelected;
                                        if (e.target.checked) {
                                            newSelected = [...currentSelected, client.id];
                                        } else {
                                            newSelected = currentSelected.filter((id: string) => id !== client.id);
                                        }
                                        setFormData({
                                            ...formData,
                                            trigger_config: { ...formData.trigger_config, selected_clients: newSelected }
                                        });
                                    }}
                                    className="rounded border-gray-300"
                                />
                                <Label htmlFor={`client_${client.id}`} className="cursor-pointer flex-1 text-sm">
                                    <span className="font-medium">{client.name || 'Sin nombre'}</span> 
                                    <span className="text-gray-500 ml-2 text-xs">{client.phone}</span>
                                </Label>
                            </div>
                        ))
                    ) : (
                        <div className="text-center py-4 text-gray-500 text-sm">
                            {clientSearchTerm ? "No se encontraron clientes." : "No hay clientes recientes."}
                        </div>
                    )}
                  </div>
                  {!clientSearchTerm && clients.length > 0 && (
                    <p className="text-xs text-muted-foreground text-center">
                      Mostrando los últimos 10 clientes. Usa el buscador para encontrar más.
                    </p>
                  )}
                </div>
            )}
          </div>
        )

      case "comment_reply":
        return (
          <div className="space-y-4">
            <div className="p-3 bg-pink-50 rounded-lg border border-pink-200">
              <h4 className="font-medium text-sm text-pink-800 mb-1">¿Cómo funciona?</h4>
              <p className="text-xs text-pink-700">
                Se activará cuando alguien comente en tus posts de Instagram. 
                Puedes responder automáticamente y convertir el comentario en una conversación privada.
              </p>
            </div>
            <div>
              <Label htmlFor="comment_keywords" className="text-sm font-medium">
                Palabras clave en comentarios (opcional)
              </Label>
              <Input
                id="comment_keywords"
                value={formData.trigger_config.comment_keywords || ""}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    trigger_config: { ...formData.trigger_config, comment_keywords: e.target.value },
                  })
                }
                placeholder="ej: precio, info, disponible (separar con comas)"
                className="mt-1"
              />
              <p className="text-xs text-gray-500 mt-1">
                Si está vacío, responderá a todos los comentarios. Si especificas palabras, solo responderá a comentarios que las contengan.
              </p>
            </div>
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="move_to_dm"
                checked={formData.trigger_config.move_to_dm || true}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    trigger_config: { ...formData.trigger_config, move_to_dm: e.target.checked },
                  })
                }
                className="rounded border-gray-300"
              />
              <Label htmlFor="move_to_dm" className="text-sm">
                Mover conversación a mensaje privado
              </Label>
            </div>
          </div>
        )

      default:
        return null
    }
  }

  const getPreviewData = () => {
    const triggerConfig = triggerTypes[formData.trigger_type as keyof typeof triggerTypes]
    const selectedBot = bots.find(b => b.id === formData.bot_id)
    const selectedPromotion = promotions.find(p => p.id === formData.promotion_id)
    
    // Generar vista previa del mensaje final directamente de la plantilla
    let finalMessage = ""
    
    // Usar directamente el contenido de la plantilla
    if (formData.template_source === "create_new" && formData.custom_template?.body_content) {
      finalMessage = formData.custom_template.body_content
    } else if (formData.selected_template?.body_content) {
      finalMessage = formData.selected_template.body_content
    }
    
    // Reemplazar variables comunes para la vista previa
    let messagePreview = finalMessage
      .replace(/\{nombre\}/g, "María González")
      .replace(/\{email\}/g, "maria.gonzalez@email.com")
      .replace(/\{instagram_usuario\}/g, "@mariagonzalez")
      .replace(/\{puntos\}/g, "250 puntos")
      .replace(/\{total_compras\}/g, "$125.000")
      .replace(/\{ultima_compra\}/g, new Date().toLocaleDateString())
      .replace(/\{nombre_negocio\}/g, "MaxiBici")
      .replace(/\{descripcion_negocio\}/g, "Tu tienda de bicicletas de confianza")
      .replace(/\{ubicacion\}/g, "Av. San Martín 1234")
      .replace(/\{enlace_menu\}/g, "https://maxibici.com/catalogo")
      .replace(/\{fecha_actual\}/g, new Date().toLocaleDateString())
      .replace(/\{hora_actual\}/g, new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}))
      .replace(/\{dia_semana\}/g, new Date().toLocaleDateString('es-ES', { weekday: 'long' }))

    // Reemplazar variables de promoción con datos reales si existe
    if (selectedPromotion) {
      messagePreview = messagePreview
        .replace(/\{nombre_promocion\}/g, selectedPromotion.name)
        .replace(/\{descripcion_promocion\}/g, selectedPromotion.description || "")
        .replace(/\{fecha_inicio\}/g, new Date(selectedPromotion.start_date).toLocaleDateString())
        .replace(/\{fecha_fin\}/g, new Date(selectedPromotion.end_date).toLocaleDateString())
    } else {
      messagePreview = messagePreview
        .replace(/\{nombre_promocion\}/g, "Black Friday Especial")
        .replace(/\{descripcion_promocion\}/g, "Descuentos increíbles en toda la tienda")
    }
    
    // Reemplazar variables mapeadas de Meta
    if (formData.template_source === "meta_api" && formData.selected_template?.variables) {
      formData.selected_template.variables.forEach(variable => {
        const mappedField = formData.variable_mapping[variable]
        if (mappedField) {
          // Si el campo mapeado es de promoción y tenemos una seleccionada, usar su valor real
          if (selectedPromotion && mappedField === 'nombre_promocion') {
             const varIndex = variable.replace('var_', '')
             const regex = new RegExp(`\\{\\{${varIndex}\\}\\}`, 'g')
             messagePreview = messagePreview.replace(regex, selectedPromotion.name)
             return
          }
          if (selectedPromotion && mappedField === 'descripcion_promocion') {
             const varIndex = variable.replace('var_', '')
             const regex = new RegExp(`\\{\\{${varIndex}\\}\\}`, 'g')
             messagePreview = messagePreview.replace(regex, selectedPromotion.description || "")
             return
          }

          // Buscar ejemplo para el campo mapeado
          const varDef = availableVariables.find(v => v.name === mappedField)
          const exampleValue = varDef ? varDef.example : `[${mappedField}]`
          
          // Reemplazar {{X}} donde X es el número extraído de var_X
          // O reemplazar {{nombre variable}} si es texto
          const varContent = variable.replace('var_', '')
          
          // Intentar reemplazar tanto {{1}} como {{nombre}}
          let regex = new RegExp(`\\{\\{${varContent}\\}\\}`, 'g')
          messagePreview = messagePreview.replace(regex, exampleValue)
        }
      })
    }
    
    return {
      triggerConfig,
      selectedBot,
      messagePreview: messagePreview.trim() || "No hay mensaje configurado",
      selectedTemplate: formData.selected_template || formData.custom_template,
      templateSource: formData.template_source
    }
  }

  if (showSuccess) {
    return (
      <Dialog open={isOpen} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-md">
          <div className="flex flex-col items-center justify-center py-8 space-y-4">
            <div className="relative">
              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center animate-pulse">
                <CheckCircle className="w-10 h-10 text-green-600" />
              </div>
              <div className="absolute -top-2 -right-2">
                <Sparkles className="w-6 h-6 text-yellow-500 animate-bounce" />
              </div>
            </div>
            <div className="text-center space-y-2">
              <h3 className="text-xl font-bold text-green-600">¡Automatización Creada!</h3>
              <p className="text-muted-foreground">Tu automatización está lista para funcionar</p>
            </div>
            <div className="w-full bg-green-100 rounded-full h-2">
              <div className="bg-green-600 h-2 rounded-full animate-pulse" style={{ width: "100%" }}></div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-3xl max-h-[95vh] sm:max-h-[90vh] overflow-y-auto mx-4 sm:mx-0">
        <DialogHeader className="px-4 sm:px-6 pt-4 sm:pt-6">
          <DialogTitle className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 sm:h-5 sm:w-5" />
              <span className="text-base sm:text-lg">Crear Nueva Automatización</span>
            </div>
            <Badge variant="secondary" className="text-xs sm:text-sm w-fit">
              Paso {currentStep} de {steps.length}
            </Badge>
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm">
            {steps[currentStep - 1]?.description}
          </DialogDescription>
        </DialogHeader>

        {/* Progress Bar */}
        <div className="px-4 sm:px-6">
          <div className="flex items-center justify-between mb-2">
            {steps.map((step, index) => {
              const stepNumber = index + 1
              const isActive = stepNumber === currentStep
              const isCompleted = stepNumber < currentStep

              return (
                <div
                  key={step.id}
                  className={cn(
                    "flex items-center text-xs sm:text-sm font-medium transition-colors",
                    isActive ? "text-primary" : isCompleted ? "text-green-600" : "text-muted-foreground"
                  )}
                >
                  <div
                    className={cn(
                      "w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center mr-2 text-xs transition-colors",
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : isCompleted
                        ? "bg-green-600 text-white"
                        : "bg-muted text-muted-foreground"
                    )}
                  >
                    {isCompleted ? <Check className="w-3 h-3 sm:w-4 sm:h-4" /> : stepNumber}
                  </div>
                  <span className="hidden sm:inline">{step.title}</span>
                </div>
              )
            })}
          </div>
          <div className="w-full bg-muted rounded-full h-2">
            <motion.div
              className="bg-primary h-2 rounded-full"
              initial={{ width: "0%" }}
              animate={{ width: `${((currentStep - 1) / (steps.length - 1)) * 100}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
        </div>

        <div className="px-4 sm:px-6 pb-4 sm:pb-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep}
              initial="hidden"
              animate="visible"
              exit="exit"
              variants={contentVariants}
              className="space-y-4 sm:space-y-6"
            >
              {/* Step 1: Basic Information */}
              {currentStep === 1 && (
                <motion.div variants={fadeInUp} className="space-y-4 sm:space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                        <Settings className="h-4 w-4 sm:h-5 sm:w-5" />
                        Información Básica
                      </CardTitle>
                      <CardDescription className="text-xs sm:text-sm">
                        Configura el nombre y selecciona el bot que ejecutará la automatización
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="automation-name" className="text-sm font-medium">
                          Nombre de la Automatización *
                        </Label>
                        <Input
                          id="automation-name"
                          value={formData.name}
                          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                          placeholder="Ej: Felicitación de Cumpleaños"
                          className="text-sm"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="bot-select" className="text-sm font-medium">
                          Seleccionar Bot *
                        </Label>
                        <Select 
                          value={formData.bot_id === "" ? undefined : formData.bot_id} 
                          onValueChange={(value) => {
                            // Solo actualizar si el valor no es el placeholder
                            if (value && value !== "no-bots-available") {
                              setFormData({ ...formData, bot_id: value, trigger_type: "" })
                              setSelectedChannel("") // reset: el canal depende del bot
                            }
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Selecciona un bot activo" />
                          </SelectTrigger>
                          <SelectContent>
                            {bots.length === 0 ? (
                              <SelectItem value="no-bots-available" disabled>
                                No hay bots activos disponibles
                              </SelectItem>
                            ) : (
                              bots.map((bot) => (
                                <SelectItem key={bot.id} value={bot.id}>
                                  {bot.name} ({getBotChannels(bot).join(" + ")})
                                </SelectItem>
                              ))
                            )}
                          </SelectContent>
                        </Select>
                        {bots.length === 0 && (
                          <p className="text-xs text-amber-600">
                            Necesitas al menos un bot activo para crear automatizaciones.
                          </p>
                        )}
                      </div>

                      {/* Bot multicanal: elegir por qué canal sale la automatización */}
                      {(() => {
                        const selBot = bots.find((b) => b.id === formData.bot_id)
                        const channels = getBotChannels(selBot)
                        if (channels.length <= 1) return null
                        return (
                          <div className="space-y-2">
                            <Label className="text-sm sm:text-base font-medium">Canal de envío *</Label>
                            <Select
                              value={selectedChannel || undefined}
                              onValueChange={(v) => {
                                setSelectedChannel(v)
                                setFormData({ ...formData, trigger_type: "" })
                              }}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="¿Por qué canal sale esta automatización?" />
                              </SelectTrigger>
                              <SelectContent>
                                {channels.map((ch) => (
                                  <SelectItem key={ch} value={ch}>
                                    {ch === "whatsapp" ? "WhatsApp" : ch === "instagram" ? "Instagram" : ch === "messenger" ? "Messenger" : "Email"}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">
                              Este bot atiende varios canales. Cada automatización se envía por uno solo.
                            </p>
                          </div>
                        )
                      })()}
                    </CardContent>
                  </Card>
                </motion.div>
              )}

              {/* Step 2: Trigger Configuration */}
              {currentStep === 2 && (
                <motion.div variants={fadeInUp} className="space-y-4 sm:space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                        <Target className="h-4 w-4 sm:h-5 sm:w-5" />
                        Disparador de Automatización
                      </CardTitle>
                      <CardDescription className="text-xs sm:text-sm">
                        Elige cuándo se debe ejecutar esta automatización
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* Mensaje informativo según plataforma */}
                      {selectedBotPlatform === 'instagram' && (
                        <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                          <div className="flex gap-2">
                            <Info className="h-4 w-4 text-blue-600 flex-shrink-0 mt-0.5" />
                            <div>
                              <h4 className="font-medium text-sm text-blue-800 mb-1">
                                Limitaciones de Instagram
                              </h4>
                              <p className="text-xs text-blue-700">
                                Instagram solo permite <strong>respuestas automáticas a comentarios</strong>. 
                                No es posible enviar mensajes masivos proactivos como cumpleaños o promociones.
                                Para esos casos, usa un bot de WhatsApp o Email.
                              </p>
                            </div>
                          </div>
                        </div>
                      )}
                      {selectedBotPlatform === 'messenger' && (
                        <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                          <div className="flex gap-2">
                            <Info className="h-4 w-4 text-blue-600 flex-shrink-0 mt-0.5" />
                            <div>
                              <h4 className="font-medium text-sm text-blue-800 mb-1">
                                Limitaciones de Messenger
                              </h4>
                              <p className="text-xs text-blue-700">
                                Messenger no permite mensajes masivos proactivos (cumpleaños, promociones).
                                El bot responde mensajes entrantes dentro de la ventana de 24 hs.
                                Para automatizaciones proactivas, usá el canal de WhatsApp.
                              </p>
                            </div>
                          </div>
                        </div>
                      )}
                      {selectedBotPlatform === 'whatsapp' && (
                        <div className="p-3 bg-green-50 rounded-lg border border-green-200">
                          <div className="flex gap-2">
                            <Check className="h-4 w-4 text-green-600 flex-shrink-0 mt-0.5" />
                            <div>
                              <p className="text-xs text-green-700">
                                <strong>WhatsApp Business API</strong> permite todos los tipos de automatizaciones 
                                incluyendo mensajes proactivos y broadcasts masivos.
                              </p>
                            </div>
                          </div>
                        </div>
                      )}
                      
                      <div className="grid gap-3 sm:gap-4">
                        {Object.entries(triggerTypes)
                          .filter(([key, config]) => {
                            // Si no hay bot seleccionado, mostrar todos
                            if (!selectedBotPlatform) return true
                            // Filtrar por el canal elegido ('email' se mapea a 'gmail' en triggers)
                            const channelKey = selectedBotPlatform === 'email' ? 'gmail' : selectedBotPlatform
                            return config.platforms.includes(channelKey)
                          })
                          .map(([key, config]) => {
                          const Icon = config.icon
                          const isSelected = formData.trigger_type === key

                          return (
                            <motion.div
                              key={key}
                              whileHover={{ scale: 1.02 }}
                              whileTap={{ scale: 0.98 }}
                            >
                              <Card
                                className={cn(
                                  "cursor-pointer transition-all border-2",
                                  isSelected
                                    ? "border-primary bg-primary/5"
                                    : "border-muted hover:border-primary/50"
                                )}
                                onClick={() => {
                                  let defaultConfig = {};
                                  switch (key) {
                                    case 'birthday': defaultConfig = { days_before: 0 }; break;
                                    case 'inactive_client': defaultConfig = { inactive_days: 30 }; break;
                                    case 'new_promotion': defaultConfig = { send_immediately: false }; break;
                                    case 'comment_reply': defaultConfig = { comment_keywords: '' }; break;
                                  }
                                  setFormData({ ...formData, trigger_type: key as any, trigger_config: defaultConfig })
                                }}
                              >
                                <CardContent className="p-3 sm:p-4">
                                  <div className="flex items-center gap-3">
                                    <div className={cn("p-2 sm:p-3 rounded-lg text-white", config.color)}>
                                      <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
                                    </div>
                                    <div className="flex-1">
                                      <h4 className="font-medium text-sm sm:text-base">{config.label}</h4>
                                      <p className="text-xs sm:text-sm text-muted-foreground">{config.description}</p>
                                      <div className="flex gap-1 mt-1">
                                        {config.platforms.map(platform => (
                                          <Badge key={platform} variant="outline" className="text-xs">
                                            {platform}
                                          </Badge>
                                        ))}
                                      </div>
                                    </div>
                                    {isSelected && (
                                      <CheckCircle className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                                    )}
                                  </div>
                                </CardContent>
                              </Card>
                            </motion.div>
                          )
                        })}
                      </div>

                      {formData.trigger_type && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          transition={{ duration: 0.3 }}
                        >
                          <Card>
                            <CardHeader>
                              <CardTitle className="text-sm sm:text-base">Configuración del Disparador</CardTitle>
                            </CardHeader>
                            <CardContent>
                              {renderTriggerConfig()}
                            </CardContent>
                          </Card>
                        </motion.div>
                      )}
                    </CardContent>
                  </Card>
                </motion.div>
              )}

              {/* Step 3: Promotion Selection (Optional) */}
              {currentStep === 3 && (
                <motion.div variants={fadeInUp} className="space-y-4 sm:space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                        <Gift className="h-4 w-4 sm:h-5 sm:w-5" />
                        Promoción (Opcional)
                      </CardTitle>
                      <CardDescription className="text-xs sm:text-sm">
                        Vincula una promoción específica con esta automatización. Esto es opcional.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-4">
                        <Label className="text-sm font-medium">Seleccionar Promoción</Label>
                        
                        {/* Option: No promotion */}
                        <div className="space-y-3">
                          <div
                            className={cn(
                              "p-4 rounded-lg border-2 cursor-pointer transition-all hover:shadow-md",
                              !formData.promotion_id 
                                ? "border-primary bg-primary/5" 
                                : "border-border hover:border-primary/50"
                            )}
                            onClick={() => setFormData({ ...formData, promotion_id: "" })}
                          >
                            <div className="flex items-center gap-3">
                              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-muted">
                                <Settings className="h-4 w-4" />
                              </div>
                              <div>
                                <h4 className="font-medium text-sm">Sin promoción específica</h4>
                                <p className="text-xs text-muted-foreground">
                                  La automatización no estará vinculada a ninguna promoción
                                </p>
                              </div>
                            </div>
                          </div>

                          {/* Promotions grid */}
                          {loadingPromotions ? (
                            <div className="flex items-center justify-center py-8">
                              <Loader2 className="h-6 w-6 animate-spin" />
                              <span className="ml-2 text-sm text-muted-foreground">Cargando promociones...</span>
                            </div>
                          ) : promotions.length > 0 ? (
                            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                              {promotions.map((promotion) => (
                                <div
                                  key={promotion.id}
                                  className={cn(
                                    "p-4 rounded-lg border-2 cursor-pointer transition-all hover:shadow-md",
                                    formData.promotion_id === promotion.id
                                      ? "border-primary bg-primary/5"
                                      : "border-border hover:border-primary/50"
                                  )}
                                  onClick={() => setFormData({ ...formData, promotion_id: promotion.id })}
                                >
                                  <div className="space-y-2">
                                    {promotion.image_url && (
                                      <img 
                                        src={promotion.image_url} 
                                        alt={promotion.name}
                                        className="w-full h-24 object-cover rounded"
                                      />
                                    )}
                                    <h4 className="font-medium text-sm truncate">{promotion.name}</h4>
                                    {promotion.description && (
                                      <div className="text-xs text-muted-foreground line-clamp-2">
                                        {promotion.description}
                                      </div>
                                    )}
                                    <Badge 
                                      variant={promotion.is_active ? "default" : "secondary"}
                                      className="text-xs"
                                    >
                                      {promotion.is_active ? "Activa" : "Inactiva"}
                                    </Badge>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="text-center py-8">
                              <Gift className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                              <p className="text-sm text-muted-foreground">
                                No tienes promociones activas. Puedes crear la automatización sin vincular una promoción.
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              )}

              {/* Step 4: Template Selection */}
              {currentStep === 4 && (
                <motion.div variants={fadeInUp} className="space-y-4 sm:space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                        <MessageSquare className="h-4 w-4 sm:h-5 sm:w-5" />
                        Selección de Plantilla
                      </CardTitle>
                      <CardDescription className="text-xs sm:text-sm">
                        {selectedBotPlatform === 'email' 
                          ? 'Selecciona una plantilla existente o crea una personalizada'
                          : 'Selecciona una plantilla aprobada de Meta Business'
                        }
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {loadingTemplates ? (
                        <div className="flex items-center justify-center py-8">
                          <Loader2 className="h-8 w-8 animate-spin" />
                          <span className="ml-2">Cargando plantillas...</span>
                        </div>
                      ) : (
                        <>
                          {/* Email: opción de crear plantilla personalizada */}
                          {canCreateCustomTemplate && (
                            <div className="space-y-4">
                              <div className="flex items-center space-x-2">
                                <input
                                  type="radio"
                                  id="create-new"
                                  name="template-source"
                                  value="create_new"
                                  checked={formData.template_source === "create_new"}
                                  onChange={(e) => {
                                    setFormData({ 
                                      ...formData, 
                                      template_source: e.target.value as "create_new",
                                      selected_template: null
                                    })
                                    setShowCustomTemplateForm(true)
                                  }}
                                />
                                <Label htmlFor="create-new" className="text-sm font-medium">
                                  Crear plantilla personalizada
                                </Label>
                              </div>
                              
                              {showCustomTemplateForm && formData.template_source === "create_new" && (
                                <Card className="bg-muted/50">
                                  <CardHeader>
                                    <CardTitle className="text-sm">
                                      Nueva Plantilla {selectedBotPlatform === 'email' ? 'de Email' : 'de Instagram'}
                                    </CardTitle>
                                  </CardHeader>
                                  <CardContent className="space-y-4">
                                    {selectedBotPlatform === 'email' && (
                                      <div>
                                        <Label htmlFor="email-subject">Asunto del Email</Label>
                                        <Input
                                          id="email-subject"
                                          value={formData.custom_template?.subject || ""}
                                          onChange={(e) => setFormData({
                                            ...formData,
                                            custom_template: {
                                              ...formData.custom_template,
                                              subject: e.target.value,
                                              body_content: formData.custom_template?.body_content || "",
                                              variables: formData.custom_template?.variables || []
                                            }
                                          })}
                                          placeholder="Ej: ¡Feliz Cumpleaños {nombre}!"
                                        />
                                      </div>
                                    )}
                                    <div>
                                      <Label htmlFor="template-body">
                                        {selectedBotPlatform === 'email' ? 'Contenido del Email' : 'Mensaje de Instagram'}
                                      </Label>
                                      <Textarea
                                        id="template-body"
                                        rows={6}
                                        value={formData.custom_template?.body_content || ""}
                                        onChange={(e) => setFormData({
                                          ...formData,
                                          custom_template: {
                                            ...formData.custom_template,
                                            subject: formData.custom_template?.subject || "",
                                            body_content: e.target.value,
                                            variables: formData.custom_template?.variables || []
                                          }
                                        })}
                                        onDrop={(e) => {
                                          e.preventDefault()
                                          const variable = e.dataTransfer.getData('text/plain')
                                          if (variable) {
                                            const textarea = e.target as HTMLTextAreaElement
                                            const start = textarea.selectionStart
                                            const end = textarea.selectionEnd
                                            const currentValue = textarea.value
                                            const newValue = currentValue.substring(0, start) + variable + currentValue.substring(end)
                                            
                                            setFormData({
                                              ...formData,
                                              custom_template: {
                                                ...formData.custom_template,
                                                subject: formData.custom_template?.subject || "",
                                                body_content: newValue,
                                                variables: formData.custom_template?.variables || []
                                              }
                                            })
                                            
                                            // Restaurar foco y posición del cursor
                                            setTimeout(() => {
                                              textarea.focus()
                                              textarea.setSelectionRange(start + variable.length, start + variable.length)
                                            }, 0)
                                          }
                                        }}
                                        onDragOver={(e) => {
                                          e.preventDefault()
                                          e.currentTarget.classList.add('ring-2', 'ring-blue-500')
                                        }}
                                        onDragLeave={(e) => {
                                          e.currentTarget.classList.remove('ring-2', 'ring-blue-500')
                                        }}
                                        placeholder={
                                          selectedBotPlatform === 'email' 
                                            ? "Arrastra variables aquí o escribe tu mensaje... Ejemplo: Hola {nombre}, ¡esperamos que tengas un cumpleaños increíble!"
                                            : "Arrastra variables aquí o escribe tu mensaje... Ejemplo: ¡Hola {nombre}! 🎉 Como regalo especial, tienes un {descuento} de descuento."
                                        }
                                        className="min-h-[120px] transition-all duration-200"
                                      />
                                      {/* Panel de Variables Drag & Drop */}
                                      <div className="mt-3 space-y-3">
                                        <div className="flex items-center gap-2">
                                          <Sparkles className="h-4 w-4 text-blue-600" />
                                          <span className="text-sm font-medium text-gray-800">
                                            Variables disponibles - Arrastra al mensaje
                                          </span>
                                        </div>
                                        
                                        {/* Variables por categoría */}
                                        <div className="grid gap-4">
                                          {/* Variables del Cliente */}
                                          <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
                                            <h4 className="text-xs font-medium text-blue-800 mb-2 flex items-center gap-1">
                                              <Users className="h-3 w-3" />
                                              Datos del Cliente
                                            </h4>
                                            <div className="flex flex-wrap gap-2">
                                              {availableVariables
                                                .filter(v => v.type === 'client')
                                                .map((variable) => (
                                                  <div
                                                    key={variable.name}
                                                    draggable
                                                    className="inline-flex items-center gap-1 bg-white px-2 py-1 rounded border border-blue-300 cursor-move hover:bg-blue-100 transition-colors text-xs"
                                                    onDragStart={(e) => {
                                                      e.dataTransfer.setData('text/plain', `{${variable.name}}`)
                                                    }}
                                                    onClick={() => {
                                                      const textarea = document.getElementById('template-body') as HTMLTextAreaElement
                                                      if (textarea) {
                                                        const start = textarea.selectionStart
                                                        const end = textarea.selectionEnd
                                                        const currentValue = textarea.value
                                                        const newValue = currentValue.substring(0, start) + `{${variable.name}}` + currentValue.substring(end)
                                                        
                                                        setFormData({
                                                          ...formData,
                                                          custom_template: {
                                                            ...formData.custom_template,
                                                            subject: formData.custom_template?.subject || "",
                                                            body_content: newValue,
                                                            variables: formData.custom_template?.variables || []
                                                          }
                                                        })
                                                        
                                                        // Restaurar foco y posición del cursor
                                                        setTimeout(() => {
                                                          textarea.focus()
                                                          textarea.setSelectionRange(start + `{${variable.name}}`.length, start + `{${variable.name}}`.length)
                                                        }, 0)
                                                      }
                                                    }}
                                                    title={`${variable.description} - Ejemplo: ${variable.example}`}
                                                  >
                                                    <span className="text-blue-700">{variable.name}</span>
                                                    <code className="text-xs text-blue-500">({variable.example})</code>
                                                  </div>
                                                ))}
                                            </div>
                                          </div>

                                          {/* Variables del Negocio */}
                                          <div className="bg-purple-50 p-3 rounded-lg border border-purple-200">
                                            <h4 className="text-xs font-medium text-purple-800 mb-2 flex items-center gap-1">
                                              <Bot className="h-3 w-3" />
                                              Datos del Negocio
                                            </h4>
                                            <div className="flex flex-wrap gap-2">
                                              {availableVariables
                                                .filter(v => v.type === 'business')
                                                .map((variable) => (
                                                  <div
                                                    key={variable.name}
                                                    draggable
                                                    className="inline-flex items-center gap-1 bg-white px-2 py-1 rounded border border-purple-300 cursor-move hover:bg-purple-100 transition-colors text-xs"
                                                    onDragStart={(e) => {
                                                      e.dataTransfer.setData('text/plain', `{${variable.name}}`)
                                                    }}
                                                    onClick={() => {
                                                      const textarea = document.getElementById('template-body') as HTMLTextAreaElement
                                                      if (textarea) {
                                                        const start = textarea.selectionStart
                                                        const end = textarea.selectionEnd
                                                        const currentValue = textarea.value
                                                        const newValue = currentValue.substring(0, start) + `{${variable.name}}` + currentValue.substring(end)
                                                        
                                                        setFormData({
                                                          ...formData,
                                                          custom_template: {
                                                            ...formData.custom_template,
                                                            subject: formData.custom_template?.subject || "",
                                                            body_content: newValue,
                                                            variables: formData.custom_template?.variables || []
                                                          }
                                                        })
                                                        
                                                        setTimeout(() => {
                                                          textarea.focus()
                                                          textarea.setSelectionRange(start + `{${variable.name}}`.length, start + `{${variable.name}}`.length)
                                                        }, 0)
                                                      }
                                                    }}
                                                    title={`${variable.description} - Ejemplo: ${variable.example}`}
                                                  >
                                                    <span className="text-purple-700">{variable.name}</span>
                                                    <code className="text-xs text-purple-500">({variable.example})</code>
                                                  </div>
                                                ))}
                                            </div>
                                          </div>

                                          {/* Variables de Promoción (solo si hay promoción vinculada) */}
                                          {formData.promotion_id && (
                                            <div className="bg-green-50 p-3 rounded-lg border border-green-200">
                                              <h4 className="text-xs font-medium text-green-800 mb-2 flex items-center gap-1">
                                                <Gift className="h-3 w-3" />
                                                Datos de la Promoción
                                              </h4>
                                              <div className="flex flex-wrap gap-2">
                                                {availableVariables
                                                  .filter(v => v.type === 'promotion')
                                                  .map((variable) => (
                                                    <div
                                                      key={variable.name}
                                                      draggable
                                                      className="inline-flex items-center gap-1 bg-white px-2 py-1 rounded border border-green-300 cursor-move hover:bg-green-100 transition-colors text-xs"
                                                      onDragStart={(e) => {
                                                        e.dataTransfer.setData('text/plain', `{${variable.name}}`)
                                                      }}
                                                      onClick={() => {
                                                        const textarea = document.getElementById('template-body') as HTMLTextAreaElement
                                                        if (textarea) {
                                                          const start = textarea.selectionStart
                                                          const end = textarea.selectionEnd
                                                          const currentValue = textarea.value
                                                          const newValue = currentValue.substring(0, start) + `{${variable.name}}` + currentValue.substring(end)
                                                          
                                                          setFormData({
                                                            ...formData,
                                                            custom_template: {
                                                              ...formData.custom_template,
                                                              subject: formData.custom_template?.subject || "",
                                                              body_content: newValue,
                                                              variables: formData.custom_template?.variables || []
                                                            }
                                                          })
                                                          
                                                          setTimeout(() => {
                                                            textarea.focus()
                                                            textarea.setSelectionRange(start + `{${variable.name}}`.length, start + `{${variable.name}}`.length)
                                                          }, 0)
                                                        }
                                                      }}
                                                      title={`${variable.description} - Ejemplo: ${variable.example}`}
                                                    >
                                                      <span className="text-green-700">{variable.name}</span>
                                                      <code className="text-xs text-green-500">({variable.example})</code>
                                                    </div>
                                                  ))}
                                              </div>
                                            </div>
                                          )}

                                          {/* Variables de Pedido (solo para triggers relacionados) */}
                                          {(formData.trigger_type === 'new_order' || formData.trigger_type === 'order_ready') && (
                                            <div className="bg-orange-50 p-3 rounded-lg border border-orange-200">
                                              <h4 className="text-xs font-medium text-orange-800 mb-2 flex items-center gap-1">
                                                <Send className="h-3 w-3" />
                                                Datos del Pedido
                                              </h4>
                                              <div className="flex flex-wrap gap-2">
                                                {availableVariables
                                                  .filter(v => v.type === 'order')
                                                  .map((variable) => (
                                                    <div
                                                      key={variable.name}
                                                      draggable
                                                      className="inline-flex items-center gap-1 bg-white px-2 py-1 rounded border border-orange-300 cursor-move hover:bg-orange-100 transition-colors text-xs"
                                                      onDragStart={(e) => {
                                                        e.dataTransfer.setData('text/plain', `{${variable.name}}`)
                                                      }}
                                                      onClick={() => {
                                                        const textarea = document.getElementById('template-body') as HTMLTextAreaElement
                                                        if (textarea) {
                                                          const start = textarea.selectionStart
                                                          const end = textarea.selectionEnd
                                                          const currentValue = textarea.value
                                                          const newValue = currentValue.substring(0, start) + `{${variable.name}}` + currentValue.substring(end)
                                                          
                                                          setFormData({
                                                            ...formData,
                                                            custom_template: {
                                                              ...formData.custom_template,
                                                              subject: formData.custom_template?.subject || "",
                                                              body_content: newValue,
                                                              variables: formData.custom_template?.variables || []
                                                            }
                                                          })
                                                          
                                                          setTimeout(() => {
                                                            textarea.focus()
                                                            textarea.setSelectionRange(start + `{${variable.name}}`.length, start + `{${variable.name}}`.length)
                                                          }, 0)
                                                        }
                                                      }}
                                                      title={`${variable.description} - Ejemplo: ${variable.example}`}
                                                    >
                                                      <span className="text-orange-700">{variable.name}</span>
                                                      <code className="text-xs text-orange-500">({variable.example})</code>
                                                    </div>
                                                  ))}
                                              </div>
                                            </div>
                                          )}
                                        </div>

                                        {/* Variables detectadas en el texto */}
                                        {detectedVariables.length > 0 && (
                                          <div className="mt-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                                            <div className="flex items-center gap-2 mb-2">
                                              <CheckCircle className="h-4 w-4 text-green-600" />
                                              <span className="text-sm font-medium text-gray-800">
                                                Variables usadas en tu mensaje ({detectedVariables.length})
                                              </span>
                                            </div>
                                            <div className="flex flex-wrap gap-1">
                                              {detectedVariables.map((variable) => {
                                                const isValid = availableVariables.some(v => v.name === variable)
                                                return (
                                                  <Badge
                                                    key={variable}
                                                    variant={isValid ? "default" : "destructive"}
                                                    className="text-xs"
                                                  >
                                                    {variable}
                                                    {!isValid && " ⚠️"}
                                                  </Badge>
                                                )
                                              })}
                                            </div>
                                          </div>
                                        )}

                                        <div className="flex items-center justify-between bg-gray-50 p-2 rounded border border-gray-200">
                                          <div className="text-xs text-gray-500">
                                            💡 <strong>Tip:</strong> Puedes hacer clic en las variables para insertarlas en la posición del cursor, o arrastrarlas al texto.
                                          </div>
                                          <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={async () => {
                                              if (!formData.custom_template?.body_content) {
                                                toast.error("Escribe un mensaje primero")
                                                return
                                              }
                                              
                                              try {
                                                const response = await fetch('/api/templates/preview', {
                                                  method: 'POST',
                                                  headers: { 'Content-Type': 'application/json' },
                                                  body: JSON.stringify({
                                                    template: formData.custom_template.body_content,
                                                    platform: selectedBotPlatform,
                                                    promotionId: formData.promotion_id
                                                  })
                                                })
                                                
                                                const result = await response.json()
                                                if (result.success) {
                                                  toast.success("Vista previa", {
                                                    description: result.resolved,
                                                    duration: 6000
                                                  })
                                                } else {
                                                  throw new Error(result.error)
                                                }
                                              } catch (error) {
                                                toast.error("Error generando preview")
                                              }
                                            }}
                                            className="text-xs"
                                          >
                                            <Eye className="h-3 w-3 mr-1" />
                                            Vista Previa
                                          </Button>
                                        </div>
                                      </div>
                                    </div>
                                  </CardContent>
                                </Card>
                              )}
                            </div>
                          )}

                          {/* Lista de plantillas existentes */}
                          <div className="space-y-4">
                            <div className="flex items-center space-x-2">
                              <input
                                type="radio"
                                id="existing-template"
                                name="template-source"
                                value={selectedBotPlatform === 'email' ? "local_db" : "meta_api"}
                                checked={formData.template_source === "local_db" || formData.template_source === "meta_api"}
                                onChange={(e) => {
                                  setFormData({ 
                                    ...formData, 
                                    template_source: e.target.value as any,
                                    custom_template: undefined
                                  })
                                  setShowCustomTemplateForm(false)
                                }}
                              />
                              <Label htmlFor="existing-template" className="text-sm font-medium">
                                {selectedBotPlatform === 'email' 
                                  ? 'Usar plantilla existente' 
                                  : selectedBotPlatform === 'instagram' 
                                    ? 'Usar plantillas de Meta o locales'
                                    : 'Usar plantilla aprobada de Meta'
                                }
                              </Label>
                            </div>

                            {(formData.template_source === "local_db" || formData.template_source === "meta_api") && (
                              <div className="space-y-2 max-h-60 overflow-y-auto">
                                {needsBusinessAccountId ? (
                                  <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                                    <h4 className="font-medium text-blue-800 mb-2">📋 Configuración necesaria para Instagram</h4>
                                    <p className="text-sm text-blue-700 mb-3">
                                      Para usar plantillas de WhatsApp en Instagram, necesitas el Business Account ID de Meta.
                                    </p>
                                    <div className="space-y-4">
                                      <div>
                                        <Label htmlFor="business_account_id" className="text-sm font-medium">
                                          WABA ID (WhatsApp Business Account ID)
                                        </Label>
                                        <Input
                                          id="business_account_id"
                                          value={businessAccountId}
                                          onChange={(e) => setBusinessAccountId(e.target.value)}
                                          placeholder="ej: 1336468254699469"
                                          className="mt-1"
                                        />
                                      </div>
                                      
                                      <div>
                                        <Label htmlFor="access_token" className="text-sm font-medium">
                                          Access Token
                                        </Label>
                                        <Input
                                          id="access_token"
                                          type="password"
                                          value={accessToken}
                                          onChange={(e) => setAccessToken(e.target.value)}
                                          placeholder="EAAjYLYimS1E..."
                                          className="mt-1"
                                        />
                                        <div className="text-xs text-blue-600 mt-1">
                                          <p>Token temporal con permisos: whatsapp_business_management</p>
                                        </div>
                                      </div>
                                      
                                      <div className="text-xs text-green-600 space-y-1">
                                        <p><strong>✅ Datos verificados:</strong></p>
                                        <p>WABA ID: 1336468254699469</p>
                                        <p>Phone Number ID: 851036181423627</p>
                                        <p>Plantillas disponibles: bienvenido, hello_world</p>
                                      </div>
                                      <div className="space-y-2">
                                        <Button 
                                          onClick={fetchTemplatesWithBusinessId}
                                          disabled={!businessAccountId.trim() || !accessToken.trim() || loadingTemplates}
                                          size="sm"
                                          className="w-full"
                                        >
                                          {loadingTemplates ? (
                                            <>
                                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                              Obteniendo plantillas...
                                            </>
                                                                                   ) : (
                                            'Obtener Plantillas'
                                          )}
                                        </Button>
                                        <Button 
                                          onClick={() => {
                                            setBusinessAccountId("1336468254699469")
                                            setAccessToken("EAAjYLYimS1EBP2j6oILI48x55aSeaZC5KgIz46aco6sKZAAGqplZAO1Jd2ZAKmaunKv1PqDXmFZClLQSYbq8mmQvmKmJtdIDYlNrJLhZBQahJJjT1haSiB5tZBjroqkrBegZCAM8zHrbWeqjWZC4NgPS6eqIfSuCJZBjzp2iZByxbPbnDu2PGsGZCqVIo87KXXR0zeZC3V0ZADTYCnx3vuNuhuIlV4564rGmZBfDhojpf00BnzZBXrJv3nENZB7wgO9gtoMJiRIfV64BHUZBBT7wLZBBxJk1YnQbXSG")
                                          }}
                                          disabled={loadingTemplates}
                                          size="sm"
                                          variant="outline"
                                          className="w-full"
                                        >
                                          🚀 Usar datos verificados
                                        </Button>
                                      </div>
                                    </div>
                                  </div>
                                ) : templates.length === 0 ? (
                                  <div className="text-center py-8 text-muted-foreground">
                                    {selectedBotPlatform === 'email' 
                                      ? 'No tienes plantillas de email. Crea una personalizada arriba.'
                                      : 'No hay plantillas disponibles.'
                                    }
                                  </div>
                                ) : (
                                  templates.map((template) => (
                                    <Card 
                                      key={template.id}
                                      className={cn(
                                        "cursor-pointer transition-all border-2",
                                        formData.selected_template?.id === template.id
                                          ? "border-primary bg-primary/5"
                                          : template.can_use 
                                            ? "border-muted hover:border-primary/50"
                                            : "border-red-200 bg-red-50 opacity-60"
                                      )}
                                      onClick={() => {
                                        if (template.can_use) {
                                          setFormData({ 
                                            ...formData, 
                                            selected_template: template,
                                            template_id: template.id
                                          })
                                        }
                                      }}
                                    >
                                      <CardContent className="p-3">
                                        <div className="flex items-start justify-between">
                                          <div className="flex-1">
                                            <div className="flex items-center gap-2">
                                              <h4 className="font-medium text-sm">{template.name}</h4>
                                              <Badge 
                                                variant={template.can_use ? "default" : "destructive"}
                                                className="text-xs"
                                              >
                                                {template.status}
                                              </Badge>
                                            </div>
                                            {template.subject && (
                                              <p className="text-xs text-muted-foreground mt-1">
                                                <strong>Asunto:</strong> {template.subject}
                                              </p>
                                            )}
                                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                              {template.body_content}
                                            </p>
                                            {template.variables.length > 0 && (
                                              <div className="flex flex-wrap gap-1 mt-2">
                                                {template.variables.map((variable, idx) => (
                                                  <code key={idx} className="bg-muted px-1 rounded text-xs">
                                                    {variable}
                                                  </code>
                                                ))}
                                              </div>
                                            )}
                                          </div>
                                          {formData.selected_template?.id === template.id && (
                                            <CheckCircle className="h-4 w-4 text-primary flex-shrink-0" />
                                          )}
                                        </div>
                                      </CardContent>
                                    </Card>
                                  ))
                                )}
                              </div>
                            )}
                          </div>


                        </>
                      )}
                    </CardContent>
                  </Card>
                </motion.div>
              )}

              {/* Step 5: Variables Configuration */}
              {currentStep === 5 && (
                <motion.div variants={fadeInUp} className="space-y-4 sm:space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                        <Settings className="h-4 w-4 sm:h-5 sm:w-5" />
                        Configuración de Variables
                      </CardTitle>
                      <CardDescription className="text-xs sm:text-sm">
                        Asigna los datos del sistema a las variables de tu plantilla
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {formData.template_source === "meta_api" && 
                       formData.selected_template && 
                       formData.selected_template.variables.length > 0 ? (
                        <div className="space-y-6">
                          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                            <div className="flex items-start gap-3">
                              <Info className="h-5 w-5 text-yellow-600 mt-0.5" />
                              <div>
                                <h4 className="text-sm font-medium text-yellow-800">Variables Dinámicas Detectadas</h4>
                                <p className="text-xs text-yellow-700 mt-1">
                                  La plantilla seleccionada <strong>"{formData.selected_template.name}"</strong> utiliza variables dinámicas ({"{{1}}"}, {"{{2}}"}, etc.). 
                                  Debes asignar qué dato del sistema corresponde a cada una.
                                </p>
                              </div>
                            </div>
                          </div>

                          <div className="grid gap-4 sm:grid-cols-2">
                            {formData.selected_template.variables.map((variable, idx) => (
                              <div key={idx} className="space-y-2 p-4 border rounded-lg bg-muted/20">
                                <Label className="text-sm font-medium flex items-center gap-2 mb-2">
                                  <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">
                                    {variable.replace('var_', '')}
                                  </Badge>
                                  <span className="text-muted-foreground text-xs">corresponde a:</span>
                                </Label>
                                <Select
                                  value={formData.variable_mapping[variable] || ""}
                                  onValueChange={(value) => {
                                    setFormData(prev => ({
                                      ...prev,
                                      variable_mapping: {
                                        ...prev.variable_mapping,
                                        [variable]: value
                                      }
                                    }))
                                  }}
                                >
                                  <SelectTrigger className="w-full">
                                    <SelectValue placeholder="Seleccionar dato..." />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {Object.entries(groupedVariables).map(([type, vars]) => (
                                      <div key={type}>
                                        <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground bg-muted/50 sticky top-0 z-10">
                                          {getVariableTypeLabel(type)}
                                        </div>
                                        {vars.map((v) => (
                                          <SelectItem key={v.name} value={v.name}>
                                            <div className="flex flex-col py-0.5">
                                              <span className="font-medium">{v.name}</span>
                                              <span className="text-xs text-muted-foreground">{v.example}</span>
                                            </div>
                                          </SelectItem>
                                        ))}
                                      </div>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="text-center py-8 text-muted-foreground">
                          <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-500" />
                          <p>Esta plantilla no requiere configuración de variables.</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </motion.div>
              )}

              {/* Step 6: Review */}
              {currentStep === 6 && (
                <motion.div variants={fadeInUp} className="space-y-4 sm:space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                        <Eye className="h-4 w-4 sm:h-5 sm:w-5" />
                        Revisión Final
                      </CardTitle>
                      <CardDescription className="text-xs sm:text-sm">
                        Verifica la configuración antes de crear la automatización
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {(() => {
                        const { triggerConfig, selectedBot, messagePreview } = getPreviewData()
                        
                        return (
                          <>
                            <div className="grid gap-4 sm:gap-6">
                              <div className="space-y-2">
                                <h4 className="font-medium text-sm">Información General</h4>
                                <div className="bg-muted/50 p-3 rounded-lg space-y-2 text-xs sm:text-sm">
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">Nombre:</span>
                                    <span className="font-medium">{formData.name}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">Bot:</span>
                                    <span className="font-medium">{selectedBot?.name}</span>
                                  </div>
                                </div>
                              </div>

                              <div className="space-y-2">
                                <h4 className="font-medium text-sm">Disparador</h4>
                                <div className="bg-muted/50 p-3 rounded-lg">
                                  <div className="flex items-center gap-2">
                                    {triggerConfig && (
                                      <>
                                        <div className={cn("p-2 rounded text-white", triggerConfig.color)}>
                                          <triggerConfig.icon className="h-4 w-4" />
                                        </div>
                                        <div>
                                          <div className="font-medium text-sm">{triggerConfig.label}</div>
                                          <div className="text-xs text-muted-foreground">
                                            {formData.trigger_type === "birthday" &&
                                              `${formData.trigger_config.days_before || 0} días antes`}
                                            {formData.trigger_type === "inactive_client" &&
                                              `Después de ${formData.trigger_config.inactive_days || 30} días`}
                                            {formData.trigger_type === "new_promotion" &&
                                              (formData.trigger_config.send_immediately ? "Envío inmediato" : "Envío programado")}
                                          </div>
                                        </div>
                                      </>
                                    )}
                                  </div>
                                </div>
                              </div>

                              <div className="space-y-2">
                                <h4 className="font-medium text-sm">Vista Previa del Mensaje</h4>
                                <div className="bg-white p-3 border rounded-lg text-sm">
                                  {messagePreview}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center space-x-2 pt-4">
                              <Switch
                                id="is-active"
                                checked={formData.is_active}
                                onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                              />
                              <Label htmlFor="is-active" className="text-sm">
                                Activar automatización inmediatamente
                              </Label>
                            </div>
                          </>
                        )
                      })()}
                    </CardContent>
                  </Card>
                </motion.div>
              )}
            </motion.div>
          </AnimatePresence>

          {/* Navigation Buttons */}
          <div className="flex items-center justify-between pt-4 sm:pt-6 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={prevStep}
              disabled={currentStep === 1}
              className="text-xs sm:text-sm"
            >
              <ChevronLeft className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
              Anterior
            </Button>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                className="text-xs sm:text-sm"
              >
                Cancelar
              </Button>

              {currentStep < steps.length ? (
                <Button
                  onClick={nextStep}
                  disabled={!isStepValid()}
                  className="text-xs sm:text-sm"
                >
                  Siguiente
                  <ChevronRight className="h-3 w-3 sm:h-4 sm:w-4 ml-1" />
                </Button>
              ) : (
                <Button
                  onClick={handleCreateAutomation}
                  disabled={isLoading || !isStepValid() || !canCreateAutomation}
                  className="text-xs sm:text-sm"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="h-3 w-3 sm:h-4 sm:w-4 mr-2 animate-spin" />
                      Creando...
                    </>
                  ) : (
                    <>
                      <Send className="h-3 w-3 sm:h-4 sm:w-4 mr-2" />
                      Crear Automatización
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}