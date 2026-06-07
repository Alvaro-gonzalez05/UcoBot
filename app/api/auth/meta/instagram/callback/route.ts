import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getGraphVersion } from '@/lib/meta/credentials'

/**
 * Instagram (Facebook Login) OAuth callback.
 *
 * Meta redirige acá después de que el cliente autoriza la app en el popup
 * de Facebook Login. Recibe `?code=...&state=...`.
 *
 * Pasos:
 *  1. Verifica que el usuario UcoBot esté logueado
 *  2. Intercambia el `code` por un short-lived user token
 *  3. Lo intercambia por un long-lived user token (60 días)
 *  4. Obtiene las Pages del usuario
 *  5. Encuentra la Page que tiene un Instagram Business Account asociado
 *  6. Guarda en `integrations`: instagram_business_account_id, page_id, page_access_token
 *  7. Redirige al dashboard
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const error = url.searchParams.get('error')
  const errorDescription = url.searchParams.get('error_description')

  const dashboardUrl = new URL('/dashboard/bots', url.origin)

  // Cliente canceló o Meta rechazó la autorización
  if (error) {
    dashboardUrl.searchParams.set('ig_error', errorDescription || error)
    return NextResponse.redirect(dashboardUrl)
  }

  if (!code) {
    dashboardUrl.searchParams.set('ig_error', 'missing_code')
    return NextResponse.redirect(dashboardUrl)
  }

  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      dashboardUrl.searchParams.set('ig_error', 'not_authenticated')
      return NextResponse.redirect(dashboardUrl)
    }

    const appId = process.env.META_APP_ID
    const appSecret = process.env.META_APP_SECRET
    const graphVersion = getGraphVersion()

    if (!appId || !appSecret) {
      dashboardUrl.searchParams.set('ig_error', 'server_misconfigured')
      return NextResponse.redirect(dashboardUrl)
    }

    const redirectUri = `${url.origin}/api/auth/meta/instagram/callback`

    // 1. Code → short-lived user token
    const tokenRes = await fetch(
      `https://graph.facebook.com/${graphVersion}/oauth/access_token?` +
      new URLSearchParams({
        client_id: appId,
        client_secret: appSecret,
        code,
        redirect_uri: redirectUri,
      }).toString()
    )

    if (!tokenRes.ok) {
      const err = await tokenRes.json().catch(() => ({}))
      console.error('Failed to exchange code:', err)
      dashboardUrl.searchParams.set('ig_error', 'token_exchange_failed')
      return NextResponse.redirect(dashboardUrl)
    }

    const { access_token: shortToken } = await tokenRes.json()

    // 2. Short-lived → long-lived (60 días)
    const longTokenRes = await fetch(
      `https://graph.facebook.com/${graphVersion}/oauth/access_token?` +
      new URLSearchParams({
        grant_type: 'fb_exchange_token',
        client_id: appId,
        client_secret: appSecret,
        fb_exchange_token: shortToken,
      }).toString()
    )

    if (!longTokenRes.ok) {
      const err = await longTokenRes.json().catch(() => ({}))
      console.error('Failed to exchange for long-lived token:', err)
      dashboardUrl.searchParams.set('ig_error', 'long_token_failed')
      return NextResponse.redirect(dashboardUrl)
    }

    const { access_token: longToken } = await longTokenRes.json()

    // 3. Listar las pages del usuario (incluye page access token por cada una)
    const pagesRes = await fetch(
      `https://graph.facebook.com/${graphVersion}/me/accounts?fields=id,name,access_token,instagram_business_account&access_token=${longToken}`
    )

    if (!pagesRes.ok) {
      const err = await pagesRes.json().catch(() => ({}))
      console.error('Failed to fetch pages:', err)
      dashboardUrl.searchParams.set('ig_error', 'pages_fetch_failed')
      return NextResponse.redirect(dashboardUrl)
    }

    const pagesData = await pagesRes.json()
    const pageWithIG = pagesData.data?.find((p: any) => p.instagram_business_account?.id)

    if (!pageWithIG) {
      dashboardUrl.searchParams.set('ig_error', 'no_instagram_business_account')
      return NextResponse.redirect(dashboardUrl)
    }

    const igBusinessAccountId = pageWithIG.instagram_business_account.id
    const pageId = pageWithIG.id
    const pageName = pageWithIG.name
    const pageAccessToken = pageWithIG.access_token // este ya es long-lived al heredar del user token long-lived

    // 4. Suscribir la app a los webhooks de la página (para recibir DMs)
    const subscribeRes = await fetch(
      `https://graph.facebook.com/${graphVersion}/${pageId}/subscribed_apps?subscribed_fields=messages,messaging_postbacks,messaging_seen`,
      { method: 'POST', headers: { Authorization: `Bearer ${pageAccessToken}` } }
    )

    if (!subscribeRes.ok) {
      const err = await subscribeRes.json().catch(() => ({}))
      console.error('Failed to subscribe page to webhooks:', err)
      // No es fatal — guardamos igual, el cliente puede reintentar.
    }

    const admin = createAdminClient()

    const config = {
      instagram_business_account_id: igBusinessAccountId,
      page_id: pageId,
      page_name: pageName,
      access_token: pageAccessToken,
      connection_method: 'facebook_login',
      connected_at: new Date().toISOString(),
      // long-lived page tokens NO expiran mientras el user token sea válido;
      // el user long-lived dura 60 días y se renueva al iniciar sesión otra vez.
      token_expires_estimate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
    }

    const { error: upsertError } = await admin
      .from('integrations')
      .upsert(
        {
          user_id: user.id,
          platform: 'instagram',
          config,
          is_active: true,
          is_verified: true,
          webhook_verified_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,platform' }
      )

    if (upsertError) {
      console.error('Error upserting integration:', upsertError)
      dashboardUrl.searchParams.set('ig_error', 'save_failed')
      return NextResponse.redirect(dashboardUrl)
    }

    dashboardUrl.searchParams.set('ig_connected', '1')
    return NextResponse.redirect(dashboardUrl)
  } catch (err) {
    console.error('Error in Instagram OAuth callback:', err)
    dashboardUrl.searchParams.set('ig_error', 'internal_error')
    return NextResponse.redirect(dashboardUrl)
  }
}
