import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { createNotification } from '@/lib/notifications'

/**
 * Webhook para procesar eventos de automatizaciones
 * Este endpoint se llama cuando:
 * 1. Se crea una nueva promoción (trigger de BD o desde frontend)
 * 2. Se activa una nueva automatización de tipo "new_promotion"
 */
export async function POST(request: NextRequest) {
  try {
    const { type, table, record } = await request.json()

    console.log('📡 Webhook received:', { type, table })

    if (type !== 'INSERT') {
      return NextResponse.json({ success: true, message: 'Event ignored (not INSERT)' })
    }

    // Procesar según el tipo de tabla
    if (table === 'automations' && record.trigger_type === 'new_promotion') {
      return await processPromotionBroadcast(record)
    }

    if (table === 'promotions') {
      return await processNewPromotionEvent(record)
    }

    return NextResponse.json({ success: true, message: 'Event processed successfully' })

  } catch (error) {
    console.error('💥 Webhook processing error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

/**
 * Procesa el broadcast cuando se crea una automatización de promoción
 */
async function processPromotionBroadcast(automation: any) {
  console.log('🎉 Processing promotion broadcast for automation:', automation.id)

  const supabase = createAdminClient()

  try {
    // Obtener datos completos de la automatización con el bot
    const { data: fullAutomation, error: automationError } = await supabase
      .from('automations')
      .select(`
        *,
        bots!inner(id, platform)
      `)
      .eq('id', automation.id)
      .single()

    if (automationError || !fullAutomation) {
      console.error('❌ Failed to fetch automation:', automationError)
      return NextResponse.json({ error: 'Automation not found' }, { status: 404 })
    }

    // Si no está activa, salir
    if (!fullAutomation.is_active) {
      console.log('ℹ️ Automation is not active, skipping broadcast')
      return NextResponse.json({ success: true, message: 'Automation inactive' })
    }

    // Determinar audiencia objetivo
    const targetAudience = fullAutomation.trigger_config?.target_audience || 'all'
    const selectedClientIds = fullAutomation.trigger_config?.selected_clients || []
    const botPlatform = fullAutomation.bots.platform

    // Obtener clientes objetivo
    let clientsQuery = supabase
      .from('clients')
      .select('*')
      .eq('user_id', fullAutomation.user_id)

    // Filtrar por clientes específicos si aplica
    if (targetAudience === 'specific' && selectedClientIds.length > 0) {
      clientsQuery = clientsQuery.in('id', selectedClientIds)
    }

    // Filtrar por plataforma para asegurar que tengan el medio de contacto correcto
    if (botPlatform === 'whatsapp') {
      clientsQuery = clientsQuery.not('phone', 'is', null).neq('phone', '')
    } else if (botPlatform === 'email') {
      clientsQuery = clientsQuery.not('email', 'is', null).neq('email', '')
    }

    const { data: clients, error: clientsError } = await clientsQuery

    if (clientsError || !clients || clients.length === 0) {
      console.log('ℹ️ No clients found for broadcast')
      return NextResponse.json({ success: true, message: 'No clients to notify', queued: 0 })
    }

    console.log(`👥 Found ${clients.length} clients for broadcast`)

    // Obtener datos de la promoción si existe
    let promotionData = null
    if (fullAutomation.promotion_id || automation.promotion) {
      const promotionId = fullAutomation.promotion_id || automation.promotion?.id

      if (promotionId) {
        const { data: promo } = await supabase
          .from('promotions')
          .select('*')
          .eq('id', promotionId)
          .single()

        promotionData = promo
      } else if (automation.promotion) {
        // Si viene del webhook de promoción, usar los datos directamente
        promotionData = automation.promotion
      }
    }

    // Extraer configuración de plantilla
    const templateVariables = fullAutomation.template_variables || {}
    const variableMapping = templateVariables.variable_mapping || {}
    const isMetaTemplate = templateVariables.source === 'meta_api'
    const templateName = templateVariables.meta_template_name

    // Extraer el idioma correctamente - puede venir como string o como objeto {code: 'es_AR'}
    let templateLanguage = templateVariables.meta_template_language || templateVariables.template_language

    // Si es un objeto, extraer el código
    if (templateLanguage && typeof templateLanguage === 'object') {
      templateLanguage = templateLanguage.code || templateLanguage.language || 'es'
    }

    // Si no hay idioma en meta_template_language, intentar obtenerlo de template_data
    if (!templateLanguage && templateVariables.template_data?.language) {
      const dataLang = templateVariables.template_data.language
      templateLanguage = typeof dataLang === 'string' ? dataLang : (dataLang.code || 'es')
    }

    // Fallback final
    if (!templateLanguage) {
      templateLanguage = 'es'
    }

    const metaVariables = templateVariables.template_data?.variables || []

    console.log('📋 Template config:', {
      isMetaTemplate,
      templateName,
      templateLanguage,
      templateLanguageRaw: templateVariables.meta_template_language,
      variableCount: Object.keys(variableMapping).length,
      metaVariables,
      templateDataComponents: templateVariables.template_data?.components,
      templateDataFull: JSON.stringify(templateVariables.template_data, null, 2)
    })

    // Crear mensajes programados para cada cliente
    const messagesToInsert: any[] = []
    const now = new Date()

    for (const client of clients) {
      // Preparar metadata del mensaje
      const metadata: any = {
        is_meta_template: isMetaTemplate,
        template_name: templateName,
        template_language: templateLanguage,
      }

      // Construir componentes de WhatsApp (Header, Body, Buttons)
      const whatsappComponents: any[] = [];

      // 1. Procesar HEADER (Imagen, Video, Documento)
      // IMPORTANTE: Solo agregamos el header si tenemos una imagen REAL para enviar (dinámica).
      // Si la plantilla tiene una imagen fija en Meta, NO debemos enviar este componente,
      // ya que Meta usará la imagen predeterminada.
      if (isMetaTemplate && templateVariables.template_data?.components) {
        const headerComponent = templateVariables.template_data.components.find((c: any) => c.type === 'HEADER');
        
        // Solo procesamos si es de tipo IMAGE
        if (headerComponent && headerComponent.format === 'IMAGE') {
          let imageUrl = null;
          
          // 1. Intentar usar la imagen de la promoción
          if (promotionData && promotionData.image_url) {
             imageUrl = promotionData.image_url;
             console.log(`🖼️ Using promotion image for dynamic header: ${imageUrl}`);
          } 
          
          // 2. Si no hay imagen de promoción, usar una imagen por defecto para evitar que falle
          // Meta REQUIERE una imagen si la plantilla tiene header de imagen. No se puede omitir.
          if (!imageUrl) {
            // Usar una imagen genérica de "Oferta" o el logo de la empresa si estuviera disponible
            // Por ahora usamos un placeholder seguro
            imageUrl = "https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=2071&auto=format&fit=crop";
            console.warn('⚠️ No promotion image found. Using fallback placeholder image to satisfy Meta requirements.');
          }
          
          whatsappComponents.push({
            type: 'header',
            parameters: [{
              type: 'image',
              image: {
                link: imageUrl
              }
            }]
          });
        }
      }

      // 2. Procesar BODY (Variables de texto)
      if (isMetaTemplate && metaVariables.length > 0) {
        const templateParameters: any[] = []

        console.log(`🔍 Building parameters for ${metaVariables.length} Meta variables:`, metaVariables)

        // Iterar sobre cada variable de la plantilla Meta en ORDEN
        for (let i = 0; i < metaVariables.length; i++) {
          const metaVar = metaVariables[i]

          // metaVar puede ser "var_1", "var_2", etc.
          const mappedField = variableMapping[metaVar]

          if (!mappedField) {
            console.warn(`⚠️ No mapping found for ${metaVar}, using placeholder`)
            // Usar texto vacío o placeholder - Meta requiere que todos los parámetros estén presentes
            templateParameters.push({
              type: 'text',
              text: '-' // Usar guion en lugar de vacío para evitar errores
            })
            continue
          }

          // Resolver el valor real según el campo mapeado
          const value = resolveVariableValue(mappedField, client, promotionData, fullAutomation.user_id)

          // Asegurar que el valor no sea null o undefined
          const finalValue = value || ''

          templateParameters.push({
            type: 'text',
            text: finalValue
          })

          console.log(`  ${metaVar} -> ${mappedField} = "${finalValue.substring(0, 30)}${finalValue.length > 30 ? '...' : ''}"`)
        }

        // VALIDACIÓN CRÍTICA: asegurar que el número de parámetros coincida
        if (templateParameters.length !== metaVariables.length) {
          console.error(`❌ PARAMETER MISMATCH! Expected ${metaVariables.length} but generated ${templateParameters.length}`)

          // Intentar corregir agregando parámetros vacíos si faltan
          while (templateParameters.length < metaVariables.length) {
            templateParameters.push({ type: 'text', text: '-' })
            console.warn(`⚠️ Added placeholder parameter at position ${templateParameters.length}`)
          }
        }

        metadata.template_parameters = templateParameters
        
        // Agregar componente BODY
        whatsappComponents.push({
          type: 'body',
          parameters: templateParameters
        });

        console.log(`✅ Generated ${templateParameters.length} parameters for client ${client.id}`)
        console.log(`   Parameters:`, templateParameters.map((p, idx) => `[${idx + 1}] "${p.text}"`).join(', '))
      } else if (isMetaTemplate) {
        // Si es plantilla pero no tiene variables, igual necesitamos el componente body vacío si la plantilla tiene body
        // Pero Meta suele aceptar componentes vacíos o implícitos si no hay parámetros.
        // Sin embargo, para consistencia, si detectamos que hay un body en la definición, podríamos agregarlo.
        // Por ahora, lo dejamos así, ya que el error principal era el header.
      }

      // Guardar componentes completos en metadata
      if (whatsappComponents.length > 0) {
        metadata.whatsapp_components = whatsappComponents;
      }

      // Determinar destinatario según plataforma
      const botPlatform = fullAutomation.bots.platform
      let recipientField: any = {}

      if (botPlatform === 'whatsapp' && client.phone) {
        recipientField = {
          recipient_phone: client.phone,
          platform: 'whatsapp'
        }
      } else if (botPlatform === 'instagram' && client.instagram) {
        recipientField = {
          recipient_instagram_id: client.instagram,
          platform: 'instagram'
        }
      } else if (botPlatform === 'email' && client.email) {
        recipientField = {
          recipient_email: client.email,
          platform: 'email'
        }
      } else {
        console.warn(`⚠️ Client ${client.id} doesn't have contact info for ${botPlatform}`)
        continue
      }

      // Construir el mensaje
      const messageData = {
        user_id: fullAutomation.user_id,
        automation_id: fullAutomation.id,
        client_id: client.id,
        bot_id: fullAutomation.bots.id,
        message_content: fullAutomation.message_template || '', // Contenido de respaldo
        recipient_name: client.name || 'Cliente',
        scheduled_for: now.toISOString(), // Envío inmediato
        automation_type: 'new_promotion',
        priority: 2, // Prioridad alta para promociones
        metadata,
        ...recipientField
      }

      messagesToInsert.push(messageData)
    }

    if (messagesToInsert.length === 0) {
      console.log('ℹ️ No messages to queue (no valid recipients)')
      return NextResponse.json({ success: true, message: 'No valid recipients', queued: 0 })
    }

    // Insertar en lotes
    const BATCH_SIZE = 100
    let totalQueued = 0

    for (let i = 0; i < messagesToInsert.length; i += BATCH_SIZE) {
      const batch = messagesToInsert.slice(i, i + BATCH_SIZE)

      const { error: insertError } = await supabase
        .from('scheduled_messages')
        .insert(batch)

      if (insertError) {
        console.error(`❌ Error inserting batch starting at ${i}:`, insertError)
      } else {
        totalQueued += batch.length
        console.log(`✅ Queued batch of ${batch.length} messages (total: ${totalQueued})`)
      }
    }

    // Notificar al usuario
    await createNotification({
      userId: fullAutomation.user_id,
      title: "Promoción en curso",
      message: `Se han programado ${totalQueued} mensajes para tu promoción`,
      type: "success",
      link: `/dashboard/automatizaciones`
    })

    console.log(`✅ Broadcast completed: ${totalQueued} messages queued`)

    return NextResponse.json({
      success: true,
      message: 'Broadcast queued successfully',
      queued: totalQueued,
      automation_id: fullAutomation.id
    })

  } catch (error) {
    console.error('💥 Error processing promotion broadcast:', error)
    return NextResponse.json(
      { error: 'Broadcast processing failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

/**
 * Procesa eventos cuando se crea una nueva promoción desde la tabla promotions
 */
async function processNewPromotionEvent(promotion: any) {
  console.log('🎉 New promotion created:', promotion.id)

  const supabase = createAdminClient()

  try {
    // Buscar automatizaciones activas de tipo new_promotion para este usuario
    const { data: automations } = await supabase
      .from('automations')
      .select(`
        *,
        bots!inner(id, platform)
      `)
      .eq('user_id', promotion.user_id)
      .eq('trigger_type', 'new_promotion')
      .eq('is_active', true)

    if (!automations || automations.length === 0) {
      console.log('ℹ️ No active new_promotion automations found for this user')
      return NextResponse.json({ success: true, message: 'No active automations' })
    }

    console.log(`Found ${automations.length} active new_promotion automations`)

    // Procesar cada automatización
    for (const automation of automations) {
      // Agregar datos de la promoción al record
      const enrichedAutomation = {
        ...automation,
        promotion_id: promotion.id,
        promotion: promotion
      }

      await processPromotionBroadcast(enrichedAutomation)
    }

    return NextResponse.json({ success: true, message: 'Promotion broadcasts triggered' })

  } catch (error) {
    console.error('💥 Error processing new promotion event:', error)
    return NextResponse.json(
      { error: 'Failed to process promotion event' },
      { status: 500 }
    )
  }
}

/**
 * Resuelve el valor de una variable según el contexto
 */
function resolveVariableValue(
  variableName: string,
  client: any,
  promotion: any | null,
  userId: string
): string {
  // Variables del cliente
  if (variableName === 'nombre') return client.name || 'Cliente'
  if (variableName === 'email') return client.email || 'Sin email'
  if (variableName === 'telefono') return client.phone || 'Sin teléfono'
  if (variableName === 'instagram_usuario') return client.instagram_username || 'Sin usuario'
  if (variableName === 'puntos') return client.points ? `${client.points} puntos` : '0 puntos'
  if (variableName === 'total_compras') return client.total_purchases ? `$${client.total_purchases}` : '$0.00'
  if (variableName === 'ultima_compra') {
    if (client.last_purchase_date) {
      return formatDate(client.last_purchase_date)
    }
    return 'Sin compras registradas'
  }

  // Variables de promoción
  if (promotion) {
    if (variableName === 'nombre_promocion') return promotion.name || 'Promoción'
    if (variableName === 'descripcion_promocion') return promotion.description || 'Sin descripción'
    if (variableName === 'fecha_inicio') return promotion.start_date ? formatDate(promotion.start_date) : 'Sin fecha'
    if (variableName === 'fecha_fin') return promotion.end_date ? formatDate(promotion.end_date) : 'Sin fecha'
    if (variableName === 'usos_maximos') return promotion.max_uses ? `${promotion.max_uses}` : 'Sin límite'
    if (variableName === 'usos_actuales') return promotion.current_uses ? `${promotion.current_uses}` : '0'
  }

  // Variables de fecha/hora
  const now = new Date()
  if (variableName === 'fecha_actual') return formatDate(now.toISOString())
  if (variableName === 'hora_actual') return now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
  if (variableName === 'dia_semana') {
    const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
    return days[now.getDay()]
  }

  // Si no se encuentra, devolver placeholder
  console.warn(`⚠️ Unknown variable: ${variableName}`)
  return 'N/A'
}

/**
 * Formatea una fecha ISO a formato legible
 */
function formatDate(isoDate: string): string {
  try {
    const date = new Date(isoDate)
    return date.toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  } catch {
    return isoDate
  }
}
