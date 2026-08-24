import type { APIRoute } from 'astro'
import { requirePickleballSession } from '../../../../worker/pickleball/authContext.js'
import { getUserByGoogleSub } from '../../../../worker/repositories/pickleball/users.js'
import { listActiveMembershipsForEmail, linkMembershipUser } from '../../../../worker/repositories/pickleball/memberships.js'
import { resolveActiveOrgId } from '../../../../worker/pickleball/authContext.js'
import { signSession, buildSetCookieHeader, SESSION_COOKIE_NAME } from '../../../../worker/pickleball/session.js'
import { getEnv } from '../../../../lib/env'
import { jsonResponse } from '../../../../worker/utils/responses.js'

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8

export const POST: APIRoute = async ({ request }) => {
  const env = getEnv()
  try {
    const session = await requirePickleballSession(request, env)
    const body = (await request.json().catch(() => ({}))) as { organizationId?: string }
    const requestedOrgId = String(body.organizationId || '')

    const user = await getUserByGoogleSub(env.PICKLEBALL_DB, session.googleSub)
    if (!user) {
      return jsonResponse({ error: 'User not found.' }, 404)
    }
    const memberships = (await listActiveMembershipsForEmail(env.PICKLEBALL_DB, user.email)) as {
      organizationId: string
    }[]
    const activeOrgId = resolveActiveOrgId(memberships, requestedOrgId)

    if (activeOrgId !== requestedOrgId) {
      return jsonResponse({ error: 'Not a member of that organization.' }, 403)
    }

    // Memberships are matched by invited_email here, but every authenticated
    // request afterwards resolves membership by (organizationId, userId) in
    // requirePickleballSession. An org this user was invited to *after* their
    // last login still has user_id = NULL, so switching into it without
    // linking first would issue a valid cookie the very next request then
    // rejects — locking the user out of the org they just chose. Same
    // linking step google/callback.ts and test-login.ts perform at sign-in.
    const targetMembership = memberships.find((membership) => membership.organizationId === activeOrgId)
    if (targetMembership) {
      await linkMembershipUser(env.PICKLEBALL_DB, {
        organizationId: targetMembership.organizationId,
        invitedEmail: user.email,
        userId: user.id,
      })
    }

    const now = Math.floor(Date.now() / 1000)
    const token = await signSession(
      { userId: session.userId, googleSub: session.googleSub, activeOrgId, iat: now, exp: now + SESSION_MAX_AGE_SECONDS },
      env.PICKLEBALL_SESSION_SECRET,
    )
    const secure = new URL(request.url).protocol === 'https:'

    return jsonResponse({ ok: true, activeOrgId }, 200, {
      'Set-Cookie': buildSetCookieHeader(SESSION_COOKIE_NAME, token, { secure, maxAgeSeconds: SESSION_MAX_AGE_SECONDS }),
    })
  } catch (error: any) {
    return jsonResponse({ error: error.message }, error.status || 500)
  }
}
