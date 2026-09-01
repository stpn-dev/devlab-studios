import type { APIRoute } from 'astro'
import { requirePickleballSession } from '../../../../../worker/pickleball/authContext.js'
import { hasPermission } from '../../../../../lib/pickleball/permissions'
import { getSession, updateSessionStatus } from '../../../../../worker/repositories/pickleball/sessions.js'
import { transitionSession } from '../../../../../lib/pickleball/sessionStateMachine'
import { sessionStatusSchema } from '../../../../../lib/schemas/pickleball/sessions'
import { getEnv } from '../../../../../lib/env'
import { jsonResponse, apiErrorResponse } from '../../../../../worker/utils/responses.js'

export const POST: APIRoute = async ({ request, params }) => {
  const env = getEnv()
  try {
    const session = await requirePickleballSession(request, env)

    // The request body is drained unconditionally, before any early return,
    // so that a 404/403 response never leaves the stream unread. Locally, a
    // POST with a JSON body whose route returns an error response without
    // reading that body crashes wrangler dev's miniflare loopback outright
    // ("Network connection lost" on every later request in the same run) —
    // documented in tests/e2e/pickleball/pickleball-attendance.spec.js. This
    // does not change any response code or ordering below, it only moves
    // when the body is consumed.
    const body = await request.json().catch(() => null)

    const record = await getSession(env.PICKLEBALL_DB, params.id, session.activeOrgId)
    if (!record) return jsonResponse({ error: 'Not found.' }, 404)

    if (!hasPermission(session, 'MANAGE_SESSIONS')) {
      return jsonResponse({ error: 'Forbidden.' }, 403)
    }

    const result = sessionStatusSchema.safeParse(body)
    if (!result.success) {
      return jsonResponse({ error: 'Validation failed.', issues: result.error.issues }, 400)
    }

    const nextStatus = transitionSession(record, result.data.status)
    // Compare-and-swap against the status this route just validated against
    // (`record.status`), not an unconditional write — otherwise two
    // concurrent requests that both read the same starting status could both
    // pass the state-machine check above and both write, with the
    // last write silently clobbering the other's transition. A null result
    // means another transition already moved the row past `record.status`
    // between our read and this write, so the update never applied.
    const updated = await updateSessionStatus(env.PICKLEBALL_DB, params.id as string, session.activeOrgId, record.status, nextStatus)
    if (!updated) {
      return jsonResponse({ error: 'Session status changed before this update could be applied. Refresh and try again.' }, 409)
    }
    return jsonResponse({ session: updated }, 200)
  } catch (error) {
    return apiErrorResponse(error)
  }
}
