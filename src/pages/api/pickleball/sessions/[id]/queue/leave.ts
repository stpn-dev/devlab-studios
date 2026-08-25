import type { APIRoute } from 'astro'
import { requirePickleballSession } from '../../../../../../worker/pickleball/authContext.js'
import { can } from '../../../../../../lib/pickleball/permissions'
import { getSession } from '../../../../../../worker/repositories/pickleball/sessions.js'
import { leaveQueue } from '../../../../../../worker/repositories/pickleball/queueEntries.js'
import { isSessionOpenForQueueOrCourtChanges } from '../../../../../../lib/pickleball/sessionLifecycle'
import { leaveQueueSchema } from '../../../../../../lib/schemas/pickleball/queue'
import { jsonResponse } from '../../../../../../worker/utils/responses.js'
import { getEnv } from '../../../../../../lib/env'

export const POST: APIRoute = async ({ request, params }) => {
  const env = getEnv()
  try {
    const session = await requirePickleballSession(request, env)
    const pickleballSession = await getSession(env.PICKLEBALL_DB, params.id, session.activeOrgId)
    if (!pickleballSession) return jsonResponse({ error: 'Not found.' }, 404)

    if (!can(session.role, 'MANAGE_QUEUE')) {
      return jsonResponse({ error: 'Forbidden.' }, 403)
    }

    if (!isSessionOpenForQueueOrCourtChanges(pickleballSession.status)) {
      return jsonResponse({ error: 'Session is not open for changes.' }, 409)
    }

    const result = leaveQueueSchema.safeParse(await request.json().catch(() => null))
    if (!result.success) {
      return jsonResponse({ error: 'Validation failed.', issues: result.error.issues }, 400)
    }

    const left = await leaveQueue(env.PICKLEBALL_DB, params.id, result.data.sessionPlayerId)
    if (!left) {
      return jsonResponse({ error: 'Player has no open QUEUED entry to leave.' }, 409)
    }

    return jsonResponse({ ok: true }, 200)
  } catch (error: any) {
    return jsonResponse({ error: error.message }, error.status || 500)
  }
}
