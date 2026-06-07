import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { getWhatsAppToken, getGraphVersion } from "@/lib/meta/credentials"

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const mediaId = searchParams.get('mediaId')
  const botId = searchParams.get('botId')

  if (!mediaId || !botId) {
    return new NextResponse("Missing mediaId or botId", { status: 400 })
  }

  try {
    const supabase = createAdminClient()

    // Get bot to find the user_id
    const { data: bot, error: botError } = await supabase
      .from("bots")
      .select("user_id")
      .eq("id", botId)
      .single()

    if (botError || !bot) {
      return new NextResponse("Bot not found", { status: 404 })
    }

    // Get WhatsApp integration token
    const { data: integration, error: integrationError } = await supabase
      .from('integrations')
      .select('config')
      .eq('user_id', bot.user_id)
      .eq('platform', 'whatsapp')
      .eq('is_active', true)
      .single()

    const accessToken = getWhatsAppToken(integration)
    if (integrationError || !accessToken) {
      return new NextResponse("Integration not found or invalid", { status: 404 })
    }

    // 1. Get Media URL from WhatsApp API
    const mediaUrlRes = await fetch(`https://graph.facebook.com/${getGraphVersion()}/${mediaId}`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    })

    if (!mediaUrlRes.ok) {
      return new NextResponse("Failed to get media URL", { status: mediaUrlRes.status })
    }

    const mediaUrlData = await mediaUrlRes.json()
    const mediaUrl = mediaUrlData.url

    if (!mediaUrl) {
      return new NextResponse("Media URL not found", { status: 404 })
    }

    // 2. Download Media
    const mediaRes = await fetch(mediaUrl, {
      headers: { Authorization: `Bearer ${accessToken}` }
    })

    if (!mediaRes.ok) {
      return new NextResponse("Failed to download media", { status: mediaRes.status })
    }

    const contentType = mediaRes.headers.get('content-type') || 'application/octet-stream'
    const arrayBuffer = await mediaRes.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600'
      }
    })

  } catch (error) {
    console.error("Error proxying media:", error)
    return new NextResponse("Internal Server Error", { status: 500 })
  }
}
