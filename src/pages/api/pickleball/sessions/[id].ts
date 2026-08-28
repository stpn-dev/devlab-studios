import type { APIRoute } from 'astro'
import { requirePickleballSession } from '../../../../worker/pickleball/authContext.js'
import { getSession } from '../../../../worker/repositories/pickleball/sessions.js'
import { getEnv } from '../../../../lib/env'
import { jsonResponse, apiErrorResponse } from '../../../../worker/utils/responses.js'

export const GET: APIRoute = async ({ request, params }) => {
  const env = getEnv()
  try {
    const session = await requirePickleballSession(request, env)
    const record = await getSession(env.PICKLEBALL_DB, params.id, session.activeOrgId)
    if (!record) return jsonResponse({ error: 'Not found.' }, 404)
    return jsonResponse({ session: record }, 200)
  } catch (error) {
    return apiErrorResponse(error)
  }
}
