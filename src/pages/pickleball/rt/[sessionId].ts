import type { APIRoute } from 'astro'
import { requirePickleballSession } from '../../../worker/pickleball/authContext.js'
import { getSession } from '../../../worker/repositories/pickleball/sessions.js'
import { jsonResponse } from '../../../worker/utils/responses.js'
import { getEnv } from '../../../lib/env'

export const GET: APIRoute = async ({ request, params }) => {
  const env = getEnv()
  try {
    const session = await requirePickleballSession(request, env)
    const sessionId = params.sessionId as string

    const pickleballSession = await getSession(env.PICKLEBALL_DB, sessionId, session.activeOrgId)
    if (!pickleballSession) return jsonResponse({ error: 'Not found.' }, 404)

    if (request.headers.get('Upgrade') !== 'websocket') {
      return jsonResponse({ error: 'Expected a WebSocket upgrade request.' }, 400)
    }

    const forwardHeaders = new Headers(request.headers)
    forwardHeaders.set('X-Pickleball-Channel', 'operator')
    forwardHeaders.set('X-Pickleball-Session-Id', sessionId)
    const forwardRequest = new Request(request, { headers: forwardHeaders })

    const stub = env.SESSION_COORDINATOR.get(env.SESSION_COORDINATOR.idFromName(sessionId))
    return stub.fetch(forwardRequest)
  } catch (error: any) {
    return jsonResponse({ error: error.message }, error.status || 500)
  }
}
