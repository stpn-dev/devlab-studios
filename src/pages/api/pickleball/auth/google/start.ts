import type { APIRoute } from 'astro'
import { generatePkcePair, buildGoogleAuthorizationUrl } from '../../../../../worker/pickleball/oauth.js'
import { randomBase64Url } from '../../../../../lib/pickleball/webCrypto.js'
import { buildSetCookieHeader } from '../../../../../worker/pickleball/session.js'
import { getEnv } from '../../../../../lib/env'

const OAUTH_COOKIE_NAME = 'devlab_pb_oauth'

export const GET: APIRoute = async ({ request }) => {
  const env = getEnv()
  const clientId = env.GOOGLE_OAUTH_CLIENT_ID
  const redirectBase = env.PICKLEBALL_OAUTH_REDIRECT_BASE_URL
  if (!clientId || !redirectBase) {
    return new Response(JSON.stringify({ error: 'Google OAuth is not configured.' }), { status: 503 })
  }

  const { verifier, challenge } = await generatePkcePair()
  const state = randomBase64Url(24)
  const redirectUri = `${redirectBase}/api/pickleball/auth/google/callback`

  const authorizationUrl = buildGoogleAuthorizationUrl({
    clientId,
    redirectUri,
    state,
    codeChallenge: challenge,
    scopes: ['openid', 'email', 'profile'],
  })

  const url = new URL(request.url)
  const secure = url.protocol === 'https:'
  const cookiePayload = encodeURIComponent(JSON.stringify({ verifier, state }))

  return new Response(null, {
    status: 302,
    headers: {
      Location: authorizationUrl,
      // Google's redirect back to the callback is a cross-site top-level
      // navigation, so this stash cookie needs SameSite=Lax (Strict cookies
      // are never sent on a cross-site-initiated navigation) — unlike the
      // session cookie, which stays Strict since it's only ever read on
      // same-site requests after login.
      'Set-Cookie': buildSetCookieHeader(OAUTH_COOKIE_NAME, cookiePayload, { secure, maxAgeSeconds: 600, sameSite: 'Lax' }),
    },
  })
}

export { OAUTH_COOKIE_NAME }
