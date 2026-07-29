import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

/**
 * Cobranza manual de clientes (solo admin de UcoBot).
 *
 * `subscription_payments` cubre lo que cobra Mercado Pago automáticamente. Esto es
 * para los clientes que se facturan a mano — promociones, acuerdos particulares —
 * que hasta ahora se llevaban de memoria.
 *
 * GET   → todos los clientes con su configuración y días hasta el próximo cobro
 * POST  → crea o actualiza la configuración de un cliente
 * PUT   → marca un cobro hecho y avanza la fecha según el ciclo
 */

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) }

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  if (profile?.role !== 'admin') {
    return { error: NextResponse.json({ error: 'Solo administradores' }, { status: 403 }) }
  }
  return { userId: user.id }
}

export async function GET() {
  const auth = await requireAdmin()
  if ('error' in auth) return auth.error

  const admin = createAdminClient()

  const [{ data: profiles }, { data: billing }] = await Promise.all([
    admin
      .from('user_profiles')
      .select('id, business_name, email, plan_type, subscription_status, billing_exempt')
      .order('business_name'),
    admin.from('client_billing').select('*'),
  ])

  const byUser = new Map((billing || []).map((b) => [b.user_id, b]))
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)

  const clientes = (profiles || []).map((p) => {
    const b = byUser.get(p.id)
    let dias: number | null = null
    if (b?.next_charge_date) {
      const next = new Date(b.next_charge_date + 'T00:00:00')
      dias = Math.round((next.getTime() - hoy.getTime()) / 86400000)
    }
    return {
      user_id: p.id,
      business_name: p.business_name,
      email: p.email,
      plan_type: p.plan_type,
      subscription_status: p.subscription_status,
      billing_exempt: p.billing_exempt,
      billing: b ?? null,
      dias_para_cobro: dias,
    }
  })

  return NextResponse.json({ clientes })
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin()
  if ('error' in auth) return auth.error

  try {
    const body = await request.json()
    const userId = String(body.user_id || '')
    if (!userId) return NextResponse.json({ error: 'Falta el cliente' }, { status: 400 })

    const admin = createAdminClient()
    const { error } = await admin.from('client_billing').upsert(
      {
        user_id: userId,
        amount: Number(body.amount) || 0,
        currency: String(body.currency || 'ARS'),
        cycle: String(body.cycle || 'monthly'),
        included_accounts: Number(body.included_accounts) || 1,
        extra_account_price: Number(body.extra_account_price) || 0,
        next_charge_date: body.next_charge_date || null,
        notes: body.notes || null,
        is_active: body.is_active !== false,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    )

    if (error) {
      console.error('[admin/billing] upsert falló:', error)
      return NextResponse.json({ error: 'No se pudo guardar' }, { status: 500 })
    }
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('[admin/billing] error:', e)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requireAdmin()
  if ('error' in auth) return auth.error

  try {
    const body = await request.json()
    const userId = String(body.user_id || '')
    if (!userId) return NextResponse.json({ error: 'Falta el cliente' }, { status: 400 })

    // El RPC avanza la fecha desde el vencimiento anterior (no desde hoy), así
    // cobrar tarde no corre todo el ciclo hacia adelante.
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('register_billing_charge', {
      p_user_id: userId,
      p_amount: body.amount != null ? Number(body.amount) : null,
      p_notes: body.notes || null,
    })

    if (error) {
      console.error('[admin/billing] cobro falló:', error)
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    return NextResponse.json({ success: true, proximo_cobro: data })
  } catch (e) {
    console.error('[admin/billing] error:', e)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
