/**
 * Cobros con el Mercado Pago del cliente (Parte B, Milestone 2).
 * Usa el access_token del vendedor guardado en mp_connections (con auto-refresh)
 * para crear preferencias de Checkout Pro (links de pago / QR).
 */
import { createAdminClient } from "@/lib/supabase/server"
import { refreshAccessToken, expiresAtFromNow } from "@/lib/mp-oauth"

const MP_API = "https://api.mercadopago.com"

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
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
