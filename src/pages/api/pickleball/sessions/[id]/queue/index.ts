import type { APIRoute } from 'astro'
import { requirePickleballSession } from '../../../../../../worker/pickleball/authContext.js'
import { can } from '../../../../../../lib/pickleball/permissions'
import { getSession } from '../../../../../../worker/repositories/pickleball/sessions.js'
import { listQueueForSession, listEligibleQueueCandidates } from '../../../../../../worker/repositories/pickleball/queueEntries.js'
import { getSessionPlayerById } from '../../../../../../worker/repositories/pickleball/sessionPlayers.js'
import { selectNextPlayers } from '../../../../../../lib/pickleball/queueEngine'
import { isSessionOpenForQueueOrCourtChanges } from '../../../../../../lib/pickleball/sessionLifecycle'
import { joinQueueSchema } from '../../../../../../lib/schemas/pickleball/queue'
import { jsonResponse, apiErrorResponse } from '../../../../../../worker/utils/responses.js'
import { getEnv } from '../../../../../../lib/env'

export const GET: APIRoute = async ({ request, params }) => {
  const env = getEnv()
  try {
    const session = await requirePickleballSession(request, env)
    const pickleballSession = await getSession(env.PICKLEBALL_DB, params.id, session.activeOrgId)
    if (!pickleballSession) return jsonResponse({ error: 'Not found.' }, 404)

    const queue = await listQueueForSession(env.PICKLEBALL_DB, params.id)
    const eligible = await listEligibleQueueCandidates(env.PICKLEBALL_DB, params.id)
    const { reasons } = selectNextPlayers(eligible, eligible.length, new Date().toISOString())
    const reasonsBySessionPlayerId = Object.fromEntries(reasons.map((r) => [r.sessionPlayerId, r.reasons]))

    return jsonResponse({
      queue: queue.map((entry: { sessionPlayerId: string }) => ({ ...entry, reasons: reasonsBySessionPlayerId[entry.sessionPlayerId] || [] })),
    }, 200)
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

    if (!can(session.role, 'MANAGE_QUEUE')) {
      return jsonResponse({ error: 'Forbidden.' }, 403)
    }

    if (!isSessionOpenForQueueOrCourtChanges(pickleballSession.status)) {
      return jsonResponse({ error: 'Session is not open for changes.' }, 409)
    }

    const result = joinQueueSchema.safeParse(await request.json().catch(() => null))
    if (!result.success) {
      return jsonResponse({ error: 'Validation failed.', issues: result.error.issues }, 400)
    }

    // Ownership check: confirm sessionPlayerId belongs to THIS session
    // before use (Global Constraint — generalized from Phase 2's playerId
    // IDOR fix, applied here before it becomes a bug instead of after).
    const sessionPlayer = await getSessionPlayerById(env.PICKLEBALL_DB, params.id, result.data.sessionPlayerId)
    if (!sessionPlayer) {
      return jsonResponse({ error: 'Session player not found in this session.' }, 400)
    }

    const sessionId = params.id as string
    const stub = env.SESSION_COORDINATOR.get(env.SESSION_COORDINATOR.idFromName(sessionId))
    const outcome = await stub.joinQueue(sessionId, result.data.sessionPlayerId)
    if (!outcome.ok) {
      return jsonResponse({ error: outcome.error }, 409)
    }

    return jsonResponse(outcome, 201)
  } catch (error) {
    return apiErrorResponse(error)
  }
}
