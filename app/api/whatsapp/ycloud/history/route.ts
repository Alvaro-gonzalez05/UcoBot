/**
 * Webhook DEDICADO al historial de coexistencia (`whatsapp.smb.history`).
 *
 * POR QUÉ EXISTE UNA RUTA APARTE
 * -------------------------------
 * YCloud manda UN evento HTTP por CADA mensaje del historial. Seis meses de chats
 * son decenas de miles de eventos, y llegan en ráfagas de ~600 por minuto.
 *
 * Cuando esto convivía con el webhook principal (runtime Node), esas invocaciones
 * consumían todos los slots de concurrencia del deployment y tiraban abajo el
 * resto de la app: el chat, el dashboard y hasta el middleware daban
 * MIDDLEWARE_INVOCATION_TIMEOUT. Medido en producción el 29/07/2026.
 *
 * La solución es aislarlo:
 *   - Endpoint propio en YCloud, solo con el evento `whatsapp.smb.history`.
 *   - Runtime EDGE, con límites de concurrencia mucho más altos y sin competir
 *     por los slots de Node que usa el resto de la aplicación.
 *   - Trabajo mínimo por evento: resolver la cuenta (cacheada) y un INSERT.
 *
 * Así, aunque entren 50.000 mensajes de golpe, lo peor que pasa es que el
 * historial tarde más en importarse. La app no se entera.
 *
 * El procesamiento pesado (crear conversaciones, deduplicar, guardar mensajes) lo
 * hace el cron en /api/whatsapp/ycloud/sync/process, no esta ruta.
 */

export const runtime = 'edge'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

/** Solo dígitos (duplicado a propósito: en edge evitamos importar el módulo entero). */
function digitsOnly(phone: string): string {
  return String(phone || '').replace(/\D/g, '')
}

/** Variantes del móvil argentino, con y sin el 9. */
function phoneVariants(phone: string): string[] {
  const d = digitsOnly(phone)
  if (!d) return []
  const out = new Set<string>([d])
  if (d.startsWith('549')) out.add('54' + d.substring(3))
  else if (d.startsWith('54')) out.add('549' + d.substring(2))
  return [...out]
}

/**
 * Cache de resolución de cuenta por número de negocio.
 *
 * Sin esto cada evento haría DOS viajes a la base (buscar integración + insertar).
 * En la ráfaga eso duplicaba la carga. El número no cambia entre eventos.
 */
type Resolved = { userId: string; storedPhone: string }
const CACHE_TTL_MS = 5 * 60 * 1000
const cache = new Map<string, { value: Resolved | null; at: number }>()

async function rest(path: string, init?: RequestInit) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY!,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  })
}

async function resolveAccount(businessPhone: string): Promise<Resolved | null> {
  const hit = cache.get(businessPhone)
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value

  const variants = phoneVariants(businessPhone)
  // `or` de PostgREST sobre el campo JSON, igual que en el webhook principal.
  const or = variants.map((v) => `config->>phone_number_id.eq.${v}`).join(',')
  const res = await rest(
    `integrations?select=user_id,config&platform=eq.whatsapp&is_active=eq.true&or=(${or})&limit=1`,
  )

  let value: Resolved | null = null
  if (res.ok) {
    const rows = (await res.json()) as any[]
    const row = rows?.[0]
    if (row) {
      value = {
        userId: row.user_id,
        storedPhone: String(row.config?.phone_number_id || '') || businessPhone,
      }
    }
  }

  cache.set(businessPhone, { value, at: Date.now() })
  return value
}

export async function POST(request: Request) {
  try {
    if (!SUPABASE_URL || !SERVICE_KEY) {
      console.error('[YCloud history] faltan credenciales de Supabase')
      return new Response(JSON.stringify({ error: 'not configured' }), { status: 500 })
    }

    const body = await request.json()

    if (body?.type !== 'whatsapp.smb.history') {
      // Este endpoint es solo para historial; el resto va al webhook principal.
      return new Response(JSON.stringify({ ok: true, ignored: true }), { status: 200 })
    }

    // Un mensaje por evento: `whatsappInboundMessage` si lo mandó el cliente,
    // `whatsappMessage` si lo mandó el negocio desde el celular.
    const inbound = body.whatsappInboundMessage
    const outbound = body.whatsappMessage
    const msg = inbound || outbound
    if (!msg) return new Response(JSON.stringify({ ok: true }), { status: 200 })

    // En un entrante el negocio es el destinatario; en un saliente, el remitente.
    const businessPhone = digitsOnly((inbound ? msg.to : msg.from) || '')
    if (!businessPhone) return new Response(JSON.stringify({ ok: true }), { status: 200 })

    const account = await resolveAccount(businessPhone)
    if (!account) {
      // Sin integración no hay dónde guardarlo. 200 a propósito: reintentar no va
      // a cambiar nada y solo agregaría carga.
      console.warn('[YCloud history] sin integración activa para', businessPhone)
      return new Response(JSON.stringify({ ok: true, skipped: true }), { status: 200 })
    }

    const insert = await rest('whatsapp_sync_chunks', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        user_id: account.userId,
        phone_number_id: account.storedPhone,
        event_type: 'history',
        payload: body,
      }),
    })

    if (!insert.ok) {
      // 500 para que YCloud reintente: el historial llega UNA sola vez y un 200
      // sin haber guardado lo pierde para siempre. Como esta ruta está aislada,
      // los reintentos ya no afectan al resto de la app.
      const detail = await insert.text().catch(() => '')
      console.error('[YCloud history] insert falló:', insert.status, detail.slice(0, 200))
      return new Response(JSON.stringify({ error: 'insert failed' }), { status: 500 })
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200 })
  } catch (error) {
    console.error('[YCloud history] error:', error)
    return new Response(JSON.stringify({ error: 'internal' }), { status: 500 })
  }
}
