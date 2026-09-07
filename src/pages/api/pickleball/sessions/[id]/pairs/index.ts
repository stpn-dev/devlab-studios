import type { APIRoute } from 'astro'
import { requirePickleballSession } from '../../../../../../worker/pickleball/authContext.js'
import { hasPermission } from '../../../../../../lib/pickleball/permissions'
import { getSession } from '../../../../../../worker/repositories/pickleball/sessions.js'
import { listSessionPairs } from '../../../../../../worker/repositories/pickleball/sessionPairs.js'
import { formPairSchema } from '../../../../../../lib/schemas/pickleball/pairs'
import { jsonResponse, apiErrorResponse } from '../../../../../../worker/utils/responses.js'
import { getEnv } from '../../../../../../lib/env'

export const GET: APIRoute = async ({ request, params }) => {
  const env = getEnv()
  try {
    const session = await requirePickleballSession(request, env)
    const pickleballSession = await getSession(env.PICKLEBALL_DB, params.id, session.activeOrgId)
    if (!pickleballSession) return jsonResponse({ error: 'Not found.' }, 404)

    const pairs = await listSessionPairs(env.PICKLEBALL_DB, params.id)
    return jsonResponse({ pairs }, 200)
  } catch (error) {
    return apiErrorResponse(error)
  }
}

export const POST: APIRoute = async ({ request, params }) => {
  const env = getEnv()
  try {
    const session = await requirePickleballSession(request, env)
    const pickleballSession = await getSession(env.PICKLEBALL_DB, params.id, session.activeOrgId)
    if (!pickleballSession) return jsonResponse({ error: 'Not found.' }, 404)

    if (!hasPermission(session, 'MANAGE_QUEUE')) {
      // Drain the request body before responding. Reproducible finding (not
      // a guess): with this removed, `pickleball-fixed-pairs.spec.js` was
      // run 5 consecutive times against a fresh `wrangler dev --local`
      // server each time, and every single run crashed the dev server with
      // "Error: Network connection lost." on the SCOREKEEPER-dissolve DELETE
      // that immediately follows this route's 403 on the same keep-alive
      // connection (5/5 failed identically: the 4 tests before it passed,
      // the 5 tests from the SCOREKEEPER test onward failed -- the first as
      // a 500, the rest via ECONNREFUSED once the server was down). Restoring
      // this drain made all 9 tests pass, repeatably. See the fix-round-1
      // section of task-3-4-report.md for the full 5-run log and the
      // isolated repro that ruled out cumulative request count, curl vs.
      // Playwright connection reuse, and trace-file writes as the cause
      // before landing on "the previous response over this connection never
      // read its own request body." Harmless no-op in production.
      await request.arrayBuffer().catch(() => {})
      return jsonResponse({ error: 'Forbidden.' }, 403)
    }

    const result = formPairSchema.safeParse(await request.json().catch(() => null))
    if (!result.success) {
      return jsonResponse({ error: 'Validation failed.', issues: result.error.issues }, 400)
    }

    const sessionId = params.id as string
    const stub = env.SESSION_COORDINATOR.get(env.SESSION_COORDINATOR.idFromName(sessionId))
    const outcome = await stub.formPair(sessionId, result.data.sessionPlayerAId, result.data.sessionPlayerBId)
    if (!outcome.ok) {
      return jsonResponse({ error: outcome.error }, 409)
    }

    return jsonResponse(outcome, 201)
  } catch (error) {
    return apiErrorResponse(error)
  }
}
