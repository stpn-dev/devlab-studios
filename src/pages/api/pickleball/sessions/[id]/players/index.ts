import type { APIRoute } from 'astro'
import { requirePickleballSession } from '../../../../../../worker/pickleball/authContext.js'
import { can } from '../../../../../../lib/pickleball/permissions'
import { getSession } from '../../../../../../worker/repositories/pickleball/sessions.js'
import { listSessionPlayers, registerPlayer } from '../../../../../../worker/repositories/pickleball/sessionPlayers.js'
import { getPlayer } from '../../../../../../worker/repositories/pickleball/players.js'
import { registerPlayerSchema } from '../../../../../../lib/schemas/pickleball/sessionPlayers'
import { summarizeAttendance } from '../../../../../../lib/pickleball/attendance'
import { jsonResponse } from '../../../../../../worker/utils/responses.js'
import { getEnv } from '../../../../../../lib/env'

export const GET: APIRoute = async ({ request, params }) => {
  const env = getEnv()
  try {
    const session = await requirePickleballSession(request, env)
    const pickleballSession = await getSession(env.PICKLEBALL_DB, params.id, session.activeOrgId)
    if (!pickleballSession) return jsonResponse({ error: 'Not found.' }, 404)

    const players = await listSessionPlayers(env.PICKLEBALL_DB, params.id)
    const counts = summarizeAttendance(players)
    return jsonResponse({ players, counts }, 200)
  } catch (error: any) {
    return jsonResponse({ error: error.message }, error.status || 500)
  }
}

export const POST: APIRoute = async ({ request, params }) => {
  const env = getEnv()
  try {
    const session = await requirePickleballSession(request, env)
    const pickleballSession = await getSession(env.PICKLEBALL_DB, params.id, session.activeOrgId)
    if (!pickleballSession) return jsonResponse({ error: 'Not found.' }, 404)

    if (!can(session.role, 'CHECK_IN_PLAYERS')) {
      return jsonResponse({ error: 'Forbidden.' }, 403)
    }

    const result = registerPlayerSchema.safeParse(await request.json().catch(() => null))
    if (!result.success) {
      return jsonResponse({ error: 'Validation failed.', issues: result.error.issues }, 400)
    }

    // session_players has no organization_id column and its player_id FK only
    // proves the player row exists — not that it belongs to the caller's org.
    // Without this check an ADMIN in org B could register an org A player into
    // their own session and then read that player's display_name back out of
    // GET .../players (which JOINs players): a cross-tenant PII leak.
    const player = await getPlayer(env.PICKLEBALL_DB, result.data.playerId, session.activeOrgId)
    if (!player) {
      return jsonResponse({ error: 'Player not found in this organization.' }, 400)
    }
    if (!player.active) {
      return jsonResponse({ error: 'Player is not active.' }, 400)
    }

    const sessionPlayer = await registerPlayer(env.PICKLEBALL_DB, { sessionId: params.id, playerId: result.data.playerId })
    return jsonResponse({ sessionPlayer }, 201)
  } catch (error: any) {
    return jsonResponse({ error: error.message }, error.status || 500)
  }
}
