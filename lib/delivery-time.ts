/**
 * Tiempo de entrega ajustado por la carga real de trabajo.
 *
 * MOTIVO: el tiempo estaba escrito a mano ("20-25 minutos") y el bot lo repetía
 * igual con la cocina vacía que con quince pedidos encima. Un viernes a la noche
 * eso es prometer algo que no se va a cumplir.
 *
 * El modelo mental es el del cocinero, no el de un algoritmo: "puedo hacer N
 * pedidos a la vez y cada tanda me lleva M minutos". Cada tanda que hay por
 * delante suma su tiempo.
 */

export interface DemandSettings {
  kitchen_capacity?: number | null
  batch_minutes?: number | null
  max_extra_minutes?: number | null
}

/** Estados en los que un pedido todavía ocupa a la cocina. */
export const ACTIVE_ORDER_STATUSES = ['pending', 'confirmed', 'preparing']

/**
 * Minutos extra por la cola de pedidos.
 *
 * Devuelve 0 si el negocio no configuró la capacidad: sin ese dato no hay forma
 * de saber cuánto tarda, y estirar el tiempo por las dudas sería inventar.
 */
export function extraMinutesForDemand(
  activeOrders: number,
  settings?: DemandSettings | null,
): number {
  const capacity = Number(settings?.kitchen_capacity) || 0
  const perBatch = Number(settings?.batch_minutes) || 0
  if (capacity <= 0 || perBatch <= 0) return 0

  // Los pedidos que entran en la tanda actual no suman: ya se están haciendo.
  const batchesAhead = Math.floor(activeOrders / capacity)
  if (batchesAhead <= 0) return 0

  const extra = batchesAhead * perBatch
  const cap = Number(settings?.max_extra_minutes) || 0
  return cap > 0 ? Math.min(extra, cap) : extra
}

/**
 * Suma los minutos extra a un tiempo escrito a mano.
 *
 * El campo es texto libre ("20-25 minutos", "media hora", "30 a 45 min"), así que
 * se buscan los números y se desplazan. Si no hay ninguno se devuelve el texto
 * original con la demora aclarada aparte: es preferible eso a romper la frase.
 */
export function applyDemandToEstimate(baseText: string, extraMinutes: number): string {
  const base = (baseText || '').trim()
  if (extraMinutes <= 0) return base
  if (!base) return `${extraMinutes} minutos más de lo habitual`

  const numbers = base.match(/\d+/g)
  if (!numbers || numbers.length === 0) {
    return `${base} (hoy sumale ~${extraMinutes} minutos por demanda)`
  }

  let i = 0
  return base.replace(/\d+/g, () => String(Number(numbers[i++]) + extraMinutes))
}

/** Frase lista para el prompt, con la aclaración de por qué se estiró. */
export function describeDemand(activeOrders: number, extraMinutes: number): string {
  if (extraMinutes <= 0) return ''
  return `Hay ${activeOrders} pedidos en preparación, así que los tiempos están ${extraMinutes} minutos por encima de lo normal. Si preguntan por qué demora más, podés decir que hay mucha demanda en este momento.`
}
