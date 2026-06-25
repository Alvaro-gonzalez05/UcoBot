import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { isPromotionActive, promotionLabel } from '@/lib/promotions'
import { getTemplateSlots } from '@/lib/whatsapp-template'

// Endpoint para procesar eventos programados (llamado por cron jobs)
// Maneja cumpleaños, clientes inactivos, etc.
export async function POST(request: NextRequest) {
  try {
    const { type } = await request.json()
    
    console.log('🕒 Processing scheduled automation:', type)
    
    const supabase = createAdminClient()

    switch (type) {
      case 'birthday.check':
        return await processBirthdayAutomations(supabase)
      
      case 'inactive_client.check':
        return await processInactiveClientAutomations(supabase)
        
      case 'promotion.broadcast':
        return await processPromotionBroadcasts(supabase)

      case 'follow_up.check':
        return await processFollowUpAutomations(supabase)

      case 'reservation_reminder.check':
        return await processReservationReminders(supabase)

      default:
        return NextResponse.json({ error: 'Unknown automation type' }, { status: 400 })
    }
    
  } catch (error) {
    console.error('💥 Scheduled automation error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

// Procesar automatizaciones de cumpleaños
async function processBirthdayAutomations(supabase: any) {
  console.log('🎂 Processing birthday automations...')
  
  try {
    const today = new Date()
    const todayStr = today.toISOString().split('T')[0] // YYYY-MM-DD
    
    // Verificar si ya se procesaron cumpleaños hoy
    // NOTA: Se ha deshabilitado esta verificación para permitir múltiples ejecuciones diarias
    /*
    const { data: existingExecution } = await supabase
      .from('automation_executions')
      .select('id')
      .eq('automation_type', 'birthday')
      .eq('execution_date', todayStr)
      .eq('status', 'completed')
    
    if (existingExecution && existingExecution.length > 0) {
      console.log('ℹ️ Birthday automations already processed today')
      return NextResponse.json({ message: 'Already processed today', processed: 0 })
    }
    */

    // Obtener automatizaciones de cumpleaños activas
    const { data: automations } = await supabase
      .from('automations')
      .select(`
        *,
        bots!inner(*)
      `)
      .eq('trigger_type', 'birthday')
      .eq('is_active', true)
      .eq('bots.is_active', true)

    if (!automations || automations.length === 0) {
      console.log('ℹ️ No active birthday automations found')
      return NextResponse.json({ message: 'No active automations', processed: 0 })
    }

    let totalProcessed = 0

    // Procesar cada automatización de cumpleaños
    for (const automation of automations) {
      const processed = await processSingleBirthdayAutomation(supabase, automation, today)
      totalProcessed += processed
    }

    console.log(`✅ Birthday processing completed. Total processed: ${totalProcessed}`)
    
    return NextResponse.json({
      success: true,
      processed: totalProcessed,
      message: 'Birthday automations processed successfully'
    })
    
  } catch (error) {
    console.error('💥 Birthday automation error:', error)
    return NextResponse.json({ error: 'Failed to process birthday automations' }, { status: 500 })
  }
}

async function processSingleBirthdayAutomation(supabase: any, automation: any, today: Date) {
  try {
    const daysBefore = automation.trigger_config?.days_before || 0
    
    // Calcular la fecha objetivo (cumpleaños - días antes)
    const targetDate = new Date(today)
    targetDate.setDate(targetDate.getDate() + daysBefore)
    
    const targetMonth = targetDate.getMonth() + 1 // getMonth() es 0-indexed
    const targetDay = targetDate.getDate()
    
    // Buscar clientes con cumpleaños en la fecha objetivo
    const { data: clients } = await supabase
      .from('clients')
      .select('*')
      .eq('user_id', automation.user_id)
      .not('birthday', 'is', null)
    
    if (!clients || clients.length === 0) {
      console.log(`ℹ️ No clients with birth dates for automation: ${automation.id}`)
      return 0
    }

    // Filtrar clientes con cumpleaños en la fecha objetivo
    const birthdayClients = clients.filter((client: any) => {
      if (!client.birthday) return false
      
      // Solución robusta para zonas horarias: parsear el string YYYY-MM-DD directamente
      // Evita que new Date('2025-11-27') se convierta en '2025-11-26 21:00' en zonas UTC-3
      try {
        const [year, month, day] = client.birthday.split('-').map(Number)
        return month === targetMonth && day === targetDay
      } catch (e) {
        // Fallback por si el formato no es YYYY-MM-DD
        const birthDate = new Date(client.birthday)
        return birthDate.getMonth() + 1 === targetMonth && birthDate.getDate() === targetDay
      }
    })

    if (birthdayClients.length === 0) {
      console.log(`ℹ️ No clients with birthday on target date for automation: ${automation.id}`)
      return 0
    }

    // Crear registro de ejecución (usando upsert para permitir re-ejecuciones en el mismo día)
    const { data: execution, error: executionError } = await supabase
      .from('automation_executions')
      .upsert({
        automation_id: automation.id,
        execution_date: today.toISOString().split('T')[0],
        automation_type: 'birthday',
        total_eligible_clients: birthdayClients.length,
        status: 'processing',
        messages_queued: 0 // Resetear contador
      }, { onConflict: 'automation_id, execution_date' })
      .select()
      .single()

    if (executionError) {
      console.error('❌ Error creating execution record for birthday:', executionError)
    }

    let messagesQueued = 0
    const messagesToInsert: any[] = []

    // Programar mensaje para cada cliente
    for (const client of birthdayClients) {
      // Personalizar mensaje
      let messageContent = automation.message_template
      if (messageContent) {
        messageContent = messageContent.replace(/\{name\}/g, client.name || 'Cliente')
        messageContent = messageContent.replace(/\{first_name\}/g, client.name?.split(' ')[0] || 'Cliente')
      }

      // Programar para envío inmediato (distribuido en 30 mins)
      const scheduledFor = new Date()
      scheduledFor.setMinutes(scheduledFor.getMinutes() + Math.floor(Math.random() * 30)) 

      // Preparar metadata
      const metadata: any = {
        is_meta_template: automation.message_type === 'template',
        template_name: automation.meta_template_name,
        template_language: automation.meta_template_language,
      }

      const messageData: any = {
        user_id: automation.user_id,
        automation_id: automation.id,
        client_id: client.id,
        bot_id: automation.bots.id,
        message_content: messageContent,
        recipient_name: client.name,
        scheduled_for: scheduledFor.toISOString(),
        automation_type: 'birthday',
        priority: 3,
        metadata: metadata
      }

      // Agregar identificador según plataforma del bot
      const botPlatform = automation.bots.platform
      if (botPlatform === 'whatsapp' && client.phone) {
        messageData.recipient_phone = client.phone
        messageData.platform = 'whatsapp'
      } else if (botPlatform === 'instagram' && client.instagram) {
        messageData.recipient_instagram_id = client.instagram
      } else if (botPlatform === 'gmail' && client.email) {
        messageData.recipient_email = client.email
        messageData.platform = 'email'
      } else {
        // Si el cliente no tiene el campo necesario para la plataforma, saltar
        console.log(`⚠️ Client ${client.id} doesn't have contact info for ${botPlatform}`)
        continue
      }

      messagesToInsert.push(messageData)
    }

    // Insertar en lotes (Bulk Insert)
    const BATCH_SIZE = 100
    for (let i = 0; i < messagesToInsert.length; i += BATCH_SIZE) {
      const batch = messagesToInsert.slice(i, i + BATCH_SIZE)
      const { error: insertError } = await supabase
        .from('scheduled_messages')
        .insert(batch)

      if (insertError) {
        console.error(`❌ Error scheduling batch of birthday messages (start index ${i}):`, insertError)
      } else {
        messagesQueued += batch.length
      }
    }

    // Actualizar registro de ejecución
    if (execution) {
      await supabase
        .from('automation_executions')
        .update({
          status: 'completed',
          clients_processed: birthdayClients.length,
          messages_queued: messagesQueued,
          completed_at: new Date().toISOString()
        })
        .eq('id', execution.id)
    }

    console.log(`✅ Birthday automation processed: ${automation.name} - ${messagesQueued} messages queued`)
    
    return messagesQueued

  } catch (error) {
    console.error(`💥 Error processing birthday automation ${automation.id}:`, error)
    return 0
  }
}

// Procesar automatizaciones de clientes inactivos
async function processInactiveClientAutomations(supabase: any) {
  console.log('😴 Processing inactive client automations...')
  
  try {
    const today = new Date()
    const todayStr = today.toISOString().split('T')[0]
    
    // Verificar si ya se procesaron hoy
    // NOTA: Se ha deshabilitado esta verificación para permitir múltiples ejecuciones diarias si es necesario
    /*
    const { data: existingExecution } = await supabase
      .from('automation_executions')
      .select('id')
      .eq('automation_type', 'inactive_client')
      .eq('execution_date', todayStr)
      .eq('status', 'completed')
    
    if (existingExecution && existingExecution.length > 0) {
      console.log('ℹ️ Inactive client automations already processed today')
      return NextResponse.json({ message: 'Already processed today', processed: 0 })
    }
    */

    // Obtener automatizaciones de clientes inactivos activas
    const { data: automations } = await supabase
      .from('automations')
      .select(`
        *,
        bots!inner(*)
      `)
      .eq('trigger_type', 'inactive_client')
      .eq('is_active', true)
      .eq('bots.is_active', true)

    if (!automations || automations.length === 0) {
      console.log('ℹ️ No active inactive client automations found')
      return NextResponse.json({ message: 'No active automations', processed: 0 })
    }

    let totalProcessed = 0

    // Procesar cada automatización
    for (const automation of automations) {
      const processed = await processSingleInactiveClientAutomation(supabase, automation, today)
      totalProcessed += processed
    }

    console.log(`✅ Inactive client processing completed. Total processed: ${totalProcessed}`)
    
    return NextResponse.json({
      success: true,
      processed: totalProcessed,
      message: 'Inactive client automations processed successfully'
    })
    
  } catch (error) {
    console.error('💥 Inactive client automation error:', error)
    return NextResponse.json({ error: 'Failed to process inactive client automations' }, { status: 500 })
  }
}

async function processSingleInactiveClientAutomation(supabase: any, automation: any, today: Date) {
  try {
    const inactiveDays = automation.trigger_config?.inactive_days || 30
    
    // Calcular fecha límite de actividad
    const cutoffDate = new Date(today)
    cutoffDate.setDate(cutoffDate.getDate() - inactiveDays)
    
    console.log(`🔍 Checking for clients inactive since: ${cutoffDate.toISOString()} (Days: ${inactiveDays})`)

    // Buscar clientes inactivos:
    // 1. Tienen last_interaction_at antigua (menor al cutoff)
    // 2. O NO tienen last_interaction_at (nunca interactuaron)
    const { data: potentialInactiveClients } = await supabase
      .from('clients')
      .select('*')
      .eq('user_id', automation.user_id)
      .or(`last_interaction_at.is.null,last_interaction_at.lt.${cutoffDate.toISOString()}`)
    
    console.log(`DEBUG: Potential clients found in DB query: ${potentialInactiveClients?.length || 0}`)

    if (!potentialInactiveClients || potentialInactiveClients.length === 0) {
      console.log(`ℹ️ No inactive clients found for automation: ${automation.id}`)
      return 0
    }

    // Filtrar falsos positivos (clientes nuevos creados recientemente que aún no tienen interacción)
    const inactiveClients = potentialInactiveClients.filter((client: any) => {
      // Si tiene fecha de interacción, la query ya garantizó que es antigua (< cutoff)
      if (client.last_interaction_at) return true
      
      // Si NO tiene fecha de interacción (es NULL), verificamos cuándo se creó
      // Si se creó hace poco (después del cutoff), es un cliente NUEVO, no inactivo.
      // Si se creó hace mucho (antes del cutoff), es un cliente que nunca interactuó -> INACTIVO.
      const createdAt = new Date(client.created_at)
      const isOldEnough = createdAt < cutoffDate
      
      if (!isOldEnough) {
         // Solo loguear los primeros 5 para no saturar
         // console.log(`DEBUG: Client ${client.id} skipped (Too new). Created: ${createdAt.toISOString()}, Cutoff: ${cutoffDate.toISOString()}`)
      }
      
      return isOldEnough
    })

    console.log(`DEBUG: Clients after 'New Client' filter: ${inactiveClients.length}`)

    if (inactiveClients.length === 0) {
      console.log(`ℹ️ No truly inactive clients found (all nulls were new clients)`)
      return 0
    }

    console.log(`👥 Found ${inactiveClients.length} truly inactive clients`)

    // Crear registro de ejecución (usando upsert para permitir re-ejecuciones en el mismo día)
    const { data: execution, error: executionError } = await supabase
      .from('automation_executions')
      .upsert({
        automation_id: automation.id,
        execution_date: today.toISOString().split('T')[0],
        automation_type: 'inactive_client',
        total_eligible_clients: inactiveClients.length,
        status: 'processing',
        messages_queued: 0 // Resetear contador si se re-ejecuta
      }, { onConflict: 'automation_id, execution_date' })
      .select()
      .single()

    if (executionError) {
      console.error('❌ Error creating execution record:', executionError)
      // Continuamos aunque falle el registro de ejecución, pero no podremos actualizarlo al final
    }

    let messagesQueued = 0

    // Programar mensaje para cada cliente inactivo
    const messagesToInsert: any[] = []

    for (const client of inactiveClients) {
      // Verificar si ya se le envió mensaje recientemente (para evitar spam si el cron corre varias veces o si la lógica falla)
      // Esto es opcional pero recomendado. Por ahora confiamos en automation_executions para el día.

      // Personalizar mensaje (si es texto simple)
      // Si es template, se maneja diferente en el envío, pero aquí preparamos el contenido base
      let messageContent = automation.message_template || ''
      if (messageContent) {
        messageContent = messageContent.replace(/\{name\}/g, client.name || 'Cliente')
        messageContent = messageContent.replace(/\{first_name\}/g, client.name?.split(' ')[0] || 'Cliente')
      }

      // Programar para envío distribuido
      const scheduledFor = new Date()
      scheduledFor.setHours(scheduledFor.getHours() + Math.floor(Math.random() * 8) + 1) // Distribuir en las próximas 8 horas

      // Preparar metadata para templates
      const metadata: any = {
        is_meta_template: automation.message_type === 'template',
        template_name: automation.meta_template_name,
        template_language: automation.meta_template_language,
        // Mapear variables si es necesario (esto requeriría lógica más compleja similar al broadcast)
        // Por simplicidad, asumimos que si es template, el usuario configuró variables estáticas o simples
      }

      // Verificar que automation.bots existe
      if (!automation.bots) {
        console.error(`❌ Automation ${automation.id} has no bot assigned`)
        continue
      }

      const messageData: any = {
        user_id: automation.user_id,
        automation_id: automation.id,
        client_id: client.id,
        bot_id: automation.bots.id,
        message_content: messageContent, // Texto fallback o contenido
        recipient_name: client.name,
        scheduled_for: scheduledFor.toISOString(),
        automation_type: 'inactive_client',
        priority: 4,
        metadata: metadata
      }

      // Agregar identificador según plataforma del bot
      const botPlatform = automation.bots.platform
      
      if (botPlatform === 'whatsapp') {
        messageData.recipient_phone = client.phone
        messageData.platform = 'whatsapp'
      } else if (botPlatform === 'instagram') {
        messageData.recipient_instagram_id = client.instagram
        messageData.platform = 'instagram'
      } else if (botPlatform === 'email') {
        messageData.recipient_email = client.email
        messageData.platform = 'email'
      }

      // Validar que tenga destino
      if (!messageData.recipient_phone && !messageData.recipient_instagram_id && !messageData.recipient_email) {
        console.warn(`⚠️ Client ${client.id} has no contact info for platform ${botPlatform}`)
        continue
      }

      messagesToInsert.push(messageData)
    }

    // Insertar en lotes para optimizar rendimiento (Bulk Insert)
    const BATCH_SIZE = 100
    for (let i = 0; i < messagesToInsert.length; i += BATCH_SIZE) {
      const batch = messagesToInsert.slice(i, i + BATCH_SIZE)
      const { error: insertError } = await supabase
        .from('scheduled_messages')
        .insert(batch)

      if (insertError) {
        console.error(`❌ Error scheduling batch of messages (start index ${i}):`, insertError)
      } else {
        messagesQueued += batch.length
      }
    }

    // Actualizar ejecución si existe
    if (execution) {
      await supabase
        .from('automation_executions')
        .update({
          status: 'completed',
          messages_queued: messagesQueued,
          completed_at: new Date().toISOString()
        })
        .eq('id', execution.id)
    }

    console.log(`✅ Inactive client automation processed: ${automation.name} - ${messagesQueued} messages queued`)
    
    return messagesQueued

  } catch (error) {
    console.error(`💥 Error processing inactive client automation ${automation.id}:`, error)
    return 0
  }
}

// Procesar difusión de promociones
async function processPromotionBroadcasts(supabase: any) {
  console.log('🎉 Processing promotion broadcasts...')
  
  try {
    const today = new Date()
    const todayStr = today.toISOString().split('T')[0] // YYYY-MM-DD
    
    // Verificar si ya se procesaron promociones hoy
    const { data: existingExecution } = await supabase
      .from('automation_executions')
      .select('id')
      .eq('automation_type', 'promotion_broadcast')
      .eq('execution_date', todayStr)
      .limit(1)

    if (existingExecution && existingExecution.length > 0) {
      console.log('ℹ️ Promotion broadcasts already processed today')
      return NextResponse.json({
        success: true,
        processed: 0,
        message: 'Already processed today',
        date: todayStr
      })
    }

    // Buscar promociones nuevas que necesiten difusión programada
    // Esto es para promociones con configuración de delay, no inmediatas
    const { data: promotionsToProcess, error: promotionsError } = await supabase
      .from('promotions')
      .select(`
        *,
        automations!inner(*)
      `)
      .eq('is_active', true)
      .eq('automations.trigger_type', 'new_promotion')
      .eq('automations.is_active', true)
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()) // Últimas 24 horas
      
    if (promotionsError) {
      console.error('❌ Error fetching promotions for processing:', promotionsError)
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    }

    let processedCount = 0

    if (promotionsToProcess && promotionsToProcess.length > 0) {
      console.log(`📢 Found ${promotionsToProcess.length} promotions to potentially broadcast`)
      
      // Este endpoint se usa principalmente para verificar mensajes pendientes
      // La lógica principal está en el webhook que se dispara inmediatamente
      processedCount = promotionsToProcess.length
    }

    // Registrar la ejecución
    await supabase
      .from('automation_executions')
      .insert({
        automation_type: 'promotion_broadcast',
        execution_date: todayStr,
        processed_count: processedCount,
        executed_at: new Date().toISOString()
      })

    return NextResponse.json({
      success: true,
      processed: processedCount,
      message: `Processed ${processedCount} promotion broadcasts`,
      date: todayStr
    })

  } catch (error) {
    console.error('💥 Promotion broadcast processing error:', error)
    return NextResponse.json(
      { error: 'Processing error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

// Arma el contexto real del negocio (info, productos, promos activas) para que la IA del
// seguimiento sepa lo mismo que cuando atiende y no invente promos/precios.
async function buildBusinessContext(supabase: any, userId: string): Promise<string> {
  const parts: string[] = []
  try {
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('business_name, business_description, business_hours, location, menu_link')
      .eq('id', userId)
      .maybeSingle()

    if (profile) {
      const info: string[] = []
      if (profile.business_name) info.push(`Negocio: ${profile.business_name}`)
      if (profile.business_description) info.push(`Descripción: ${profile.business_description}`)
      if (profile.location) info.push(`Ubicación: ${profile.location}`)
      if (profile.menu_link) info.push(`Carta/catálogo: ${profile.menu_link}`)
      // Horarios (resumen compacto)
      const bh = profile.business_hours
      if (bh && typeof bh === 'object') {
        const dias: Record<string, string> = {
          monday: 'Lun', tuesday: 'Mar', wednesday: 'Mié', thursday: 'Jue',
          friday: 'Vie', saturday: 'Sáb', sunday: 'Dom',
        }
        const abiertos = Object.entries(bh)
          .filter(([, v]: any) => v?.isOpen)
          .map(([k, v]: any) => `${dias[k] || k} ${v.open}-${v.close}`)
        if (abiertos.length) info.push(`Horarios: ${abiertos.join(', ')}`)
      }
      if (info.length) parts.push('═══ NEGOCIO ═══\n' + info.join('\n'))
    }

    const { data: products } = await supabase
      .from('products')
      .select('name, price, description')
      .eq('user_id', userId)
      .limit(40)
    if (products && products.length > 0) {
      const list = products
        .map((p: any) => `- ${p.name}: $${p.price}${p.description ? ` (${p.description})` : ''}`)
        .join('\n')
      parts.push('═══ PRODUCTOS ═══\n' + list)
    }

    const { data: promos } = await supabase
      .from('promotions')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
    const active = (promos || []).filter((p: any) => isPromotionActive(p))
    if (active.length > 0) {
      const list = active.map((p: any) => `- ${p.name}: ${promotionLabel(p)}`).join('\n')
      parts.push('═══ PROMOCIONES ACTIVAS ═══\n' + list)
    } else {
      parts.push('═══ PROMOCIONES ACTIVAS ═══\nNo hay promociones activas. NO inventes ni ofrezcas promos/descuentos que no existan.')
    }
  } catch (e) {
    console.error('Error building business context for follow-up:', e)
  }
  return parts.join('\n\n')
}

// Genera un mensaje de seguimiento CONTEXTUAL con IA, basado en lo que se habló en esa charla
// y en el contexto real del negocio (productos, promos, info). Null si no se pudo.
async function generateFollowUpMessage(
  supabase: any,
  bot: any,
  conversationId: string,
  guide: string,
  businessContext: string
) {
  try {
    const apiKey = bot.gemini_api_key || process.env.GEMINI_DEMO_API_KEY
    if (!apiKey) return null

    const { data: msgs } = await supabase
      .from('messages')
      .select('sender_type, content')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(8)
    if (!msgs || msgs.length === 0) return null

    const history = msgs
      .reverse()
      .map((m: any) => `${m.sender_type === 'client' ? 'Cliente' : 'Bot'}: ${m.content}`)
      .join('\n')

    const prompt = `Sos ${bot.name}, del negocio. Un cliente habló hace casi un día y no avanzó/cerró.
Escribí UN solo mensaje de seguimiento, corto (1-2 oraciones), cálido y natural, RETOMANDO lo puntual que se habló para reengancharlo. No vuelvas a saludar formalmente, no suenes a robot.
REGLA: usá SOLO datos reales del negocio (de abajo). NUNCA inventes productos, precios ni promociones. Si la indicación pide ofrecer una promo y NO hay promos activas, no inventes una: invitá a continuar sin prometer descuentos.
${guide ? `Indicación del negocio para este seguimiento: ${guide}\n` : ''}${bot.personality_prompt ? `Tu personalidad: ${bot.personality_prompt}\n` : ''}
${businessContext ? businessContext + '\n' : ''}
Conversación reciente:
${history}

Respondé SOLO con el texto del mensaje (sin comillas ni prefijos).`

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.7 } }),
      }
    )
    if (!res.ok) return null
    const data = await res.json()
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
    return text || null
  } catch {
    return null
  }
}

// Procesar RECORDATORIOS de reserva/turno (con plantilla de Meta, X horas antes).
async function processReservationReminders(supabase: any) {
  console.log('⏰ Processing reservation reminders...')
  try {
    const { data: automations } = await supabase
      .from('automations')
      .select(`*, bots!inner(*)`)
      .eq('trigger_type', 'reservation_reminder')
      .eq('is_active', true)
      .eq('bots.is_active', true)

    if (!automations || automations.length === 0) {
      return NextResponse.json({ message: 'No active reservation reminders', processed: 0 })
    }

    const now = new Date()
    const todayStr = now.toISOString().slice(0, 10)
    let totalQueued = 0

    for (const automation of automations) {
      const bot = automation.bots
      const tv = automation.template_variables || {}
      const templateName = tv.meta_template_name
      if (!bot || !templateName) continue // el recordatorio requiere una plantilla de Meta aprobada

      let templateLanguage = tv.meta_template_language || tv.template_language || 'es'
      if (templateLanguage && typeof templateLanguage === 'object') templateLanguage = templateLanguage.code || 'es'

      const hoursBefore = Number(automation.trigger_config?.hours_before) || 24

      // Cuántas variables de cuerpo tiene la plantilla (para llenar las justas)
      let bodyCount = 0
      try {
        bodyCount = getTemplateSlots(tv.template_data?.components || []).filter((s: any) => s.group === 'body').length
      } catch {
        bodyCount = 0
      }

      // Reservas futuras, no avisadas, no canceladas
      const { data: rows } = await supabase
        .from('reservations')
        .select('id, customer_name, customer_phone, reservation_date, reservation_time, staff_name, service_name')
        .eq('user_id', automation.user_id)
        .is('reminder_sent_at', null)
        .neq('status', 'cancelled')
        .gte('reservation_date', todayStr)
      if (!rows || rows.length === 0) continue

      const windowMs = hoursBefore * 3600 * 1000
      const due = rows.filter((r: any) => {
        if (!r.reservation_date || !r.reservation_time || !r.customer_phone) return false
        const dt = new Date(`${r.reservation_date}T${r.reservation_time}:00`).getTime()
        const diff = dt - now.getTime()
        return diff > 0 && diff <= windowMs // entra en las próximas X horas
      })
      if (due.length === 0) continue

      const messages = due.map((r: any) => {
        // Variables en orden fijo: {{1}} nombre, {{2}} fecha, {{3}} hora, {{4}} profesional/servicio
        const allParams = [
          r.customer_name || 'Cliente',
          r.reservation_date,
          r.reservation_time,
          r.staff_name || r.service_name || '',
        ]
        const params = allParams.slice(0, bodyCount)
        const components = bodyCount > 0 ? [{ type: 'body', parameters: params.map((t) => ({ type: 'text', text: String(t) })) }] : []
        return {
          user_id: automation.user_id,
          automation_id: automation.id,
          bot_id: bot.id,
          message_content: `Recordatorio de turno: ${r.reservation_date} ${r.reservation_time}`,
          recipient_name: r.customer_name,
          recipient_phone: r.customer_phone,
          platform: 'whatsapp',
          scheduled_for: now.toISOString(),
          automation_type: 'reservation_reminder',
          priority: 2,
          metadata: {
            is_meta_template: true,
            template_name: templateName,
            template_language: templateLanguage,
            whatsapp_components: components,
          },
        }
      })

      const { error } = await supabase.from('scheduled_messages').insert(messages)
      if (error) {
        console.error('❌ Error queueing reservation reminders:', error)
        continue
      }
      await supabase.from('reservations').update({ reminder_sent_at: now.toISOString() }).in('id', due.map((r: any) => r.id))
      totalQueued += messages.length
      console.log(`✅ Recordatorios "${automation.name}": ${messages.length} encolados`)
    }

    return NextResponse.json({ success: true, processed: totalQueued, message: 'Reservation reminders processed' })
  } catch (error) {
    console.error('💥 Reservation reminder error:', error)
    return NextResponse.json({ error: 'Failed to process reservation reminders' }, { status: 500 })
  }
}

// Procesar automatizaciones de SEGUIMIENTO (follow_up)
// Manda un mensaje a conversaciones que hablaron y no cerraron, antes de que venza la ventana de 24 hs.
async function processFollowUpAutomations(supabase: any) {
  console.log('📌 Processing follow-up automations...')
  try {
    const { data: automations } = await supabase
      .from('automations')
      .select(`*, bots!inner(*)`)
      .eq('trigger_type', 'follow_up')
      .eq('is_active', true)
      .eq('bots.is_active', true)

    if (!automations || automations.length === 0) {
      return NextResponse.json({ message: 'No active follow-up automations', processed: 0 })
    }

    let totalQueued = 0

    for (const automation of automations) {
      const bot = automation.bots
      const messageTemplate = automation.message_template
      if (!bot || !messageTemplate) continue

      // Modo del mensaje: 'plain' = texto fijo tal cual / 'ai' = la IA redacta uno contextual.
      const messageMode = automation.trigger_config?.message_mode === 'plain' ? 'plain' : 'ai'

      // Contexto del negocio (productos/promos/info) una sola vez por automatización (solo si usa IA).
      const businessContext = messageMode === 'ai' ? await buildBusinessContext(supabase, automation.user_id) : ''

      // Ventana: mandamos cuando faltan `hours_before_close` horas para las 24 hs.
      const hoursBeforeClose = Number(automation.trigger_config?.hours_before_close) || 2
      const now = Date.now()
      const lower = new Date(now - 24 * 3600 * 1000).toISOString() // no después de cerrada
      const upper = new Date(now - (24 - hoursBeforeClose) * 3600 * 1000).toISOString()

      // Conversaciones candidatas: dentro de la franja, sin seguimiento previo,
      // sin intervención humana (no pausadas / ayuda / revisión).
      const { data: convs } = await supabase
        .from('conversations')
        .select('id, client_name, client_phone, client_instagram_id, platform, user_id')
        .eq('bot_id', bot.id)
        .gte('last_client_message_at', lower)
        .lte('last_client_message_at', upper)
        .is('follow_up_sent_at', null)
        .eq('needs_attention', false)
        .eq('in_review', false)
        .neq('status', 'paused')
        .limit(500)

      if (!convs || convs.length === 0) continue

      // Excluir solo las que cerraron RECIÉN (pedido o reserva en las últimas 24 hs,
      // es decir, de esta interacción). Compras viejas NO cuentan como cierre actual.
      const ids = convs.map((c: any) => c.id)
      const [{ data: orders }, { data: reservations }] = await Promise.all([
        supabase.from('orders').select('conversation_id').in('conversation_id', ids).gte('created_at', lower),
        supabase.from('reservations').select('conversation_id').in('conversation_id', ids).gte('created_at', lower),
      ])
      const converted = new Set<string>([
        ...(orders || []).map((o: any) => o.conversation_id),
        ...(reservations || []).map((r: any) => r.conversation_id),
      ])

      const eligible = convs.filter((c: any) => {
        if (converted.has(c.id)) return false
        // Solo canales que el pipeline de envío soporta hoy
        if (c.platform === 'whatsapp') return !!c.client_phone
        if (c.platform === 'instagram') return !!c.client_instagram_id
        return false // messenger: pendiente de soporte en process-queue
      })

      if (eligible.length === 0) continue

      const messagesToInsert: any[] = []
      for (const c of eligible) {
        const firstName = (c.client_name || 'Cliente').split(' ')[0]
        const plain = messageTemplate.replace(/\{name\}/g, c.client_name || 'Cliente').replace(/\{first_name\}/g, firstName)

        // Según el modo: texto fijo, o la IA redacta uno contextual (con fallback al texto).
        let content = plain
        let usedAi = false
        if (messageMode === 'ai') {
          const aiText = await generateFollowUpMessage(supabase, bot, c.id, messageTemplate, businessContext)
          if (aiText) {
            content = aiText
            usedAi = true
          }
        }

        const base: any = {
          user_id: c.user_id,
          automation_id: automation.id,
          bot_id: bot.id,
          message_content: content,
          recipient_name: c.client_name,
          scheduled_for: new Date().toISOString(),
          automation_type: 'follow_up',
          priority: 2,
          platform: c.platform,
          metadata: { ai_generated: usedAi },
        }
        if (c.platform === 'whatsapp') base.recipient_phone = c.client_phone
        else if (c.platform === 'instagram') base.recipient_instagram_id = c.client_instagram_id
        messagesToInsert.push(base)
      }

      const { error: insertError } = await supabase.from('scheduled_messages').insert(messagesToInsert)
      if (insertError) {
        console.error('❌ Error queueing follow-up messages:', insertError)
        continue
      }

      // Marcar como ya seguidas para no repetir
      await supabase
        .from('conversations')
        .update({ follow_up_sent_at: new Date().toISOString() })
        .in('id', eligible.map((c: any) => c.id))

      totalQueued += messagesToInsert.length
      console.log(`✅ Follow-up "${automation.name}": ${messagesToInsert.length} mensajes encolados`)
    }

    return NextResponse.json({ success: true, processed: totalQueued, message: 'Follow-up automations processed' })
  } catch (error) {
    console.error('💥 Follow-up automation error:', error)
    return NextResponse.json({ error: 'Failed to process follow-up automations' }, { status: 500 })
  }
}

// Endpoint GET para verificar el estado del sistema
export async function GET() {
  try {
    const supabase = createAdminClient()
    
    const today = new Date().toISOString().split('T')[0]
    
    // Obtener estadísticas de ejecuciones de hoy
    const { data: todayExecutions } = await supabase
      .from('automation_executions')
      .select('*')
      .eq('execution_date', today)
    
    // Obtener mensajes pendientes
    const { data: pendingMessages } = await supabase
      .from('scheduled_messages')
      .select('status')
      .eq('status', 'pending')
    
    return NextResponse.json({
      date: today,
      executions_today: todayExecutions?.length || 0,
      pending_messages: pendingMessages?.length || 0,
      last_check: new Date().toISOString()
    })
    
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}