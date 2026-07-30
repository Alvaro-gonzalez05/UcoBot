"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Switch } from "@/components/ui/switch"
import { toast } from "sonner"
import { Facebook, Instagram, Linkedin, Twitter, Globe, Clock } from "lucide-react"

interface UserEditDialogProps {
  profile: any
  children: React.ReactNode
}

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
const DAY_NAMES: Record<string, string> = {
  monday: 'Lunes', tuesday: 'Martes', wednesday: 'Miércoles', thursday: 'Jueves',
  friday: 'Viernes', saturday: 'Sábado', sunday: 'Domingo'
}

const SOCIAL_PLATFORMS = [
  { id: 'facebook', label: 'Facebook', icon: Facebook },
  { id: 'instagram', label: 'Instagram', icon: Instagram },
  { id: 'twitter', label: 'Twitter', icon: Twitter },
  { id: 'linkedin', label: 'LinkedIn', icon: Linkedin },
  { id: 'tiktok', label: 'TikTok', icon: Globe },
]

export function UserEditDialog({ profile, children }: UserEditDialogProps) {
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  // Form States
  const [generalData, setGeneralData] = useState({
    business_name: '',
    business_description: '',
    location: '',
    phone: '',
    email: '',
    website: '',
    menu_link: '',
    plan_type: 'trial',
    subscription_status: 'trialing'
  })

  const [hoursData, setHoursData] = useState<Record<string, { isOpen: boolean, open: string, close: string }>>({})
  const [socialData, setSocialData] = useState<Record<string, string>>({})

  useEffect(() => {
    if (isEditOpen) {
      // Initialize General Data
      setGeneralData({
        business_name: profile.business_name || '',
        business_description: profile.business_description || '',
        location: profile.location || '',
        phone: profile.business_info?.phone || '',
        email: profile.business_info?.email || '',
        website: profile.business_info?.website || '',
        menu_link: profile.menu_link || '',
        plan_type: profile.plan_type === 'free' ? 'trial' : (profile.plan_type || 'trial'),
        subscription_status: profile.subscription_status || 'trialing',
      })

      // Initialize Hours
      const initialHours: any = {}
      DAYS.forEach(day => {
        const existing = profile.business_hours?.[day]
        initialHours[day] = {
          isOpen: existing?.isOpen ?? false,
          open: existing?.open || '09:00',
          close: existing?.close || '18:00'
        }
      })
      setHoursData(initialHours)

      // Initialize Socials
      setSocialData(profile.social_links || {})
    }
  }, [isEditOpen, profile])

  const handleUpdateProfile = async () => {
    setIsLoading(true)
    try {
      const updatedBusinessInfo = {
        ...profile.business_info,
        phone: generalData.phone,
        email: generalData.email,
        website: generalData.website
      }

      // Clean up social links (remove empty ones)
      const cleanSocials: Record<string, string> = {}
      Object.entries(socialData).forEach(([key, value]) => {
        if (value && value.trim() !== '') {
          cleanSocials[key] = value.trim()
        }
      })

      // Por el servidor: sin política de UPDATE para admin, esto no cambiaba nada.
      const res = await fetch("/api/admin/user-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: profile.id,
          business_name: generalData.business_name,
          business_description: generalData.business_description,
          location: generalData.location,
          menu_link: generalData.menu_link,
          business_info: updatedBusinessInfo,
          business_hours: hoursData,
          social_links: cleanSocials,
          plan_type: generalData.plan_type,
          subscription_status: generalData.subscription_status,
        }),
      })
      const json = await res.json()
      const error = res.ok ? null : new Error(json.error || "No se pudo actualizar")

      if (error) throw error

      toast.success("Perfil actualizado", {
        description: "Los datos del usuario han sido actualizados correctamente."
      })
      setIsEditOpen(false)
      router.refresh()
    } catch (error) {
      console.error(error)
      toast.error("Error al actualizar", {
        description: "No se pudo actualizar el perfil"
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleHourChange = (day: string, field: string, value: any) => {
    setHoursData(prev => ({
      ...prev,
      [day]: {
        ...prev[day],
        [field]: value
      }
    }))
  }

  const handleSocialChange = (platform: string, value: string) => {
    setSocialData(prev => ({
      ...prev,
      [platform]: value
    }))
  }

  return (
    <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Perfil de Usuario</DialogTitle>
          <DialogDescription>
            Modifica la información del negocio, horarios y redes sociales.
          </DialogDescription>
        </DialogHeader>
        
        <Tabs defaultValue="general" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="contact">Contacto</TabsTrigger>
            <TabsTrigger value="hours">Horarios</TabsTrigger>
            <TabsTrigger value="social">Redes</TabsTrigger>
          </TabsList>
          
          <TabsContent value="general" className="space-y-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="business_name" className="text-right">
                Negocio
              </Label>
              <Input
                id="business_name"
                value={generalData.business_name}
                onChange={(e) => setGeneralData({...generalData, business_name: e.target.value})}
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="description" className="text-right">
                Descripción
              </Label>
              <Textarea
                id="description"
                value={generalData.business_description}
                onChange={(e) => setGeneralData({...generalData, business_description: e.target.value})}
                className="col-span-3"
                rows={3}
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="location" className="text-right">
                Ubicación
              </Label>
              <Input
                id="location"
                value={generalData.location}
                onChange={(e) => setGeneralData({...generalData, location: e.target.value})}
                className="col-span-3"
              />
            </div>
            
            <div className="border-t pt-4 mt-4">
              <h4 className="mb-4 text-sm font-medium text-muted-foreground">Suscripción</h4>
              <div className="grid grid-cols-4 items-center gap-4 mb-4">
                <Label htmlFor="plan" className="text-right">Plan</Label>
                <Select 
                  value={generalData.plan_type} 
                  onValueChange={(value) => setGeneralData({...generalData, plan_type: value})}
                >
                  <SelectTrigger className="col-span-3">
                    <SelectValue placeholder="Seleccionar plan" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="trial">Trial (Prueba)</SelectItem>
                    <SelectItem value="pro">Pro ($69/mes)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="status" className="text-right">Estado</Label>
                <Select 
                  value={generalData.subscription_status} 
                  onValueChange={(value) => setGeneralData({...generalData, subscription_status: value})}
                >
                  <SelectTrigger className="col-span-3">
                    <SelectValue placeholder="Seleccionar estado" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Activo</SelectItem>
                    <SelectItem value="past_due">Pago Pendiente</SelectItem>
                    <SelectItem value="canceled">Cancelado</SelectItem>
                    <SelectItem value="suspended">Suspendido</SelectItem>
                    <SelectItem value="trialing">En Prueba</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="contact" className="space-y-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="phone" className="text-right">
                Teléfono
              </Label>
              <Input
                id="phone"
                value={generalData.phone}
                onChange={(e) => setGeneralData({...generalData, phone: e.target.value})}
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="email" className="text-right">
                Email
              </Label>
              <Input
                id="email"
                value={generalData.email}
                onChange={(e) => setGeneralData({...generalData, email: e.target.value})}
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="website" className="text-right">
                Sitio Web
              </Label>
              <Input
                id="website"
                value={generalData.website}
                onChange={(e) => setGeneralData({...generalData, website: e.target.value})}
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="menu_link" className="text-right">
                Link Menú
              </Label>
              <Input
                id="menu_link"
                value={generalData.menu_link}
                onChange={(e) => setGeneralData({...generalData, menu_link: e.target.value})}
                className="col-span-3"
              />
            </div>
          </TabsContent>

          <TabsContent value="hours" className="space-y-4 py-4">
            <div className="space-y-4">
              {DAYS.map((day) => (
                <div key={day} className="flex items-center gap-4 p-2 rounded-lg border bg-card">
                  <div className="w-24 font-medium capitalize">{DAY_NAMES[day]}</div>
                  <div className="flex items-center gap-2">
                    <Switch 
                      checked={hoursData[day]?.isOpen}
                      onCheckedChange={(checked) => handleHourChange(day, 'isOpen', checked)}
                    />
                    <span className="text-sm text-muted-foreground w-16">
                      {hoursData[day]?.isOpen ? 'Abierto' : 'Cerrado'}
                    </span>
                  </div>
                  
                  {hoursData[day]?.isOpen && (
                    <div className="flex items-center gap-2 ml-auto">
                      <Input 
                        type="time" 
                        value={hoursData[day]?.open}
                        onChange={(e) => handleHourChange(day, 'open', e.target.value)}
                        className="w-32"
                      />
                      <span>-</span>
                      <Input 
                        type="time" 
                        value={hoursData[day]?.close}
                        onChange={(e) => handleHourChange(day, 'close', e.target.value)}
                        className="w-32"
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="social" className="space-y-4 py-4">
            <div className="space-y-4">
              {SOCIAL_PLATFORMS.map((platform) => {
                const Icon = platform.icon
                return (
                  <div key={platform.id} className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor={platform.id} className="text-right flex items-center justify-end gap-2">
                      <Icon className="h-4 w-4" />
                      {platform.label}
                    </Label>
                    <Input
                      id={platform.id}
                      placeholder={`URL de ${platform.label}`}
                      value={socialData[platform.id] || ''}
                      onChange={(e) => handleSocialChange(platform.id, e.target.value)}
                      className="col-span-3"
                    />
                  </div>
                )
              })}
              
              <div className="border-t pt-4 mt-4">
                <h4 className="mb-2 text-sm font-medium">Otros Enlaces</h4>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="custom_link" className="text-right">URL Personalizada</Label>
                  <Input
                    id="custom_link"
                    placeholder="https://..."
                    value={socialData['website'] || ''}
                    onChange={(e) => handleSocialChange('website', e.target.value)}
                    className="col-span-3"
                  />
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => setIsEditOpen(false)}>Cancelar</Button>
          <Button onClick={handleUpdateProfile} disabled={isLoading}>
            {isLoading ? "Guardando..." : "Guardar Cambios"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
