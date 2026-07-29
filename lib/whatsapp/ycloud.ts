import { createHmac, timingSafeEqual } from 'crypto'

/**
 * Cliente de la API de YCloud (BSP oficial de WhatsApp).
 *
 * Modelo: TODOS los WABAs de los clientes cuelgan de UNA cuenta de YCloud
 * (la de UcoBot). Por eso hay una sola API key a nivel plataforma y un solo
 * webhook; el número se elige por el campo `from` al enviar y se resuelve por
 * `to` al recibir.
 *
 * El alta la hace el cliente en la consola white-label (popup), y después
 * UcoBot le pregunta a esta API qué números aparecieron para vincularlos.
 */

export interface YCloudPhoneNumber {
  /** ID interno de YCloud para el número */
  id: string
  wabaId: string
  /** Número en E.164 con "+" (ej: +5492611234567) */
  phoneNumber: string
  verifiedName: string | null
  qualityRating: string | null
  status: string | null
}

/** Base de la API. Con white-label puede ser api.tudominio.com. */
export function getYCloudApiBase(): string {
  return (process.env.YCLOUD_API_BASE || 'https://api.ycloud.com/v2').replace(/\/$/, '')
}

export function getYCloudKey(): string | null {
  return process.env.YCLOUD_API_KEY?.trim() || null
}

export function isYCloudConfigured(): boolean {
  return !!getYCloudKey()
}

/**
 * Credencial de YCloud de una integración concreta.
 *
 * MODELO (29/07/2026): se pasó de "una sola cuenta de YCloud para toda la
 * plataforma" a "cada cliente con la suya". Motivo comercial: el plan que hace
 * falta para tener varios canales en una cuenta cuesta bastante más que aprovechar
 * la cuota gratis de cada cuenta por separado.
 *
 * El `?? getYCloudKey()` es lo que mantiene vivas las integraciones viejas, que
 * no tienen credencial propia y siguen apoyándose en la de la plataforma. Cuando
 * no quede ninguna, la variable de entorno se puede borrar.
 */
export function getIntegrationKey(integration?: { config?: any } | null): string | null {
  const own = integration?.config?.ycloud_api_key
  if (typeof own === 'string' && own.trim()) return own.trim()
  return getYCloudKey()
}

/** Secreto para validar la firma del webhook de ESA cuenta. */
export function getIntegrationWebhookSecret(
  integration?: { config?: any } | null,
): string | null {
  const own = integration?.config?.ycloud_webhook_secret
  if (typeof own === 'string' && own.trim()) return own.trim()
  return process.env.YCLOUD_WEBHOOK_SECRET?.trim() || null
}

/** URL de la consola donde el cliente hace el Embedded Signup (popup). */
export function getYCloudOnboardingUrl(): string {
  return (
    process.env.NEXT_PUBLIC_YCLOUD_ONBOARDING_URL ||
    'https://www.ycloud.com/console/#/app/dashboard/account'
  )
}

async function ycloudFetch(
  path: string,
  init?: RequestInit,
  apiKey?: string | null,
): Promise<any> {
  // La credencial de la integración manda; el entorno es el respaldo para las
  // conexiones viejas, de cuando todo colgaba de una única cuenta.
  const key = apiKey?.trim() || getYCloudKey()
  if (!key) throw new Error('Falta la API key de YCloud para esta cuenta')

  const res = await fetch(`${getYCloudApiBase()}${path}`, {
    ...init,
    headers: {
      'X-API-Key': key,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = data?.message || data?.error?.message || `YCloud HTTP ${res.status}`

    // Caso frecuente y confuso: la WABA figura en la consola pero NO está vinculada
    // a la cuenta (el alta por coexistencia quedó a medias o la WABA se desprendió).
    // El mensaje crudo de YCloud sugiere que el ID está mal escrito, cuando en
    // realidad el ID es correcto y lo que falta es el vínculo. Se traduce para que
    // el operador no salga a buscar el problema donde no está.
    if (/hasn'?t bound WABA|not bound/i.test(msg)) {
      throw new YCloudUnboundWabaError(
        'La cuenta de WhatsApp no está vinculada a YCloud. Volvé a conectar el número desde Integraciones.',
      )
    }

    throw new Error(msg)
  }
  return data
}

/** La WABA existe pero no está vinculada a la cuenta: no es un ID mal cargado. */
export class YCloudUnboundWabaError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'YCloudUnboundWabaError'
  }
}

/**
 * Las listas de YCloud v2 vienen paginadas. El wrapper cambió entre versiones
 * de la doc (`items` / `data`), así que aceptamos las dos formas.
 */
function unwrapList(data: any): any[] {
  if (Array.isArray(data)) return data
  if (Array.isArray(data?.items)) return data.items
  if (Array.isArray(data?.data)) return data.data
  return []
}

/** Todos los números registrados en la cuenta (todas las WABAs). */
export async function listYCloudPhoneNumbers(apiKey?: string | null): Promise<YCloudPhoneNumber[]> {
  const out: YCloudPhoneNumber[] = []
  // Paginado defensivo: con muchos clientes esto crece.
  for (let page = 1; page <= 20; page++) {
    const data = await ycloudFetch(`/whatsapp/phoneNumbers?page=${page}&limit=100`, undefined, apiKey)
    const items = unwrapList(data)
    for (const p of items) {
      out.push({
        id: String(p.id ?? ''),
        wabaId: String(p.wabaId ?? ''),
        phoneNumber: String(p.phoneNumber ?? p.display ?? ''),
        verifiedName: p.verifiedName ?? null,
        qualityRating: p.qualityRating ?? null,
        status: p.status ?? null,
      })
    }
    if (items.length < 100) break
  }
  return out.filter((p) => p.phoneNumber)
}

/**
 * Plantillas de la WABA, ya normalizadas a la forma de la Graph API de Meta
 * (name / status / language / category / components), que es la que espera
 * todo el front de plantillas. Así el cambio de proveedor es invisible.
 */
export async function listYCloudTemplates(wabaId: string, apiKey?: string | null): Promise<any[]> {
  const out: any[] = []
  for (let page = 1; page <= 20; page++) {
    const data = await ycloudFetch(
      `/whatsapp/templates?filter.wabaId=${encodeURIComponent(wabaId)}&page=${page}&limit=100`,
      undefined,
      apiKey,
    )
    const items = unwrapList(data)
    for (const t of items) {
      out.push({
        id: t.id || `ycloud_${t.name}_${t.language}`,
        name: t.name,
        status: t.status,
        language: t.language,
        category: t.category,
        components: t.components || [],
        quality_score: t.qualityScore ?? null,
      })
    }
    if (items.length < 100) break
  }
  return out
}

/**
 * Endpoints de webhook configurados en la cuenta de YCloud, con los eventos a los
 * que están suscritos. Se usa para diagnosticar: si el envío anda pero no entra
 * nada, el problema casi siempre está acá (endpoint deshabilitado, URL vieja o
 * evento sin tildar).
 */
export async function listYCloudWebhookEndpoints(apiKey?: string | null): Promise<any[]> {
  const data = await ycloudFetch('/webhookEndpoints?page=1&limit=100', undefined, apiKey)
  return unwrapList(data)
}

/** Eventos sin los cuales la integración queda coja. */
export const REQUIRED_YCLOUD_EVENTS = [
  'whatsapp.inbound_message.received',
  'whatsapp.message.updated',
  'whatsapp.smb.message.echoes',
  'whatsapp.smb.history',
  'whatsapp.smb.app.state.sync',
] as const

/**
 * Deja el webhook de UcoBot configurado en la cuenta de YCloud del cliente.
 *
 * Es el paso que más se rompe cuando se hace a mano (URL mal pegada, endpoint
 * deshabilitado, eventos sin tildar) y encima es el que produce el síntoma más
 * confuso: el número envía bien pero no recibe nada. Como la API permite crearlo,
 * se hace desde acá y el cliente no lo toca.
 *
 * Devuelve el `secret` de firma SOLO cuando crea el endpoint: YCloud no lo expone
 * al listar. Si el endpoint ya existía, hay que copiarlo a mano de la consola o
 * rotarlo.
 */
export async function ensureYCloudWebhook(
  apiKey: string,
  url: string,
): Promise<{ created: boolean; secret?: string; endpointId?: string; error?: string }> {
  try {
    const existing = await listYCloudWebhookEndpoints(apiKey)
    const match = existing.find((e: any) => String(e?.url || '').trim() === url)

    if (match) {
      // Ya apunta acá: solo nos aseguramos de que esté activo y con todos los eventos.
      const events: string[] = Array.isArray(match.events) ? match.events : []
      const missing = REQUIRED_YCLOUD_EVENTS.filter((e) => !events.includes(e))
      const disabled = String(match.status || '').toLowerCase() !== 'active'

      if (missing.length > 0 || disabled) {
        await ycloudFetch(
          `/webhookEndpoints/${encodeURIComponent(String(match.id))}`,
          {
            method: 'PATCH',
            body: JSON.stringify({
              events: Array.from(new Set([...events, ...REQUIRED_YCLOUD_EVENTS])),
              status: 'active',
            }),
          },
          apiKey,
        )
      }
      return { created: false, endpointId: String(match.id) }
    }

    const created = await ycloudFetch(
      '/webhookEndpoints',
      {
        method: 'POST',
        body: JSON.stringify({
          url,
          events: [...REQUIRED_YCLOUD_EVENTS],
          status: 'active',
        }),
      },
      apiKey,
    )

    return {
      created: true,
      endpointId: created?.id ? String(created.id) : undefined,
      secret: created?.secret || undefined,
    }
  } catch (e: any) {
    return { created: false, error: e?.message || 'No se pudo configurar el webhook' }
  }
}

/**
 * Registra el número contra la Cloud API.
 *
 * Es el paso que causa el error 133010 ("Account not registered") cuando falta:
 * el número aparece "Conectado" en YCloud y recibe mensajes sin problema, pero
 * NO puede enviar, porque enviar exige que el número esté registrado del lado de
 * Meta. En el alta por coexistencia debería hacerse solo; cuando no ocurre, hay
 * que forzarlo con esta llamada.
 *
 * El identificador del número que espera YCloud varía (su id interno o el E.164),
 * así que se prueban los dos y se devuelve cuál funcionó.
 */
export async function registerYCloudPhoneNumber(
  wabaId: string,
  candidates: string[],
  apiKey?: string | null,
): Promise<{ ok: boolean; usedId?: string; error?: string; skipped?: boolean; reason?: string }> {
  let lastError = 'Sin identificadores para registrar'

  for (const id of candidates.filter(Boolean)) {
    try {
      await ycloudFetch(
        `/whatsapp/phoneNumbers/${encodeURIComponent(wabaId)}/${encodeURIComponent(id)}/register`,
        { method: 'POST', body: JSON.stringify({}) },
        apiKey,
      )
      return { ok: true, usedId: id }
    } catch (e: any) {
      const msg = e?.message || 'Error desconocido'

      // Los números de coexistencia (SMB) NO se registran: YCloud responde
      // "Register endpoint is not available for SMB businesses". No es un fallo,
      // es que el paso no aplica — se corta acá para no reintentar con los otros
      // identificadores ni ensuciar los logs en cada vinculación.
      if (/not available for SMB/i.test(msg)) {
        return { ok: true, skipped: true, reason: 'coexistencia (no requiere registro)' }
      }

      lastError = msg
    }
  }

  return { ok: false, error: lastError }
}

export async function createYCloudTemplate(
  payload: Record<string, any>,
  apiKey?: string | null,
): Promise<any> {
  return await ycloudFetch(
    '/whatsapp/templates',
    { method: 'POST', body: JSON.stringify(payload) },
    apiKey,
  )
}

export async function deleteYCloudTemplate(
  wabaId: string,
  name: string,
  language?: string,
  apiKey?: string | null,
): Promise<void> {
  const qs = new URLSearchParams({ wabaId, name })
  if (language) qs.set('language', language)
  await ycloudFetch(`/whatsapp/templates?${qs.toString()}`, { method: 'DELETE' }, apiKey)
}

/* ------------------------------------------------------------------ */
/* Normalización de números                                            */
/* ------------------------------------------------------------------ */

/** Solo dígitos. Es la forma en que el pipeline guarda los teléfonos. */
export function digitsOnly(phone: string): string {
  return String(phone || '').replace(/\D/g, '')
}

/**
 * E.164 con "+" para la API de YCloud.
 *
 * OJO con Argentina: YCloud reenvía a la Cloud API de Meta, que espera el móvil
 * SIN el 9 (549261… → 54261…). Se mantiene la misma regla que CloudApiProvider
 * para no cambiar el comportamiento histórico.
 */
export function toE164(phone: string): string {
  let d = digitsOnly(phone)
  if (d.startsWith('549')) d = '54' + d.substring(3)
  return `+${d}`
}

/**
 * Variantes con las que un móvil argentino puede aparecer: con y sin el 9.
 *
 * Hace falta para resolver el NÚMERO DEL NEGOCIO en el webhook. El `to` que manda
 * YCloud sale del payload de Meta, y Meta lo reporta con el formato con el que se
 * registró ese WABA: al recrear la WABA el mismo número puede pasar de 549261… a
 * 54261… (o al revés). Si se compara literal contra config.phone_number_id, la
 * integración deja de encontrarse y los mensajes entrantes se descartan en
 * silencio, aunque el envío siga funcionando.
 *
 * Para el resto de los países devuelve el número tal cual.
 */
export function businessPhoneVariants(phone: string): string[] {
  const d = digitsOnly(phone)
  if (!d) return []
  const out = new Set<string>([d])
  if (d.startsWith('549')) out.add('54' + d.substring(3))
  else if (d.startsWith('54')) out.add('549' + d.substring(2))
  return [...out]
}

/* ------------------------------------------------------------------ */
/* Firma del webhook                                                   */
/* ------------------------------------------------------------------ */

/**
 * Verifica el header `YCloud-Signature` (HMAC-SHA256 sobre `{timestamp}.{body}`).
 *
 * El header trae el timestamp y la firma; toleramos tanto el formato con claves
 * (`t=...,v1=...`) como una lista suelta separada por comas.
 */
export function verifyYCloudSignature(
  rawBody: string,
  header: string | null,
  secret: string,
): boolean {
  if (!header) return false

  const parts = header.split(',').map((s) => s.trim())
  let timestamp: string | null = null
  const candidates: string[] = []

  for (const part of parts) {
    const [k, v] = part.includes('=') ? part.split('=', 2) : [null, part]
    if (k === 't' || k === 'timestamp') timestamp = v
    else if (v) candidates.push(v)
  }

  // Sin pares clave=valor: asumimos "timestamp,firma"
  if (!timestamp && parts.length >= 2) {
    timestamp = parts[0]
    candidates.push(parts[1])
  }
  if (!timestamp || candidates.length === 0) return false

  const expected = createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex')

  return candidates.some((c) => {
    const a = Buffer.from(expected, 'utf8')
    const b = Buffer.from(c.toLowerCase(), 'utf8')
    return a.length === b.length && timingSafeEqual(a, b)
  })
}

/* ------------------------------------------------------------------ */
/* Envío                                                               */
/* ------------------------------------------------------------------ */

export interface YCloudSendBody {
  from: string
  to: string
  type: string
  [key: string]: any
}

export async function sendYCloudMessage(
  body: YCloudSendBody,
  apiKey?: string | null,
): Promise<{ id?: string }> {
  return await ycloudFetch(
    '/whatsapp/messages',
    { method: 'POST', body: JSON.stringify(body) },
    apiKey,
  )
}
