"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { motion, AnimatePresence } from "framer-motion"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  UserPlus,
  Loader2,
  MoveRight,
  ArrowLeft,
  CheckCircle2,
  MessageSquare,
  Users,
  Calendar,
  ShoppingBag,
  FileText,
  Zap,
  Tag,
  LayoutDashboard,
  Bot,
  Eye,
  EyeOff,
} from "lucide-react"

// Maps Material Symbols icon names (used by the real sidebar) to Lucide for display in this dialog
const ICON_MAP: Record<string, React.ReactNode> = {
  dashboard:        <LayoutDashboard className="w-4 h-4" />,
  forum:            <Bot className="w-4 h-4" />,
  chat_bubble:      <MessageSquare className="w-4 h-4" />,
  group:            <Users className="w-4 h-4" />,
  point_of_sale:    <ShoppingBag className="w-4 h-4" />,
  shopping_cart:    <ShoppingBag className="w-4 h-4" />,
  calendar_month:   <Calendar className="w-4 h-4" />,
  description:      <FileText className="w-4 h-4" />,
  local_offer:      <Tag className="w-4 h-4" />,
  account_tree:     <Zap className="w-4 h-4" />,
}

// IDs and icons must match baseNavigation in dashboard-sidebar.tsx (href.split("/").pop())
const DEFAULT_SECTIONS = [
  { id: "dashboard",        icon: "dashboard",      label: "Resumen",         visible: true  },
  { id: "bots",             icon: "forum",           label: "Chatbots",        visible: true  },
  { id: "chat",             icon: "chat_bubble",     label: "Mensajes",        visible: true  },
  { id: "clientes",         icon: "group",           label: "Clientes",        visible: true  },
  { id: "punto-de-venta",   icon: "point_of_sale",   label: "Punto de venta",  visible: false },
  { id: "pedidos",          icon: "shopping_cart",   label: "Pedidos",         visible: true  },
  { id: "reservas",         icon: "calendar_month",  label: "Reservas",        visible: true  },
  { id: "formularios",      icon: "description",     label: "Formularios",     visible: true  },
  { id: "promociones",      icon: "local_offer",     label: "Promociones",     visible: false },
  { id: "automatizaciones", icon: "account_tree",    label: "Automatizaciones",visible: true  },
]

interface CreateUserDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CreateUserDialog({ open, onOpenChange }: CreateUserDialogProps) {
  const router = useRouter()
  const [step, setStep] = useState<1 | 2>(1)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const [formData, setFormData] = useState({
    businessName: "",
    contactName: "",
    email: "",
    password: "",
    confirmPassword: "",
    planType: "pro" as "pro" | "trial" | "free",
  })

  const [sections, setSections] = useState(DEFAULT_SECTIONS.map((s) => ({ ...s })))

  const handleChange = (field: string, value: string | number) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
    setError(null)
  }

  const handleSectionLabel = (id: string, label: string) => {
    setSections((prev) => prev.map((s) => (s.id === id ? { ...s, label } : s)))
  }

  const handleSectionToggle = (id: string, visible: boolean) => {
    setSections((prev) => prev.map((s) => (s.id === id ? { ...s, visible } : s)))
  }

  const validateStep1 = () => {
    if (!formData.email || !formData.businessName) {
      setError("Email y nombre del negocio son requeridos")
      return false
    }
    if (!formData.password) {
      setError("La contraseña es requerida")
      return false
    }
    if (formData.password.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres")
      return false
    }
    if (formData.password !== formData.confirmPassword) {
      setError("Las contraseñas no coinciden")
      return false
    }
    return true
  }

  const handleNext = () => {
    if (!validateStep1()) return
    setError(null)
    setStep(2)
  }

  const handleSubmit = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const response = await fetch("/api/admin/create-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: formData.email,
          password: formData.password,
          businessName: formData.businessName,
          contactName: formData.contactName,
          planType: formData.planType,
          sidebarConfig: sections,
        }),
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Error al crear la cuenta")

      setSuccess(true)
      toast.success("¡Cuenta creada!", {
        description: `La cuenta de ${formData.businessName} está lista.`,
      })

      setTimeout(() => {
        onOpenChange(false)
        setSuccess(false)
        setStep(1)
        setFormData({
          businessName: "",
          contactName: "",
          email: "",
          password: "",
          confirmPassword: "",
          planType: "pro",
        })
        setSections(DEFAULT_SECTIONS.map((s) => ({ ...s })))
        router.refresh()
      }, 2000)
    } catch (err: any) {
      setError(err.message || "Error al crear la cuenta")
    } finally {
      setIsLoading(false)
    }
  }

  const PLAN_OPTIONS = [
    { value: "pro", label: "Pro", desc: "Acceso completo" },
    { value: "trial", label: "Trial", desc: "Período de prueba" },
    { value: "free", label: "Free", desc: "Plan gratuito" },
  ] as const

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) { setStep(1); setError(null) } }}>
      <DialogContent className="max-w-3xl p-0 overflow-hidden rounded-3xl border-0 shadow-2xl">
        {success ? (
          <div className="flex flex-col items-center justify-center py-20 px-8 bg-card text-center gap-4">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
              className="w-20 h-20 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center"
            >
              <CheckCircle2 className="w-10 h-10 text-green-500" />
            </motion.div>
            <motion.h3
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="text-2xl font-bold"
            >
              ¡Cuenta creada!
            </motion.h3>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="text-muted-foreground"
            >
              <strong>{formData.businessName}</strong> ya puede acceder con sus credenciales.
            </motion.p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-5">
            {/* Left panel */}
            <div className="lg:col-span-2 bg-gradient-to-br from-[#1C1C28] to-[#2a2a3a] p-7 flex flex-col gap-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#D1F366]/10 border border-[#D1F366]/20 flex items-center justify-center flex-shrink-0">
                  <UserPlus className="w-5 h-5 text-[#D1F366]" />
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-[#D1F366]/60 font-semibold">
                    Nueva cuenta
                  </p>
                  <h3 className="font-bold text-white text-base leading-tight">
                    {formData.businessName || "Sin nombre aún"}
                  </h3>
                </div>
              </div>

              {/* Steps indicator */}
              <div className="space-y-3">
                <button
                  onClick={() => { setStep(1); setError(null) }}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all text-left ${
                    step === 1
                      ? "bg-[#D1F366]/10 border border-[#D1F366]/20"
                      : "opacity-50 hover:opacity-70"
                  }`}
                >
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                    step === 1 ? "bg-[#D1F366] text-[#1C1C28]" : "bg-white/10 text-white"
                  }`}>
                    1
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">Datos de la cuenta</p>
                    <p className="text-[11px] text-white/50">Email, contraseña, plan</p>
                  </div>
                </button>

                <button
                  onClick={() => { if (validateStep1()) { setStep(2); setError(null) } }}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all text-left ${
                    step === 2
                      ? "bg-[#D1F366]/10 border border-[#D1F366]/20"
                      : "opacity-50 hover:opacity-70"
                  }`}
                >
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                    step === 2 ? "bg-[#D1F366] text-[#1C1C28]" : "bg-white/10 text-white"
                  }`}>
                    2
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">Panel del cliente</p>
                    <p className="text-[11px] text-white/50">Secciones y nombres</p>
                  </div>
                </button>
              </div>

              {/* Preview sidebar */}
              {step === 2 && (
                <div className="mt-auto space-y-1.5">
                  <p className="text-[10px] uppercase tracking-widest text-[#D1F366]/60 font-semibold mb-2">
                    Vista previa
                  </p>
                  {sections.filter((s) => s.visible).map((s) => (
                    <div key={s.id} className="flex items-center gap-2 text-xs text-white/70">
                      <span className="text-[#D1F366]/60">{ICON_MAP[s.icon]}</span>
                      {s.label}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Right panel */}
            <div className="lg:col-span-3 p-7 bg-card flex flex-col gap-5">
              <AnimatePresence mode="wait">
                {step === 1 ? (
                  <motion.div
                    key="step1"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.2 }}
                    className="flex flex-col gap-5 flex-1"
                  >
                    <DialogHeader className="pb-0">
                      <DialogTitle className="text-xl font-bold">Datos de la cuenta</DialogTitle>
                      <p className="text-sm text-muted-foreground">
                        Información básica del nuevo cliente.
                      </p>
                    </DialogHeader>

                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5 block">
                            Nombre del negocio *
                          </Label>
                          <Input
                            value={formData.businessName}
                            onChange={(e) => handleChange("businessName", e.target.value)}
                            placeholder="Ej: Wonder Real Estate"
                            className="rounded-xl h-11 bg-background"
                          />
                        </div>
                        <div>
                          <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5 block">
                            Nombre del contacto
                          </Label>
                          <Input
                            value={formData.contactName}
                            onChange={(e) => handleChange("contactName", e.target.value)}
                            placeholder="Ej: Juan García"
                            className="rounded-xl h-11 bg-background"
                          />
                        </div>
                      </div>

                      <div>
                        <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5 block">
                          Email *
                        </Label>
                        <Input
                          type="email"
                          value={formData.email}
                          onChange={(e) => handleChange("email", e.target.value)}
                          placeholder="cliente@negocio.com"
                          className="rounded-xl h-11 bg-background"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5 block">
                            Contraseña *
                          </Label>
                          <div className="relative">
                            <Input
                              type={showPassword ? "text" : "password"}
                              value={formData.password}
                              onChange={(e) => handleChange("password", e.target.value)}
                              placeholder="Mín. 6 caracteres"
                              className="rounded-xl h-11 bg-background pr-10"
                            />
                            <button
                              type="button"
                              onClick={() => setShowPassword(!showPassword)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            >
                              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                          </div>
                        </div>
                        <div>
                          <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5 block">
                            Confirmar
                          </Label>
                          <Input
                            type="password"
                            value={formData.confirmPassword}
                            onChange={(e) => handleChange("confirmPassword", e.target.value)}
                            placeholder="Repetir contraseña"
                            className="rounded-xl h-11 bg-background"
                          />
                        </div>
                      </div>

                      {/* Plan */}
                      <div>
                        <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 block">
                          Plan
                        </Label>
                        <div className="grid grid-cols-3 gap-2">
                          {PLAN_OPTIONS.map((p) => (
                            <button
                              key={p.value}
                              type="button"
                              onClick={() => handleChange("planType", p.value)}
                              className={`p-3 rounded-xl border text-left transition-all ${
                                formData.planType === p.value
                                  ? "border-[#D1F366] bg-[#D1F366]/10 text-foreground"
                                  : "border-border bg-background text-muted-foreground hover:border-[#D1F366]/40"
                              }`}
                            >
                              <p className="text-sm font-bold">{p.label}</p>
                              <p className="text-[11px] opacity-70">{p.desc}</p>
                            </button>
                          ))}
                        </div>
                      </div>

                    </div>

                    {error && (
                      <motion.div
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-4 py-3 rounded-xl"
                      >
                        {error}
                      </motion.div>
                    )}

                    <div className="flex gap-3 pt-2 mt-auto">
                      <Button
                        type="button"
                        variant="outline"
                        className="flex-1 rounded-xl h-11"
                        onClick={() => onOpenChange(false)}
                      >
                        Cancelar
                      </Button>
                      <Button
                        type="button"
                        onClick={handleNext}
                        className="flex-1 rounded-xl h-11 bg-[#D1F366] text-[#1C1C28] hover:bg-[#B3D93C] font-bold"
                      >
                        Configurar panel
                        <MoveRight className="w-4 h-4 ml-2" />
                      </Button>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key="step2"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.2 }}
                    className="flex flex-col gap-4 flex-1"
                  >
                    <DialogHeader className="pb-0">
                      <DialogTitle className="text-xl font-bold">Panel del cliente</DialogTitle>
                      <p className="text-sm text-muted-foreground">
                        Elegí qué secciones ve el cliente y con qué nombre.
                      </p>
                    </DialogHeader>

                    <div className="space-y-2 overflow-y-auto max-h-[340px] pr-1">
                      {sections.map((section) => (
                        <div
                          key={section.id}
                          className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                            section.visible
                              ? "border-border bg-background"
                              : "border-border/40 bg-muted/30 opacity-50"
                          }`}
                        >
                          <div className="text-muted-foreground flex-shrink-0">
                            {ICON_MAP[section.icon]}
                          </div>
                          <Input
                            value={section.label}
                            onChange={(e) => handleSectionLabel(section.id, e.target.value)}
                            disabled={!section.visible}
                            className="h-8 text-sm rounded-lg border-0 bg-transparent p-0 focus-visible:ring-0 focus-visible:ring-offset-0 font-medium flex-1"
                          />
                          <Switch
                            checked={section.visible}
                            onCheckedChange={(v) => handleSectionToggle(section.id, v)}
                            className="flex-shrink-0 data-[state=checked]:bg-[#D1F366]"
                          />
                        </div>
                      ))}
                    </div>

                    {error && (
                      <motion.div
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-4 py-3 rounded-xl"
                      >
                        {error}
                      </motion.div>
                    )}

                    <div className="flex gap-3 pt-2 mt-auto">
                      <Button
                        type="button"
                        variant="outline"
                        className="rounded-xl h-11 px-4"
                        onClick={() => setStep(1)}
                      >
                        <ArrowLeft className="w-4 h-4 mr-1" />
                        Atrás
                      </Button>
                      <Button
                        type="button"
                        onClick={handleSubmit}
                        disabled={isLoading}
                        className="flex-1 rounded-xl h-11 bg-[#D1F366] text-[#1C1C28] hover:bg-[#B3D93C] font-bold"
                      >
                        {isLoading ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Creando cuenta...
                          </>
                        ) : (
                          <>
                            Crear cuenta
                            <MoveRight className="w-4 h-4 ml-2" />
                          </>
                        )}
                      </Button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
