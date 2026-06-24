import { NextResponse } from "next/server"
import crypto from "crypto"
import { cookies } from "next/headers"
import { createClient } from "@/lib/supabase/server"
import { buildAuthorizationUrl } from "@/lib/mp-oauth"

/**
 * Inicia la conexión OAuth: guarda un `state` anti-CSRF en cookie y redirige
 * al cliente a la pantalla de autorización de Mercado Pago.
 */
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.redirect(new URL("/login", process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"))
  }

  const state = crypto.randomBytes(16).toString("hex")
  const cookieStore = await cookies()
  cookieStore.set("mp_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600, // 10 min
    path: "/",
  })

  return NextResponse.redirect(buildAuthorizationUrl(state))
}
