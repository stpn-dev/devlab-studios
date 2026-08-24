import type { APIRoute } from 'astro'
import { exchangeGoogleCode, fetchGoogleProfile } from '../../../../../worker/pickleball/oauth.js'
import { upsertUserByGoogleSub } from '../../../../../worker/repositories/pickleball/users.js'
import { listActiveMembershipsForEmail, linkMembershipUser } from '../../../../../worker/repositories/pickleball/memberships.js'
import { resolveActiveOrgId } from '../../../../../worker/pickleball/authContext.js'
import { signSession, buildSetCookieHeader, buildClearCookieHeader } from '../../../../../worker/pickleball/session.js'
import { SESSION_COOKIE_NAME } from '../../../../../worker/pickleball/session.js'
import { getEnv } from '../../../../../lib/env'
import { parseCookies } from '../../../../../worker/pickleball/session.js'

const OAUTH_COOKIE_NAME = 'devlab_pb_oauth'
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8

export const GET: APIRoute = async ({ request }) => {
  const env = getEnv()
  const url = new URL(request.url)
  const secure = url.protocol === 'https:'
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')

  const cookies = parseCookies(request.headers.get('Cookie')) as Record<string, string>
  const clearOauthCookie = buildClearCookieHeader(OAUTH_COOKIE_NAME, { secure })

  let stashed
  try {
    stashed = JSON.parse(decodeURIComponent(cookies['devlab_pb_oauth'] || ''))
  } catch {
    stashed = null
  }

  if (!code || !state || !stashed?.state || stashed.state !== state) {
    return new Response(JSON.stringify({ error: 'Invalid OAuth state.' }), { status: 400 })
  }

  // Fail fast on misconfiguration before spending a round-trip to Google —
  // without this check, signSession would silently HMAC the literal string
  // "undefined" as the secret, issue a cookie that looks like a successful
  // login, and only fail later (503) on the very next authenticated request.
  if (!env.PICKLEBALL_SESSION_SECRET) {
    return new Response(JSON.stringify({ error: 'Pickleball session secret is not configured.' }), {
      status: 503,
      headers: { 'Set-Cookie': clearOauthCookie },
    })
  }

  try {
    const redirectUri = `${env.PICKLEBALL_OAUTH_REDIRECT_BASE_URL}/api/pickleball/auth/google/callback`
    const { accessToken } = await exchangeGoogleCode({
      code,
      codeVerifier: stashed.verifier,
      clientId: env.GOOGLE_OAUTH_CLIENT_ID,
      clientSecret: env.GOOGLE_OAUTH_CLIENT_SECRET,
      redirectUri,
    })

    const profile = await fetchGoogleProfile(accessToken)

    // Google only guarantees `email` is actually owned by the account when
    // email_verified is true. Since profile.email is used directly as the
    // authorization key below (which org memberships it can claim / link
    // to), an unverified email must never be allowed to log in or link.
    if (!profile.emailVerified) {
      return new Response(null, {
        status: 302,
        headers: { Location: '/pickleball/login?error=email_not_verified', 'Set-Cookie': clearOauthCookie },
      })
    }

    const user = await upsertUserByGoogleSub(env.PICKLEBALL_DB, {
      googleSub: profile.sub,
      email: profile.email,
      name: profile.name,
      avatarUrl: profile.picture,
    })

    if (!user) {
      return new Response(JSON.stringify({ error: 'Failed to create or update user.' }), {
        status: 500,
        headers: { 'Set-Cookie': clearOauthCookie },
      })
    }

    const memberships = await listActiveMembershipsForEmail(env.PICKLEBALL_DB, profile.email)

    if (!memberships.length) {
      return new Response(null, {
        status: 302,
        headers: { Location: '/pickleball/login?error=no_access', 'Set-Cookie': clearOauthCookie },
      })
    }

    // Link every active membership for this email to the real user id now
    // that we have one — requirePickleballSession's getMembership() lookup
    // is by (organizationId, userId), so without this every request after
    // login would find no membership and be rejected as unauthorized.
    await Promise.all(
      memberships.map((membership: { organizationId: string }) =>
        linkMembershipUser(env.PICKLEBALL_DB, {
          organizationId: membership.organizationId,
          invitedEmail: profile.email,
          userId: user.id,
        }),
      ),
    )

    const activeOrgId = resolveActiveOrgId(memberships, null)
    const now = Math.floor(Date.now() / 1000)
    const token = await signSession(
      { userId: user.id, googleSub: user.googleSub, activeOrgId, iat: now, exp: now + SESSION_MAX_AGE_SECONDS },
      env.PICKLEBALL_SESSION_SECRET,
    )

    return new Response(null, {
      status: 302,
      headers: {
        Location: '/pickleball/app',
        'Set-Cookie': buildSetCookieHeader(SESSION_COOKIE_NAME, token, { secure, maxAgeSeconds: SESSION_MAX_AGE_SECONDS }),
      },
    })
  } catch {
    // exchangeGoogleCode / fetchGoogleProfile throw tagged 502s on routine
    // conditions (expired/reused code, a transient Google 4xx, network
    // failure) — none of that should surface as a raw unhandled 500 to the
    // user, so send them back to login with a friendly error instead.
    return new Response(null, {
      status: 302,
      headers: { Location: '/pickleball/login?error=oauth_failed', 'Set-Cookie': clearOauthCookie },
    })
  }
}
