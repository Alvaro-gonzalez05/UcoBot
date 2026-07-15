import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { fetchQualityRating } from '@/lib/meta/quality'

/**
 * Estado de calidad del número de WhatsApp del usuario + histórico de eventos.
 *
 * El estado se actualiza solo cuando Meta manda `phone_number_quality_update`,
 * que puede tardar. `?refresh=1` fuerza una lectura del Graph API para tener el
 * rating al día sin esperar el webhook.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const admin = createAdminClient()

    const { data: integration } = await admin
      .from('integrations')
      .select('config')
      .eq('user_id', user.id)
      .eq('platform', 'whatsapp')
      .eq('is_active', true)
      .maybeSingle()

    const phoneNumberId = (integration?.config as any)?.phone_number_id
    if (!phoneNumberId) {
      return NextResponse.json({ connected: false })
    }

    const refresh = request.nextUrl.searchParams.get('refresh') === '1'
    if (refresh) {
      const rating = await fetchQualityRating(phoneNumberId)
      // No pisamos is_flagged ni sends_blocked: eso solo lo sabe el webhook.
      // Acá únicamente refrescamos el rating leído del Graph API.
      await admin.from('whatsapp_number_quality').upsert(
        {
          phone_number_id: phoneNumberId,
          user_id: user.id,
          waba_id: (integration?.config as any)?.waba_id || null,
          display_phone_number: (integration?.config as any)?.display_phone_number || null,
          quality_rating: rating,
          last_event_at: new Date().toISOString(),
        },
        { onConflict: 'phone_number_id' }
      )
      await admin.from('whatsapp_quality_events').insert({
        phone_number_id: phoneNumberId,
        user_id: user.id,
        waba_id: (integration?.config as any)?.waba_id || null,
        event: 'POLL',
        quality_rating: rating,
        raw: { source: 'dashboard_refresh' },
      })
    }

    const { data: quality } = await admin
      .from('whatsapp_number_quality')
      .select('*')
      .eq('phone_number_id', phoneNumberId)
      .maybeSingle()

    const { data: events } = await admin
      .from('whatsapp_quality_events')
      .select('event, quality_rating, previous_quality, messaging_limit, created_at')
      .eq('phone_number_id', phoneNumberId)
      .order('created_at', { ascending: false })
      .limit(20)

    return NextResponse.json({
      connected: true,
      phone_number_id: phoneNumberId,
      display_phone_number:
        quality?.display_phone_number || (integration?.config as any)?.display_phone_number || null,
      quality: quality || null,
      events: events || [],
    })
  } catch (error) {
    console.error('Error leyendo calidad de WhatsApp:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
