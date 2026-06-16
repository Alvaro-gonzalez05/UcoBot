import { NextRequest, NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { getWhatsAppToken, getGraphVersion } from "@/lib/meta/credentials"

// Descarga un sticker recibido desde la Graph API y lo guarda en Storage + saved_stickers
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 })
    }

    const { mediaId, botId } = await request.json()
    if (!mediaId || !botId) {
      return NextResponse.json({ error: "Faltan mediaId o botId" }, { status: 400 })
    }

    const admin = createAdminClient()

    // El bot debe pertenecer al usuario
    const { data: bot } = await admin.from("bots").select("user_id").eq("id", botId).single()
    if (!bot || bot.user_id !== user.id) {
      return NextResponse.json({ error: "Bot no encontrado" }, { status: 403 })
    }

    // Token de WhatsApp del usuario
    const { data: integration } = await admin
      .from("integrations")
      .select("config")
      .eq("user_id", user.id)
      .eq("platform", "whatsapp")
      .eq("is_active", true)
      .single()

    const accessToken = getWhatsAppToken(integration)
    if (!accessToken) {
      return NextResponse.json({ error: "Integración de WhatsApp no encontrada" }, { status: 404 })
    }

    // 1. URL del media
    const mediaUrlRes = await fetch(`https://graph.facebook.com/${getGraphVersion()}/${mediaId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!mediaUrlRes.ok) {
      return NextResponse.json({ error: "No se pudo obtener el sticker (puede haber expirado)" }, { status: 404 })
    }
    const mediaUrlData = await mediaUrlRes.json()
    const mediaUrl = mediaUrlData.url
    if (!mediaUrl) {
      return NextResponse.json({ error: "Sticker no disponible" }, { status: 404 })
    }

    // 2. Descargar bytes
    const mediaRes = await fetch(mediaUrl, { headers: { Authorization: `Bearer ${accessToken}` } })
    if (!mediaRes.ok) {
      return NextResponse.json({ error: "No se pudo descargar el sticker" }, { status: 502 })
    }
    const contentType = mediaRes.headers.get("content-type") || "image/webp"
    const buffer = Buffer.from(await mediaRes.arrayBuffer())

    // 3. Subir a Storage
    const timestamp = Date.now()
    const rand = Math.random().toString(36).substring(2)
    const path = `${user.id}/stickers/${timestamp}_${rand}.webp`

    const { error: uploadError } = await supabase.storage
      .from("chat-media")
      .upload(path, buffer, { contentType, cacheControl: "3600", upsert: false })

    if (uploadError) {
      console.error("Error subiendo sticker a Storage:", uploadError)
      return NextResponse.json({ error: "Error al guardar el sticker" }, { status: 500 })
    }

    const { data: { publicUrl } } = supabase.storage.from("chat-media").getPublicUrl(path)

    // 4. Indexar en saved_stickers
    const { data: saved, error: insertError } = await supabase
      .from("saved_stickers")
      .insert({ user_id: user.id, storage_path: path, public_url: publicUrl, mime_type: contentType })
      .select()
      .single()

    if (insertError) {
      console.error("Error guardando saved_sticker:", insertError)
      return NextResponse.json({ error: "Error al indexar el sticker" }, { status: 500 })
    }

    return NextResponse.json({ success: true, sticker: saved })
  } catch (error) {
    console.error("Error en stickers/save:", error)
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 })
  }
}
