import type { APIRoute } from 'astro'
import { requirePickleballSession } from '../../../../../worker/pickleball/authContext.js'
import { getSession } from '../../../../../worker/repositories/pickleball/sessions.js'
import { getPublicCodeForSession } from '../../../../../worker/repositories/pickleball/publicSessionTokens.js'
import { jsonResponse, apiErrorResponse } from '../../../../../worker/utils/responses.js'
import { getEnv } from '../../../../../lib/env'

export const GET: APIRoute = async ({ request, params }) => {
  const env = getEnv()
  try {
    const session = await requirePickleballSession(request, env)
    const sessionId = params.id as string
    const pickleballSession = await getSession(env.PICKLEBALL_DB, sessionId, session.activeOrgId)
    if (!pickleballSession) return jsonResponse({ error: 'Not found.' }, 404)

    const code = await getPublicCodeForSession(env.PICKLEBALL_DB, sessionId, session.activeOrgId)
    if (!code) return jsonResponse({ error: 'No public link for this session.' }, 404)

    return jsonResponse({ code }, 200)
  } catch (error) {
    return apiErrorResponse(error)
  }
}
