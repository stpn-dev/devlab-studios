import type { APIRoute } from 'astro'
import { requirePickleballSession } from '../../../../worker/pickleball/authContext.js'
import { getEnv } from '../../../../lib/env'
import { getUserByGoogleSub } from '../../../../worker/repositories/pickleball/users.js'
import { listActiveMembershipsForEmail } from '../../../../worker/repositories/pickleball/memberships.js'

export const GET: APIRoute = async ({ request }) => {
  const env = getEnv()
  try {
    const session = await requirePickleballSession(request, env)
    const user = await getUserByGoogleSub(env.PICKLEBALL_DB, session.googleSub)
    if (!user) {
      return new Response(JSON.stringify({ error: 'User not found.' }), { status: 404 })
    }
    const memberships = await listActiveMembershipsForEmail(env.PICKLEBALL_DB, user.email)
    return new Response(
      JSON.stringify({
        userId: session.userId,
        activeOrgId: session.activeOrgId,
        role: session.role,
        email: user.email,
        name: user.name,
        organizations: memberships.map((m: { organizationId: string; role: string }) => ({
          organizationId: m.organizationId,
          role: m.role,
        })),
      }),
      { status: 200 },
    )
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: error.status || 500 })
  }
}
