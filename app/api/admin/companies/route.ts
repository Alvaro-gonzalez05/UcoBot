import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

/**
 * Gestión de empresas y sucursales — SOLO admin de plataforma (devs).
 *
 * Modelo: "sucursal = cuenta". Una empresa agrupa varias cuentas (sucursales).
 * Un miembro con role 'company_admin' puede leer los datos de todas las
 * sucursales de su empresa (RLS de la migración 102).
 *
 * OJO: esto es distinto de user_profiles.role='admin', que es el admin de
 * plataforma (quien usa este endpoint).
 */

async function requirePlatformAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autorizado', status: 401 as const }

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  if (profile?.role !== 'admin') return { error: 'Requiere admin de plataforma', status: 403 as const }
  return { ok: true as const }
}

export async function GET() {
  const auth = await requirePlatformAdmin()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const admin = createAdminClient()

  const { data: companies } = await admin
    .from('companies')
    .select('id, name, created_at')
    .order('created_at', { ascending: false })

  const { data: members } = await admin
    .from('company_members')
    .select('company_id, user_id, branch_name, role')

  // Cuentas dueñas (no empleados) disponibles para asignar como sucursal
  const { data: accounts } = await admin
    .from('user_profiles')
    .select('id, business_name, email')
    .is('parent_user_id', null)
    .order('business_name')

  return NextResponse.json({
    companies: companies || [],
    members: members || [],
    accounts: accounts || [],
  })
}

export async function POST(request: NextRequest) {
  const auth = await requirePlatformAdmin()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const admin = createAdminClient()
  const body = await request.json()
  const action = body.action as string

  try {
    if (action === 'create_company') {
      const name = String(body.name || '').trim()
      if (!name) return NextResponse.json({ error: 'Falta el nombre' }, { status: 400 })
      const { data, error } = await admin.from('companies').insert({ name }).select().single()
      if (error) throw error
      return NextResponse.json({ success: true, company: data })
    }

    if (action === 'add_member') {
      const { company_id, user_id, branch_name, role } = body
      if (!company_id || !user_id) {
        return NextResponse.json({ error: 'Faltan company_id o user_id' }, { status: 400 })
      }
      const { error } = await admin.from('company_members').upsert(
        {
          company_id,
          user_id,
          branch_name: branch_name || null,
          role: role === 'company_admin' ? 'company_admin' : 'branch',
        },
        { onConflict: 'company_id,user_id' },
      )
      if (error) throw error
      return NextResponse.json({ success: true })
    }

    if (action === 'remove_member') {
      const { company_id, user_id } = body
      if (!company_id || !user_id) {
        return NextResponse.json({ error: 'Faltan company_id o user_id' }, { status: 400 })
      }
      const { error } = await admin
        .from('company_members')
        .delete()
        .eq('company_id', company_id)
        .eq('user_id', user_id)
      if (error) throw error
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Acción desconocida' }, { status: 400 })
  } catch (e: any) {
    console.error('[admin/companies] error:', e)
    return NextResponse.json({ error: e?.message || 'Error interno' }, { status: 500 })
  }
}
