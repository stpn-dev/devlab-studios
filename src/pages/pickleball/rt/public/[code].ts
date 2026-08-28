import type { APIRoute } from 'astro'
import { getSessionByPublicCode } from '../../../../worker/repositories/pickleball/publicSessionTokens.js'
import { jsonResponse, apiErrorResponse } from '../../../../worker/utils/responses.js'
import { getEnv } from '../../../../lib/env'

export const GET: APIRoute = async ({ request, params }) => {
  const env = getEnv()
  try {
    const code = params.code as string
    const publicSession = await getSessionByPublicCode(env.PICKLEBALL_DB, code)
    if (!publicSession || !publicSession.publicViewEnabled) return jsonResponse({ error: 'Not found.' }, 404)

    if (request.headers.get('Upgrade') !== 'websocket') {
      return jsonResponse({ error: 'Expected a WebSocket upgrade request.' }, 400)
    }

    const forwardHeaders = new Headers(request.headers)
    forwardHeaders.set('X-Pickleball-Channel', 'public')
    forwardHeaders.set('X-Pickleball-Session-Id', publicSession.id)
    const forwardRequest = new Request(request, { headers: forwardHeaders })

    const stub = env.SESSION_COORDINATOR.get(env.SESSION_COORDINATOR.idFromName(publicSession.id))
    return stub.fetch(forwardRequest)
  } catch (error) {
    return apiErrorResponse(error)
  }
}
