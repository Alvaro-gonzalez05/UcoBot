import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import webpush from "web-push"

// Configure VAPID keys
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY!
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:soporte@ucobot.com"

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
}

interface SendPushParams {
  userId: string
  title: string
  body: string
  url?: string
  icon?: string
  tag?: string
  requireInteraction?: boolean
}

export async function sendPushToUser({
  userId,
  title,
  body,
  url = "/dashboard",
  icon = "/favicon.png",
  tag = "ucobot-notification",
  requireInteraction = false,
}: SendPushParams) {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.warn("VAPID keys not configured. Skipping push notification.")
    return { sent: 0, failed: 0 }
  }

  const supabase = createAdminClient()

  const { data: subscriptions, error } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId)

  if (error || !subscriptions || subscriptions.length === 0) {
    return { sent: 0, failed: 0 }
  }

  const payload = JSON.stringify({ title, body, url, icon, tag, requireInteraction })

  let sent = 0
  let failed = 0
  const expiredIds: string[] = []

  for (const sub of subscriptions) {
    const pushSubscription = {
      endpoint: sub.endpoint,
      keys: {
        p256dh: sub.p256dh,
        auth: sub.auth,
      },
    }

    try {
      await webpush.sendNotification(pushSubscription, payload)
      sent++
    } catch (err: any) {
      failed++
      // 410 Gone or 404 means the subscription is no longer valid
      if (err.statusCode === 410 || err.statusCode === 404) {
        expiredIds.push(sub.id)
      } else {
        console.error(`Push to ${sub.endpoint.slice(0, 50)}... failed:`, err.statusCode || err.message)
      }
    }
  }

  // Cleanup expired subscriptions
  if (expiredIds.length > 0) {
    await supabase
      .from("push_subscriptions")
      .delete()
      .in("id", expiredIds)
  }

  return { sent, failed }
}

// POST endpoint for sending push notifications (internal use / webhooks)
export async function POST(request: Request) {
  try {
    // Verify internal auth (simple shared secret)
    const authHeader = request.headers.get("authorization")
    const internalSecret = process.env.INTERNAL_API_SECRET

    if (internalSecret && authHeader !== `Bearer ${internalSecret}`) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    }

    const { userId, title, body, url, tag } = await request.json()

    if (!userId || !title || !body) {
      return NextResponse.json({ error: "Faltan userId, title o body" }, { status: 400 })
    }

    const result = await sendPushToUser({ userId, title, body, url, tag })
    return NextResponse.json(result)
  } catch (error) {
    console.error("Push send error:", error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
