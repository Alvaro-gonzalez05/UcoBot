import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { exchangeCodeForToken, expiresAtFromNow } from "@/lib/mp-oauth"

/**
 * Callback de OAuth: MP vuelve con `code` + `state`. Validamos el state,
 * cambiamos el code por los tokens del vendedor y los guardamos.
 */
export async function GET(req: NextRequest) {
  const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
  const url = new URL(req.url)
  const code = url.searchParams.get("code")
  const state = url.searchParams.get("state")

  const fail = (msg: string) =>
    NextResponse.redirect(new URL(`/mp/conectado?mp=error&msg=${encodeURIComponent(msg)}`, base))

  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.redirect(new URL("/login", base))

    // Validar state (anti-CSRF)
    const cookieStore = await cookies()
    const savedState = cookieStore.get("mp_oauth_state")?.value
    cookieStore.delete("mp_oauth_state")
    if (!code || !state || !savedState || state !== savedState) {
      return fail("Validación de seguridad fallida. Intentá de nuevo.")
    }

    // Cambiar code por tokens
    const token = await exchangeCodeForToken(code)

    // Guardar la conexión (service role, sin exponer tokens al cliente)
    const admin = createAdminClient()
    await admin.from("mp_connections").upsert(
      {
        user_id: user.id,
        mp_user_id: String(token.user_id),
        access_token: token.access_token,
        refresh_token: token.refresh_token,
        public_key: token.public_key || null,
        expires_at: expiresAtFromNow(token.expires_in),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    )

    return NextResponse.redirect(new URL("/mp/conectado?mp=ok", base))
  } catch (e: any) {
    console.error("Error en OAuth callback MP:", e)
    return fail(e?.message || "No se pudo conectar Mercado Pago")
  }
}
