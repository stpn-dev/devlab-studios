import type { APIRoute } from 'astro'
import { requirePickleballSession } from '../../../../worker/pickleball/authContext.js'
import { getEnv } from '../../../../lib/env'
import { getUserByGoogleSub } from '../../../../worker/repositories/pickleball/users.js'
import { listActiveMembershipsForEmail } from '../../../../worker/repositories/pickleball/memberships.js'
import { jsonResponse, apiErrorResponse } from '../../../../worker/utils/responses.js'

export const GET: APIRoute = async ({ request }) => {
  const env = getEnv()
  try {
    const session = await requirePickleballSession(request, env)
    const user = await getUserByGoogleSub(env.PICKLEBALL_DB, session.googleSub)
    if (!user) {
      return jsonResponse({ error: 'User not found.' }, 404)
    }
    const memberships = await listActiveMembershipsForEmail(env.PICKLEBALL_DB, user.email)
    return jsonResponse(
      {
        userId: session.userId,
        activeOrgId: session.activeOrgId,
        role: session.role,
        isPlatformAdmin: session.isPlatformAdmin,
        email: user.email,
        name: user.name,
        organizations: memberships.map((m: { organizationId: string; role: string }) => ({
          organizationId: m.organizationId,
          role: m.role,
        })),
      },
      200,
    )
  } catch (error) {
    return apiErrorResponse(error)
  }
}
