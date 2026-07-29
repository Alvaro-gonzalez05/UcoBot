import { getGraphVersion } from '@/lib/meta/credentials'
import { sendYCloudMessage, toE164, getIntegrationKey } from '@/lib/whatsapp/ycloud'

/**
 * Capa de proveedores de WhatsApp.
 *
 * TODO el envío de WhatsApp de UcoBot pasa por acá. La lógica del chatbot,
 * CRM y automatizaciones NUNCA sabe qué proveedor hay detrás.
 *
 * Proveedores:
 *  - 'cloud'     (default) WhatsApp Cloud API oficial de Meta. Paridad exacta
 *                con el comportamiento histórico (normalización 549→54 incluida).
 *  - 'ycloud'    YCloud, BSP oficial de Meta. El WABA del cliente cuelga de la
 *                solución de YCloud, así que NO hace falta app de Meta propia.
 *  - 'evolution' Evolution API (Baileys / WhatsApp Web NO oficial). Puente
 *                temporal mientras se resuelve el Tech Provider de Meta.
 *
 * El discriminador vive en integration.config.provider ('cloud' si falta,
 * así las integraciones existentes no cambian de comportamiento).
 */

export interface SendResult {
  success: boolean
  messageId?: string
  error?: string
}

export interface MediaInput {
  url: string
  kind: 'image' | 'video' | 'audio' | 'document'
  caption?: string
  filename?: string
}

export interface WhatsAppProvider {
  readonly name: 'cloud' | 'ycloud' | 'evolution'
  sendText(to: string, text: string, opts?: { replyToId?: string }): Promise<SendResult>
  sendMedia(to: string, media: MediaInput): Promise<SendResult>
}

type IntegrationLike = {
  config?: Record<string, any> | null
} | null | undefined

/* ------------------------------------------------------------------ */
/* Cloud API (Meta oficial)                                            */
/* ------------------------------------------------------------------ */

class CloudApiProvider implements WhatsAppProvider {
  readonly name = 'cloud' as const

  constructor(
    private accessToken: string,
    private phoneNumberId: string,
  ) {}

  /** Meta Cloud API espera AR sin el 9: 549261... → 54261... (comportamiento histórico) */
  private normalize(phone: string): string {
    return phone.startsWith('549') ? '54' + phone.substring(3) : phone
  }

  async sendText(to: string, text: string, opts?: { replyToId?: string }): Promise<SendResult> {
    try {
      const body: any = {
        messaging_product: 'whatsapp',
        to: this.normalize(to),
        type: 'text',
        text: { body: text },
      }
      if (opts?.replyToId) body.context = { message_id: opts.replyToId }

      const res = await fetch(
        `https://graph.facebook.com/${getGraphVersion()}/${this.phoneNumberId}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        },
      )
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        return { success: false, error: data.error?.message || 'Meta API error' }
      }
      return { success: true, messageId: data.messages?.[0]?.id }
    } catch {
      return { success: false, error: 'Network error' }
    }
  }

  async sendMedia(to: string, media: MediaInput): Promise<SendResult> {
    try {
      const body: any = {
        messaging_product: 'whatsapp',
        to: this.normalize(to),
        type: media.kind,
        [media.kind]: {
          link: media.url,
          ...(media.caption && media.kind !== 'audio' ? { caption: media.caption } : {}),
          ...(media.kind === 'document' && media.filename ? { filename: media.filename } : {}),
        },
      }
      const res = await fetch(
        `https://graph.facebook.com/${getGraphVersion()}/${this.phoneNumberId}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        },
      )
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        return { success: false, error: data.error?.message || 'Meta API error' }
      }
      return { success: true, messageId: data.messages?.[0]?.id }
    } catch {
      return { success: false, error: 'Network error' }
    }
  }
}

/* ------------------------------------------------------------------ */
/* YCloud (BSP oficial de Meta)                                        */
/* ------------------------------------------------------------------ */

class YCloudProvider implements WhatsAppProvider {
  readonly name = 'ycloud' as const

  /**
   * `from` = número del negocio en E.164 con "+" (lo exige la API de YCloud).
   * `apiKey` = credencial de ESA cuenta de YCloud. Null para las integraciones
   * viejas, que siguen usando la de la plataforma.
   */
  constructor(
    private from: string,
    private apiKey: string | null,
  ) {}

  async sendText(to: string, text: string, opts?: { replyToId?: string }): Promise<SendResult> {
    try {
      const body: any = {
        from: this.from,
        to: toE164(to),
        type: 'text',
        text: { body: text, preview_url: false },
      }
      // Cita al mensaje anterior (mismo concepto que context.message_id en Meta)
      if (opts?.replyToId) body.context = { message_id: opts.replyToId }

      const data = await sendYCloudMessage(body, this.apiKey)
      return { success: true, messageId: data?.id }
    } catch (e: any) {
      return { success: false, error: e?.message || 'YCloud error' }
    }
  }

  async sendMedia(to: string, media: MediaInput): Promise<SendResult> {
    try {
      const data = await sendYCloudMessage(
        {
          from: this.from,
          to: toE164(to),
          type: media.kind,
          [media.kind]: {
            link: media.url,
            ...(media.caption && media.kind !== 'audio' ? { caption: media.caption } : {}),
            ...(media.kind === 'document' && media.filename ? { filename: media.filename } : {}),
          },
        },
        this.apiKey,
      )
      return { success: true, messageId: data?.id }
    } catch (e: any) {
      return { success: false, error: e?.message || 'YCloud error' }
    }
  }
}

/* ------------------------------------------------------------------ */
/* Evolution API (Baileys, no oficial)                                 */
/* ------------------------------------------------------------------ */

class EvolutionProvider implements WhatsAppProvider {
  readonly name = 'evolution' as const

  constructor(
    private baseUrl: string,
    private apiKey: string,
    private instance: string,
  ) {}

  private headers() {
    return { apikey: this.apiKey, 'Content-Type': 'application/json' }
  }

  /**
   * OJO: al revés que Cloud API. WhatsApp Web usa el JID real del celular,
   * que en AR móvil ES con 9 (549261...). Acá NO se quita el 9.
   */
  private normalize(phone: string): string {
    return phone.replace(/\D/g, '')
  }

  async sendText(to: string, text: string): Promise<SendResult> {
    try {
      const res = await fetch(
        `${this.baseUrl}/message/sendText/${encodeURIComponent(this.instance)}`,
        {
          method: 'POST',
          headers: this.headers(),
          body: JSON.stringify({ number: this.normalize(to), text }),
        },
      )
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        return { success: false, error: data?.message || data?.error || `Evolution HTTP ${res.status}` }
      }
      return { success: true, messageId: data?.key?.id }
    } catch {
      return { success: false, error: 'Evolution network error' }
    }
  }

  async sendMedia(to: string, media: MediaInput): Promise<SendResult> {
    try {
      const res = await fetch(
        `${this.baseUrl}/message/sendMedia/${encodeURIComponent(this.instance)}`,
        {
          method: 'POST',
          headers: this.headers(),
          body: JSON.stringify({
            number: this.normalize(to),
            mediatype: media.kind === 'document' ? 'document' : media.kind,
            media: media.url,
            ...(media.caption ? { caption: media.caption } : {}),
            ...(media.filename ? { fileName: media.filename } : {}),
          }),
        },
      )
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        return { success: false, error: data?.message || data?.error || `Evolution HTTP ${res.status}` }
      }
      return { success: true, messageId: data?.key?.id }
    } catch {
      return { success: false, error: 'Evolution network error' }
    }
  }
}

/* ------------------------------------------------------------------ */
/* Factory                                                             */
/* ------------------------------------------------------------------ */

export function getEvolutionConfig(): { baseUrl: string; apiKey: string } | null {
  const baseUrl = process.env.EVOLUTION_API_URL?.replace(/\/$/, '')
  const apiKey = process.env.EVOLUTION_API_KEY
  if (!baseUrl || !apiKey) return null
  return { baseUrl, apiKey }
}

/**
 * Devuelve el proveedor para una integración de WhatsApp, o null si la
 * integración no está completa. Default: 'cloud' (comportamiento histórico).
 */
export function getWhatsAppProvider(integration: IntegrationLike): WhatsAppProvider | null {
  const cfg = integration?.config || {}

  if (cfg.provider === 'ycloud') {
    // `ycloud_from` se guarda al vincular el número (E.164 con "+").
    const from = cfg.ycloud_from || (cfg.phone_number_id ? `+${cfg.phone_number_id}` : null)
    // Credencial propia de la cuenta; si no tiene, la de la plataforma.
    const apiKey = getIntegrationKey(integration)
    if (!from || !apiKey) return null
    return new YCloudProvider(from, apiKey)
  }

  if (cfg.provider === 'evolution') {
    const evo = getEvolutionConfig()
    const instance = cfg.evolution_instance || cfg.phone_number_id
    if (!evo || !instance) return null
    return new EvolutionProvider(evo.baseUrl, evo.apiKey, instance)
  }

  // Cloud (default): token propio del cliente primero (manual/legacy);
  // el System Token solo sirve para WABAs conectados vía Embedded Signup.
  const accessToken = cfg.access_token?.trim() || process.env.WHATSAPP_SYSTEM_TOKEN?.trim()
  const phoneNumberId = cfg.phone_number_id
  if (!accessToken || !phoneNumberId) return null
  return new CloudApiProvider(accessToken, phoneNumberId)
}
