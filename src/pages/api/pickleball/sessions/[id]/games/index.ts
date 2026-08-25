import type { APIRoute } from 'astro'
import { requirePickleballSession } from '../../../../../../worker/pickleball/authContext.js'
import { getSession } from '../../../../../../worker/repositories/pickleball/sessions.js'
import { listGamesForSession } from '../../../../../../worker/repositories/pickleball/games.js'
import { jsonResponse } from '../../../../../../worker/utils/responses.js'
import { getEnv } from '../../../../../../lib/env'

export const GET: APIRoute = async ({ request, params }) => {
  const env = getEnv()
  try {
    const session = await requirePickleballSession(request, env)

    const sessionId = params.id as string
    const pickleballSession = await getSession(env.PICKLEBALL_DB, sessionId, session.activeOrgId)
    if (!pickleballSession) return jsonResponse({ error: 'Not found.' }, 404)

    const games = await listGamesForSession(env.PICKLEBALL_DB, sessionId)
    return jsonResponse({ games }, 200)
  } catch (error: any) {
    return jsonResponse({ error: error.message }, error.status || 500)
  }
}
