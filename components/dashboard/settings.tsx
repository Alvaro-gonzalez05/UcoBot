"use client"

import { useState, useEffect, useRef } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import {
  User, Bell, CreditCard, Shield, LogOut, Trash2,
  LayoutDashboard, Camera, Eye, EyeOff, GripVertical,
} from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import { ScrollFadeIn, ScrollSlideUp } from "@/components/ui/scroll-animations"
import { motion } from "framer-motion"

// ── Sidebar sections the user can configure ──────────────────────────────────
const DEFAULT_SIDEBAR_SECTIONS = [
  { id: "dashboard",       label: "Resumen",          icon: "dashboard" },
  { id: "bots",            label: "Chatbots",         icon: "forum" },
  { id: "chat",            label: "Mensajes",         icon: "chat_bubble" },
  { id: "clientes",        label: "Clientes",         icon: "group" },
  { id: "punto-de-venta",  label: "Punto de venta",   icon: "point_of_sale" },
  { id: "pedidos",         label: "Pedidos",           icon: "shopping_cart" },
  { id: "reservas",        label: "Reservas",          icon: "calendar_month" },
  { id: "formularios",     label: "Formularios",       icon: "description" },
  { id: "promociones",     label: "Promociones",       icon: "local_offer" },
  { id: "automatizaciones",label: "Automatizaciones",  icon: "account_tree" },
]

interface SidebarSectionConfig {
  id: string
  label: string
  visible: boolean
}

export function Settings() {
  const supabase = createClient()
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Profile state
  const [userId, setUserId] = useState("")
  const [email, setEmail] = useState("")
  const [fullName, setFullName] = useState("")
  const [businessName, setBusinessName] = useState("")
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [createdAt, setCreatedAt] = useState("")
  const [planType, setPlanType] = useState("free")

  // Sidebar config state
  const [sidebarSections, setSidebarSections] = useState<SidebarSectionConfig[]>(
    DEFAULT_SIDEBAR_SECTIONS.map(s => ({ ...s, visible: true }))
  )

  // Password state
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  // Loading flags
  const [isLoading, setIsLoading] = useState(true)
  const [isSavingProfile, setIsSavingProfile] = useState(false)
  const [isSavingSidebar, setIsSavingSidebar] = useState(false)
  const [isSavingPassword, setIsSavingPassword] = useState(false)

  useEffect(() => { fetchProfile() }, [])

  const fetchProfile = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id)
      setEmail(user.email || "")
      setCreatedAt(user.created_at)

      const { data } = await supabase
        .from("user_profiles")
        .select("business_name, full_name, avatar_url, sidebar_config, plan_type")
        .eq("id", user.id)
        .single()

      if (data) {
        setBusinessName(data.business_name || "")
        setFullName(data.full_name || "")
        setAvatarUrl(data.avatar_url || null)
        setPlanType(data.plan_type || "free")

        if (data.sidebar_config && Array.isArray(data.sidebar_config)) {
          // Merge saved config with defaults (in case new sections were added)
          const saved: SidebarSectionConfig[] = data.sidebar_config
          setSidebarSections(
            DEFAULT_SIDEBAR_SECTIONS.map(def => {
              const found = saved.find(s => s.id === def.id)
              return found ? { ...def, label: found.label, visible: found.visible } : { ...def, visible: true }
            })
          )
        }
      }
    } catch (err) {
      console.error("Error fetching profile:", err)
    } finally {
      setIsLoading(false)
    }
  }

  // ── Profile photo ─────────────────────────────────────────────────────────
  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setAvatarFile(file)
    setAvatarPreview(URL.createObjectURL(file))
  }

  const saveProfile = async () => {
    setIsSavingProfile(true)
    try {
      let newAvatarUrl = avatarUrl

      if (avatarFile) {
        const ext = avatarFile.name.split(".").pop()
        const path = `avatars/${userId}.${ext}`
        const { error: uploadError } = await supabase.storage
          .from("avatars")
          .upload(path, avatarFile, { upsert: true })

        if (uploadError) throw uploadError

        const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(path)
        newAvatarUrl = publicUrl
        setAvatarUrl(newAvatarUrl)
        setAvatarFile(null)
      }

      const { error } = await supabase
        .from("user_profiles")
        .update({ full_name: fullName, business_name: businessName, avatar_url: newAvatarUrl })
        .eq("id", userId)

      if (error) throw error
      toast.success("Perfil actualizado")
    } catch (err: any) {
      toast.error("Error al guardar", { description: err.message })
    } finally {
      setIsSavingProfile(false)
    }
  }

  // ── Sidebar config ────────────────────────────────────────────────────────
  const updateSection = (id: string, field: "label" | "visible", value: string | boolean) => {
    setSidebarSections(prev =>
      prev.map(s => s.id === id ? { ...s, [field]: value } : s)
    )
  }

  const saveSidebarConfig = async () => {
    setIsSavingSidebar(true)
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (!authUser) throw new Error("No autenticado")

      const { error } = await supabase
        .from("user_profiles")
        .update({ sidebar_config: sidebarSections })
        .eq("id", authUser.id)

      if (error) throw error
      toast.success("Configuracion del panel guardada")
      window.dispatchEvent(new Event("sidebarConfigUpdated"))
    } catch (err: any) {
      toast.error("Error al guardar", { description: err.message })
    } finally {
      setIsSavingSidebar(false)
    }
  }

  // ── Password ──────────────────────────────────────────────────────────────
  const savePassword = async () => {
    if (!newPassword) return toast.error("Ingresa una nueva contrasena")
    if (newPassword.length < 6) return toast.error("La contrasena debe tener al menos 6 caracteres")
    if (newPassword !== confirmPassword) return toast.error("Las contrasenas no coinciden")
    setIsSavingPassword(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) throw error
      setCurrentPassword("")
      setNewPassword("")
      setConfirmPassword("")
      toast.success("Contrasena actualizada correctamente")
    } catch (err: any) {
      toast.error("Error al cambiar la contrasena", { description: err.message })
    } finally {
      setIsSavingPassword(false)
    }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    router.push("/login")
  }

  const planLabel: Record<string, string> = {
    free: "Gratuito", trial: "Prueba", basic: "Basic", pro: "Pro",
    premium: "Premium", enterprise: "Enterprise",
  }

  const displayAvatar = avatarPreview || avatarUrl

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="h-6 w-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <ScrollSlideUp>
        <div>
          <h1 className="text-3xl font-bold">Configuracion</h1>
          <p className="text-muted-foreground">Gestioná tu perfil, el panel lateral y la seguridad de tu cuenta</p>
        </div>
      </ScrollSlideUp>

      <Tabs defaultValue="perfil" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="perfil">Perfil</TabsTrigger>
          <TabsTrigger value="panel">Panel lateral</TabsTrigger>
          <TabsTrigger value="seguridad">Seguridad</TabsTrigger>
          <TabsTrigger value="notificaciones">Notificaciones</TabsTrigger>
        </TabsList>

        {/* ── PERFIL ──────────────────────────────────────────────────────── */}
        <TabsContent value="perfil" className="space-y-4">
          <ScrollFadeIn delay={0.1}>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Datos del perfil
                </CardTitle>
                <CardDescription>Tu nombre, foto y datos del negocio</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Avatar */}
                <div className="flex items-center gap-5">
                  <div className="relative">
                    {displayAvatar ? (
                      <img
                        src={displayAvatar}
                        alt="Foto de perfil"
                        className="w-20 h-20 rounded-full object-cover border-2 border-border"
                      />
                    ) : (
                      <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center text-2xl font-bold text-muted-foreground border-2 border-border">
                        {(fullName || businessName || email).charAt(0).toUpperCase()}
                      </div>
                    )}
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="absolute bottom-0 right-0 w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-md hover:opacity-90 transition-opacity"
                    >
                      <Camera className="h-3.5 w-3.5" />
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleAvatarChange}
                    />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{fullName || businessName || "Sin nombre"}</p>
                    <p className="text-xs text-muted-foreground">{email}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Miembro desde {createdAt ? new Date(createdAt).toLocaleDateString("es-AR") : "—"}
                    </p>
                    <Badge variant="secondary" className="mt-1.5 text-xs">
                      Plan {planLabel[planType] ?? planType}
                    </Badge>
                  </div>
                </div>

                <Separator />

                {/* Fields */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="full_name">Nombre completo</Label>
                    <Input
                      id="full_name"
                      placeholder="Tu nombre"
                      value={fullName}
                      onChange={e => setFullName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="business_name">Nombre del negocio</Label>
                    <Input
                      id="business_name"
                      placeholder="Mi negocio"
                      value={businessName}
                      onChange={e => setBusinessName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" value={email} disabled className="bg-muted" />
                    <p className="text-xs text-muted-foreground">El email no se puede cambiar</p>
                  </div>
                </div>

                <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} className="w-fit">
                  <Button onClick={saveProfile} disabled={isSavingProfile}>
                    {isSavingProfile ? "Guardando..." : "Guardar perfil"}
                  </Button>
                </motion.div>
              </CardContent>
            </Card>
          </ScrollFadeIn>
        </TabsContent>

        {/* ── PANEL LATERAL ────────────────────────────────────────────────── */}
        <TabsContent value="panel" className="space-y-4">
          <ScrollFadeIn delay={0.1}>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <LayoutDashboard className="h-5 w-5" />
                  Secciones del panel lateral
                </CardTitle>
                <CardDescription>
                  Elegí que secciones mostrar en tu sidebar y renombralas como quieras para tu negocio
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="space-y-1">
                  {sidebarSections.map((section, index) => (
                    <motion.div
                      key={section.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.04 }}
                      className={`flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors ${
                        section.visible ? "bg-background" : "bg-muted/30 opacity-60"
                      }`}
                    >
                      <GripVertical className="h-4 w-4 text-muted-foreground/40 flex-shrink-0" />

                      {/* Icon preview */}
                      <span className="material-symbols-outlined text-base text-muted-foreground flex-shrink-0">
                        {section.icon}
                      </span>

                      {/* Rename input */}
                      <Input
                        value={section.label}
                        onChange={e => updateSection(section.id, "label", e.target.value)}
                        className="h-8 text-sm border-0 bg-transparent px-0 focus-visible:ring-0 focus-visible:ring-offset-0 font-medium"
                        disabled={!section.visible}
                      />

                      {/* Visibility toggle */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-xs text-muted-foreground hidden sm:inline">
                          {section.visible ? "Visible" : "Oculta"}
                        </span>
                        <Switch
                          checked={section.visible}
                          onCheckedChange={v => updateSection(section.id, "visible", v)}
                        />
                      </div>
                    </motion.div>
                  ))}
                </div>

                <div className="pt-2">
                  <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} className="w-fit">
                    <Button onClick={saveSidebarConfig} disabled={isSavingSidebar}>
                      {isSavingSidebar ? "Guardando..." : "Guardar configuracion del panel"}
                    </Button>
                  </motion.div>
                </div>
              </CardContent>
            </Card>
          </ScrollFadeIn>
        </TabsContent>

        {/* ── SEGURIDAD ────────────────────────────────────────────────────── */}
        <TabsContent value="seguridad" className="space-y-4">
          <ScrollFadeIn delay={0.1}>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Cambiar contrasena
                </CardTitle>
                <CardDescription>Actualiza tu contrasena periodicamente para mayor seguridad</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2 max-w-sm">
                  <Label htmlFor="new_password">Nueva contrasena</Label>
                  <div className="relative">
                    <Input
                      id="new_password"
                      type={showNew ? "text" : "password"}
                      placeholder="Minimo 6 caracteres"
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNew(!showNew)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-2 max-w-sm">
                  <Label htmlFor="confirm_password">Confirmar contrasena</Label>
                  <div className="relative">
                    <Input
                      id="confirm_password"
                      type={showConfirm ? "text" : "password"}
                      placeholder="Repetir contrasena"
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirm(!showConfirm)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {confirmPassword && newPassword !== confirmPassword && (
                    <p className="text-xs text-destructive">Las contrasenas no coinciden</p>
                  )}
                </div>

                <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} className="w-fit">
                  <Button
                    onClick={savePassword}
                    disabled={isSavingPassword || !newPassword || newPassword !== confirmPassword}
                  >
                    {isSavingPassword ? "Actualizando..." : "Actualizar contrasena"}
                  </Button>
                </motion.div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <LogOut className="h-5 w-5" />
                  Sesion
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Cerrar sesion</p>
                    <p className="text-xs text-muted-foreground">Salis de tu cuenta en este dispositivo</p>
                  </div>
                  <Button variant="outline" onClick={signOut}>
                    <LogOut className="h-4 w-4 mr-2" />
                    Cerrar sesion
                  </Button>
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-destructive">Eliminar cuenta</p>
                    <p className="text-xs text-muted-foreground">Esta accion es permanente e irreversible</p>
                  </div>
                  <Button variant="destructive" disabled>
                    <Trash2 className="h-4 w-4 mr-2" />
                    Eliminar cuenta
                  </Button>
                </div>
              </CardContent>
            </Card>
          </ScrollFadeIn>
        </TabsContent>

        {/* ── NOTIFICACIONES ───────────────────────────────────────────────── */}
        <TabsContent value="notificaciones" className="space-y-4">
          <ScrollFadeIn delay={0.1}>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bell className="h-5 w-5" />
                  Preferencias de notificaciones
                </CardTitle>
                <CardDescription>Configura como y cuando queres recibir notificaciones</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                {[
                  { key: "email", label: "Notificaciones por email", desc: "Recibe actualizaciones importantes por correo" },
                  { key: "push",  label: "Notificaciones push",      desc: "Alertas en tiempo real en tu dispositivo" },
                  { key: "marketing", label: "Emails de marketing",  desc: "Consejos y novedades del producto" },
                  { key: "bots",  label: "Alertas de bots",          desc: "Estado e incidentes de tus bots" },
                ].map(item => (
                  <div key={item.key} className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{item.label}</p>
                      <p className="text-xs text-muted-foreground">{item.desc}</p>
                    </div>
                    <Switch defaultChecked={item.key !== "marketing"} />
                  </div>
                ))}
                <Button variant="outline">Guardar preferencias</Button>
              </CardContent>
            </Card>
          </ScrollFadeIn>
        </TabsContent>
      </Tabs>
    </div>
  )
}
