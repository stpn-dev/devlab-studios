import type { APIRoute } from 'astro'
import { requirePickleballSession } from '../../../../worker/pickleball/authContext.js'
import { getUserByGoogleSub } from '../../../../worker/repositories/pickleball/users.js'
import { listActiveMembershipsForEmail } from '../../../../worker/repositories/pickleball/memberships.js'
import { resolveActiveOrgId } from '../../../../worker/pickleball/authContext.js'
import { signSession, buildSetCookieHeader, SESSION_COOKIE_NAME } from '../../../../worker/pickleball/session.js'
import { getEnv } from '../../../../lib/env'

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8

export const POST: APIRoute = async ({ request }) => {
  const env = getEnv()
  try {
    const session = await requirePickleballSession(request, env)
    const body = (await request.json().catch(() => ({}))) as { organizationId?: string }
    const requestedOrgId = String(body.organizationId || '')

    const user = await getUserByGoogleSub(env.PICKLEBALL_DB, session.googleSub)
    if (!user) {
      return new Response(JSON.stringify({ error: 'User not found.' }), { status: 404 })
    }
    const memberships = await listActiveMembershipsForEmail(env.PICKLEBALL_DB, user.email)
    const activeOrgId = resolveActiveOrgId(memberships, requestedOrgId)

    if (activeOrgId !== requestedOrgId) {
      return new Response(JSON.stringify({ error: 'Not a member of that organization.' }), { status: 403 })
    }

    const now = Math.floor(Date.now() / 1000)
    const token = await signSession(
      { userId: session.userId, googleSub: session.googleSub, activeOrgId, iat: now, exp: now + SESSION_MAX_AGE_SECONDS },
      env.PICKLEBALL_SESSION_SECRET,
    )
    const secure = new URL(request.url).protocol === 'https:'

    return new Response(JSON.stringify({ ok: true, activeOrgId }), {
      status: 200,
      headers: { 'Set-Cookie': buildSetCookieHeader(SESSION_COOKIE_NAME, token, { secure, maxAgeSeconds: SESSION_MAX_AGE_SECONDS }) },
    })
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: error.status || 500 })
  }
}
