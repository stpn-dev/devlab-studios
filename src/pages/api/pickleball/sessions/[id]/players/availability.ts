import type { APIRoute } from 'astro'
import { requirePickleballSession } from '../../../../../../worker/pickleball/authContext.js'
import { can } from '../../../../../../lib/pickleball/permissions'
import { getSession } from '../../../../../../worker/repositories/pickleball/sessions.js'
import { setAvailability } from '../../../../../../worker/repositories/pickleball/sessionPlayers.js'
import { setAvailabilitySchema } from '../../../../../../lib/schemas/pickleball/sessionPlayers'
import { jsonResponse } from '../../../../../../worker/utils/responses.js'
import { getEnv } from '../../../../../../lib/env'

export const POST: APIRoute = async ({ request, params }) => {
  const env = getEnv()
  try {
    const session = await requirePickleballSession(request, env)
    const pickleballSession = await getSession(env.PICKLEBALL_DB, params.id, session.activeOrgId)
    if (!pickleballSession) return jsonResponse({ error: 'Not found.' }, 404)

    if (!can(session.role, 'CHECK_IN_PLAYERS')) {
      return jsonResponse({ error: 'Forbidden.' }, 403)
    }

    const result = setAvailabilitySchema.safeParse(await request.json().catch(() => null))
    if (!result.success) {
      return jsonResponse({ error: 'Validation failed.', issues: result.error.issues }, 400)
    }

    const sessionPlayer = await setAvailability(env.PICKLEBALL_DB, params.id, result.data.playerId, result.data.status)
    if (!sessionPlayer) {
      return jsonResponse({ error: 'Player must be checked in to change availability.' }, 409)
    }

    return jsonResponse({ sessionPlayer }, 200)
  } catch (error: any) {
    return jsonResponse({ error: error.message }, error.status || 500)
  }
}
