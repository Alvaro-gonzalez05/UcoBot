import { updateSession } from "@/lib/supabase/middleware"
import type { NextRequest } from "next/server"

export async function middleware(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - images - .svg, .png, .jpg, .jpeg, .gif, .webp
     * - videos - .mp4, .webm
     * - api/whatsapp/* (WhatsApp endpoints)
     * - api/instagram/* (Instagram endpoints) 
     * - api/debug/* (debug endpoints)
     * - api/chat/webhook (webhook chat API)
     * - api/automations/* (automation endpoints for cron jobs)
     */
    "/((?!_next/static|_next/image|favicon.ico|sw\\.js|manifest\\.json|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mp4|webm|html|js|json)$|api/whatsapp|api/instagram|api/debug|api/chat/webhook|api/automations|api/push).*)",
  ],
}
