/**
 * OAuth de Mercado Pago (Parte B): conectar la cuenta MP de un cliente para
 * cobrar en su nombre (links de pago del bot, QR del POS).
 *
 * Flujo "authorization_code":
 *  1. start  → redirigimos al cliente a la pantalla de autorización de MP.
 *  2. callback → MP vuelve con un `code` que cambiamos por access_token + refresh_token.
 *  3. refresh → renovamos el token antes de que venza (~6 meses).
 */

const OAUTH_AUTHORIZE = "https://auth.mercadopago.com.ar/authorization"
const OAUTH_TOKEN = "https://api.mercadopago.com/oauth/token"

export function getOAuthClientId(): string {
  const id = process.env.MP_OAUTH_CLIENT_ID
  if (!id) throw new Error("Falta MP_OAUTH_CLIENT_ID")
  return id
}

export function getOAuthClientSecret(): string {
  const secret = process.env.MP_OAUTH_CLIENT_SECRET
  if (!secret) throw new Error("Falta MP_OAUTH_CLIENT_SECRET")
  return secret
}

export function getRedirectUri(): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
  return `${base}/api/mp/oauth/callback`
}

/** URL a la que mandamos al cliente para que autorice la conexión. */
export function buildAuthorizationUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: getOAuthClientId(),
    response_type: "code",
    platform_id: "mp",
    state,
    redirect_uri: getRedirectUri(),
  })
  return `${OAUTH_AUTHORIZE}?${params.toString()}`
}

interface TokenResponse {
  access_token: string
  refresh_token: string
  user_id: number
  public_key?: string
  expires_in: number // segundos
}

/** Cambia el `code` del callback por los tokens del vendedor. */
export async function exchangeCodeForToken(code: string): Promise<TokenResponse> {
  const res = await fetch(OAUTH_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      client_id: getOAuthClientId(),
      client_secret: getOAuthClientSecret(),
      code,
      redirect_uri: getRedirectUri(),
    }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.message || "No se pudo obtener el token de Mercado Pago")
  return data as TokenResponse
}

/** Renueva el access_token usando el refresh_token. */
export async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const res = await fetch(OAUTH_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      grant_type: "refresh_token",
      client_id: getOAuthClientId(),
      client_secret: getOAuthClientSecret(),
      refresh_token: refreshToken,
    }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.message || "No se pudo renovar el token de Mercado Pago")
  return data as TokenResponse
}

export function expiresAtFromNow(expiresInSeconds: number): string {
  return new Date(Date.now() + expiresInSeconds * 1000).toISOString()
}
