import type { APIRoute } from 'astro'
import { requirePickleballSession } from '../../../../../../worker/pickleball/authContext.js'
import { hasPermission } from '../../../../../../lib/pickleball/permissions'
import { getSession } from '../../../../../../worker/repositories/pickleball/sessions.js'
import { jsonResponse, apiErrorResponse } from '../../../../../../worker/utils/responses.js'
import { getEnv } from '../../../../../../lib/env'

export const DELETE: APIRoute = async ({ request, params }) => {
  const env = getEnv()
  try {
    const session = await requirePickleballSession(request, env)
    const pickleballSession = await getSession(env.PICKLEBALL_DB, params.id, session.activeOrgId)
    if (!pickleballSession) return jsonResponse({ error: 'Not found.' }, 404)

    if (!hasPermission(session, 'MANAGE_QUEUE')) {
      return jsonResponse({ error: 'Forbidden.' }, 403)
    }

    const sessionId = params.id as string
    const pairId = params.pairId as string
    const stub = env.SESSION_COORDINATOR.get(env.SESSION_COORDINATOR.idFromName(sessionId))
    const outcome = await stub.dissolvePair(sessionId, pairId)
    if (!outcome.ok) {
      return jsonResponse({ error: outcome.error }, 409)
    }

    return jsonResponse(outcome, 200)
  } catch (error) {
    return apiErrorResponse(error)
  }
}
