"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import { Ban, CheckCircle, Settings, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
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
import { toast } from "sonner"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

interface UserDetailActionsProps {
  userId: string
  currentPlan: string
  currentStatus: string
  userName: string
  businessDescription?: string
  location?: string
  businessInfo?: any
  menuLink?: string
  businessHours?: any
  socialLinks?: any
}

export function UserDetailActions({ 
  userId, 
  currentPlan, 
  currentStatus, 
  userName,
  businessDescription,
  location,
  businessInfo,
  menuLink,
  businessHours,
  socialLinks
}: UserDetailActionsProps) {
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [isSuspendOpen, setIsSuspendOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const [formData, setFormData] = useState({
    business_name: userName,
    business_description: businessDescription || '',
    location: location || '',
    phone: businessInfo?.phone || '',
    email: businessInfo?.email || '',
    website: businessInfo?.website || '',
    menu_link: menuLink || '',
    plan_type: currentPlan === 'free' ? 'trial' : currentPlan,
    subscription_status: currentStatus,
    business_hours_json: JSON.stringify(businessHours || {}, null, 2),
    social_links_json: JSON.stringify(socialLinks || {}, null, 2)
  })

  useEffect(() => {
    setFormData({
      business_name: userName,
      business_description: businessDescription || '',
      location: location || '',
      phone: businessInfo?.phone || '',
      email: businessInfo?.email || '',
      website: businessInfo?.website || '',
      menu_link: menuLink || '',
      plan_type: currentPlan === 'free' ? 'trial' : currentPlan,
      subscription_status: currentStatus,
      business_hours_json: JSON.stringify(businessHours || {}, null, 2),
      social_links_json: JSON.stringify(socialLinks || {}, null, 2)
    })
  }, [currentPlan, currentStatus, userName, businessDescription, location, businessInfo, menuLink, businessHours, socialLinks])

  const handleUpdateProfile = async () => {
    setIsLoading(true)
    try {
      let parsedHours = {}
      let parsedSocial = {}
      
      try {
        parsedHours = JSON.parse(formData.business_hours_json)
      } catch (e) {
        toast.error("Error en formato JSON de Horarios")
        return
      }

      try {
        parsedSocial = JSON.parse(formData.social_links_json)
      } catch (e) {
        toast.error("Error en formato JSON de Redes Sociales")
        return
      }

      const updatedBusinessInfo = {
        ...businessInfo,
        phone: formData.phone,
        email: formData.email,
        website: formData.website
      }

      // Por el servidor: sin política de UPDATE para admin, esto no cambiaba nada.
      const res = await fetch("/api/admin/user-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          business_name: formData.business_name,
          business_description: formData.business_description,
          location: formData.location,
          menu_link: formData.menu_link,
          business_info: updatedBusinessInfo,
          business_hours: parsedHours,
          social_links: parsedSocial,
          plan_type: formData.plan_type,
          subscription_status: formData.subscription_status,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "No se pudo actualizar el perfil")

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

  const handleSuspendUser = async () => {
    setIsLoading(true)
    try {
      const newStatus = currentStatus === 'suspended' ? 'active' : 'suspended'
      
      const res = await fetch("/api/admin/user-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, subscription_status: newStatus }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "No se pudo cambiar el estado")

      toast.success(newStatus === 'suspended' ? "Usuario suspendido" : "Usuario reactivado", {
        description: newStatus === 'suspended' 
          ? "El usuario ha perdido acceso al sistema" 
          : "El usuario ha recuperado el acceso"
      })
      setIsSuspendOpen(false)
      router.refresh()
    } catch (error) {
      console.error(error)
      toast.error("Error al cambiar estado", {
        description: "No se pudo cambiar el estado del usuario"
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <>
      <div className="flex gap-2">
        {currentStatus === 'suspended' ? (
          <Button 
            variant="outline" 
            className="text-green-600 hover:text-green-700 hover:bg-green-50 border-green-200"
            onClick={() => setIsSuspendOpen(true)}
          >
            <CheckCircle className="mr-2 h-4 w-4" />
            Reactivar Usuario
          </Button>
        ) : (
          <Button 
            variant="outline" 
            className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
            onClick={() => setIsSuspendOpen(true)}
          >
            <Ban className="mr-2 h-4 w-4" />
            Suspender Usuario
          </Button>
        )}
        
        <Button onClick={() => setIsEditOpen(true)}>
          <Settings className="mr-2 h-4 w-4" />
          Editar Perfil
        </Button>
      </div>

      {/* Edit Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Perfil de Usuario</DialogTitle>
            <DialogDescription>
              Modifica la información del negocio y estado de la suscripción.
            </DialogDescription>
          </DialogHeader>
          
          <Tabs defaultValue="general" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="general">General</TabsTrigger>
              <TabsTrigger value="contact">Contacto</TabsTrigger>
              <TabsTrigger value="advanced">Avanzado</TabsTrigger>
              <TabsTrigger value="subscription">Suscripción</TabsTrigger>
            </TabsList>
            
            <TabsContent value="general" className="space-y-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="business_name" className="text-right">
                  Negocio
                </Label>
                <Input
                  id="business_name"
                  value={formData.business_name}
                  onChange={(e) => setFormData({...formData, business_name: e.target.value})}
                  className="col-span-3"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="description" className="text-right">
                  Descripción
                </Label>
                <Textarea
                  id="description"
                  value={formData.business_description}
                  onChange={(e) => setFormData({...formData, business_description: e.target.value})}
                  className="col-span-3"
                  rows={4}
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="location" className="text-right">
                  Ubicación
                </Label>
                <Input
                  id="location"
                  value={formData.location}
                  onChange={(e) => setFormData({...formData, location: e.target.value})}
                  className="col-span-3"
                />
              </div>
            </TabsContent>

            <TabsContent value="contact" className="space-y-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="phone" className="text-right">
                  Teléfono
                </Label>
                <Input
                  id="phone"
                  value={formData.phone}
                  onChange={(e) => setFormData({...formData, phone: e.target.value})}
                  className="col-span-3"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="email" className="text-right">
                  Email
                </Label>
                <Input
                  id="email"
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                  className="col-span-3"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="website" className="text-right">
                  Sitio Web
                </Label>
                <Input
                  id="website"
                  value={formData.website}
                  onChange={(e) => setFormData({...formData, website: e.target.value})}
                  className="col-span-3"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="menu_link" className="text-right">
                  Link Menú
                </Label>
                <Input
                  id="menu_link"
                  value={formData.menu_link}
                  onChange={(e) => setFormData({...formData, menu_link: e.target.value})}
                  className="col-span-3"
                />
              </div>
            </TabsContent>

            <TabsContent value="advanced" className="space-y-4 py-4">
              <div className="grid grid-cols-4 items-start gap-4">
                <Label htmlFor="hours" className="text-right pt-2">
                  Horarios (JSON)
                </Label>
                <Textarea
                  id="hours"
                  value={formData.business_hours_json}
                  onChange={(e) => setFormData({...formData, business_hours_json: e.target.value})}
                  className="col-span-3 font-mono text-xs"
                  rows={6}
                />
              </div>
              <div className="grid grid-cols-4 items-start gap-4">
                <Label htmlFor="social" className="text-right pt-2">
                  Redes (JSON)
                </Label>
                <Textarea
                  id="social"
                  value={formData.social_links_json}
                  onChange={(e) => setFormData({...formData, social_links_json: e.target.value})}
                  className="col-span-3 font-mono text-xs"
                  rows={4}
                />
              </div>
            </TabsContent>

            <TabsContent value="subscription" className="space-y-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="plan" className="text-right">
                  Plan
                </Label>
                <Select 
                  value={formData.plan_type} 
                  onValueChange={(value) => setFormData({...formData, plan_type: value})}
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
                <Label htmlFor="status" className="text-right">
                  Estado
                </Label>
                <Select 
                  value={formData.subscription_status} 
                  onValueChange={(value) => setFormData({...formData, subscription_status: value})}
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

      {/* Suspend Alert Dialog */}
      <AlertDialog open={isSuspendOpen} onOpenChange={setIsSuspendOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {currentStatus === 'suspended' ? "¿Reactivar usuario?" : "¿Suspender usuario?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {currentStatus === 'suspended' 
                ? "El usuario recuperará el acceso al panel y sus bots volverán a responder."
                : "El usuario perderá acceso inmediato al panel y sus bots dejarán de responder. Esta acción es reversible."
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleSuspendUser}
              className={currentStatus === 'suspended' ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"}
            >
              {isLoading ? "Procesando..." : (currentStatus === 'suspended' ? "Reactivar" : "Suspender")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
