import type { APIRoute } from 'astro'
import { requirePickleballSession } from '../../../../worker/pickleball/authContext.js'
import { can } from '../../../../lib/pickleball/permissions'
import { listScoringRulesets, listOrganizationScoringRulesets, createScoringRuleset } from '../../../../worker/repositories/pickleball/sessions.js'
import { createScoringRulesetSchema } from '../../../../lib/schemas/pickleball/scoringRulesets'
import { getEnv } from '../../../../lib/env'
import { jsonResponse, apiErrorResponse } from '../../../../worker/utils/responses.js'

// `?scope=organization` is the Settings page's read: this org's own
// rulesets, active and inactive. Without it, the default stays the
// session-creation dropdown's view (every global built-in plus this org's
// ACTIVE ones only) — same endpoint, so there is one source of truth for
// "what rulesets does this org have," not two that could drift.
export const GET: APIRoute = async ({ request, url }) => {
  const env = getEnv()
  try {
    const session = await requirePickleballSession(request, env)
    const rulesets = url.searchParams.get('scope') === 'organization'
      ? await listOrganizationScoringRulesets(env.PICKLEBALL_DB, session.activeOrgId)
      : await listScoringRulesets(env.PICKLEBALL_DB, session.activeOrgId)
    return jsonResponse({ rulesets }, 200)
  } catch (error) {
    return apiErrorResponse(error)
  }
}

export const POST: APIRoute = async ({ request }) => {
  const env = getEnv()
  try {
    const session = await requirePickleballSession(request, env)
    if (!can(session.role, 'CONFIGURE_SYSTEM_DEFAULTS')) {
      return jsonResponse({ error: 'Forbidden.' }, 403)
    }

    const result = createScoringRulesetSchema.safeParse(await request.json().catch(() => null))
    if (!result.success) {
      return jsonResponse({ error: 'Validation failed.', issues: result.error.issues }, 400)
    }

    const ruleset = await createScoringRuleset(env.PICKLEBALL_DB, session.activeOrgId, result.data)
    return jsonResponse({ ruleset }, 201)
  } catch (error) {
    return apiErrorResponse(error)
  }
}
