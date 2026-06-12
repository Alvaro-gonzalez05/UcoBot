"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { motion, AnimatePresence } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import {
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  Instagram,
  Mail,
  Bot,
  Key,
  Facebook,
  CheckCircle,
  Sparkles,
  Crown,
  TestTube,
  Check,
  Loader2,
  Plus,
  X,
} from "lucide-react"
import { FaWhatsapp, FaFacebookMessenger } from "react-icons/fa"

interface BotFormData {
  name: string
  platform: "whatsapp" | "instagram" | "messenger" | "email" | ""
  platforms: string[]
  personality_prompt: string
  features: string[]
  allowed_tags: string[]
  gemini_api_key: string
  facebook_page_access_token?: string
  facebook_page_id?: string
  facebook_app_id?: string
  facebook_app_secret?: string
  whatsapp_phone_number_id?: string
  whatsapp_access_token?: string
  whatsapp_webhook_verify_token?: string
  whatsapp_business_account_id?: string
}

interface UserSubscription {
  subscription_status: string
  plan_type: string
  trial_end_date: string | null
  subscription_end_date: string | null
  max_automations: number
}

interface MultiStepBotCreationProps {
  isOpen: boolean
  onClose: () => void
  onBotCreated: (bot: any) => void
  userId: string
}

const platformIcons = {
  whatsapp: FaWhatsapp,
  instagram: Instagram,
  messenger: FaFacebookMessenger,
}

const platformLabels = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  messenger: "Messenger",
}

const availableFeatures = [
  { id: "take_orders", label: "Tomar pedidos" },
  { id: "take_reservations", label: "Tomar reservas" },
  { id: "register_clients", label: "Registro de clientes" },
  { id: "loyalty_points", label: "Consulta de puntos de fidelización" },
]

const steps = [
  { id: "platform", title: "Plataforma" },
  { id: "config", title: "Configuración" },
  { id: "ai", title: "IA" },
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

export function MultiStepBotCreation({ isOpen, onClose, onBotCreated, userId }: MultiStepBotCreationProps) {
  const [currentStep, setCurrentStep] = useState(1)
  const [isLoading, setIsLoading] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const [metaBusinessSetupCompleted, setMetaBusinessSetupCompleted] = useState(false)
  const [tokensConfigured, setTokensConfigured] = useState(false)
  const [userSubscription, setUserSubscription] = useState<UserSubscription | null>(null)
  const [tagInput, setTagInput] = useState("")
  const supabase = createClient()

  const [formData, setFormData] = useState<BotFormData>({
    name: "",
    platform: "",
    platforms: [],
    personality_prompt: "",
    features: [],
    allowed_tags: [],
    gemini_api_key: "",
    facebook_page_access_token: "",
    facebook_page_id: "",
    facebook_app_id: "",
    facebook_app_secret: "",
    whatsapp_phone_number_id: "",
    whatsapp_access_token: "",
    whatsapp_webhook_verify_token: `bot_${Math.random().toString(36).substring(2, 15)}_${Date.now()}`,
  })

  useEffect(() => {
    if (isOpen && userId) {
      fetchUserSubscription()
    }
  }, [isOpen, userId])

  const fetchUserSubscription = async () => {
    try {
      const { data, error } = await supabase
        .from("user_profiles")
        .select("subscription_status, plan_type, trial_end_date, subscription_end_date")
        .eq("id", userId)
        .single()

      if (error) {
        console.log("[v0] Subscription columns not found, using defaults:", error.message)
        setUserSubscription({
          subscription_status: "trial",
          plan_type: "trial",
          trial_end_date: null,
          subscription_end_date: null,
          max_automations: 0,
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
        trial_end_date: null,
        subscription_end_date: null,
        max_automations: 0,
      })
    }
  }

  const hasPaidSubscription = () => {
    return userSubscription?.plan_type !== "trial" && userSubscription?.subscription_status === "active"
  }

  const shouldShowPlatformSteps = () => {
    return hasPaidSubscription() && formData.platforms.some((p) => p === "whatsapp" || p === "instagram")
  }

  const togglePlatform = (platformId: string) => {
    setFormData((prev) => {
      const next = prev.platforms.includes(platformId)
        ? prev.platforms.filter((p) => p !== platformId)
        : [...prev.platforms, platformId]
      return {
        ...prev,
        platforms: next,
        // `platform` (legacy) refleja el primer canal para compatibilidad
        platform: (next[0] || "") as BotFormData["platform"],
      }
    })
  }

  const getTotalSteps = () => {
    return 3
  }

  const resetForm = () => {
    setFormData({
      name: "",
      platform: "",
      platforms: [],
      personality_prompt: "",
      features: [],
      gemini_api_key: "",
      facebook_page_access_token: "",
      facebook_page_id: "",
      facebook_app_id: "",
      facebook_app_secret: "",
      whatsapp_phone_number_id: "",
      whatsapp_access_token: "",
      whatsapp_webhook_verify_token: "",
    })
    setCurrentStep(1)
    setShowSuccess(false)
    setMetaBusinessSetupCompleted(false)
    setTokensConfigured(false)
  }

  const handleClose = () => {
    resetForm()
    onClose()
  }

  const nextStep = () => {
    const totalSteps = getTotalSteps()
    if (currentStep < totalSteps) {
      setCurrentStep(currentStep + 1)
    }
  }

  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1)
    }
  }

  const handleFeatureChange = (featureId: string, checked: boolean) => {
    if (checked) {
      setFormData({ ...formData, features: [...formData.features, featureId] })
    } else {
      setFormData({ ...formData, features: formData.features.filter((f) => f !== featureId) })
    }
  }

  const handleCreateBot = async () => {
    setIsLoading(true)

    try {
      // Solo enviar campos que existen en la tabla bots
      const botData = {
        name: formData.name,
        platform: formData.platforms[0] || formData.platform,
        platforms: formData.platforms,
        personality_prompt: formData.personality_prompt,
        features: formData.features,
        gemini_api_key: formData.gemini_api_key,
        user_id: userId,
        is_active: true,
        automations: [], // Por defecto vacío
      }

      const { data: bot, error } = await supabase
        .from("bots")
        .insert([botData])
        .select()
        .single()

      if (error) throw error

      // Si incluye WhatsApp, crear integración con token por defecto (para configurar luego)
      if (formData.platforms.includes("whatsapp")) {
        const defaultVerifyToken = `verify_${bot.id}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
        
        const whatsappData = {
          user_id: userId,
          bot_id: bot.id,
          phone_number_id: "pending_configuration", // Placeholder hasta configurar Meta
          access_token: "pending_configuration", // Placeholder hasta configurar Meta
          webhook_verify_token: defaultVerifyToken,
          business_account_id: "pending_configuration", // Placeholder hasta configurar Meta
          webhook_url: `${window.location.origin}/api/whatsapp/webhook`,
          is_active: false, // Desactivado hasta completar configuración
          is_verified: false
        }

        const { error: whatsappError } = await supabase
          .from("whatsapp_integrations")
          .insert([whatsappData])

        if (whatsappError) {
          console.error("Error creating WhatsApp integration:", whatsappError)
          // No fallar la creación del bot por esto, solo mostrar advertencia
          toast.error("Bot creado pero hubo un error preparando la integración de WhatsApp", {
            description: "Podrás configurar WhatsApp más tarde desde las opciones del bot.",
            duration: 6000,
          })
        }
      }

      setShowSuccess(true)

      setTimeout(() => {
        onBotCreated(bot)
        handleClose()
        
        // Emit custom event to update sidebar navigation
        window.dispatchEvent(new CustomEvent('botCreated', { detail: bot }))
        
        toast.success(`Bot "${bot.name}" creado exitosamente`, {
          description: formData.platforms.includes("whatsapp")
            ? "Tu bot está listo. Para usarlo con WhatsApp, configura la integración con Meta Business Suite desde las opciones del bot."
            : "Tu bot está listo. Puedes probarlo en la sección de pruebas.",
          duration: 4000,
        })
      }, 3000)
    } catch (error) {
      console.error("Error creating bot:", error)
      toast.error("Error al crear el bot", {
        description: "No se pudo crear el bot. Inténtalo de nuevo.",
        duration: 4000,
      })
    } finally {
      setIsLoading(false)
    }
  }

  const isStepValid = () => {
    switch (currentStep) {
      case 1:
        return formData.platforms.length > 0
      case 2:
        return formData.name.trim() !== "" && formData.personality_prompt.trim() !== ""
      case 3:
        return formData.gemini_api_key.trim() !== ""
      default:
        return true
    }
  }

  const canProceedStep1 = formData.platforms.length > 0
  const canProceedStep2 = formData.name.trim() !== "" && formData.personality_prompt.trim() !== ""
  const canProceedStep3 = formData.gemini_api_key.trim() !== ""

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
              <h3 className="text-xl font-bold text-green-600">¡Bot Creado Exitosamente!</h3>
              <p className="text-muted-foreground">Tu bot está listo para comenzar a trabajar</p>
            </div>
            <div className="w-full bg-green-100 rounded-full h-2">
              <div className="bg-green-600 h-2 rounded-full animate-pulse" style={{ width: "100%" }}></div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  const totalSteps = getTotalSteps()

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl max-h-[95vh] sm:max-h-[90vh] overflow-y-auto mx-4 sm:mx-0">
        <DialogHeader className="px-4 sm:px-6 pt-4 sm:pt-6">
          <DialogTitle className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
            <div className="flex items-center gap-2">
              <Bot className="h-4 w-4 sm:h-5 sm:w-5" />
              <span className="text-base sm:text-lg">Crear Nuevo Bot</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm sm:text-base">Paso {currentStep} de {totalSteps}</span>
              {userSubscription && (
                <Badge variant={hasPaidSubscription() ? "default" : "secondary"} className="text-xs">
                  {hasPaidSubscription() ? (
                    <>
                      <Crown className="h-3 w-3 mr-1" />
                      Premium
                    </>
                  ) : (
                    <>
                      <TestTube className="h-3 w-3 mr-1" />
                      Prueba
                    </>
                  )}
                </Badge>
              )}
            </div>
          </DialogTitle>
          <DialogDescription className="text-sm sm:text-base">
            Configura tu chatbot paso a paso para obtener los mejores resultados
          </DialogDescription>
        </DialogHeader>

        {/* Progress indicator */}
        <motion.div
          className="mb-8"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="flex justify-between mb-2">
            {steps.slice(0, getTotalSteps()).map((step, index) => (
              <motion.div
                key={index}
                className="flex flex-col items-center"
                whileHover={{ scale: 1.1 }}
              >
                <motion.div
                  className={cn(
                    "w-4 h-4 rounded-full cursor-pointer transition-colors duration-300",
                    index < currentStep - 1
                      ? "bg-primary"
                      : index === currentStep - 1
                        ? "bg-primary ring-4 ring-primary/20"
                        : "bg-muted",
                  )}
                  onClick={() => {
                    if (index <= currentStep - 1) {
                      setCurrentStep(index + 1)
                    }
                  }}
                  whileTap={{ scale: 0.95 }}
                />
                <motion.span
                  className={cn(
                    "text-xs mt-1.5 hidden sm:block",
                    index === currentStep - 1
                      ? "text-primary font-medium"
                      : "text-muted-foreground",
                  )}
                >
                  {step.title}
                </motion.span>
              </motion.div>
            ))}
          </div>
          <div className="w-full bg-muted h-1.5 rounded-full overflow-hidden mt-2">
            <motion.div
              className="h-full bg-primary"
              initial={{ width: 0 }}
              animate={{ width: `${((currentStep - 1) / (getTotalSteps() - 1)) * 100}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
        </motion.div>

        {/* Form card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <Card className="border shadow-md rounded-3xl overflow-hidden">
            <div>
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentStep}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  variants={contentVariants}
                >
                  {/* Step 1: Platform Selection */}
                  {currentStep === 1 && (
                    <>
                      <CardHeader className="px-4 sm:px-6 pt-4 sm:pt-6">
                        <CardTitle className="text-lg sm:text-xl">Selecciona la Plataforma</CardTitle>
                        <CardDescription className="text-sm sm:text-base">
                          ¿En qué plataforma quieres que funcione tu bot?
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3 sm:space-y-4 px-4 sm:px-6 pb-4 sm:pb-6">
                        <motion.div variants={fadeInUp} className="space-y-3 sm:space-y-4">
                          <Label className="text-sm sm:text-base font-medium">Seleccioná los canales (uno o varios)</Label>
                          <div className="space-y-2 sm:space-y-3">
                            {Object.entries(platformLabels).map(([key, label], index) => {
                              const Icon = platformIcons[key as keyof typeof platformIcons]
                              const selected = formData.platforms.includes(key)
                              return (
                                <motion.div
                                  key={key}
                                  className={cn(
                                    "flex items-center space-x-2 sm:space-x-3 rounded-md border p-3 sm:p-4 cursor-pointer transition-colors group",
                                    selected ? "bg-accent" : "hover:bg-accent"
                                  )}
                                  whileHover={{ scale: 1.02 }}
                                  whileTap={{ scale: 0.98 }}
                                  transition={{ duration: 0.2 }}
                                  initial={{ opacity: 0, y: 10 }}
                                  animate={{
                                    opacity: 1,
                                    y: 0,
                                    transition: {
                                      delay: 0.1 * index,
                                      duration: 0.3,
                                    },
                                  }}
                                  onMouseEnter={e => {
                                    e.currentTarget.classList.add('hovered')
                                  }}
                                  onMouseLeave={e => {
                                    e.currentTarget.classList.remove('hovered')
                                  }}
                                  onClick={() => togglePlatform(key)}
                                >
                                  <Checkbox
                                    checked={selected}
                                    id={`platform-${key}`}
                                    className="flex-shrink-0 pointer-events-none"
                                  />
                                  <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                                    <Icon className={cn("h-5 w-5 sm:h-6 sm:w-6 transition-colors flex-shrink-0", selected ? "text-white" : "text-primary group-hover:text-white")} />
                                    <div className={cn("flex-1 min-w-0", selected ? "text-white" : "group-hover:text-white")}>
                                      <Label htmlFor={`platform-${key}`} className={cn("cursor-pointer text-sm sm:text-base font-medium transition-colors pointer-events-none", selected ? "text-white" : "group-hover:text-white")}>
                                        {label}
                                      </Label>
                                      <p className={cn("text-xs sm:text-sm mt-1 transition-colors", selected ? "text-white" : "text-muted-foreground group-hover:text-white")}>
                                        {key === "whatsapp" && "Ideal para atención al cliente directa"}
                                        {key === "instagram" && "Perfecto para engagement en redes sociales"}
                                        {key === "messenger" && "Atendé los mensajes de tu página de Facebook"}
                                      </p>
                                    </div>
                                    {!hasPaidSubscription() && (
                                      <Badge variant="outline" className={cn("text-xs transition-colors flex-shrink-0", selected ? "text-white border-white" : "group-hover:text-white group-hover:border-white")}>
                                        <span className="hidden sm:inline">Solo prueba</span>
                                        <span className="sm:hidden">Prueba</span>
                                      </Badge>
                                    )}
                                  </div>
                                </motion.div>
                              )
                            })}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            El mismo bot atiende todos los canales que elijas, con una sola configuración.
                          </p>
                        </motion.div>

                        {!hasPaidSubscription() && (
                          <motion.div variants={fadeInUp}>
                            <Card className="border-blue-200 bg-blue-50">
                              <CardContent className="p-4">
                                <div className="flex items-start gap-3">
                                  <TestTube className="h-5 w-5 text-blue-600 mt-0.5" />
                                  <div>
                                    <h4 className="font-medium text-blue-800">Modo Prueba</h4>
                                    <p className="text-sm text-blue-700 mt-1">
                                      En tu plan gratuito, los bots se crean para prueba interna. Para conectar a plataformas reales,
                                      actualiza tu plan.
                                    </p>
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          </motion.div>
                        )}
                      </CardContent>
                    </>
                  )}

                  {/* Step 2: Bot Configuration */}
                  {currentStep === 2 && (
                    <>
                      <CardHeader className="px-4 sm:px-6 pt-4 sm:pt-6">
                        <CardTitle className="text-lg sm:text-xl">Configura tu Bot</CardTitle>
                        <CardDescription className="text-sm sm:text-base">
                          Dale personalidad y nombre a tu asistente virtual
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3 sm:space-y-4 px-4 sm:px-6 pb-4 sm:pb-6">
                        <motion.div variants={fadeInUp} className="space-y-2">
                          <Label htmlFor="bot-name" className="text-sm sm:text-base font-medium">Nombre del Bot *</Label>
                          <Input
                            id="bot-name"
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            placeholder="Asistente Virtual de Mi Negocio"
                            className="text-sm sm:text-base transition-all duration-300 focus:ring-2 focus:ring-primary/20 focus:border-primary"
                          />
                        </motion.div>

                        <motion.div variants={fadeInUp} className="space-y-2">
                          <Label htmlFor="personality" className="text-sm sm:text-base font-medium">Personalidad y Prompt *</Label>
                          <Textarea
                            id="personality"
                            value={formData.personality_prompt}
                            onChange={(e) => setFormData({ ...formData, personality_prompt: e.target.value })}
                            placeholder="Eres un asistente amigable y profesional que ayuda a los clientes de [tu negocio]. Siempre respondes de manera cortés y útil..."
                            rows={4}
                            className="min-h-[100px] sm:min-h-[120px] text-sm sm:text-base transition-all duration-300 focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
                          />
                          <p className="text-xs text-muted-foreground">
                            Define cómo debe comportarse tu bot, su tono de voz y estilo de comunicación
                          </p>
                        </motion.div>

                        <motion.div variants={fadeInUp} className="space-y-2">
                          <Label htmlFor="allowed_tags" className="text-sm sm:text-base font-medium">Etiquetas Permitidas (Opcional)</Label>
                          <div className="space-y-2">
                            <div className="flex gap-2">
                              <Input
                                id="allowed_tags"
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
                                className="text-sm sm:text-base transition-all duration-300 focus:ring-2 focus:ring-primary/20 focus:border-primary"
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
                              <div className="flex flex-wrap gap-2 mt-2">
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
                        </motion.div>

                        <motion.div variants={fadeInUp} className="space-y-2">
                          <Label className="text-sm sm:text-base font-medium">Funcionalidades del Bot</Label>
                          <div className="grid grid-cols-1 gap-2 sm:gap-3">
                            {availableFeatures.map((feature, index) => (
                              <motion.div
                                key={feature.id}
                                className="flex items-center space-x-2 sm:space-x-3 rounded-md border p-2 sm:p-3 cursor-pointer hover:bg-accent transition-colors"
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                                transition={{ duration: 0.2 }}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{
                                  opacity: 1,
                                  y: 0,
                                  transition: {
                                    delay: 0.05 * index,
                                    duration: 0.3,
                                  },
                                }}
                                onClick={() =>
                                  handleFeatureChange(feature.id, !formData.features.includes(feature.id))
                                }
                              >
                                <Checkbox
                                  id={feature.id}
                                  checked={formData.features.includes(feature.id)}
                                  onCheckedChange={(checked) => handleFeatureChange(feature.id, checked as boolean)}
                                />
                                <Label htmlFor={feature.id} className="cursor-pointer w-full text-sm">
                                  {feature.label}
                                </Label>
                              </motion.div>
                            ))}
                          </div>
                        </motion.div>
                      </CardContent>
                    </>
                  )}

                  {/* Step 3: AI Configuration */}
                  {currentStep === 3 && (
                    <>
                      <CardHeader>
                        <CardTitle className="text-lg sm:text-xl">Configuración de IA</CardTitle>
                        <CardDescription className="text-sm sm:text-base">
                          Conecta tu API de Gemini para que el bot funcione
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3 sm:space-y-4 px-4 sm:px-6 pb-4 sm:pb-6">
                        <motion.div variants={fadeInUp}>
                          <Card className="border-amber-200 bg-amber-50">
                            <CardContent className="p-3 sm:p-4">
                              <div className="flex items-start gap-2 sm:gap-3">
                                <Key className="h-4 w-4 sm:h-5 sm:w-5 text-amber-600 mt-0.5 flex-shrink-0" />
                                <div className="min-w-0">
                                  <h4 className="text-sm sm:text-base font-medium text-amber-800">¿Cómo obtener tu API Key?</h4>
                                  <ol className="text-xs sm:text-sm text-amber-700 mt-2 space-y-1">
                                    <li>
                                      1. Ve a{" "}
                                      <a
                                        href="https://aistudio.google.com/"
                                        target="_blank"
                                        className="underline"
                                        rel="noreferrer"
                                      >
                                        aistudio.google.com
                                      </a>
                                    </li>
                                    <li>2. Inicia sesión o crea una cuenta</li>
                                    <li>3. Ve a "API Keys" y crea una nueva clave</li>
                                    <li>4. Copia la clave y pégala aquí abajo</li>
                                  </ol>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        </motion.div>

                        <motion.div variants={fadeInUp} className="space-y-2">
                          <Label htmlFor="gemini-key" className="text-sm sm:text-base font-medium">API Key de Gemini *</Label>
                          <Input
                            id="gemini-key"
                            type="password"
                            value={formData.gemini_api_key}
                            onChange={(e) => setFormData({ ...formData, gemini_api_key: e.target.value })}
                            placeholder="AIza..."
                            className="transition-all duration-300 focus:ring-2 focus:ring-primary/20 focus:border-primary"
                          />
                          <p className="text-xs text-muted-foreground">
                            Tu clave API se almacena de forma segura y solo se usa para tu bot
                          </p>
                        </motion.div>

                        {!hasPaidSubscription() && (
                          <motion.div variants={fadeInUp}>
                            <Card className="border-green-200 bg-green-50">
                              <CardContent className="p-4">
                                <div className="text-center">
                                  <CheckCircle className="h-8 w-8 text-green-600 mx-auto mb-2" />
                                  <h4 className="font-medium text-green-800">¡Casi listo!</h4>
                                  <p className="text-sm text-green-700">
                                    Tu bot se creará para pruebas internas. Podrás probarlo desde la sección de prueba.
                                  </p>
                                </div>
                              </CardContent>
                            </Card>
                          </motion.div>
                        )}
                      </CardContent>
                    </>
                  )}

                  {/* Step 4: Meta Business Suite Setup Instructions */}
                  {currentStep === 4 && shouldShowPlatformSteps() && (
                    <>
                      <CardHeader>
                        <CardTitle>
                          Configurar Meta Business Suite
                        </CardTitle>
                        <CardDescription>
                          Antes de configurar los tokens, necesitas crear tu aplicación en Meta Business Suite
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-6">
                        <motion.div variants={fadeInUp}>
                          <Card className="border-blue-200 bg-blue-50">
                            <CardContent className="p-4">
                              <div className="flex items-start gap-3">
                                <Facebook className="h-5 w-5 text-blue-600 mt-0.5" />
                                <div>
                                  <h4 className="font-medium text-blue-800">Paso 1: Accede a Meta Business Suite</h4>
                                  <p className="text-sm text-blue-700 mt-1">
                                    Si no tienes una cuenta comercial, necesitarás crearla primero
                                  </p>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        </motion.div>

                        <motion.div variants={fadeInUp} className="space-y-4">
                          <div className="bg-white border rounded-lg p-4 space-y-4">
                            <div className="flex items-center justify-between">
                              <h3 className="font-medium">Instrucciones paso a paso:</h3>
                              <Badge variant="outline">Requerido</Badge>
                            </div>
                            
                            <div className="space-y-3 text-sm">
                              <div className="flex gap-3">
                                <div className="bg-blue-100 text-blue-800 rounded-full w-6 h-6 flex items-center justify-center text-xs font-medium">1</div>
                                <div>
                                  <p className="font-medium">Ir a Meta Business Suite</p>
                                  <p className="text-gray-600">Visita <code className="bg-gray-100 px-2 py-1 rounded text-xs">creators.facebook.com/tools/meta-business-suite</code></p>
                                </div>
                              </div>

                              <div className="flex gap-3">
                                <div className="bg-blue-100 text-blue-800 rounded-full w-6 h-6 flex items-center justify-center text-xs font-medium">2</div>
                                <div>
                                  <p className="font-medium">Crear Portfolio Comercial</p>
                                  <p className="text-gray-600">Si ya tienes uno, puedes saltarte este paso</p>
                                </div>
                              </div>

                              <div className="flex gap-3">
                                <div className="bg-blue-100 text-blue-800 rounded-full w-6 h-6 flex items-center justify-center text-xs font-medium">3</div>
                                <div>
                                  <p className="font-medium">Ir a Configuraciones → Apps</p>
                                  <p className="text-gray-600">En el panel del portfolio comercial</p>
                                </div>
                              </div>

                              <div className="flex gap-3">
                                <div className="bg-blue-100 text-blue-800 rounded-full w-6 h-6 flex items-center justify-center text-xs font-medium">4</div>
                                <div>
                                  <p className="font-medium">Crear Nueva App</p>
                                  <p className="text-gray-600">Seleccionar "Crear un nuevo identificador de la app"</p>
                                </div>
                              </div>

                              <div className="flex gap-3">
                                <div className="bg-orange-100 text-orange-800 rounded-full w-6 h-6 flex items-center justify-center text-xs font-medium">⚠️</div>
                                <div>
                                  <p className="font-medium text-orange-800">IMPORTANTE: Configuración de la App</p>
                                  <ul className="text-gray-600 ml-4 list-disc space-y-1">
                                    <li><strong>Caso de uso:</strong> Seleccionar "OTRO"</li>
                                    <li><strong>Tipo de app:</strong> Seleccionar "NEGOCIOS"</li>
                                  </ul>
                                </div>
                              </div>

                              <div className="flex gap-3">
                                <div className="bg-green-100 text-green-800 rounded-full w-6 h-6 flex items-center justify-center text-xs font-medium">5</div>
                                <div>
                                  <p className="font-medium">Agregar Productos</p>
                                  <p className="text-gray-600">
                                    Una vez creada la app, agregar{" "}
                                    {formData.platform === "whatsapp" 
                                      ? "WhatsApp Business Platform para obtener Phone Number ID y Access Token"
                                      : "Instagram Basic Display API para obtener tokens de acceso"
                                    }
                                  </p>
                                </div>
                              </div>
                            </div>

                            <div className="border-t pt-4">
                              <Button
                                variant="outline"
                                className="w-full"
                                onClick={() => window.open('https://creators.facebook.com/tools/meta-business-suite/?locale=es_LA', '_blank')}
                              >
                                <Facebook className="h-4 w-4 mr-2" />
                                Abrir Meta Business Suite
                              </Button>
                            </div>
                          </div>
                        </motion.div>

                        <motion.div variants={fadeInUp}>
                          <Card className="border-green-200 bg-green-50">
                            <CardContent className="p-4">
                              <div className="flex items-center gap-3">
                                <Checkbox 
                                  id="meta-setup-completed"
                                  checked={metaBusinessSetupCompleted}
                                  onCheckedChange={(checked) => setMetaBusinessSetupCompleted(!!checked)}
                                />
                                <Label htmlFor="meta-setup-completed" className="text-sm text-green-800">
                                  He completado la configuración en Meta Business Suite y tengo mis tokens listos
                                </Label>
                              </div>
                            </CardContent>
                          </Card>
                        </motion.div>
                      </CardContent>
                    </>
                  )}

                  {/* Step 5: Token Configuration */}
                  {currentStep === 5 && shouldShowPlatformSteps() && (
                    <>
                      <CardHeader>
                        <CardTitle>
                          Configuración de {platformLabels[formData.platform as keyof typeof platformLabels]}
                        </CardTitle>
                        <CardDescription>
                          {formData.platform === "whatsapp" && "Configura los tokens de WhatsApp Business API"}
                          {formData.platform === "instagram" && "Conecta tu cuenta de Instagram Business"}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {formData.platform === "whatsapp" && (
                          <div className="space-y-4">
                            <motion.div variants={fadeInUp} className="space-y-2">
                              <Label htmlFor="wa-access-token">WhatsApp Access Token *</Label>
                              <Input
                                id="wa-access-token"
                                type="password"
                                value={formData.whatsapp_access_token}
                                onChange={(e) => setFormData({ ...formData, whatsapp_access_token: e.target.value })}
                                placeholder="EAAxxxxx..."
                                className="transition-all duration-300 focus:ring-2 focus:ring-primary/20 focus:border-primary"
                              />
                            </motion.div>

                            <motion.div variants={fadeInUp} className="space-y-2">
                              <Label htmlFor="wa-phone-id">Phone Number ID *</Label>
                              <Input
                                id="wa-phone-id"
                                value={formData.whatsapp_phone_number_id}
                                onChange={(e) => setFormData({ ...formData, whatsapp_phone_number_id: e.target.value })}
                                placeholder="123456789..."
                                className="transition-all duration-300 focus:ring-2 focus:ring-primary/20 focus:border-primary"
                              />
                            </motion.div>



                            <motion.div variants={fadeInUp}>
                              <Card className="border-blue-200 bg-blue-50">
                                <CardContent className="p-4">
                                  <div className="text-center">
                                    <TestTube className="h-8 w-8 text-blue-600 mx-auto mb-2" />
                                    <h4 className="font-medium text-blue-800">
                                      {!hasPaidSubscription() ? "Modo de Prueba Activado" : "¿No tienes los tokens aún?"}
                                    </h4>
                                    <p className="text-sm text-blue-700 mb-3">
                                      {!hasPaidSubscription() 
                                        ? "Como usuario de prueba, puedes crear el bot sin configurar WhatsApp y probarlo en la sección de pruebas."
                                        : "Puedes crear el bot sin tokens y configurarlos después. También podrás conectar WhatsApp más tarde."}
                                    </p>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => {
                                        setFormData({
                                          ...formData,
                                          whatsapp_access_token: "",
                                          whatsapp_phone_number_id: "",
                                          whatsapp_webhook_verify_token: "",
                                        })
                                        handleCreateBot()
                                      }}
                                      disabled={isLoading}
                                    >
                                      {!hasPaidSubscription() ? "Crear Bot de Prueba" : "Crear Bot sin WhatsApp"}
                                    </Button>
                                  </div>
                                </CardContent>
                              </Card>
                            </motion.div>
                          </div>
                        )}

                        {formData.platform === "instagram" && (
                          <div className="space-y-4">
                            <motion.div variants={fadeInUp} className="space-y-2">
                              <Label htmlFor="fb-page-token">Page Access Token *</Label>
                              <Input
                                id="fb-page-token"
                                type="password"
                                value={formData.facebook_page_access_token}
                                onChange={(e) => setFormData({ ...formData, facebook_page_access_token: e.target.value })}
                                placeholder="EAAxxxxx..."
                                className="transition-all duration-300 focus:ring-2 focus:ring-primary/20 focus:border-primary"
                              />
                            </motion.div>

                            <motion.div variants={fadeInUp} className="space-y-2">
                              <Label htmlFor="fb-page-id">Page ID *</Label>
                              <Input
                                id="fb-page-id"
                                value={formData.facebook_page_id}
                                onChange={(e) => setFormData({ ...formData, facebook_page_id: e.target.value })}
                                placeholder="123456789..."
                                className="transition-all duration-300 focus:ring-2 focus:ring-primary/20 focus:border-primary"
                              />
                            </motion.div>

                            <motion.div variants={fadeInUp} className="grid grid-cols-2 gap-4">
                              <div className="space-y-2">
                                <Label htmlFor="fb-app-id">App ID</Label>
                                <Input
                                  id="fb-app-id"
                                  value={formData.facebook_app_id}
                                  onChange={(e) => setFormData({ ...formData, facebook_app_id: e.target.value })}
                                  placeholder="123456789"
                                  className="transition-all duration-300 focus:ring-2 focus:ring-primary/20 focus:border-primary"
                                />
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor="fb-app-secret">App Secret</Label>
                                <Input
                                  id="fb-app-secret"
                                  type="password"
                                  value={formData.facebook_app_secret}
                                  onChange={(e) => setFormData({ ...formData, facebook_app_secret: e.target.value })}
                                  placeholder="abc123..."
                                  className="transition-all duration-300 focus:ring-2 focus:ring-primary/20 focus:border-primary"
                                />
                              </div>
                            </motion.div>

                            <motion.div variants={fadeInUp}>
                              <Card className="border-blue-200 bg-blue-50">
                                <CardContent className="p-4">
                                  <div className="text-center">
                                    <TestTube className="h-8 w-8 text-blue-600 mx-auto mb-2" />
                                    <h4 className="font-medium text-blue-800">¿No tienes los tokens aún?</h4>
                                    <p className="text-sm text-blue-700 mb-3">
                                      Puedes crear el bot sin tokens y configurarlos después desde la sección de prueba.
                                    </p>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => {
                                        setFormData({
                                          ...formData,
                                          facebook_page_access_token: "",
                                          facebook_page_id: "",
                                          facebook_app_id: "",
                                          facebook_app_secret: "",
                                        })
                                        handleCreateBot()
                                      }}
                                      disabled={isLoading}
                                    >
                                      Crear Bot para Prueba
                                    </Button>
                                  </div>
                                </CardContent>
                              </Card>
                            </motion.div>
                          </div>
                        )}
                      </CardContent>
                    </>
                  )}

                  {/* Step 6: Webhook Configuration */}
                  {currentStep === 6 && shouldShowPlatformSteps() && (
                    <>
                      <CardHeader>
                        <CardTitle>
                          Configurar Webhook de {formData.platform === "whatsapp" ? "WhatsApp" : "Instagram"}
                        </CardTitle>
                        <CardDescription>
                          Último paso: configurar el webhook en Meta Developer Console para recibir mensajes
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-6">
                        <motion.div variants={fadeInUp}>
                          <Card className="border-orange-200 bg-orange-50">
                            <CardContent className="p-4">
                              <div className="space-y-4">
                                <div className="flex items-center gap-3">
                                  <Key className="h-5 w-5 text-orange-600" />
                                  <h4 className="font-medium text-orange-800">URL del Webhook</h4>
                                </div>
                                <div className="bg-white p-3 rounded border font-mono text-sm break-all">
                                  {window.location.origin}/api/whatsapp/webhook
                                </div>
                                <div className="bg-yellow-50 border border-yellow-200 rounded p-2 mt-2">
                                  <p className="text-xs text-yellow-800 mb-1">
                                    <strong>Desarrollo con ngrok:</strong>
                                  </p>
                                  <p className="text-xs text-yellow-700">
                                    Si usas ngrok, usa: <code className="bg-white px-1 rounded">https://tu-id.ngrok-free.app/api/whatsapp/webhook</code>
                                  </p>
                                  <p className="text-xs text-yellow-700 mt-1">
                                    <strong>Importante:</strong> Asegúrate de que la URL termine sin slash final
                                  </p>
                                </div>
                                <p className="text-xs text-orange-700">
                                  Copia esta URL exacta y úsala en Meta Developer Console
                                </p>
                              </div>
                            </CardContent>
                          </Card>
                        </motion.div>

                        <motion.div variants={fadeInUp}>
                          <div className="bg-white border rounded-lg p-4 space-y-4">
                            <h3 className="font-medium flex items-center gap-2">
                              <Facebook className="h-4 w-4 text-blue-600" />
                              Pasos en Meta Developer Console:
                            </h3>
                            
                            <div className="space-y-3 text-sm">
                              <div className="flex gap-3">
                                <div className="bg-blue-100 text-blue-800 rounded-full w-6 h-6 flex items-center justify-center text-xs font-medium">1</div>
                                <div>
                                  <p className="font-medium">Ir a tu app en Meta Developer Console</p>
                                  <p className="text-gray-600">developers.facebook.com/apps/</p>
                                </div>
                              </div>

                              <div className="flex gap-3">
                                <div className="bg-blue-100 text-blue-800 rounded-full w-6 h-6 flex items-center justify-center text-xs font-medium">2</div>
                                <div>
                                  <p className="font-medium">
                                    {formData.platform === "whatsapp" 
                                      ? "Ir a WhatsApp > Configuración" 
                                      : "Ir a Instagram > Configuración"}
                                  </p>
                                  <p className="text-gray-600">En el menú lateral de tu app</p>
                                </div>
                              </div>

                              <div className="flex gap-3">
                                <div className="bg-blue-100 text-blue-800 rounded-full w-6 h-6 flex items-center justify-center text-xs font-medium">3</div>
                                <div>
                                  <p className="font-medium">Configurar Webhook</p>
                                  <div className="text-gray-600 space-y-1">
                                    <p><strong>URL del callback:</strong> La URL de arriba</p>
                                    <p><strong>Token de verificación:</strong> {formData.whatsapp_webhook_verify_token || "tu_token_secreto"}</p>
                                  </div>
                                </div>
                              </div>

                              <div className="flex gap-3">
                                <div className="bg-green-100 text-green-800 rounded-full w-6 h-6 flex items-center justify-center text-xs font-medium">4</div>
                                <div>
                                  <p className="font-medium">Suscribirse a eventos</p>
                                  <p className="text-gray-600">
                                    {formData.platform === "whatsapp" 
                                      ? "Seleccionar: messages, message_deliveries, message_reads"
                                      : "Seleccionar los eventos de mensajes que necesites"}
                                  </p>
                                </div>
                              </div>

                              <div className="flex gap-3">
                                <div className="bg-green-100 text-green-800 rounded-full w-6 h-6 flex items-center justify-center text-xs font-medium">✓</div>
                                <div>
                                  <p className="font-medium">Verificar y Guardar</p>
                                  <p className="text-gray-600">Meta verificará la conexión automáticamente</p>
                                </div>
                              </div>
                            </div>

                            <div className="border-t pt-4 space-y-3">
                              <Button
                                variant="outline"
                                className="w-full"
                                onClick={() => window.open('https://developers.facebook.com/apps/', '_blank')}
                              >
                                <Facebook className="h-4 w-4 mr-2" />
                                Abrir Meta Developer Console
                              </Button>
                              
                              <div className="flex items-center gap-3">
                                <Checkbox 
                                  id="webhook-configured"
                                  checked={tokensConfigured}
                                  onCheckedChange={(checked) => setTokensConfigured(!!checked)}
                                />
                                <Label htmlFor="webhook-configured" className="text-sm">
                                  He configurado correctamente el webhook en Meta Developer Console
                                </Label>
                              </div>
                            </div>
                          </div>
                        </motion.div>

                        {/* Campo para el Webhook Verify Token */}
                        <motion.div variants={fadeInUp} className="space-y-2">
                          <Label htmlFor="wa-verify-token">Webhook Verify Token *</Label>
                          <Input
                            id="wa-verify-token"
                            value={formData.whatsapp_webhook_verify_token}
                            onChange={(e) => setFormData({ ...formData, whatsapp_webhook_verify_token: e.target.value })}
                            placeholder="mi_token_secreto"
                            className="transition-all duration-300 focus:ring-2 focus:ring-primary/20 focus:border-primary"
                          />
                          <div className="bg-blue-50 border border-blue-200 rounded p-3 mt-2">
                            <p className="text-xs text-blue-800 mb-1">
                              <strong>💡 Importante:</strong>
                            </p>
                            <p className="text-xs text-blue-700">
                              • Este token es <strong>único para tu bot</strong> - puedes usar cualquier texto secreto
                            </p>
                            <p className="text-xs text-blue-700">
                              • Ejemplo: <code className="bg-white px-1 rounded">mi_bot_2024_secreto</code>
                            </p>
                            <p className="text-xs text-blue-700">
                              • Meta usará este token para verificar que el webhook es tuyo
                            </p>
                          </div>
                        </motion.div>
                      </CardContent>
                    </>
                  )}
                </motion.div>
              </AnimatePresence>

              <CardFooter className="flex flex-col sm:flex-row justify-between gap-3 sm:gap-0 pt-4 sm:pt-6 pb-4 px-4 sm:px-6">
                <motion.div
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="w-full sm:w-auto"
                >
                  <Button
                    type="button"
                    variant="outline"
                    onClick={prevStep}
                    disabled={currentStep === 1}
                    className="flex items-center justify-center gap-1 transition-all duration-300 rounded-2xl w-full sm:w-auto text-sm sm:text-base"
                  >
                    <ChevronLeft className="h-3 w-3 sm:h-4 sm:w-4" /> 
                    <span className="hidden sm:inline">Anterior</span>
                    <span className="sm:hidden">Atrás</span>
                  </Button>
                </motion.div>

                <div className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-2 w-full sm:w-auto">
                  <Button 
                    type="button" 
                    variant="ghost" 
                    onClick={handleClose}
                    className="w-full sm:w-auto text-sm sm:text-base"
                  >
                    Cancelar
                  </Button>

                  <motion.div
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="w-full sm:w-auto"
                  >
                    {currentStep < totalSteps ? (
                      <Button
                        onClick={nextStep}
                        disabled={!isStepValid()}
                        className="flex items-center justify-center gap-1 transition-all duration-300 rounded-2xl w-full sm:w-auto text-sm sm:text-base"
                      >
                        {isLoading ? (
                          <>
                            <Loader2 className="h-3 w-3 sm:h-4 sm:w-4 animate-spin" /> 
                            <span className="hidden sm:inline">Cargando...</span>
                            <span className="sm:hidden">...</span>
                          </>
                        ) : (
                          <>
                            <span className="hidden sm:inline">Siguiente</span>
                            <span className="sm:hidden">Continuar</span>
                            <ChevronRight className="h-3 w-3 sm:h-4 sm:w-4" />
                          </>
                        )}
                      </Button>
                    ) : (
                      <Button
                        onClick={handleCreateBot}
                        disabled={isLoading}
                        className="flex items-center justify-center gap-1 transition-all duration-300 rounded-2xl w-full sm:w-auto text-sm sm:text-base"
                      >
                        {isLoading ? (
                          <>
                            <Loader2 className="h-3 w-3 sm:h-4 sm:w-4 animate-spin" /> 
                            <span className="hidden sm:inline">Creando...</span>
                            <span className="sm:hidden">...</span>
                          </>
                        ) : (
                          <>
                            <span className="hidden sm:inline">Crear Bot</span>
                            <span className="sm:hidden">Crear</span>
                            <Check className="h-3 w-3 sm:h-4 sm:w-4" />
                          </>
                        )}
                      </Button>
                    )}
                  </motion.div>
                </div>
              </CardFooter>
            </div>
          </Card>
        </motion.div>

        {/* Step indicator */}
        <motion.div
          className="mt-4 text-center text-sm text-muted-foreground"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.4 }}
        >
          Paso {currentStep} de {totalSteps}: {steps[currentStep - 1]?.title}
        </motion.div>
      </DialogContent>
    </Dialog>
  )
}