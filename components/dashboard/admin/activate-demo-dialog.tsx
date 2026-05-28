"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { motion } from "framer-motion"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Building2,
  Check,
  MoveRight,
  Loader2,
  Bot,
  Zap,
  MessageSquare,
  CheckCircle2,
} from "lucide-react"

const FEATURE_LABELS: Record<string, string> = {
  register_clients: "Registro de clientes",
  take_orders: "Toma de pedidos",
  manage_appointments: "Gestión de citas",
  lead_qualification: "Calificación de leads",
  loyalty_points: "Puntos de fidelidad",
  custom_forms: "Formularios personalizados",
  take_reservations: "Reservas",
}

interface ActivateDemoDialogProps {
  demo: {
    id: string
    business_name: string
    business_type: string
    contact_name?: string
    contact_email?: string
    business_summary?: string
    features?: string[]
  }
  open: boolean
  onOpenChange: (open: boolean) => void
}

const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
}

export function ActivateDemoDialog({
  demo,
  open,
  onOpenChange,
}: ActivateDemoDialogProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const [formData, setFormData] = useState({
    businessName: demo.business_name || "",
    email: demo.contact_email || "",
    contactName: demo.contact_name || "",
    password: "",
    confirmPassword: "",
  })

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
    setError(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (formData.password !== formData.confirmPassword) {
      setError("Las contraseñas no coinciden")
      return
    }
    if (formData.password.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres")
      return
    }
    if (!formData.email || !formData.businessName) {
      setError("Email y nombre del negocio son requeridos")
      return
    }

    setIsLoading(true)
    try {
      const response = await fetch("/api/admin/activate-demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          demoId: demo.id,
          email: formData.email,
          password: formData.password,
          businessName: formData.businessName,
          contactName: formData.contactName,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Error al crear la cuenta")
      }

      setSuccess(true)
      toast.success("¡Cuenta creada exitosamente!", {
        description: `La cuenta de ${formData.businessName} está lista.`,
      })

      setTimeout(() => {
        onOpenChange(false)
        setSuccess(false)
        router.refresh()
      }, 2000)
    } catch (err: any) {
      setError(err.message || "Error al crear la cuenta")
    } finally {
      setIsLoading(false)
    }
  }

  const features = Array.isArray(demo.features) ? demo.features : []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl p-0 overflow-hidden rounded-3xl border-0 shadow-2xl">
        {success ? (
          /* ── Success state ── */
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
              ¡Cuenta activada!
            </motion.h3>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="text-muted-foreground"
            >
              La cuenta de <strong>{formData.businessName}</strong> fue creada
              con las configuraciones del demo.
            </motion.p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-5">
            {/* ── Left panel: Demo summary ── */}
            <div className="lg:col-span-2 bg-gradient-to-br from-[#1C1C28] to-[#2a2a3a] p-7 flex flex-col gap-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#D1F366]/10 border border-[#D1F366]/20 flex items-center justify-center flex-shrink-0">
                  <Building2 className="w-5 h-5 text-[#D1F366]" />
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-[#D1F366]/60 font-semibold">
                    Activar cuenta
                  </p>
                  <h3 className="font-bold text-white text-base leading-tight">
                    {demo.business_name}
                  </h3>
                </div>
              </div>

              {demo.business_summary && (
                <p className="text-sm text-white/60 italic leading-relaxed">
                  "{demo.business_summary}"
                </p>
              )}

              {features.length > 0 && (
                <div className="space-y-3">
                  <p className="text-xs text-[#D1F366]/70 uppercase tracking-wider font-semibold flex items-center gap-1.5">
                    <Zap className="w-3 h-3" /> Funciones del demo
                  </p>
                  <ul className="space-y-2">
                    {features.map((f) => (
                      <li
                        key={f}
                        className="flex items-center gap-2 text-sm text-white/80"
                      >
                        <Check className="w-3.5 h-3.5 text-[#D1F366] flex-shrink-0" />
                        {FEATURE_LABELS[f] || f}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="mt-auto space-y-2">
                <div className="flex items-center gap-2 text-xs text-white/50">
                  <Bot className="w-3.5 h-3.5" />
                  Se creará un bot preconfigurado
                </div>
                <div className="flex items-center gap-2 text-xs text-white/50">
                  <MessageSquare className="w-3.5 h-3.5" />
                  Cuenta activada con Plan Pro
                </div>
              </div>
            </div>

            {/* ── Right panel: Form ── */}
            <div className="lg:col-span-3 p-7 bg-card flex flex-col gap-5">
              <DialogHeader className="pb-0">
                <DialogTitle className="text-xl font-bold">
                  Crear cuenta del cliente
                </DialogTitle>
                <p className="text-sm text-muted-foreground">
                  Completa los datos para activar la cuenta con la configuración
                  del demo.
                </p>
              </DialogHeader>

              <form onSubmit={handleSubmit} className="space-y-4 flex-1">
                <motion.div variants={itemVariants} initial="hidden" animate="visible">
                  <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5 block">
                    Nombre del negocio
                  </Label>
                  <Input
                    value={formData.businessName}
                    onChange={(e) => handleChange("businessName", e.target.value)}
                    placeholder="Nombre del negocio"
                    required
                    className="rounded-xl h-11 bg-background border-border focus:border-[#D1F366] focus:ring-[#D1F366]/20"
                  />
                </motion.div>

                <motion.div
                  variants={itemVariants}
                  initial="hidden"
                  animate="visible"
                  transition={{ delay: 0.05 }}
                >
                  <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5 block">
                    Nombre del contacto
                  </Label>
                  <Input
                    value={formData.contactName}
                    onChange={(e) => handleChange("contactName", e.target.value)}
                    placeholder="Nombre completo"
                    className="rounded-xl h-11 bg-background border-border focus:border-[#D1F366] focus:ring-[#D1F366]/20"
                  />
                </motion.div>

                <motion.div
                  variants={itemVariants}
                  initial="hidden"
                  animate="visible"
                  transition={{ delay: 0.1 }}
                >
                  <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5 block">
                    Email
                  </Label>
                  <Input
                    type="email"
                    value={formData.email}
                    onChange={(e) => handleChange("email", e.target.value)}
                    placeholder="email@negocio.com"
                    required
                    className="rounded-xl h-11 bg-background border-border focus:border-[#D1F366] focus:ring-[#D1F366]/20"
                  />
                </motion.div>

                <div className="grid grid-cols-2 gap-3">
                  <motion.div
                    variants={itemVariants}
                    initial="hidden"
                    animate="visible"
                    transition={{ delay: 0.15 }}
                  >
                    <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5 block">
                      Contraseña
                    </Label>
                    <Input
                      type="password"
                      value={formData.password}
                      onChange={(e) => handleChange("password", e.target.value)}
                      placeholder="Mínimo 6 caracteres"
                      required
                      className="rounded-xl h-11 bg-background border-border focus:border-[#D1F366] focus:ring-[#D1F366]/20"
                    />
                  </motion.div>
                  <motion.div
                    variants={itemVariants}
                    initial="hidden"
                    animate="visible"
                    transition={{ delay: 0.2 }}
                  >
                    <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5 block">
                      Confirmar
                    </Label>
                    <Input
                      type="password"
                      value={formData.confirmPassword}
                      onChange={(e) =>
                        handleChange("confirmPassword", e.target.value)
                      }
                      placeholder="Repetir contraseña"
                      required
                      className="rounded-xl h-11 bg-background border-border focus:border-[#D1F366] focus:ring-[#D1F366]/20"
                    />
                  </motion.div>
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

                <div className="flex gap-3 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1 rounded-xl h-11"
                    onClick={() => onOpenChange(false)}
                    disabled={isLoading}
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="submit"
                    disabled={isLoading}
                    className="flex-1 rounded-xl h-11 bg-[#D1F366] text-[#1C1C28] hover:bg-[#B3D93C] font-bold shadow-sm"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Creando cuenta...
                      </>
                    ) : (
                      <>
                        Activar cuenta
                        <MoveRight className="w-4 h-4 ml-2" />
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
