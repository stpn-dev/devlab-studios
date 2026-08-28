import type { APIRoute } from 'astro'
import { requirePickleballSession } from '../../../../../../worker/pickleball/authContext.js'
import { can } from '../../../../../../lib/pickleball/permissions'
import { getSession } from '../../../../../../worker/repositories/pickleball/sessions.js'
import { getMembership } from '../../../../../../worker/repositories/pickleball/memberships.js'
import { grantSessionOperator } from '../../../../../../worker/repositories/pickleball/sessionOperatorGrants.js'
import { grantOperatorSchema } from '../../../../../../lib/schemas/pickleball/games'
import { jsonResponse, apiErrorResponse } from '../../../../../../worker/utils/responses.js'
import { getEnv } from '../../../../../../lib/env'

export const POST: APIRoute = async ({ request, params }) => {
  const env = getEnv()
  try {
    const session = await requirePickleballSession(request, env)
    const body = await request.json().catch(() => null)

    const sessionId = params.id as string
    const pickleballSession = await getSession(env.PICKLEBALL_DB, sessionId, session.activeOrgId)
    if (!pickleballSession) return jsonResponse({ error: 'Not found.' }, 404)

    if (!can(session.role, 'MANAGE_SESSIONS')) {
      return jsonResponse({ error: 'Forbidden.' }, 403)
    }

    const result = grantOperatorSchema.safeParse(body)
    if (!result.success) {
      return jsonResponse({ error: 'Validation failed.', issues: result.error.issues }, 400)
    }

    const targetMembership = await getMembership(env.PICKLEBALL_DB, {
      organizationId: session.activeOrgId, userId: result.data.userId,
    })
    if (!targetMembership) {
      return jsonResponse({ error: 'That user has no active membership in this organization.' }, 400)
    }

    await grantSessionOperator(env.PICKLEBALL_DB, {
      sessionId, userId: result.data.userId, grantedByUserId: session.userId,
    })

    return jsonResponse({ ok: true }, 200)
  } catch (error) {
    return apiErrorResponse(error)
  }
}
