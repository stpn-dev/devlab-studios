import type { APIRoute } from 'astro'
import { upsertUserByGoogleSub } from '../../../../worker/repositories/pickleball/users.js'
import { listActiveMembershipsForEmail, linkMembershipUser } from '../../../../worker/repositories/pickleball/memberships.js'
import {
  resolveActiveOrgId,
  buildLoginRateLimitKey,
  isLoginRateLimited,
  recordFailedLogin,
  clearFailedLogins,
} from '../../../../worker/pickleball/authContext.js'
import { signSession, buildSetCookieHeader, SESSION_COOKIE_NAME } from '../../../../worker/pickleball/session.js'
import { getEnv } from '../../../../lib/env'
import { jsonResponse } from '../../../../worker/utils/responses.js'

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8

// Test-only bypass for the Google OAuth redirect/exchange, so Playwright
// can reach an authenticated state without a live Google account. Only
// responds when PICKLEBALL_TEST_AUTH_ENABLED=true, which must never be set
// in wrangler.jsonc's committed vars (local .dev.vars / CI env only).
export const POST: APIRoute = async ({ request }) => {
  const env = getEnv()
  if (env.PICKLEBALL_TEST_AUTH_ENABLED !== 'true') {
    return jsonResponse({ error: 'Not found.' }, 404)
  }

  const body = (await request.json().catch(() => ({}))) as { email?: string }
  const email = String(body.email || '').trim().toLowerCase()
  if (!email) {
    return jsonResponse({ error: 'email is required.' }, 400)
  }

  // This endpoint mints a full session for any email with an active
  // membership, and its 200-vs-403 split is an email-enumeration oracle even
  // when it refuses. Throttle it on the same ip:email bucket the real Google
  // callback uses, so neither path can be probed at scale should the gate env
  // var ever be left on somewhere it should not be.
  const loginKey = buildLoginRateLimitKey(request, email)
  if (isLoginRateLimited(loginKey)) {
    return jsonResponse({ error: 'Too many login attempts. Try again later.' }, 429)
  }

  const memberships = await listActiveMembershipsForEmail(env.PICKLEBALL_DB, email)
  if (!memberships.length) {
    recordFailedLogin(loginKey)
    return jsonResponse({ error: 'No active membership for that email.' }, 403)
  }

  const user = await upsertUserByGoogleSub(env.PICKLEBALL_DB, {
    googleSub: `test-${email}`,
    email,
    name: email,
    avatarUrl: '',
  })

  if (!user) {
    return jsonResponse({ error: 'Failed to create or update user.' }, 500)
  }

  clearFailedLogins(loginKey)

  // Same linking requirement as the real callback (see google/callback.ts) —
  // without it, getMembership(organizationId, userId) never matches and
  // every subsequent authenticated request in the test suite would 403.
  await Promise.all(
    memberships.map((membership: { organizationId: string }) =>
      linkMembershipUser(env.PICKLEBALL_DB, { organizationId: membership.organizationId, invitedEmail: email, userId: user.id }),
    ),
  )

  const activeOrgId = resolveActiveOrgId(memberships, null)
  const now = Math.floor(Date.now() / 1000)
  const token = await signSession(
    { userId: user.id, googleSub: user.googleSub, activeOrgId, iat: now, exp: now + SESSION_MAX_AGE_SECONDS },
    env.PICKLEBALL_SESSION_SECRET,
  )
  const secure = new URL(request.url).protocol === 'https:'

  return jsonResponse({ ok: true, activeOrgId }, 200, {
    'Set-Cookie': buildSetCookieHeader(SESSION_COOKIE_NAME, token, { secure, maxAgeSeconds: SESSION_MAX_AGE_SECONDS }),
  })
}
