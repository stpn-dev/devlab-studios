import type { APIRoute } from 'astro'
import { requirePickleballSession } from '../../../../../../../worker/pickleball/authContext.js'
import { can } from '../../../../../../../lib/pickleball/permissions'
import { getSession } from '../../../../../../../worker/repositories/pickleball/sessions.js'
import { getGame } from '../../../../../../../worker/repositories/pickleball/games.js'
import { hasSessionOperatorGrant } from '../../../../../../../worker/repositories/pickleball/sessionOperatorGrants.js'
import { rallySchema } from '../../../../../../../lib/schemas/pickleball/games'
import { jsonResponse } from '../../../../../../../worker/utils/responses.js'
import { getEnv } from '../../../../../../../lib/env'

export const POST: APIRoute = async ({ request, params }) => {
  const env = getEnv()
  try {
    const session = await requirePickleballSession(request, env)
    const body = await request.json().catch(() => null)

    const sessionId = params.id as string
    const pickleballSession = await getSession(env.PICKLEBALL_DB, sessionId, session.activeOrgId)
    if (!pickleballSession) return jsonResponse({ error: 'Not found.' }, 404)

    if (!can(session.role, 'SCORE_GAME')) return jsonResponse({ error: 'Forbidden.' }, 403)
    if (session.role === 'SCOREKEEPER' && !(await hasSessionOperatorGrant(env.PICKLEBALL_DB, sessionId, session.userId))) {
      return jsonResponse({ error: 'Forbidden.' }, 403)
    }

    const result = rallySchema.safeParse(body)
    if (!result.success) return jsonResponse({ error: 'Validation failed.', issues: result.error.issues }, 400)

    const gameId = params.gameId as string
    const game = await getGame(env.PICKLEBALL_DB, sessionId, gameId)
    if (!game) return jsonResponse({ error: 'Game not found in this session.' }, 404)

    const stub = env.SESSION_COORDINATOR.get(env.SESSION_COORDINATOR.idFromName(sessionId))
    const outcome = await stub.recordRally(sessionId, gameId, result.data.winningTeam, session.userId, result.data.idempotencyKey)

    if (!outcome.ok) return jsonResponse({ error: outcome.error }, 409)
    return jsonResponse(outcome, 200)
  } catch (error: any) {
    return jsonResponse({ error: error.message }, error.status || 500)
  }
}
