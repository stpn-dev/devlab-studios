import type { APIRoute } from 'astro'
import { requirePickleballSession } from '../../../../worker/pickleball/authContext.js'
import { getCourt } from '../../../../worker/repositories/pickleball/courts.js'
import { getEnv } from '../../../../lib/env'
import { jsonResponse } from '../../../../worker/utils/responses.js'

export const GET: APIRoute = async ({ request, params }) => {
  const env = getEnv()
  try {
    const session = await requirePickleballSession(request, env)
    const court = await getCourt(env.PICKLEBALL_DB, params.id, session.activeOrgId)
    if (!court) return jsonResponse({ error: 'Not found.' }, 404)
    return jsonResponse({ court }, 200)
  } catch (error: any) {
    return jsonResponse({ error: error.message }, error.status || 500)
  }
}
