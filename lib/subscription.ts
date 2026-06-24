/**
 * Datos mínimos del perfil para evaluar si la cuenta puede operar.
 */
export interface SubscriptionInfo {
  subscription_status?: string | null
  trial_ends_at?: string | null
  billing_exempt?: boolean | null
}

const TRIAL_STATUSES = ["trial", "trialing"]

/**
 * True si la cuenta está "al día" (puede usar el bot y las funciones de pago):
 *  - billing_exempt = true (pago manual / VIP, nunca se bloquea), o
 *  - subscription_status = 'active' (abono pagado por Mercado Pago), o
 *  - en trial Y el trial todavía NO venció.
 */
export function isSubscriptionActive(p?: SubscriptionInfo | null): boolean {
  if (!p) return false
  if (p.billing_exempt) return true
  if (p.subscription_status === "active") return true
  if (TRIAL_STATUSES.includes(p.subscription_status || "")) {
    return !!p.trial_ends_at && new Date(p.trial_ends_at).getTime() > Date.now()
  }
  return false
}

/** Días restantes de trial (>=0). Null si no está en trial. */
export function trialDaysLeft(p?: SubscriptionInfo | null): number | null {
  if (!p || !TRIAL_STATUSES.includes(p.subscription_status || "") || !p.trial_ends_at) return null
  const ms = new Date(p.trial_ends_at).getTime() - Date.now()
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)))
}
