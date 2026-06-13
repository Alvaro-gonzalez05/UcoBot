import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Realtime de la tarjeta de fidelización.
 *
 * Usamos BROADCAST (no postgres_changes) porque la tarjeta pública la abre un
 * cliente final sin login: con broadcast no exponemos la tabla `clients` por RLS.
 * El canal lleva el loyalty_code (un UUID) que actúa como "secreto" de acceso.
 *
 * El Punto de Venta emite en el canal cuando suma puntos/sellos; la tarjeta
 * escucha y se anima sola, sin refrescar.
 */

export const loyaltyChannelName = (loyaltyCode: string) => `loyalty-card-${loyaltyCode}`

export interface LoyaltyUpdatePayload {
  points?: number
  stamps?: number
  total_purchases?: number
}

export async function broadcastLoyaltyUpdate(
  supabase: SupabaseClient,
  loyaltyCode: string,
  payload: LoyaltyUpdatePayload
) {
  if (!loyaltyCode) return
  const channel = supabase.channel(loyaltyChannelName(loyaltyCode))

  const subscribed = await new Promise<boolean>((resolve) => {
    const safety = setTimeout(() => resolve(false), 3000)
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        clearTimeout(safety)
        resolve(true)
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        clearTimeout(safety)
        resolve(false)
      }
    })
  })

  try {
    if (subscribed) {
      // Pequeño settle: tras SUBSCRIBED el socket de Phoenix puede no estar
      // listo y el primer broadcast se pierde. 250ms lo evita.
      await new Promise((r) => setTimeout(r, 250))
      await channel.send({ type: "broadcast", event: "points-updated", payload })
      console.log("[loyalty] update emitido", payload)
    } else {
      console.warn("[loyalty] no se pudo suscribir al canal Realtime para emitir")
    }
  } catch (err) {
    console.warn("[loyalty] error emitiendo broadcast:", err)
  } finally {
    // Mantener el canal vivo un momento para asegurar el flush antes de cerrarlo
    setTimeout(() => {
      supabase.removeChannel(channel)
    }, 2000)
  }
}
