import type { APIRoute } from 'astro'
import { requirePickleballSession } from '../../../../../worker/pickleball/authContext.js'
import { hasPermission } from '../../../../../lib/pickleball/permissions'
import { getSession, updateSessionVisibility } from '../../../../../worker/repositories/pickleball/sessions.js'
import { sessionVisibilitySchema } from '../../../../../lib/schemas/pickleball/sessions'
import { getEnv } from '../../../../../lib/env'
import { jsonResponse, apiErrorResponse, forbiddenResponse } from '../../../../../worker/utils/responses.js'

// Turns a session's public share link on or off, and separately whether it
// carries the leaderboard.
//
// This route exists because new sessions now start with publishing OFF: the
// public view carries real player names, so it is something an operator opts
// into rather than something that happens to them by default. Without a way
// to turn it back on, that default would simply make the live and TV views
// unreachable.
export const POST: APIRoute = async ({ request, params }) => {
  const env = getEnv()
  try {
    const session = await requirePickleballSession(request, env)

    // Drained unconditionally before any early return, for the same reason
    // status.ts documents: a POST whose route answers without reading its
    // body crashes wrangler dev's loopback for every later request in the run.
    const body = await request.json().catch(() => null)

    const record = await getSession(env.PICKLEBALL_DB, params.id, session.activeOrgId)
    if (!record) return jsonResponse({ error: 'Not found.' }, 404)

    // Publishing personal data is a session-management decision, so it sits
    // with MANAGE_SESSIONS -- the same permission that starts and ends a
    // session -- not with MANAGE_QUEUE, which a scorekeeper holds.
    if (!hasPermission(session, 'MANAGE_SESSIONS')) return forbiddenResponse(request)

    const result = sessionVisibilitySchema.safeParse(body)
    if (!result.success) {
      return jsonResponse({ error: 'Validation failed.', issues: result.error.issues }, 400)
    }

    const updated = await updateSessionVisibility(env.PICKLEBALL_DB, params.id, session.activeOrgId, result.data)
    if (!updated) return jsonResponse({ error: 'Not found.' }, 404)

    return jsonResponse({ session: updated }, 200)
  } catch (error) {
    return apiErrorResponse(error)
  }
}
