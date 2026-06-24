/**
 * Estados de suscripción que se consideran "al día" (la cuenta puede operar).
 * - active: abono pagado por Mercado Pago
 * - trial / trialing: período de prueba
 */
export const ACTIVE_SUBSCRIPTION_STATUSES = ["active", "trial", "trialing"]

/** True si la cuenta está al día (puede usar el bot y las funciones de pago). */
export function isSubscriptionActive(status?: string | null): boolean {
  return !!status && ACTIVE_SUBSCRIPTION_STATUSES.includes(status)
}
