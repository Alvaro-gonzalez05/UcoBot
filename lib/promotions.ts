// Lógica compartida de promociones con descuento real.
// Funciones puras: el POS (cliente) y el bot (servidor) traen las promos y usan esto.

export interface Promotion {
  id: string
  name: string
  description?: string | null
  discount_type?: "percentage" | "fixed_amount" | null
  discount_value?: number | null
  /** Tope máximo del descuento (ej: 20% pero como máximo $10.000) */
  max_discount_amount?: number | null
  /** A qué se aplica el tope: por producto (default) o sobre el total de la compra */
  max_discount_scope?: "product" | "total" | null
  applies_to?: "all" | "products" | "category" | null
  product_ids?: string[] | null
  category?: string | null
  max_uses?: number | null
  current_uses?: number | null
  start_date?: string | null
  end_date?: string | null
  is_active?: boolean | null
}

export interface ProductLike {
  id: string
  price: number
  category?: string | null
}

export interface AppliedPromotion {
  promo: Promotion
  /** Precio final con el descuento aplicado */
  price: number
  /** Monto descontado (precio original - precio final) */
  amount: number
}

// ¿La promo está vigente ahora? (activa, con descuento, dentro de fechas y con cupo)
export function isPromotionActive(p: Promotion, now: Date = new Date()): boolean {
  if (!p.is_active) return false
  if (!p.discount_type || p.discount_value == null || p.discount_value <= 0) return false
  if (p.start_date && new Date(p.start_date) > now) return false
  if (p.end_date && new Date(p.end_date) < now) return false
  if (p.max_uses != null && (p.current_uses ?? 0) >= p.max_uses) return false
  return true
}

// ¿La promo aplica a este producto según su destino?
export function promotionAppliesToProduct(p: Promotion, product: ProductLike): boolean {
  const target = p.applies_to || "all"
  if (target === "all") return true
  if (target === "products") return (p.product_ids ?? []).includes(product.id)
  if (target === "category") return !!product.category && product.category === p.category
  return false
}

// Precio resultante de aplicar una promo a un precio dado (respeta el tope de descuento)
export function applyDiscount(price: number, p: Promotion): number {
  if (!p.discount_type || p.discount_value == null) return price
  let discount =
    p.discount_type === "percentage"
      ? price * (p.discount_value / 100)
      : p.discount_value
  // El tope por-producto se aplica acá; el tope sobre-el-total se aplica a nivel carrito (totalCapAdjustment)
  const scope = p.max_discount_scope ?? "product"
  if (scope === "product" && p.max_discount_amount != null && p.max_discount_amount > 0) {
    discount = Math.min(discount, p.max_discount_amount)
  }
  const result = price - discount
  return Math.max(0, Math.round(result * 100) / 100)
}

// Para promos con tope SOBRE EL TOTAL: calcula cuánto descuento hay que "devolver"
// porque la suma de descuentos de esa promo en el carrito superó su tope.
// Devuelve el monto a SUMAR de nuevo al total (0 si ningún tope total se excede).
export function totalCapAdjustment(
  items: { originalPrice?: number | null; price: number; quantity: number; promoId?: string | null }[],
  promos: Promotion[]
): number {
  const rawByPromo: Record<string, number> = {}
  for (const it of items) {
    if (!it.promoId || it.originalPrice == null) continue
    rawByPromo[it.promoId] = (rawByPromo[it.promoId] || 0) + (it.originalPrice - it.price) * it.quantity
  }
  let addBack = 0
  for (const [pid, rawDiscount] of Object.entries(rawByPromo)) {
    const promo = promos.find((p) => p.id === pid)
    if (!promo) continue
    const scope = promo.max_discount_scope ?? "product"
    if (scope === "total" && promo.max_discount_amount != null && promo.max_discount_amount > 0) {
      if (rawDiscount > promo.max_discount_amount) addBack += rawDiscount - promo.max_discount_amount
    }
  }
  return Math.round(addBack * 100) / 100
}

// La mejor promo vigente para un producto (la que más descuenta). null si no hay.
export function bestProductPromotion(
  product: ProductLike,
  promos: Promotion[],
  now: Date = new Date()
): AppliedPromotion | null {
  let best: AppliedPromotion | null = null
  for (const p of promos) {
    if (!isPromotionActive(p, now)) continue
    if (!promotionAppliesToProduct(p, product)) continue
    const price = applyDiscount(product.price, p)
    const amount = Math.round((product.price - price) * 100) / 100
    if (amount <= 0) continue
    if (!best || price < best.price) best = { promo: p, price, amount }
  }
  return best
}

// Etiqueta legible del descuento (ej: "20% OFF" o "$500 OFF")
export function promotionLabel(p: Promotion): string {
  if (!p.discount_type || p.discount_value == null) return ""
  return p.discount_type === "percentage"
    ? `${p.discount_value}% OFF`
    : `$${p.discount_value} OFF`
}
