"use client"

import { useEffect, useState } from "react"
import { Bell, BellOff, BellRing } from "lucide-react"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"

type PermissionState = "default" | "granted" | "denied" | "unsupported"

export function PushNotificationToggle() {
  const [permission, setPermission] = useState<PermissionState>("default")
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      setPermission("unsupported")
      return
    }
    setPermission(Notification.permission as PermissionState)
  }, [])

  const registerServiceWorker = async () => {
    const registration = await navigator.serviceWorker.register("/sw.js")
    await navigator.serviceWorker.ready
    return registration
  }

  const subscribeUser = async (registration: ServiceWorkerRegistration) => {
    const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    if (!vapidPublicKey) {
      throw new Error("VAPID public key not configured")
    }

    const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey)

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey,
    })

    // Send subscription to server
    const res = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(subscription.toJSON()),
    })

    if (!res.ok) {
      throw new Error("Failed to save subscription on server")
    }

    return subscription
  }

  const handleEnable = async () => {
    setIsLoading(true)
    try {
      const registration = await registerServiceWorker()
      const result = await Notification.requestPermission()
      setPermission(result as PermissionState)

      if (result === "granted") {
        await subscribeUser(registration)
        toast.success("Notificaciones activadas correctamente")
      } else if (result === "denied") {
        toast.error("Notificaciones bloqueadas. Puedes habilitarlas desde la configuración de tu navegador.")
      }
    } catch (error) {
      console.error("Error enabling push notifications:", error)
      toast.error("Error al activar notificaciones")
    } finally {
      setIsLoading(false)
    }
  }

  const handleDisable = async () => {
    setIsLoading(true)
    try {
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.getSubscription()

      if (subscription) {
        // Remove from server
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        })

        // Unsubscribe from browser
        await subscription.unsubscribe()
      }

      setPermission("default")
      toast.success("Notificaciones desactivadas")
    } catch (error) {
      console.error("Error disabling push:", error)
      toast.error("Error al desactivar notificaciones")
    } finally {
      setIsLoading(false)
    }
  }

  if (permission === "unsupported") {
    return null
  }

  if (permission === "granted") {
    return (
      <Button
        variant="ghost"
        size="icon"
        onClick={handleDisable}
        disabled={isLoading}
        className="relative h-9 w-9 rounded-xl text-[#1DB954] hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
        title="Notificaciones push activadas — clic para desactivar"
      >
        <BellRing className="h-5 w-5" />
        <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-[#1DB954] border-2 border-background" />
      </Button>
    )
  }

  if (permission === "denied") {
    return (
      <Button
        variant="ghost"
        size="icon"
        disabled
        className="h-9 w-9 rounded-xl text-muted-foreground opacity-50"
        title="Notificaciones bloqueadas en tu navegador"
      >
        <BellOff className="h-5 w-5" />
      </Button>
    )
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleEnable}
      disabled={isLoading}
      className="h-9 w-9 rounded-xl text-muted-foreground hover:text-[#D1F366] hover:bg-[#D1F366]/10 transition-colors"
      title="Activar notificaciones push"
    >
      <Bell className="h-5 w-5" />
    </Button>
  )
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/")
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}
