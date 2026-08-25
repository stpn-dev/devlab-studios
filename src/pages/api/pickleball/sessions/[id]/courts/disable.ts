import type { APIRoute } from 'astro'
import { requirePickleballSession } from '../../../../../../worker/pickleball/authContext.js'
import { can } from '../../../../../../lib/pickleball/permissions'
import { getSession } from '../../../../../../worker/repositories/pickleball/sessions.js'
import { setCourtEnabled } from '../../../../../../worker/repositories/pickleball/sessionCourts.js'
import { assignCourtSchema } from '../../../../../../lib/schemas/pickleball/queue'
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

    const result = assignCourtSchema.safeParse(await request.json().catch(() => null))
    if (!result.success) {
      return jsonResponse({ error: 'Validation failed.', issues: result.error.issues }, 400)
    }

    const court = await setCourtEnabled(env.PICKLEBALL_DB, params.id, result.data.sessionCourtId, false)
    if (!court) return jsonResponse({ error: 'Court not found in this session.' }, 404)

    return jsonResponse({ court }, 200)
  } catch (error: any) {
    return jsonResponse({ error: error.message }, error.status || 500)
  }
}
