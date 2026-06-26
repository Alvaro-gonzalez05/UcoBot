/**
 * Cobros con el Mercado Pago del cliente (Parte B, Milestone 2).
 * Usa el access_token del vendedor guardado en mp_connections (con auto-refresh)
 * para crear preferencias de Checkout Pro (links de pago / QR).
 */
import { createAdminClient } from "@/lib/supabase/server"
import { refreshAccessToken, expiresAtFromNow } from "@/lib/mp-oauth"

const MP_API = "https://api.mercadopago.com"

function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/+$/, "")
}

/**
 * Devuelve un access_token válido del vendedor. Si está por vencer (o vencido),
 * lo renueva con el refresh_token y actualiza la base. Null si no tiene conexión.
 */
export async function getValidSellerToken(userId: string): Promise<{ token: string; mpUserId: string | null } | null> {
  const admin = createAdminClient()
  const { data: conn } = await admin
    .from("mp_connections")
    .select("access_token, refresh_token, expires_at, mp_user_id")
    .eq("user_id", userId)
    .maybeSingle()

  if (!conn) return null

  // ¿Vence en menos de 7 días? Lo renovamos.
  const expSoon =
    !conn.expires_at || new Date(conn.expires_at).getTime() - Date.now() < 7 * 24 * 60 * 60 * 1000

  if (expSoon && conn.refresh_token) {
    try {
      const refreshed = await refreshAccessToken(conn.refresh_token)
      await admin
        .from("mp_connections")
        .update({
          access_token: refreshed.access_token,
          refresh_token: refreshed.refresh_token || conn.refresh_token,
          expires_at: expiresAtFromNow(refreshed.expires_in),
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId)
      return { token: refreshed.access_token, mpUserId: String(refreshed.user_id || conn.mp_user_id || "") }
    } catch (e) {
      console.error("No se pudo refrescar el token MP, uso el actual:", e)
    }
  }

  return { token: conn.access_token, mpUserId: conn.mp_user_id }
}

/**
 * Crea una preferencia de Checkout Pro en la cuenta del vendedor.
 * Devuelve el init_point (URL de pago) y el id de la preferencia.
 */
export async function createPreference(params: {
  sellerUserId: string
  sellerToken: string
  title: string
  amount: number
  externalReference?: string // ej: id del pedido
  payerEmail?: string
}) {
  const body: any = {
    items: [
      {
        title: params.title.slice(0, 250),
        quantity: 1,
        unit_price: params.amount,
        currency_id: "ARS",
      },
    ],
    // El webhook necesita saber de qué vendedor es el pago → va en la URL
    notification_url: `${appUrl()}/api/mp/payments-webhook?seller=${params.sellerUserId}`,
    back_urls: {
      success: `${appUrl()}/pago/ok`,
      failure: `${appUrl()}/pago/error`,
      pending: `${appUrl()}/pago/pendiente`,
    },
    auto_return: "approved",
  }
  if (params.externalReference) body.external_reference = params.externalReference
  if (params.payerEmail) body.payer = { email: params.payerEmail }

  const res = await fetch(`${MP_API}/checkout/preferences`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.sellerToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.message || "Mercado Pago rechazó la creación del pago")
  return { id: data.id as string, init_point: data.init_point as string }
}

/**
 * Asegura que el vendedor tenga una sucursal + caja (POS) para el QR interoperable.
 * Devuelve el external_pos_id (lo guarda en mp_connections para no recrearlo).
 */
export async function ensureSellerPos(userId: string, sellerToken: string, mpUserId: string): Promise<string | null> {
  const admin = createAdminClient()
  const { data: conn } = await admin
    .from("mp_connections")
    .select("pos_external_id, store_id")
    .eq("user_id", userId)
    .maybeSingle()
  if (conn?.pos_external_id) return conn.pos_external_id

  const { data: prof } = await admin
    .from("user_profiles")
    .select("business_name, location")
    .eq("id", userId)
    .maybeSingle()

  const extStore = `UCO${userId.replace(/-/g, "").slice(0, 10).toUpperCase()}`
  const extPos = `${extStore}P1`

  // 1) Crear sucursal (si ya existe, MP devuelve error y seguimos con el store_id guardado)
  let storeId = conn?.store_id || null
  try {
    const storeRes = await fetch(`${MP_API}/users/${mpUserId}/stores`, {
      method: "POST",
      headers: { Authorization: `Bearer ${sellerToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: prof?.business_name || "Local",
        external_id: extStore,
        location: {
          street_number: "0",
          street_name: prof?.location || "Sin dirección",
          city_name: "N/A",
          state_name: "N/A",
          latitude: -34.6037,
          longitude: -58.3816,
        },
      }),
    })
    const store = await storeRes.json().catch(() => ({}))
    if (store?.id) storeId = String(store.id)
  } catch (e) {
    console.error("Error creando sucursal MP:", e)
  }

  // 2) Crear caja (POS)
  try {
    const posRes = await fetch(`${MP_API}/pos`, {
      method: "POST",
      headers: { Authorization: `Bearer ${sellerToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "UcoBot POS",
        fixed_amount: true,
        store_id: storeId,
        external_store_id: extStore,
        external_id: extPos,
        category: 621102,
      }),
    })
    const pos = await posRes.json().catch(() => ({}))
    // Si la caja ya existía o se creó, usamos nuestro external_id determinístico.
    if (!posRes.ok && !String(pos?.message || "").toLowerCase().includes("already")) {
      console.error("Error creando caja MP:", pos)
    }
  } catch (e) {
    console.error("Error creando caja MP:", e)
  }

  await admin.from("mp_connections").update({ store_id: storeId, pos_external_id: extPos }).eq("user_id", userId)
  return extPos
}

/** Crea un QR dinámico (interoperable) con monto. Devuelve la trama qr_data y el id de la orden. */
export async function createQrOrder(
  sellerToken: string,
  externalPosId: string,
  amount: number,
  externalReference: string
): Promise<{ qrData: string | null; orderId: string | null }> {
  const res = await fetch(`${MP_API}/v1/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${sellerToken}`,
      "Content-Type": "application/json",
      "X-Idempotency-Key": (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`),
    },
    body: JSON.stringify({
      type: "qr",
      total_amount: amount.toFixed(2),
      external_reference: externalReference,
      config: { qr: { external_pos_id: externalPosId, mode: "dynamic" } },
      transactions: { payments: [{ amount: amount.toFixed(2) }] },
    }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data?.message || data?.errors?.[0]?.message || "Mercado Pago rechazó la creación del QR")
  }
  return { qrData: data?.type_response?.qr_data || data?.qr_data || null, orderId: data?.id ? String(data.id) : null }
}

/** Consulta el estado de una orden (para saber si el QR ya se pagó). */
export async function getQrOrderStatus(sellerToken: string, orderId: string): Promise<{ paid: boolean; status: string }> {
  const res = await fetch(`${MP_API}/v1/orders/${orderId}`, {
    headers: { Authorization: `Bearer ${sellerToken}` },
  })
  const data = await res.json().catch(() => ({}))
  const status = String(data?.status || "")
  const paid = ["processed", "paid", "closed", "completed"].includes(status)
  return { paid, status }
}

/** Consulta un pago con el token del vendedor (para el webhook). */
export async function getPaymentWithToken(token: string, paymentId: string) {
  const res = await fetch(`${MP_API}/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.message || "No se pudo consultar el pago")
  return data as {
    id: number
    status: string
    transaction_amount: number
    external_reference?: string
    payer?: { email?: string }
  }
}
