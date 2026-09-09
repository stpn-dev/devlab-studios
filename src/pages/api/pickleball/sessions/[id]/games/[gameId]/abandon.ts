import type { APIRoute } from 'astro'
import { requirePickleballSession } from '../../../../../../../worker/pickleball/authContext.js'
import { hasPermission } from '../../../../../../../lib/pickleball/permissions'
import { getSession } from '../../../../../../../worker/repositories/pickleball/sessions.js'
import { getGame } from '../../../../../../../worker/repositories/pickleball/games.js'
import { hasSessionOperatorGrant } from '../../../../../../../worker/repositories/pickleball/sessionOperatorGrants.js'
import { jsonResponse, apiErrorResponse, forbiddenResponse } from '../../../../../../../worker/utils/responses.js'
import { getEnv } from '../../../../../../../lib/env'

export const POST: APIRoute = async ({ request, params }) => {
  const env = getEnv()
  try {
    const session = await requirePickleballSession(request, env)
    await request.json().catch(() => null)

    const sessionId = params.id as string
    const pickleballSession = await getSession(env.PICKLEBALL_DB, sessionId, session.activeOrgId)
    if (!pickleballSession) return jsonResponse({ error: 'Not found.' }, 404)

    // Abandoning is a way of ending a game, so it is gated the same tier as
    // finishing (FINISH_GAME) -- this hardening plan's ruling, matching the
    // base plan's original tier assignment.
    if (!hasPermission(session, 'FINISH_GAME')) return await forbiddenResponse(request)
    if (session.role === 'SCOREKEEPER' && !(await hasSessionOperatorGrant(env.PICKLEBALL_DB, sessionId, session.userId))) {
      return await forbiddenResponse(request)
    }

    const gameId = params.gameId as string
    const game = await getGame(env.PICKLEBALL_DB, sessionId, gameId)
    if (!game) return jsonResponse({ error: 'Game not found in this session.' }, 404)

    const stub = env.SESSION_COORDINATOR.get(env.SESSION_COORDINATOR.idFromName(sessionId))
    const outcome = await stub.abandonGame(sessionId, gameId, session.userId)

    if (!outcome.ok) return jsonResponse({ error: outcome.error }, 409)
    return jsonResponse(outcome, 200)
  } catch (error) {
    return apiErrorResponse(error)
  }
}
