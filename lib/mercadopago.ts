/**
 * Helper mínimo para la API de Mercado Pago (suscripción de UcoBot vía preapproval).
 * Usa el Access Token del dueño de UcoBot (la cuenta que cobra el abono).
 */

const MP_API = "https://api.mercadopago.com"

export function getMpAccessToken(): string {
  const token = process.env.MP_ACCESS_TOKEN
  if (!token) throw new Error("Falta MP_ACCESS_TOKEN en las variables de entorno")
  return token
}

/** Precio mensual del abono de UcoBot (ARS). Configurable por env. */
export function getSubscriptionPrice(): number {
  return Number(process.env.MP_SUBSCRIPTION_PRICE || 90000)
}

export function getAppUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/+$/, "")
}

/** Crea una suscripción (preapproval) sin plan asociado, con precio fijo mensual.
 *  Si se pasa `startDate`, el PRIMER cobro ocurre en esa fecha (ej: fin del trial);
 *  la tarjeta se adhiere ahora pero recién se debita al terminar la prueba. */
export async function createPreapproval(params: {
  payerEmail: string
  externalReference: string
  reason?: string
  startDate?: string // ISO; cuándo arranca a cobrar (default: ya)
}) {
  // MP exige que start_date sea futuro; aseguramos al menos +10 min.
  const minStart = Date.now() + 10 * 60 * 1000
  const start = params.startDate ? Math.max(new Date(params.startDate).getTime(), minStart) : null

  const auto_recurring: any = {
    frequency: 1,
    frequency_type: "months",
    transaction_amount: getSubscriptionPrice(),
    currency_id: "ARS",
  }
  if (start) auto_recurring.start_date = new Date(start).toISOString()

  const body = {
    reason: params.reason || "Suscripción UcoBot",
    external_reference: params.externalReference,
    payer_email: params.payerEmail,
    back_url: `${getAppUrl()}/dashboard?suscripcion=ok`,
    status: "pending",
    auto_recurring,
  }

  const res = await fetch(`${MP_API}/preapproval`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getMpAccessToken()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data?.message || "Mercado Pago rechazó la creación de la suscripción")
  }
  // data.init_point = URL donde el cliente autoriza el débito automático
  return data as { id: string; init_point: string; status: string }
}

/** Consulta el estado actual de una suscripción (preapproval) por id. */
export async function getPreapproval(id: string) {
  const res = await fetch(`${MP_API}/preapproval/${id}`, {
    headers: { Authorization: `Bearer ${getMpAccessToken()}` },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.message || "No se pudo consultar la suscripción en Mercado Pago")
  return data as {
    id: string
    status: string // authorized | paused | cancelled | pending
    external_reference?: string
    payer_email?: string
    next_payment_date?: string
  }
}

/** Consulta un pago por id (para los cobros recurrentes). */
export async function getPayment(id: string) {
  const res = await fetch(`${MP_API}/v1/payments/${id}`, {
    headers: { Authorization: `Bearer ${getMpAccessToken()}` },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.message || "No se pudo consultar el pago en Mercado Pago")
  return data as {
    id: number
    status: string
    external_reference?: string
    metadata?: any
    preapproval_id?: string
    transaction_amount?: number
    currency_id?: string
    date_approved?: string
  }
}
