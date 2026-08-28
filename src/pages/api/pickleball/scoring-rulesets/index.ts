import type { APIRoute } from 'astro'
import { requirePickleballSession } from '../../../../worker/pickleball/authContext.js'
import { listScoringRulesets } from '../../../../worker/repositories/pickleball/sessions.js'
import { getEnv } from '../../../../lib/env'
import { jsonResponse, apiErrorResponse } from '../../../../worker/utils/responses.js'

export const GET: APIRoute = async ({ request }) => {
  const env = getEnv()
  try {
    const session = await requirePickleballSession(request, env)
    const rulesets = await listScoringRulesets(env.PICKLEBALL_DB, session.activeOrgId)
    return jsonResponse({ rulesets }, 200)
  } catch (error) {
    return apiErrorResponse(error)
  }
}
