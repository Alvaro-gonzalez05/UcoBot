"use client"

import { useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import { Ban, CheckCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
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
import { toast } from "sonner"

interface UserSuspendButtonProps {
  userId: string
  currentStatus: string
  userName?: string
}

export function UserSuspendButton({ userId, currentStatus, userName }: UserSuspendButtonProps) {
  const [isSuspendOpen, setIsSuspendOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const handleSuspendUser = async () => {
    setIsLoading(true)
    try {
      const newStatus = currentStatus === 'suspended' ? 'active' : 'suspended'
      
      // Mismo motivo que en el menú de acciones: sin política de UPDATE para
      // admin, el cambio desde el navegador no tocaba ninguna fila.
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

      <AlertDialog open={isSuspendOpen} onOpenChange={setIsSuspendOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {currentStatus === 'suspended' ? "¿Reactivar usuario?" : "¿Suspender usuario?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {currentStatus === 'suspended' 
                ? `¿Estás seguro de que deseas reactivar la cuenta de ${userName || 'este usuario'}? Recuperará el acceso al panel y sus bots volverán a responder.`
                : `¿Estás seguro de que deseas suspender la cuenta de ${userName || 'este usuario'}? Perderá acceso inmediato al panel y sus bots dejarán de responder.`
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
