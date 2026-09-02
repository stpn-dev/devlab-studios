import type { APIRoute } from 'astro'
import { requirePickleballSession } from '../../../../worker/pickleball/authContext.js'
import { hasPermission } from '../../../../lib/pickleball/permissions'
import { getSession, updateSessionName, listSessionPlayerIds, deleteSessionCascade } from '../../../../worker/repositories/pickleball/sessions.js'
import { updateSessionNameSchema } from '../../../../lib/schemas/pickleball/sessions'
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

export const PATCH: APIRoute = async ({ request, params }) => {
  const env = getEnv()
  try {
    const session = await requirePickleballSession(request, env)
    const body = await request.json().catch(() => null)

    const record = await getSession(env.PICKLEBALL_DB, params.id, session.activeOrgId)
    if (!record) return jsonResponse({ error: 'Not found.' }, 404)

    if (!hasPermission(session, 'MANAGE_SESSIONS')) {
      return jsonResponse({ error: 'Forbidden.' }, 403)
    }

    const result = updateSessionNameSchema.safeParse(body)
    if (!result.success) {
      return jsonResponse({ error: 'Validation failed.', issues: result.error.issues }, 400)
    }

    const updated = await updateSessionName(env.PICKLEBALL_DB, params.id as string, session.activeOrgId, result.data.name)
    if (!updated) return jsonResponse({ error: 'Not found.' }, 404)
    return jsonResponse({ session: updated }, 200)
  } catch (error) {
    return apiErrorResponse(error)
  }
}

// Deletes the session and every row that depends on it (courts, queue,
// teams, games and everything under a game, matchmaking history, audit
// events) and recomputes every affected player's OPI so their ALL_TIME
// aggregate no longer reflects this session's games -- see
// deleteSessionCascade's own comment in sessions.js for exactly which
// tables cascade via FK versus which this explicitly cleans up. There is
// no status restriction: a DRAFT test session and a LIVE one are equally
// deletable, since the whole point is letting an operator remove a
// session they created in error, at any point in its lifecycle.
export const DELETE: APIRoute = async ({ request, params }) => {
  const env = getEnv()
  try {
    const session = await requirePickleballSession(request, env)

    const record = await getSession(env.PICKLEBALL_DB, params.id, session.activeOrgId)
    if (!record) return jsonResponse({ error: 'Not found.' }, 404)

    if (!hasPermission(session, 'MANAGE_SESSIONS')) {
      return jsonResponse({ error: 'Forbidden.' }, 403)
    }

    const affectedPlayerIds = await listSessionPlayerIds(env.PICKLEBALL_DB, params.id as string)
    const deleted = await deleteSessionCascade(env.PICKLEBALL_DB, params.id as string, session.activeOrgId, affectedPlayerIds)
    if (!deleted) return jsonResponse({ error: 'Not found.' }, 404)
    return jsonResponse({ ok: true }, 200)
  } catch (error) {
    return apiErrorResponse(error)
  }
}
