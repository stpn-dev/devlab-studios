import type { APIRoute } from 'astro'
import { upsertUserByGoogleSub } from '../../../../worker/repositories/pickleball/users.js'
import { listActiveMembershipsForEmail, linkMembershipUser } from '../../../../worker/repositories/pickleball/memberships.js'
import { resolveActiveOrgId } from '../../../../worker/pickleball/authContext.js'
import { signSession, buildSetCookieHeader, SESSION_COOKIE_NAME } from '../../../../worker/pickleball/session.js'
import { getEnv } from '../../../../lib/env'

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8

// Test-only bypass for the Google OAuth redirect/exchange, so Playwright
// can reach an authenticated state without a live Google account. Only
// responds when PICKLEBALL_TEST_AUTH_ENABLED=true, which must never be set
// in wrangler.jsonc's committed vars (local .dev.vars / CI env only).
export const POST: APIRoute = async ({ request }) => {
  const env = getEnv()
  if (env.PICKLEBALL_TEST_AUTH_ENABLED !== 'true') {
    return new Response(JSON.stringify({ error: 'Not found.' }), { status: 404 })
  }

  const body = (await request.json().catch(() => ({}))) as { email?: string }
  const email = String(body.email || '').trim().toLowerCase()
  if (!email) {
    return new Response(JSON.stringify({ error: 'email is required.' }), { status: 400 })
  }

  const memberships = await listActiveMembershipsForEmail(env.PICKLEBALL_DB, email)
  if (!memberships.length) {
    return new Response(JSON.stringify({ error: 'No active membership for that email.' }), { status: 403 })
  }

  const user = await upsertUserByGoogleSub(env.PICKLEBALL_DB, {
    googleSub: `test-${email}`,
    email,
    name: email,
    avatarUrl: '',
  })

  if (!user) {
    return new Response(JSON.stringify({ error: 'Failed to create or update user.' }), { status: 500 })
  }

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

  return new Response(JSON.stringify({ ok: true, activeOrgId }), {
    status: 200,
    headers: { 'Set-Cookie': buildSetCookieHeader(SESSION_COOKIE_NAME, token, { secure, maxAgeSeconds: SESSION_MAX_AGE_SECONDS }) },
  })
}
