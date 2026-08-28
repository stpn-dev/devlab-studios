import type { APIRoute } from 'astro'
import { requirePickleballSession } from '../../../../worker/pickleball/authContext.js'
import { can } from '../../../../lib/pickleball/permissions'
import { updateScoringRuleset } from '../../../../worker/repositories/pickleball/sessions.js'
import { updateScoringRulesetSchema } from '../../../../lib/schemas/pickleball/scoringRulesets'
import { getEnv } from '../../../../lib/env'
import { jsonResponse, apiErrorResponse } from '../../../../worker/utils/responses.js'

export const PUT: APIRoute = async ({ request, params }) => {
  const env = getEnv()
  try {
    const session = await requirePickleballSession(request, env)
    if (!can(session.role, 'CONFIGURE_SYSTEM_DEFAULTS')) {
      return jsonResponse({ error: 'Forbidden.' }, 403)
    }

    const result = updateScoringRulesetSchema.safeParse(await request.json().catch(() => null))
    if (!result.success) {
      return jsonResponse({ error: 'Validation failed.', issues: result.error.issues }, 400)
    }

    const ruleset = await updateScoringRuleset(env.PICKLEBALL_DB, params.id as string, session.activeOrgId, result.data)
    if (!ruleset) return jsonResponse({ error: 'Not found.' }, 404)
    return jsonResponse({ ruleset }, 200)
  } catch (error) {
    return apiErrorResponse(error)
  }
}
