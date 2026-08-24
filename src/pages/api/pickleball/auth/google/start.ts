import type { APIRoute } from 'astro'
import { generatePkcePair, buildGoogleAuthorizationUrl } from '../../../../../worker/pickleball/oauth.js'
import { randomBase64Url } from '../../../../../lib/pickleball/webCrypto.js'
import { buildSetCookieHeader } from '../../../../../worker/pickleball/session.js'
import { getEnv } from '../../../../../lib/env'
import { jsonResponse } from '../../../../../worker/utils/responses.js'

const OAUTH_COOKIE_NAME = 'devlab_pb_oauth'

// wrangler.jsonc ships GOOGLE_OAUTH_CLIENT_ID as this literal placeholder
// until real Google credentials are provisioned. It is truthy, so a bare
// falsy check would let it through and bounce real users to Google with a
// garbage client_id instead of returning a clean 503.
const CLIENT_ID_PLACEHOLDER = 'REPLACE_ME'

export const GET: APIRoute = async ({ request }) => {
  const env = getEnv()
  const clientId = env.GOOGLE_OAUTH_CLIENT_ID
  const redirectBase = env.PICKLEBALL_OAUTH_REDIRECT_BASE_URL
  if (!clientId || clientId === CLIENT_ID_PLACEHOLDER || !redirectBase) {
    return jsonResponse({ error: 'Google OAuth is not configured.' }, 503)
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
