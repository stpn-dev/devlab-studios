import type { APIRoute } from 'astro'
import { requirePickleballSession } from '../../../../../../worker/pickleball/authContext.js'
import { can } from '../../../../../../lib/pickleball/permissions'
import { getSession } from '../../../../../../worker/repositories/pickleball/sessions.js'
import { hasSessionOperatorGrant } from '../../../../../../worker/repositories/pickleball/sessionOperatorGrants.js'
import { startGameSchema } from '../../../../../../lib/schemas/pickleball/games'
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

    if (!can(session.role, 'SCORE_GAME')) return jsonResponse({ error: 'Forbidden.' }, 403)
    if (session.role === 'SCOREKEEPER' && !(await hasSessionOperatorGrant(env.PICKLEBALL_DB, sessionId, session.userId))) {
      return jsonResponse({ error: 'Forbidden.' }, 403)
    }

    const result = startGameSchema.safeParse(body)
    if (!result.success) return jsonResponse({ error: 'Validation failed.', issues: result.error.issues }, 400)

    const stub = env.SESSION_COORDINATOR.get(env.SESSION_COORDINATOR.idFromName(sessionId))
    const outcome = await stub.startGame(
      sessionId,
      result.data.sessionCourtId,
      result.data.servingTeam,
      result.data.teamAStartingServerSessionPlayerId,
      result.data.teamBStartingServerSessionPlayerId,
    )

    if (!outcome.ok) return jsonResponse({ error: outcome.error }, 409)
    return jsonResponse(outcome, 201)
  } catch (error) {
    return apiErrorResponse(error)
  }
}
