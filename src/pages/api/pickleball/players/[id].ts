import type { APIRoute } from 'astro'
import { requirePickleballSession } from '../../../../worker/pickleball/authContext.js'
import { hasPermission } from '../../../../lib/pickleball/permissions'
import { deletePlayer, findPlayerUsage, getPlayer, updatePlayer } from '../../../../worker/repositories/pickleball/players.js'
import { updatePlayerSchema } from '../../../../lib/schemas/pickleball/players'
import { getEnv } from '../../../../lib/env'
import { jsonResponse, apiErrorResponse, forbiddenResponse } from '../../../../worker/utils/responses.js'

export const GET: APIRoute = async ({ request, params }) => {
  const env = getEnv()
  const id = params.id as string
  try {
    const session = await requirePickleballSession(request, env)
    const player = await getPlayer(env.PICKLEBALL_DB, id, session.activeOrgId)
    if (!player) return jsonResponse({ error: 'Not found.' }, 404)
    return jsonResponse({ player }, 200)
  } catch (error) {
    return apiErrorResponse(error)
  }
}

export const PUT: APIRoute = async ({ request, params }) => {
  const env = getEnv()
  const id = params.id as string
  try {
    const session = await requirePickleballSession(request, env)
    if (!hasPermission(session, 'MANAGE_PLAYERS')) {
      return await forbiddenResponse(request)
    }

    const result = updatePlayerSchema.safeParse(await request.json().catch(() => null))
    if (!result.success) {
      return jsonResponse({ error: 'Validation failed.', issues: result.error.issues }, 400)
    }

    const player = await updatePlayer(env.PICKLEBALL_DB, id, session.activeOrgId, result.data)
    if (!player) return jsonResponse({ error: 'Not found.' }, 404)
    return jsonResponse({ player }, 200)
  } catch (error) {
    return apiErrorResponse(error)
  }
}

export const DELETE: APIRoute = async ({ request, params }) => {
  const env = getEnv()
  const id = params.id as string
  try {
    const session = await requirePickleballSession(request, env)
    if (!hasPermission(session, 'MANAGE_PLAYERS')) {
      return await forbiddenResponse(request)
    }

    const player = await getPlayer(env.PICKLEBALL_DB, id, session.activeOrgId)
    if (!player) return jsonResponse({ error: 'Not found.' }, 404)

    const deleted = await deletePlayer(env.PICKLEBALL_DB, id, session.activeOrgId)
    if (deleted) return jsonResponse({ id, deleted: true }, 200)

    // Refused, not broken. Read the usage back afterwards so the operator is
    // told which of the two reasons applies rather than a bare "cannot".
    // Deactivating is the supported way to retire a player who has played:
    // deleting one would cascade away their finished games and every pairing
    // record that mentions them.
    const usage = await findPlayerUsage(env.PICKLEBALL_DB, id, session.activeOrgId)
    return jsonResponse(
      {
        error: usage.liveSessions > 0
          ? 'This player is in a session that is still under way. Delete is only possible for a player who has never been added to a session.'
          : 'This player has session or game history, which deleting would erase. Deactivate them instead to remove them from the roster while keeping their record.',
        usage,
        canDeactivate: player.active,
      },
      409,
    )
  } catch (error) {
    return apiErrorResponse(error)
  }
}
