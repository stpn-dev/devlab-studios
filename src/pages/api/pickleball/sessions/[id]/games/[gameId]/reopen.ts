import type { APIRoute } from 'astro'
import { requirePickleballSession } from '../../../../../../../worker/pickleball/authContext.js'
import { can } from '../../../../../../../lib/pickleball/permissions'
import { getSession } from '../../../../../../../worker/repositories/pickleball/sessions.js'
import { getGame } from '../../../../../../../worker/repositories/pickleball/games.js'
import { jsonResponse } from '../../../../../../../worker/utils/responses.js'
import { getEnv } from '../../../../../../../lib/env'

export const POST: APIRoute = async ({ request, params }) => {
  const env = getEnv()
  try {
    const session = await requirePickleballSession(request, env)
    await request.json().catch(() => null)

    const sessionId = params.id as string
    const pickleballSession = await getSession(env.PICKLEBALL_DB, sessionId, session.activeOrgId)
    if (!pickleballSession) return jsonResponse({ error: 'Not found.' }, 404)

    // ADMIN/FACILITATOR only -- SCOREKEEPER never holds REOPEN_GAME, so there
    // is deliberately no session-operator-grant branch here.
    if (!can(session.role, 'REOPEN_GAME')) return jsonResponse({ error: 'Forbidden.' }, 403)

    const gameId = params.gameId as string
    const game = await getGame(env.PICKLEBALL_DB, sessionId, gameId)
    if (!game) return jsonResponse({ error: 'Game not found in this session.' }, 404)

    const stub = env.SESSION_COORDINATOR.get(env.SESSION_COORDINATOR.idFromName(sessionId))
    const outcome = await stub.reopenGame(sessionId, gameId, session.userId)

    if (!outcome.ok) return jsonResponse({ error: outcome.error }, 409)
    return jsonResponse(outcome, 200)
  } catch (error: any) {
    return jsonResponse({ error: error.message }, error.status || 500)
  }
}
