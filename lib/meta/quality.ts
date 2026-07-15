import { createAdminClient } from '@/lib/supabase/server'
import { getGraphVersion } from '@/lib/meta/credentials'

/**
 * Monitoreo de calidad de números de WhatsApp.
 *
 * Meta puntúa cada número por tasa de bloqueos y reportes de los destinatarios.
 * Una plantilla aprobada NO garantiza nada: la aprobación valida el contenido,
 * no que el destinatario quiera recibirlo. Si la calidad cae, Meta primero baja
 * el límite de mensajería y después inhabilita el número o el negocio entero.
 *
 * Fuentes:
 *  - webhook `phone_number_quality_update` -> evento FLAGGED / UNFLAGGED + límite
 *  - Graph API `quality_rating` -> GREEN | YELLOW | RED
 */

export type QualityRating = 'GREEN' | 'YELLOW' | 'RED' | 'UNKNOWN'

/** Meta manda el número formateado de formas distintas según el evento. */
function normalizePhone(value?: string | null): string {
  return (value || '').replace(/\D/g, '')
}

/**
 * Política de corte. La regla es la que declaramos ante Meta:
 *  - RED o número flaggeado -> no sale nada automático.
 *  - YELLOW -> no sale marketing; utilidad y servicio siguen.
 *  - GREEN  -> todo normal.
 *
 * Las respuestas dentro de la ventana de 24 h las inició el cliente, así que no
 * se cortan nunca: bloquearlas empeoraría la atención sin mejorar la calidad.
 */
export function isSendAllowed(
  quality: { quality_rating?: string | null; is_flagged?: boolean | null; sends_blocked?: boolean | null } | null,
  kind: 'marketing' | 'utility' | 'service'
): { allowed: boolean; reason?: string } {
  if (kind === 'service') return { allowed: true }
  if (!quality) return { allowed: true }

  if (quality.sends_blocked) {
    return { allowed: false, reason: 'Envíos cortados por calidad del número' }
  }
  if (quality.is_flagged) {
    return { allowed: false, reason: 'Número flaggeado por Meta' }
  }

  const rating = (quality.quality_rating || 'UNKNOWN') as QualityRating
  if (rating === 'RED') {
    return { allowed: false, reason: 'Calidad LOW (RED)' }
  }
  if (rating === 'YELLOW' && kind === 'marketing') {
    return { allowed: false, reason: 'Calidad MEDIUM (YELLOW): marketing suspendido' }
  }
  return { allowed: true }
}

/** Lee el estado de calidad de un número. Devuelve null si nunca se registró. */
export async function getNumberQuality(phoneNumberId: string) {
  const admin = createAdminClient()
  const { data } = await admin
    .from('whatsapp_number_quality')
    .select('phone_number_id, quality_rating, is_flagged, sends_blocked, messaging_limit')
    .eq('phone_number_id', phoneNumberId)
    .maybeSingle()
  return data
}

/**
 * Resuelve el phone_number_id + user_id a partir del display_phone_number, porque
 * el webhook de calidad manda el número formateado y no el ID.
 */
async function resolveIntegration(wabaId: string | null, displayPhone: string | null) {
  const admin = createAdminClient()

  const { data: all, error } = await admin
    .from('integrations')
    .select('user_id, config')
    .eq('platform', 'whatsapp')

  if (error) {
    console.error('[WA quality] error resolviendo integración:', error)
    return null
  }
  if (!all?.length) return null

  const target = normalizePhone(displayPhone)

  // Capa 1: match por teléfono. Es el único identificador que Meta manda siempre
  // en este evento, así que es el más confiable. No se puede filtrar en SQL:
  // Meta manda "5492616527342" y nosotros guardamos "+54 9 261 652-7342".
  if (target) {
    const byPhone = all.find((row: any) => normalizePhone(row.config?.display_phone_number) === target)
    if (byPhone) return shape(byPhone)
  }

  // Capa 2: match por WABA, solo si el teléfono no alcanzó. Las integraciones
  // legacy guardan el WABA bajo `business_account_id` en vez de `waba_id`, y ese
  // campo además podría ser un Business Manager ID y no un WABA: lo tratamos como
  // candidato, no como verdad. Si no es un WABA, no matchea y seguimos de largo.
  if (wabaId) {
    const byWaba = all.filter((row: any) => {
      const cfg = row.config || {}
      return cfg.waba_id === wabaId || cfg.business_account_id === wabaId
    })
    // Solo resolvemos si el WABA identifica una única integración. Con varias,
    // elegir al azar escribiría la calidad en el número equivocado y cortaría los
    // envíos de un cliente que no tiene el problema.
    if (byWaba.length === 1) return shape(byWaba[0])
    if (byWaba.length > 1) {
      console.warn('[WA quality] WABA con varias integraciones y sin match de teléfono:', {
        wabaId,
        displayPhone,
        candidatos: byWaba.length,
      })
      return null
    }
  }

  return null
}

function shape(row: any) {
  return {
    user_id: row.user_id as string,
    phone_number_id: row.config?.phone_number_id as string | undefined,
    waba_id: row.config?.waba_id as string | undefined,
  }
}

/**
 * Procesa un evento `phone_number_quality_update`.
 *
 * Shape típico del value:
 *   { display_phone_number: "16505551111", event: "FLAGGED", current_limit: "TIER_1K" }
 *
 * Meta cambia estos payloads sin avisar, así que guardamos el crudo en `raw` y
 * parseamos de forma defensiva.
 */
export async function handleQualityUpdate(wabaId: string | null, value: any) {
  const admin = createAdminClient()

  const event: string = (value?.event || 'UNKNOWN').toUpperCase()
  const displayPhone: string | null = value?.display_phone_number || null
  const messagingLimit: string | null = value?.current_limit || null

  const resolved = await resolveIntegration(wabaId, displayPhone)
  const phoneNumberId = resolved?.phone_number_id
  if (!phoneNumberId) {
    console.warn('[WA quality] evento sin integración asociada:', { wabaId, displayPhone, event })
    return
  }

  const previous = await getNumberQuality(phoneNumberId)

  // El webhook informa FLAGGED/UNFLAGGED pero no el rating. Lo pedimos al Graph
  // API para tener el valor exacto (GREEN/YELLOW/RED) en el mismo evento.
  const rating = await fetchQualityRating(phoneNumberId)

  const isFlagged = event === 'FLAGGED'
  const blocked = isFlagged || rating === 'RED'

  await admin.from('whatsapp_number_quality').upsert(
    {
      phone_number_id: phoneNumberId,
      user_id: resolved.user_id,
      waba_id: wabaId || resolved.waba_id || null,
      display_phone_number: displayPhone,
      quality_rating: rating,
      messaging_limit: messagingLimit,
      is_flagged: isFlagged,
      // No pisamos un corte manual puesto por un admin.
      sends_blocked: previous?.sends_blocked && (previous as any)?.sends_blocked_manual ? true : blocked,
      blocked_reason: blocked ? `Meta: ${event} / rating ${rating}` : null,
      blocked_at: blocked ? new Date().toISOString() : null,
      last_event_at: new Date().toISOString(),
    },
    { onConflict: 'phone_number_id' }
  )

  await admin.from('whatsapp_quality_events').insert({
    phone_number_id: phoneNumberId,
    user_id: resolved.user_id,
    waba_id: wabaId || resolved.waba_id || null,
    event,
    quality_rating: rating,
    previous_quality: previous?.quality_rating || null,
    messaging_limit: messagingLimit,
    raw: value ?? {},
  })

  console.log('[WA quality]', {
    phoneNumberId,
    event,
    rating,
    previous: previous?.quality_rating,
    blocked,
  })
}

/** Lee el quality_rating actual del Graph API. Devuelve UNKNOWN si falla. */
export async function fetchQualityRating(phoneNumberId: string): Promise<QualityRating> {
  const token = process.env.WHATSAPP_SYSTEM_TOKEN
  if (!token) return 'UNKNOWN'

  try {
    const res = await fetch(
      `https://graph.facebook.com/${getGraphVersion()}/${phoneNumberId}?fields=quality_rating`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    if (!res.ok) return 'UNKNOWN'
    const json = await res.json()
    const raw = String(json?.quality_rating || '').toUpperCase()
    if (raw === 'GREEN' || raw === 'YELLOW' || raw === 'RED') return raw
    return 'UNKNOWN'
  } catch {
    return 'UNKNOWN'
  }
}
