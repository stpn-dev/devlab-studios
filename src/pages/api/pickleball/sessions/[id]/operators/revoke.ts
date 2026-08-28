import type { APIRoute } from 'astro'
import { requirePickleballSession } from '../../../../../../worker/pickleball/authContext.js'
import { can } from '../../../../../../lib/pickleball/permissions'
import { getSession } from '../../../../../../worker/repositories/pickleball/sessions.js'
import { revokeSessionOperator } from '../../../../../../worker/repositories/pickleball/sessionOperatorGrants.js'
import { revokeOperatorSchema } from '../../../../../../lib/schemas/pickleball/games'
import { jsonResponse, apiErrorResponse } from '../../../../../../worker/utils/responses.js'
import { getEnv } from '../../../../../../lib/env'

export const POST: APIRoute = async ({ request, params }) => {
  const env = getEnv()
  try {
    const session = await requirePickleballSession(request, env)
    const body = await request.json().catch(() => null)

    const sessionId = params.id as string
    const pickleballSession = await getSession(env.PICKLEBALL_DB, sessionId, session.activeOrgId)
    if (!pickleballSession) return jsonResponse({ error: 'Not found.' }, 404)

    if (!can(session.role, 'MANAGE_SESSIONS')) {
      return jsonResponse({ error: 'Forbidden.' }, 403)
    }

    const result = revokeOperatorSchema.safeParse(body)
    if (!result.success) {
      return jsonResponse({ error: 'Validation failed.', issues: result.error.issues }, 400)
    }

    // No membership pre-check: revoking a grant is safe regardless of the
    // target's current membership status (e.g. a since-deactivated member
    // who still holds a stale operator grant should still be revocable).
    await revokeSessionOperator(env.PICKLEBALL_DB, sessionId, result.data.userId)

    return jsonResponse({ ok: true }, 200)
  } catch (error) {
    return apiErrorResponse(error)
  }
}
