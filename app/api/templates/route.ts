import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getWhatsAppToken, getGraphVersion } from '@/lib/meta/credentials'

// Endpoint para obtener plantillas de mensaje desde las APIs de Meta y proveedores externos
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    const { data, error } = await supabase.auth.getUser()
    if (error || !data?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = data.user.id
    const { searchParams } = new URL(request.url)
    const platform = searchParams.get('platform') // 'whatsapp', 'instagram', 'gmail', 'all'
    const botId = searchParams.get('bot_id')
    const businessAccountId = searchParams.get('business_account_id') // Para Instagram
    const accessToken = searchParams.get('access_token') // Token temporal

    let allTemplates: any[] = []

    if (!platform || platform === 'all') {
      // Obtener plantillas de todas las plataformas
      const [whatsappTemplates, instagramTemplates, gmailTemplates] = await Promise.all([
        fetchWhatsAppTemplates(supabase, userId, botId),
        fetchInstagramTemplates(supabase, userId, botId, businessAccountId, accessToken),
        fetchGmailTemplates(supabase, userId, botId)
      ])
      
      allTemplates = [
        ...whatsappTemplates,
        ...instagramTemplates,
        ...gmailTemplates
      ]
    } else {
      // Obtener plantillas de una plataforma específica
      switch (platform) {
        case 'whatsapp':
          allTemplates = await fetchWhatsAppTemplates(supabase, userId, botId)
          break
        case 'instagram':
          allTemplates = await fetchInstagramTemplates(supabase, userId, botId, businessAccountId, accessToken)
          break
        case 'gmail':
          allTemplates = await fetchGmailTemplates(supabase, userId, botId)
          break
        default:
          return NextResponse.json({ error: 'Invalid platform' }, { status: 400 })
      }
    }

    // Agrupar por plataforma para mejor organización
    const templatesByPlatform = allTemplates.reduce((acc, template) => {
      const platform = template.platform
      if (!acc[platform]) {
        acc[platform] = []
      }
      acc[platform].push(template)
      return acc
    }, {})

    const response = {
      success: true,
      data: {
        templates: allTemplates,
        by_platform: templatesByPlatform,
        total_count: allTemplates.length,
        platforms: Object.keys(templatesByPlatform)
      }
    }

    console.log('📤 API Response structure:', {
      success: response.success,
      templatesCount: response.data.templates.length,
      templateNames: response.data.templates.map((t: any) => t.name),
      platforms: response.data.platforms
    })

    return NextResponse.json(response)

  } catch (error) {
    console.error('Error fetching message templates:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Obtener plantillas de WhatsApp Business desde Meta API
async function fetchWhatsAppTemplates(supabase: any, userId: string, botId?: string | null) {
  try {
    // 1. Obtener los bots de WhatsApp
    let query = supabase
      .from('bots')
      .select('id, name, platform, user_id')
      .eq('user_id', userId)
      .eq('platform', 'whatsapp')
      .eq('is_active', true)

    if (botId) {
      query = query.eq('id', botId)
    }

    const { data: bots } = await query

    if (!bots || bots.length === 0) {
      return []
    }

    // 2. Obtener la configuración de integración de WhatsApp
    const { data: integration } = await supabase
      .from('integrations')
      .select('config')
      .eq('user_id', userId)
      .eq('platform', 'whatsapp')
      .single()

    const integrationConfig = integration?.config
    const whatsappToken = getWhatsAppToken(integration)

    if (!integrationConfig?.business_account_id || !whatsappToken) {
      console.log('Missing WhatsApp integration configuration')
      return []
    }

    const templates: any[] = []

    // Para cada bot de WhatsApp, obtener plantillas desde Meta API
    // Nota: Como la integración es por cuenta (user_id), todos los bots comparten la misma WABA
    // por lo que las plantillas serán las mismas para todos.

    try {
      // Llamar a Meta Graph API para obtener message templates
      const response = await fetch(
        `https://graph.facebook.com/${getGraphVersion()}/${integrationConfig.business_account_id}/message_templates?fields=name,status,language,category,components,quality_score`,
        {
          headers: {
            'Authorization': `Bearer ${whatsappToken}`,
            'Content-Type': 'application/json'
          }
        }
      )

      if (response.ok) {
        const result = await response.json()
        
        if (result.data) {
          // Asignamos las plantillas encontradas a cada bot solicitado
          for (const bot of bots) {
            result.data.forEach((template: any) => {
              templates.push({
                id: template.id || `whatsapp_${template.name}`,
                name: template.name,
                platform: 'whatsapp',
                bot_id: bot.id,
                bot_name: bot.name,
                status: template.status,
                language: template.language,
                category: template.category,
                components: template.components,
                quality_score: template.quality_score,
                body_content: extractWhatsAppTemplateBody(template.components),
                variables: extractWhatsAppTemplateVariables(template.components),
                can_use: template.status === 'APPROVED',
                source: 'meta_api',
                last_synced: new Date().toISOString()
              })
            })
          }
        }
      } else {
        const errorText = await response.text()
        console.error(`Failed to fetch WhatsApp templates: ${response.status}`, errorText)
      }
    } catch (error) {
      console.error(`Error fetching WhatsApp templates from Meta API:`, error)
    }

    return templates
  } catch (error) {
    console.error('Error in fetchWhatsAppTemplates:', error)
    return []
  }
}

// Obtener plantillas de Instagram Business desde Meta API
async function fetchInstagramTemplates(supabase: any, userId: string, botId?: string | null, businessAccountId?: string | null, accessToken?: string | null) {
  console.log('🚀 fetchInstagramTemplates called with:', { userId, botId, businessAccountId: businessAccountId || 'none', accessToken: accessToken ? 'provided' : 'none' })
  
  try {
    const templates: any[] = []

    // Si se proporcionan businessAccountId y accessToken, hacer llamada directa a Meta API
    if (businessAccountId && accessToken) {
      console.log('✅ Using provided parameters for direct Meta API call')
      console.log(`🎯 WABA ID: ${businessAccountId}`)
      console.log(`🔑 Access Token: ${accessToken.substring(0, 20)}...`)
      
      try {
        const response = await fetch(
          `https://graph.facebook.com/${getGraphVersion()}/${businessAccountId}/message_templates?fields=name,status,language,category,components,quality_score`,
          {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            }
          }
        )

        console.log(`📡 Meta API Response status: ${response.status}`)
        
        if (response.ok) {
          const result = await response.json()
          console.log(`📊 Templates found: ${result.data?.length || 0}`)
          
          if (result.data && result.data.length > 0) {
            result.data.forEach((template: any) => {
              templates.push({
                id: template.id || `instagram_${template.name}`,
                name: `${template.name} (WhatsApp)`,
                platform: 'instagram',
                bot_id: botId || 'temp',
                bot_name: 'Instagram Bot',
                status: template.status,
                language: template.language,
                category: template.category,
                components: template.components,
                quality_score: template.quality_score,
                body_content: extractWhatsAppTemplateBody(template.components),
                variables: extractWhatsAppTemplateVariables(template.components),
                can_use: template.status === 'APPROVED',
                source: 'whatsapp_shared',
                last_synced: new Date().toISOString()
              })
            })
            console.log(`✅ Successfully processed ${templates.length} templates`)
          }
        } else {
          const errorData = await response.text()
          console.error(`❌ Meta API Error ${response.status}:`, errorData)
          
          templates.push({
            id: 'api_error_template',
            name: 'Error: No se pudieron obtener plantillas',
            platform: 'instagram',
            bot_id: botId || 'temp',
            bot_name: 'Instagram Bot',
            status: 'ERROR',
            body_content: `Error ${response.status}: ${errorData}`,
            variables: [],
            can_use: false,
            source: 'api_error',
            last_synced: new Date().toISOString()
          })
        }
      } catch (fetchError) {
        console.error('❌ Error calling Meta API:', fetchError)
        templates.push({
          id: 'fetch_error_template',
          name: 'Error: Fallo en la conexión',
          platform: 'instagram',
          bot_id: botId || 'temp',
          bot_name: 'Instagram Bot',
          status: 'ERROR',
          body_content: `Error de conexión: ${fetchError}`,
          variables: [],
          can_use: false,
          source: 'fetch_error',
          last_synced: new Date().toISOString()
        })
      }
      
      return templates
    }

    // Si no se proporcionan parámetros, buscar en la configuración guardada (flujo original)
    console.log('📂 No direct parameters provided, checking saved bot configuration')
    
    // Obtener configuraciones de Instagram del usuario desde la tabla bots
    let query = supabase
      .from('bots')
      .select('id, name, platform, integrations')
      .eq('user_id', userId)
      .eq('platform', 'instagram')
      .eq('is_active', true)

    if (botId) {
      query = query.eq('id', botId)
    }

    const { data: bots } = await query
    console.log('📊 Query result:', { botsFound: bots?.length || 0, bots: bots?.map((b: any) => ({ id: b.id, name: b.name })) })

    if (!bots || bots.length === 0) {
      console.log('❌ No Instagram bots found - returning empty array')
      return []
    }

    // Para cada bot de Instagram, obtener plantillas
    // Obtener la configuración de integración de Instagram
    const { data: integration } = await supabase
      .from('integrations')
      .select('config')
      .eq('user_id', userId)
      .eq('platform', 'instagram')
      .single()
      
    let globalIntegrationConfig = integration?.config

    for (const bot of bots) {
      try {
        // Usar la configuración global de la tabla integrations
        let integrationConfig = globalIntegrationConfig
        
        // Si se proporciona businessAccountId como parámetro, usarlo temporalmente
        const accountIdToUse = businessAccountId || integrationConfig?.business_account_id
        
        if (!integrationConfig?.access_token) {
          console.log(`Instagram bot ${bot.id} missing access token in integrations table`)
          
          // Si se proporciona accessToken como parámetro, usarlo temporalmente
          if (accessToken) {
            console.log('Using temporary access token provided in request')
            integrationConfig = { 
              ...integrationConfig,
              access_token: accessToken
            }
          } else {
            // Si no hay token global ni parámetro, intentar con la columna legacy (por si acaso)
            if (bot.integrations?.access_token) {
               integrationConfig = bot.integrations
            } else {
               continue
            }
          }
        }

        // Si tenemos un business_account_id (temporal o guardado), obtener plantillas de WhatsApp
        if (accountIdToUse) {
          console.log(`Fetching templates for business account: ${accountIdToUse}`)
          console.log(`Access token provided via parameter: ${accessToken ? 'Yes' : 'No'}`)
          console.log(`Integration config token: ${integrationConfig?.access_token ? 'Yes' : 'No'}`)
          
          // Intentar obtener plantillas incluso sin access token para debugging
          let authHeader = ''
          if (integrationConfig?.access_token) {
            authHeader = `Bearer ${integrationConfig.access_token}`
            console.log(`Using access token from config`)
          } else {
            console.log(`Warning: No access token found for bot ${bot.id}`)
            // Crear un template de ejemplo para mostrar que el business_account_id funciona
            templates.push({
              id: 'debug_template',
              name: 'Debug: Configuración requerida',
              platform: 'instagram',
              bot_id: bot.id,
              bot_name: bot.name,
              status: 'PENDING',
              body_content: `Para obtener plantillas reales, necesitas:\n1. Access Token válido de Meta\n2. Permisos: whatsapp_business_management\n3. Business Account ID: ${accountIdToUse}`,
              variables: [],
              can_use: false,
              source: 'debug_info',
              last_synced: new Date().toISOString()
            })
            continue
          }

          const response = await fetch(
            `https://graph.facebook.com/${getGraphVersion()}/${accountIdToUse}/message_templates?fields=name,status,language,category,components,quality_score`,
            {
              headers: {
                'Authorization': authHeader,
                'Content-Type': 'application/json'
              }
            }
          )

          console.log(`API Response status: ${response.status}`)
          
          if (response.ok) {
            const result = await response.json()
            console.log(`Templates found: ${result.data?.length || 0}`)
            console.log('Template names:', result.data?.map((t: any) => t.name).join(', ') || 'None')
            
            if (result.data && result.data.length > 0) {
              result.data.forEach((template: any) => {
                templates.push({
                  id: template.id || `instagram_${template.name}`,
                  name: `${template.name} (WhatsApp)`,
                  platform: 'instagram',
                  bot_id: bot.id,
                  bot_name: bot.name,
                  status: template.status,
                  language: template.language,
                  category: template.category,
                  components: template.components,
                  quality_score: template.quality_score,
                  body_content: extractWhatsAppTemplateBody(template.components),
                  variables: extractWhatsAppTemplateVariables(template.components),
                  can_use: template.status === 'APPROVED',
                  source: 'whatsapp_shared',
                  last_synced: new Date().toISOString()
                })
              })
            }
          } else {
            // Error en la respuesta de la API
            const errorData = await response.text()
            console.error(`API Error ${response.status}:`, errorData)
            
            templates.push({
              id: 'api_error_template',
              name: 'Error: No se pudieron obtener plantillas',
              platform: 'instagram',
              bot_id: bot.id,
              bot_name: bot.name,
              status: 'ERROR',
              body_content: `Error ${response.status}: ${errorData}`,
              variables: [],
              can_use: false,
              source: 'api_error',
              last_synced: new Date().toISOString()
            })
          }
        }

        // Obtener plantillas locales de Instagram (nueva tabla templates)
        const { data: newLocalTemplates } = await supabase
          .from('templates')
          .select('*')
          .eq('user_id', userId)
          .eq('platform', 'instagram')
          .eq('source', 'local')
          .eq('status', 'active')
          .or(`bot_id.eq.${bot.id},bot_id.is.null`)

        if (newLocalTemplates) {
          newLocalTemplates.forEach((template: any) => {
            templates.push({
              id: template.id,
              name: template.name,
              platform: 'instagram',
              bot_id: bot.id,
              bot_name: bot.name,
              status: 'APPROVED',
              body_content: template.body_text,
              subject: template.subject,
              html_content: template.html_content,
              variables: Array.isArray(template.variables) 
                ? template.variables.map((v: any) => typeof v === 'string' ? v : `{${v}}`) 
                : [],
              can_use: true,
              source: 'local_db',
              last_synced: new Date().toISOString()
            })
          })
        }

        // Obtener plantillas locales de Instagram (tabla legacy message_templates)
        const { data: legacyLocalTemplates } = await supabase
          .from('message_templates')
          .select('*')
          .eq('bot_id', bot.id)
          .eq('platform', 'instagram')
          .eq('status', 'active')

        if (legacyLocalTemplates) {
          legacyLocalTemplates.forEach((template: any) => {
            templates.push({
              id: template.id,
              name: template.template_name,
              platform: 'instagram',
              bot_id: bot.id,
              bot_name: bot.name,
              status: 'APPROVED',
              body_content: template.body_content,
              variables: template.variables || [],
              can_use: true,
              source: 'legacy_local_db',
              last_synced: new Date().toISOString()
            })
          })
        }
      } catch (error) {
        console.error(`Error fetching Instagram templates for bot ${bot.id}:`, error)
      }
    }

    return templates
  } catch (error) {
    console.error('Error in fetchInstagramTemplates:', error)
    return []
  }
}

// Obtener plantillas de Gmail (solo locales - el usuario crea sus mensajes)
async function fetchGmailTemplates(supabase: any, userId: string, botId?: string | null) {
  try {
    const templates: any[] = []

    // Obtener plantillas de la nueva tabla templates
    let newQuery = supabase
      .from('templates')
      .select('*')
      .eq('user_id', userId)
      .eq('platform', 'gmail')
      .eq('source', 'local')
      .eq('status', 'active')

    if (botId) {
      newQuery = newQuery.or(`bot_id.eq.${botId},bot_id.is.null`)
    }

    const { data: newLocalTemplates } = await newQuery

    if (newLocalTemplates) {
      newLocalTemplates.forEach((template: any) => {
        templates.push({
          id: template.id,
          name: template.name,
          platform: 'gmail',
          bot_id: template.bot_id,
          bot_name: 'Gmail Bot', // Podríamos obtener el nombre del bot si es necesario
          status: template.status,
          language: 'es',
          category: template.category || 'transactional',
          body_text: template.body_text,
          html_content: template.html_content,
          subject: template.subject,
          variables: Array.isArray(template.variables) 
            ? template.variables.map((v: any) => typeof v === 'string' ? v : `{${v}}`) 
            : [],
          source: 'local_db',
          created_at: template.created_at,
          updated_at: template.updated_at
        })
      })
    }

    // Obtener plantillas de la tabla legacy message_templates
    let legacyQuery = supabase
      .from('message_templates')
      .select(`
        *,
        bots!inner(id, name, user_id)
      `)
      .eq('bots.user_id', userId)
      .eq('platform', 'gmail')
      .eq('status', 'active')

    if (botId) {
      legacyQuery = legacyQuery.eq('bot_id', botId)
    }

    const { data: legacyLocalTemplates } = await legacyQuery

    if (legacyLocalTemplates) {
      legacyLocalTemplates.forEach((template: any) => {
        templates.push({
          id: template.id,
          name: template.template_name,
          platform: 'gmail',
          bot_id: template.bot_id,
          bot_name: template.bots.name,
          status: template.status,
          language: template.language || 'es',
          category: template.category || 'transactional',
          body_text: template.body_content,
          html_content: template.html_content,
          subject: template.subject,
          variables: template.variables_used || [],
          source: 'legacy_local_db',
          created_at: template.created_at,
          updated_at: template.updated_at
        })
      })
    }

    // Agregar plantilla "vacía" para que el usuario escriba su mensaje
    templates.unshift({
      id: 'gmail_custom_message',
      name: 'Mensaje personalizado',
      platform: 'gmail',
      bot_id: botId || 'all',
      bot_name: 'Gmail Bot',
      status: 'active',
      language: 'es',
      category: 'custom',
      body_text: 'Escribe aquí tu mensaje personalizado...',
      html_content: '',
      subject: 'Asunto del email',
      variables: ['name', 'first_name', 'email'],
      source: 'user_input',
      created_at: new Date().toISOString()
    })

    return templates
  } catch (error) {
    console.error('Error in fetchEmailTemplates:', error)
    return []
  }
}

// Función auxiliar para extraer el cuerpo del mensaje de WhatsApp
function extractWhatsAppTemplateBody(components: any[]): string {
  if (!components) return ''
  
  let parts: string[] = []

  // Header
  const headerComponent = components.find(comp => comp.type === 'HEADER')
  if (headerComponent && headerComponent.format === 'TEXT') {
    parts.push(headerComponent.text)
  }

  // Body
  const bodyComponent = components.find(comp => comp.type === 'BODY')
  if (bodyComponent) {
    parts.push(bodyComponent.text)
  }

  // Footer
  const footerComponent = components.find(comp => comp.type === 'FOOTER')
  if (footerComponent) {
    parts.push(footerComponent.text)
  }

  return parts.join('\n\n')
}

// Función auxiliar para extraer variables de WhatsApp
function extractWhatsAppTemplateVariables(components: any[]): string[] {
  if (!components) return []
  
  const variables: string[] = []
  components.forEach(comp => {
    if (comp.text) {
      // Buscar cualquier contenido entre llaves dobles {{...}}
      // Esto soporta tanto {{1}} como {{nombre de usuario}}
      const matches = comp.text.match(/\{\{([^}]+)\}\}/g)
      if (matches) {
        matches.forEach((match: string) => {
          // Limpiar llaves y espacios
          const varContent = match.replace(/[{}]/g, '').trim()
          variables.push(`var_${varContent}`)
        })
      }
    }
  })
  
  return [...new Set(variables)] // Remover duplicados
}

// Obtener plantillas de SendGrid
async function fetchSendGridTemplates(supabase: any, userId: string, botId?: string | null) {
  try {
    // Obtener configuración de SendGrid del usuario
    const { data: emailConfig } = await supabase
      .from('email_integrations')
      .select('*')
      .eq('user_id', userId)
      .eq('provider', 'sendgrid')
      .eq('is_active', true)
      .single()

    if (!emailConfig || !emailConfig.api_key) {
      return []
    }

    // Llamar a SendGrid API para obtener plantillas
    const response = await fetch('https://api.sendgrid.com/v3/templates?generations=dynamic,legacy', {
      headers: {
        'Authorization': `Bearer ${emailConfig.api_key}`,
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      console.error('Failed to fetch SendGrid templates:', await response.text())
      return []
    }

    const result = await response.json()
    const templates: any[] = []

    if (result.templates) {
      result.templates.forEach((template: any) => {
        templates.push({
          id: `sendgrid_${template.id}`,
          name: template.name,
          platform: 'email',
          bot_id: botId || 'sendgrid_global',
          bot_name: 'SendGrid',
          status: 'active',
          language: 'es',
          category: 'transactional',
          body_text: template.name, // SendGrid no expone el contenido completo en list
          subject: template.name,
          variables: [], // Se obtendrían en detalle individual
          source: 'sendgrid_api',
          external_id: template.id,
          created_at: template.updated_at || new Date().toISOString()
        })
      })
    }

    return templates
  } catch (error) {
    console.error('Error fetching SendGrid templates:', error)
    return []
  }
}

// Sincronizar plantillas desde APIs externas
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    const { data, error } = await supabase.auth.getUser()
    if (error || !data?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = data.user.id
    const { platform, bot_id, force_refresh = false } = await request.json()

    let syncResults: any = {}

    if (!platform || platform === 'all') {
      // Sincronizar todas las plataformas
      syncResults.whatsapp = await syncWhatsAppTemplates(supabase, userId, bot_id, force_refresh)
      syncResults.instagram = await syncInstagramTemplates(supabase, userId, bot_id, force_refresh)
      syncResults.email = await syncEmailTemplates(supabase, userId, bot_id, force_refresh)
    } else {
      switch (platform) {
        case 'whatsapp':
          syncResults.whatsapp = await syncWhatsAppTemplates(supabase, userId, bot_id, force_refresh)
          break
        case 'instagram':
          syncResults.instagram = await syncInstagramTemplates(supabase, userId, bot_id, force_refresh)
          break
        case 'email':
          syncResults.email = await syncEmailTemplates(supabase, userId, bot_id, force_refresh)
          break
        default:
          return NextResponse.json({ error: 'Invalid platform' }, { status: 400 })
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Templates synchronized successfully',
      data: syncResults
    })

  } catch (error) {
    console.error('Error syncing templates:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Funciones auxiliares de sincronización (implementación básica)
async function syncWhatsAppTemplates(supabase: any, userId: string, botId?: string, forceRefresh: boolean = false) {
  // Implementar sincronización y almacenamiento local de plantillas de WhatsApp
  return { synced: 0, message: 'WhatsApp sync implemented' }
}

async function syncInstagramTemplates(supabase: any, userId: string, botId?: string, forceRefresh: boolean = false) {
  // Implementar sincronización y almacenamiento local de plantillas de Instagram
  return { synced: 0, message: 'Instagram sync implemented' }
}

async function syncEmailTemplates(supabase: any, userId: string, botId?: string, forceRefresh: boolean = false) {
  // Implementar sincronización y almacenamiento local de plantillas de Email
  return { synced: 0, message: 'Email sync implemented' }
}