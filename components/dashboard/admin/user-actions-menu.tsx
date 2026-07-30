"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import { MoreHorizontal, CreditCard, Ban, CheckCircle, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import Link from "next/link"

interface UserActionsMenuProps {
  userId: string
  currentPlan: string
  currentStatus: string
  userName: string
}

export function UserActionsMenu({ userId, currentPlan, currentStatus, userName }: UserActionsMenuProps) {
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [isSuspendOpen, setIsSuspendOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const [formData, setFormData] = useState({
    plan_type: currentPlan === 'free' ? 'trial' : currentPlan,
    subscription_status: currentStatus
  })

  useEffect(() => {
    setFormData({
      plan_type: currentPlan === 'free' ? 'trial' : currentPlan,
      subscription_status: currentStatus
    })
  }, [currentPlan, currentStatus])

  const handleUpdateSubscription = async () => {
    setIsLoading(true)
    try {
      // Va por el servidor: `user_profiles` no tiene política de UPDATE para
      // admin, así que hacerlo desde acá no cambiaba nada y encima avisaba que sí.
      const res = await fetch("/api/admin/user-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          plan_type: formData.plan_type,
          subscription_status: formData.subscription_status,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "No se pudo actualizar")

      toast.success("Suscripción actualizada", {
        description: `El usuario ahora es ${formData.plan_type} (${formData.subscription_status})`
      })
      setIsEditOpen(false)
      router.refresh()
    } catch (error) {
      console.error(error)
      toast.error("Error al actualizar", {
        description: error instanceof Error ? error.message : "No se pudo actualizar la suscripción"
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleSuspendUser = async () => {
    setIsLoading(true)
    try {
      // Toggle suspension
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
          ? "El usuario ya no podrá acceder al sistema" 
          : "El acceso del usuario ha sido restaurado"
      })
      setIsSuspendOpen(false)
      router.refresh()
    } catch (error) {
      console.error(error)
      toast.error("Error", {
        description: "No se pudo cambiar el estado del usuario"
      })
    } finally {
      setIsLoading(false)
    }
  }

  const isSuspended = currentStatus === 'suspended'

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-8 w-8 p-0">
            <span className="sr-only">Abrir menú</span>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Acciones</DropdownMenuLabel>
          <DropdownMenuItem asChild>
            <Link href={`/dashboard/admin/users/${userId}`}>Ver detalles</Link>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setTimeout(() => setIsEditOpen(true), 100)}>
            <CreditCard className="mr-2 h-4 w-4" />
            Editar suscripción
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem 
            onSelect={() => setTimeout(() => setIsSuspendOpen(true), 100)}
            className={isSuspended ? "text-green-600" : "text-red-600"}
          >
            {isSuspended ? (
              <>
                <CheckCircle className="mr-2 h-4 w-4" />
                Reactivar cuenta
              </>
            ) : (
              <>
                <Ban className="mr-2 h-4 w-4" />
                Suspender cuenta
              </>
            )}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Edit Subscription Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Suscripción</DialogTitle>
            <DialogDescription>
              Modifica el plan y estado de {userName}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="plan">Plan</Label>
              <Select
                value={formData.plan_type}
                onValueChange={(val) => setFormData({...formData, plan_type: val})}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="trial">Trial / Free</SelectItem>
                  <SelectItem value="pro">Pro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="status">Estado</Label>
              <Select
                value={formData.subscription_status}
                onValueChange={(val) => setFormData({...formData, subscription_status: val})}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Activo</SelectItem>
                  <SelectItem value="trialing">En Prueba</SelectItem>
                  <SelectItem value="past_due">Pago Pendiente</SelectItem>
                  <SelectItem value="canceled">Cancelado</SelectItem>
                  <SelectItem value="suspended">Suspendido</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditOpen(false)}>Cancelar</Button>
            <Button onClick={handleUpdateSubscription} disabled={isLoading}>
              {isLoading ? "Guardando..." : "Guardar Cambios"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Suspend Confirmation Alert */}
      <AlertDialog open={isSuspendOpen} onOpenChange={setIsSuspendOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isSuspended ? "¿Reactivar usuario?" : "¿Suspender usuario?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isSuspended 
                ? `¿Estás seguro de que quieres reactivar el acceso a ${userName}?`
                : `¿Estás seguro de que quieres suspender a ${userName}? El usuario perderá acceso inmediato al sistema y sus bots dejarán de responder.`
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleSuspendUser}
              className={isSuspended ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"}
            >
              {isLoading ? "Procesando..." : (isSuspended ? "Reactivar" : "Suspender")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
