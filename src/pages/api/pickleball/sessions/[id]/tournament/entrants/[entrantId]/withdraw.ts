import type { APIRoute } from 'astro'
import { requirePickleballSession } from '../../../../../../../../worker/pickleball/authContext.js'
import { hasPermission } from '../../../../../../../../lib/pickleball/permissions'
import { getSession } from '../../../../../../../../worker/repositories/pickleball/sessions.js'
import { jsonResponse, apiErrorResponse, forbiddenResponse } from '../../../../../../../../worker/utils/responses.js'
import { getEnv } from '../../../../../../../../lib/env'

export const POST: APIRoute = async ({ request, params }) => {
  const env = getEnv()
  try {
    const session = await requirePickleballSession(request, env)

    // withdrawEntrant takes no request body, but callers may still send one
    // -- draining it unconditionally, before any early return, avoids the
    // same wrangler dev --local keep-alive crash lock.ts/status.ts already
    // document: a response that ends without ever reading the request's own
    // body corrupts the next request replayed over the same connection.
    await request.arrayBuffer().catch(() => {})

    const pickleballSession = await getSession(env.PICKLEBALL_DB, params.id, session.activeOrgId)
    if (!pickleballSession) return jsonResponse({ error: 'Not found.' }, 404)

    if (!hasPermission(session, 'MANAGE_QUEUE')) {
      // Body already drained above; forbiddenResponse's own drain attempt on
      // the now-empty stream is a harmless no-op.
      return forbiddenResponse(request)
    }

    const sessionId = params.id as string
    const entrantId = params.entrantId as string
    const stub = env.SESSION_COORDINATOR.get(env.SESSION_COORDINATOR.idFromName(sessionId))
    const outcome = await stub.withdrawEntrant(sessionId, entrantId)
    if (!outcome.ok) {
      return jsonResponse({ error: outcome.error }, 409)
    }

    return jsonResponse(outcome, 200)
  } catch (error) {
    return apiErrorResponse(error)
  }
}
