import type { APIRoute } from 'astro'
import { requirePickleballSession } from '../../../../../../../worker/pickleball/authContext.js'
import { getSession } from '../../../../../../../worker/repositories/pickleball/sessions.js'
import { listFixtures } from '../../../../../../../worker/repositories/pickleball/tournaments.js'
import { jsonResponse, apiErrorResponse } from '../../../../../../../worker/utils/responses.js'
import { getEnv } from '../../../../../../../lib/env'

export const GET: APIRoute = async ({ request, params }) => {
  const env = getEnv()
  try {
    const session = await requirePickleballSession(request, env)
    const pickleballSession = await getSession(env.PICKLEBALL_DB, params.id, session.activeOrgId)
    if (!pickleballSession) return jsonResponse({ error: 'Not found.' }, 404)

    const fixtures = await listFixtures(env.PICKLEBALL_DB, params.id)
    return jsonResponse({ fixtures }, 200)
  } catch (error) {
    return apiErrorResponse(error)
  }
}
