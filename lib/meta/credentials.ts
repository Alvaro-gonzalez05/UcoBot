/**
 * Resolución centralizada de credenciales de Meta (WhatsApp + Instagram).
 *
 * Estrategia:
 *  - WhatsApp: si la integración tiene token propio (`integration.config.access_token`,
 *    configuración manual o legacy) se usa ese, porque el System Token de UcoBot
 *    no tiene acceso a WABAs que no pasaron por Embedded Signup. Si no hay token
 *    propio, se usa el System User Token único (Embedded Signup).
 *  - Instagram: Long-lived Page Access Token por cliente (Facebook Login).
 *
 * Toda llamada a la Graph API de Meta debe pasar por este módulo para mantener
 * un solo punto de cambio cuando se complete la migración.
 */

type Integration = {
  config?: {
    access_token?: string
    [key: string]: any
  } | null
} | null | undefined

export function getWhatsAppToken(integration?: Integration): string | null {
  const ownToken = integration?.config?.access_token?.trim()
  if (ownToken) return ownToken

  const systemToken = process.env.WHATSAPP_SYSTEM_TOKEN?.trim()
  return systemToken || null
}

export function getInstagramToken(integration?: Integration): string | null {
  const token = integration?.config?.access_token?.trim()
  return token || null
}

export function getGraphVersion(): string {
  return process.env.META_GRAPH_VERSION || 'v21.0'
}

export function getGraphHost(token: string): string {
  return token.startsWith('IGAA') ? 'graph.instagram.com' : 'graph.facebook.com'
}
