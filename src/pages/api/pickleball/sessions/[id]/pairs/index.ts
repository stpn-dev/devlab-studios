import type { APIRoute } from 'astro'
import { requirePickleballSession } from '../../../../../../worker/pickleball/authContext.js'
import { hasPermission } from '../../../../../../lib/pickleball/permissions'
import { getSession } from '../../../../../../worker/repositories/pickleball/sessions.js'
import { listSessionPairs } from '../../../../../../worker/repositories/pickleball/sessionPairs.js'
import { formPairSchema } from '../../../../../../lib/schemas/pickleball/pairs'
import { jsonResponse, apiErrorResponse, forbiddenResponse } from '../../../../../../worker/utils/responses.js'
import { getEnv } from '../../../../../../lib/env'

export const GET: APIRoute = async ({ request, params }) => {
  const env = getEnv()
  try {
    const session = await requirePickleballSession(request, env)
    const pickleballSession = await getSession(env.PICKLEBALL_DB, params.id, session.activeOrgId)
    if (!pickleballSession) return jsonResponse({ error: 'Not found.' }, 404)

    const pairs = await listSessionPairs(env.PICKLEBALL_DB, params.id)
    return jsonResponse({ pairs }, 200)
  } catch (error) {
    return apiErrorResponse(error)
  }
}

export const POST: APIRoute = async ({ request, params }) => {
  const env = getEnv()
  try {
    const session = await requirePickleballSession(request, env)
    const pickleballSession = await getSession(env.PICKLEBALL_DB, params.id, session.activeOrgId)
    if (!pickleballSession) return jsonResponse({ error: 'Not found.' }, 404)

    if (!hasPermission(session, 'MANAGE_QUEUE')) {
      return forbiddenResponse(request)
    }

    const result = formPairSchema.safeParse(await request.json().catch(() => null))
    if (!result.success) {
      return jsonResponse({ error: 'Validation failed.', issues: result.error.issues }, 400)
    }

    const sessionId = params.id as string
    const stub = env.SESSION_COORDINATOR.get(env.SESSION_COORDINATOR.idFromName(sessionId))
    const outcome = await stub.formPair(sessionId, result.data.sessionPlayerAId, result.data.sessionPlayerBId)
    if (!outcome.ok) {
      return jsonResponse({ error: outcome.error }, 409)
    }

    return jsonResponse(outcome, 201)
  } catch (error) {
    return apiErrorResponse(error)
  }
}
