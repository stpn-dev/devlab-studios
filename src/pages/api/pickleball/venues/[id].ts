import type { APIRoute } from 'astro'
import { requirePickleballSession } from '../../../../worker/pickleball/authContext.js'
import { getVenue } from '../../../../worker/repositories/pickleball/venues.js'
import { getEnv } from '../../../../lib/env'
import { jsonResponse } from '../../../../worker/utils/responses.js'

export const GET: APIRoute = async ({ request, params }) => {
  const env = getEnv()
  try {
    const session = await requirePickleballSession(request, env)
    const venue = await getVenue(env.PICKLEBALL_DB, params.id, session.activeOrgId)
    if (!venue) return jsonResponse({ error: 'Not found.' }, 404)
    return jsonResponse({ venue }, 200)
  } catch (error: any) {
    return jsonResponse({ error: error.message }, error.status || 500)
  }
}
