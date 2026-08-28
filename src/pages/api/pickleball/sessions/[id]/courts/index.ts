import type { APIRoute } from 'astro'
import { requirePickleballSession } from '../../../../../../worker/pickleball/authContext.js'
import { getSession } from '../../../../../../worker/repositories/pickleball/sessions.js'
import { listSessionCourts } from '../../../../../../worker/repositories/pickleball/sessionCourts.js'
import { jsonResponse, apiErrorResponse } from '../../../../../../worker/utils/responses.js'
import { getEnv } from '../../../../../../lib/env'

export const GET: APIRoute = async ({ request, params }) => {
  const env = getEnv()
  try {
    const session = await requirePickleballSession(request, env)
    const pickleballSession = await getSession(env.PICKLEBALL_DB, params.id, session.activeOrgId)
    if (!pickleballSession) return jsonResponse({ error: 'Not found.' }, 404)

    const courts = await listSessionCourts(env.PICKLEBALL_DB, params.id)
    return jsonResponse({ courts }, 200)
  } catch (error) {
    return apiErrorResponse(error)
  }
}
