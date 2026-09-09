import type { APIRoute } from 'astro'
import { requirePickleballSession } from '../../../../../../worker/pickleball/authContext.js'
import { hasPermission } from '../../../../../../lib/pickleball/permissions'
import { getSession } from '../../../../../../worker/repositories/pickleball/sessions.js'
import { listQueueForSession, listEligibleQueueCandidates } from '../../../../../../worker/repositories/pickleball/queueEntries.js'
import { getSessionPlayerById } from '../../../../../../worker/repositories/pickleball/sessionPlayers.js'
import { selectNextPlayers } from '../../../../../../lib/pickleball/queueEngine'
import { listEligiblePairs } from '../../../../../../worker/repositories/pickleball/sessionPairs.js'
import { selectNextPairs } from '../../../../../../lib/pickleball/pairSelection'
import { isSessionOpenForQueueOrCourtChanges } from '../../../../../../lib/pickleball/sessionLifecycle'
import { joinQueueSchema } from '../../../../../../lib/schemas/pickleball/queue'
import { jsonResponse, apiErrorResponse, forbiddenResponse } from '../../../../../../worker/utils/responses.js'
import { getEnv } from '../../../../../../lib/env'

export const GET: APIRoute = async ({ request, params }) => {
  const env = getEnv()
  try {
    const session = await requirePickleballSession(request, env)
    const pickleballSession = await getSession(env.PICKLEBALL_DB, params.id, session.activeOrgId)
    if (!pickleballSession) return jsonResponse({ error: 'Not found.' }, 404)

    const queue = await listQueueForSession(env.PICKLEBALL_DB, params.id)
    const nowIso = new Date().toISOString()

    // A FIXED_PAIRS session must be explained by the engine that actually
    // decides its assignments. Running selectNextPlayers here would derive a
    // pair's "why" from session_players.games_played and player-level queue
    // order, while assignCourt selects on session_pairs.games_played via
    // selectNextPairs -- so the waiting list could tell an operator something
    // the next assignment then contradicts.
    if (pickleballSession.sessionType === 'FIXED_PAIRS') {
      const eligiblePairs = await listEligiblePairs(env.PICKLEBALL_DB, params.id)
      const { reasons } = selectNextPairs(eligiblePairs, eligiblePairs.length, nowIso)
      const reasonsByPairId = Object.fromEntries(reasons.map((r) => [r.sessionPairId, r.reasons]))

      return jsonResponse({
        queue: queue.map((entry: { sessionPairId: string | null }) => ({
          ...entry,
          reasons: (entry.sessionPairId && reasonsByPairId[entry.sessionPairId]) || [],
        })),
      }, 200)
    }

    const eligible = await listEligibleQueueCandidates(env.PICKLEBALL_DB, params.id)
    const { reasons } = selectNextPlayers(eligible, eligible.length, nowIso)
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

    if (!hasPermission(session, 'MANAGE_QUEUE')) {
      return await forbiddenResponse(request)
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
