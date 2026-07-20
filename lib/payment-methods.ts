/**
 * Fuente única de los métodos de pago del POS/pedidos.
 * Los ids se guardan en pos_settings.payment_methods y orders.payments[].method.
 * Los iconos (lucide) los mapea cada componente para no acoplar UI acá.
 */
export const PAYMENT_METHOD_IDS = ["cash", "card", "transfer", "qr", "nave"] as const

export type PaymentMethodId = (typeof PAYMENT_METHOD_IDS)[number]

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "Efectivo",
  card: "Tarjeta",
  transfer: "Transferencia",
  qr: "QR",
  nave: "Nave",
}

/** Label legible de un método; los pagos viejos pueden traer su propio label. */
export function paymentLabel(id: string, fallbackLabel?: string): string {
  return PAYMENT_METHOD_LABELS[id] ?? fallbackLabel ?? id
}
