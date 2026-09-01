import type { APIRoute } from 'astro'
import { requirePickleballSession } from '../../../../../../../worker/pickleball/authContext.js'
import { hasPermission } from '../../../../../../../lib/pickleball/permissions'
import { getSession } from '../../../../../../../worker/repositories/pickleball/sessions.js'
import { getGame } from '../../../../../../../worker/repositories/pickleball/games.js'
import { correctGameSchema } from '../../../../../../../lib/schemas/pickleball/games'
import { jsonResponse, apiErrorResponse } from '../../../../../../../worker/utils/responses.js'
import { getEnv } from '../../../../../../../lib/env'
import { recordAuditEvent } from '../../../../../../../worker/repositories/pickleball/auditEvents.js'

export const POST: APIRoute = async ({ request, params }) => {
  const env = getEnv()
  try {
    const session = await requirePickleballSession(request, env)
    const body = await request.json().catch(() => null)

    const sessionId = params.id as string
    const pickleballSession = await getSession(env.PICKLEBALL_DB, sessionId, session.activeOrgId)
    if (!pickleballSession) return jsonResponse({ error: 'Not found.' }, 404)

    // ADMIN/FACILITATOR only -- SCOREKEEPER never holds CORRECT_GAME, so there
    // is deliberately no session-operator-grant branch here.
    if (!hasPermission(session, 'CORRECT_GAME')) return jsonResponse({ error: 'Forbidden.' }, 403)

    const result = correctGameSchema.safeParse(body)
    if (!result.success) return jsonResponse({ error: 'Validation failed.', issues: result.error.issues }, 400)

    const gameId = params.gameId as string
    const game = await getGame(env.PICKLEBALL_DB, sessionId, gameId)
    if (!game) return jsonResponse({ error: 'Game not found in this session.' }, 404)

    const stub = env.SESSION_COORDINATOR.get(env.SESSION_COORDINATOR.idFromName(sessionId))
    const outcome = await stub.correctGame(sessionId, gameId, session.userId, {
      scoreA: result.data.scoreA,
      scoreB: result.data.scoreB,
      servingTeam: result.data.servingTeam,
      serverNumber: result.data.serverNumber,
    })

    if (!outcome.ok) return jsonResponse({ error: outcome.error }, 409)

    // Re-fetched rather than read off `outcome.game`: the DO's RPC return type
    // is a union crossing the Durable Object stub boundary, and Cloudflare's
    // RPC serialization types don't narrow that union cleanly at the call
    // site (see correctGame's `Promise<{ok:false...} | {ok:true...}>` return
    // type upstream). A fresh read is also always current, unlike a value
    // captured mid-RPC-response.
    const updatedGame = await getGame(env.PICKLEBALL_DB, sessionId, gameId)

    await recordAuditEvent(env.PICKLEBALL_DB, {
      organizationId: session.activeOrgId,
      sessionId,
      actorUserId: session.userId,
      action: 'GAME_CORRECTED',
      entityType: 'game',
      entityId: gameId,
      previousState: game,
      newState: updatedGame,
      metadata: {},
    })

    return jsonResponse(outcome, 200)
  } catch (error) {
    return apiErrorResponse(error)
  }
}
