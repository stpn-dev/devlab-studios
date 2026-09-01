import type { APIRoute } from 'astro'
import { requirePickleballSession } from '../../../../../../worker/pickleball/authContext.js'
import { hasPermission } from '../../../../../../lib/pickleball/permissions'
import { getSession } from '../../../../../../worker/repositories/pickleball/sessions.js'
import { getSessionCourt, setCourtEnabled } from '../../../../../../worker/repositories/pickleball/sessionCourts.js'
import { isSessionOpenForQueueOrCourtChanges } from '../../../../../../lib/pickleball/sessionLifecycle'
import { assignCourtSchema } from '../../../../../../lib/schemas/pickleball/queue'
import { jsonResponse, apiErrorResponse } from '../../../../../../worker/utils/responses.js'
import { getEnv } from '../../../../../../lib/env'

export const POST: APIRoute = async ({ request, params }) => {
  const env = getEnv()
  try {
    const session = await requirePickleballSession(request, env)
    const pickleballSession = await getSession(env.PICKLEBALL_DB, params.id, session.activeOrgId)
    if (!pickleballSession) return jsonResponse({ error: 'Not found.' }, 404)

    if (!hasPermission(session, 'MANAGE_QUEUE')) {
      return jsonResponse({ error: 'Forbidden.' }, 403)
    }

    if (!isSessionOpenForQueueOrCourtChanges(pickleballSession.status)) {
      return jsonResponse({ error: 'Session is not open for changes.' }, 409)
    }

    const result = assignCourtSchema.safeParse(await request.json().catch(() => null))
    if (!result.success) {
      return jsonResponse({ error: 'Validation failed.', issues: result.error.issues }, 400)
    }

    // A court sitting at ASSIGNED is mid-game: `assignCourt` already refuses a
    // NEW assignment onto a disabled court (it checks `court.enabled`), but
    // nothing stopped this route from disabling a court that already has an
    // assignment in progress, leaving it disabled + still ASSIGNED -- a
    // recoverable but incoherent state. Only an AVAILABLE court may be
    // disabled; `setCourtEnabled` itself stays generic (no status
    // precondition) since it's also used to re-enable, which is always safe.
    const existingCourt = await getSessionCourt(env.PICKLEBALL_DB, params.id, result.data.sessionCourtId)
    if (!existingCourt) return jsonResponse({ error: 'Court not found in this session.' }, 404)
    if (existingCourt.status !== 'AVAILABLE') {
      return jsonResponse({ error: 'Cannot disable a court with an active assignment.' }, 409)
    }

    const court = await setCourtEnabled(env.PICKLEBALL_DB, params.id, result.data.sessionCourtId, false)
    if (!court) return jsonResponse({ error: 'Court not found in this session.' }, 404)

    return jsonResponse({ court }, 200)
  } catch (error) {
    return apiErrorResponse(error)
  }
}
