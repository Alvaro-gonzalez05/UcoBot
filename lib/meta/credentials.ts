/**
 * Resolución centralizada de credenciales de Meta (WhatsApp + Instagram).
 *
 * Estrategia:
 *  - WhatsApp: System User Token único (Embedded Signup) con fallback al token
 *    por cliente en `integration.config.access_token` para integraciones legacy.
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
  const systemToken = process.env.WHATSAPP_SYSTEM_TOKEN?.trim()
  if (systemToken) return systemToken

  const legacyToken = integration?.config?.access_token?.trim()
  return legacyToken || null
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
