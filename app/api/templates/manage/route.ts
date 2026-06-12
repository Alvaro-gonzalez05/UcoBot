import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getWhatsAppToken, getGraphVersion } from '@/lib/meta/credentials'

/**
 * Gestión de plantillas de WhatsApp contra la API de Meta.
 *
 * GET    → lista las plantillas del WABA del usuario (directo desde Meta)
 * POST   → crea una plantilla (queda PENDING hasta que Meta la apruebe)
 * PUT    → edita una plantilla existente (solo APPROVED / REJECTED / PAUSED)
 * DELETE → elimina una plantilla por nombre
 */

async function getWhatsAppContext() {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getUser()
  if (error || !data?.user) {
    return { error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) }
  }

  const { data: integration } = await supabase
    .from('integrations')
    .select('config')
    .eq('user_id', data.user.id)
    .eq('platform', 'whatsapp')
    .maybeSingle()

  // Integraciones nuevas guardan waba_id; las legacy, business_account_id
  const wabaId = integration?.config?.waba_id || integration?.config?.business_account_id
  const token = getWhatsAppToken(integration)

  if (!wabaId || !token) {
    return {
      error: NextResponse.json(
        { error: 'Conectá WhatsApp primero para poder gestionar plantillas.' },
        { status: 400 }
      ),
    }
  }

  return { wabaId, token, userId: data.user.id }
}

function buildComponents(body: any) {
  const components: any[] = []

  const headerText = String(body.header_text || '').trim()
  if (headerText) {
    components.push({ type: 'HEADER', format: 'TEXT', text: headerText })
  }

  const bodyText = String(body.body_text || '').trim()
  const bodyComponent: any = { type: 'BODY', text: bodyText }

  // Meta exige valores de ejemplo cuando el cuerpo tiene variables {{n}}
  const variableMatches = bodyText.match(/\{\{\d+\}\}/g) || []
  const variableCount = new Set(variableMatches).size
  if (variableCount > 0) {
    const provided: string[] = Array.isArray(body.example_values) ? body.example_values : []
    const examples = Array.from({ length: variableCount }, (_, i) =>
      String(provided[i] || `ejemplo${i + 1}`).trim() || `ejemplo${i + 1}`
    )
    bodyComponent.example = { body_text: [examples] }
  }
  components.push(bodyComponent)

  const footerText = String(body.footer_text || '').trim()
  if (footerText) {
    components.push({ type: 'FOOTER', text: footerText })
  }

  return components
}

export async function GET() {
  const ctx = await getWhatsAppContext()
  if ('error' in ctx) return ctx.error

  const res = await fetch(
    `https://graph.facebook.com/${getGraphVersion()}/${ctx.wabaId}/message_templates?fields=name,status,language,category,components,quality_score&limit=100`,
    { headers: { Authorization: `Bearer ${ctx.token}` } }
  )

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    console.error('Error fetching templates from Meta:', err)
    return NextResponse.json(
      { error: err.error?.message || 'No se pudieron obtener las plantillas de Meta' },
      { status: 400 }
    )
  }

  const result = await res.json()
  return NextResponse.json({ success: true, templates: result.data || [] })
}

export async function POST(request: NextRequest) {
  const ctx = await getWhatsAppContext()
  if ('error' in ctx) return ctx.error

  try {
    const body = await request.json()
    const name = String(body.name || '').trim().toLowerCase()
    const language = String(body.language || 'es_AR')
    const category = String(body.category || 'MARKETING').toUpperCase()

    if (!/^[a-z0-9_]{1,512}$/.test(name)) {
      return NextResponse.json(
        { error: 'El nombre solo puede tener minúsculas, números y guiones bajos (ej: bienvenida_clientes)' },
        { status: 400 }
      )
    }
    if (!String(body.body_text || '').trim()) {
      return NextResponse.json({ error: 'El cuerpo del mensaje es obligatorio' }, { status: 400 })
    }
    if (!['MARKETING', 'UTILITY', 'AUTHENTICATION'].includes(category)) {
      return NextResponse.json({ error: 'Categoría inválida' }, { status: 400 })
    }

    const payload = {
      name,
      language,
      category,
      allow_category_change: true,
      components: buildComponents(body),
    }

    const res = await fetch(
      `https://graph.facebook.com/${getGraphVersion()}/${ctx.wabaId}/message_templates`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ctx.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      }
    )

    const result = await res.json().catch(() => ({}))

    if (!res.ok) {
      console.error('Error creating template in Meta:', result)
      return NextResponse.json(
        {
          error:
            result.error?.error_user_msg ||
            result.error?.message ||
            'Meta rechazó la creación de la plantilla',
        },
        { status: 400 }
      )
    }

    return NextResponse.json({ success: true, template: result })
  } catch (error) {
    console.error('Error in template create:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  const ctx = await getWhatsAppContext()
  if ('error' in ctx) return ctx.error

  try {
    const body = await request.json()
    const templateId = String(body.template_id || '').trim()

    if (!templateId) {
      return NextResponse.json({ error: 'Falta template_id' }, { status: 400 })
    }
    if (!String(body.body_text || '').trim()) {
      return NextResponse.json({ error: 'El cuerpo del mensaje es obligatorio' }, { status: 400 })
    }

    const res = await fetch(
      `https://graph.facebook.com/${getGraphVersion()}/${templateId}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ctx.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ components: buildComponents(body) }),
      }
    )

    const result = await res.json().catch(() => ({}))

    if (!res.ok) {
      console.error('Error editing template in Meta:', result)
      return NextResponse.json(
        {
          error:
            result.error?.error_user_msg ||
            result.error?.message ||
            'Meta rechazó la edición. Las plantillas pendientes de revisión no se pueden editar.',
        },
        { status: 400 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in template edit:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const ctx = await getWhatsAppContext()
  if ('error' in ctx) return ctx.error

  const name = new URL(request.url).searchParams.get('name')
  if (!name) {
    return NextResponse.json({ error: 'Falta el nombre de la plantilla' }, { status: 400 })
  }

  const res = await fetch(
    `https://graph.facebook.com/${getGraphVersion()}/${ctx.wabaId}/message_templates?name=${encodeURIComponent(name)}`,
    { method: 'DELETE', headers: { Authorization: `Bearer ${ctx.token}` } }
  )

  const result = await res.json().catch(() => ({}))

  if (!res.ok) {
    console.error('Error deleting template in Meta:', result)
    return NextResponse.json(
      { error: result.error?.message || 'No se pudo eliminar la plantilla' },
      { status: 400 }
    )
  }

  return NextResponse.json({ success: true })
}
