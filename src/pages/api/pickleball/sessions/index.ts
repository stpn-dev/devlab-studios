import type { APIRoute } from 'astro'
import { requirePickleballSession } from '../../../../worker/pickleball/authContext.js'
import { can } from '../../../../lib/pickleball/permissions'
import { listSessions, getSession, getScoringRuleset, buildCreateSessionStatement } from '../../../../worker/repositories/pickleball/sessions.js'
import { getVenue } from '../../../../worker/repositories/pickleball/venues.js'
import { listCourtsForVenue } from '../../../../worker/repositories/pickleball/courts.js'
import { buildSeedSessionCourtsStatements } from '../../../../worker/repositories/pickleball/sessionCourts.js'
import { createSessionSchema } from '../../../../lib/schemas/pickleball/sessions'
import { getEnv } from '../../../../lib/env'
import { jsonResponse, nowIso } from '../../../../worker/utils/responses.js'

export const GET: APIRoute = async ({ request }) => {
  const env = getEnv()
  try {
    const session = await requirePickleballSession(request, env)
    const sessions = await listSessions(env.PICKLEBALL_DB, session.activeOrgId)
    return jsonResponse({ sessions }, 200)
  } catch (error: any) {
    return jsonResponse({ error: error.message }, error.status || 500)
  }
}

export const POST: APIRoute = async ({ request }) => {
  const env = getEnv()
  try {
    const session = await requirePickleballSession(request, env)
    if (!can(session.role, 'MANAGE_SESSIONS')) {
      return jsonResponse({ error: 'Forbidden.' }, 403)
    }

    const result = createSessionSchema.safeParse(await request.json().catch(() => null))
    if (!result.success) {
      return jsonResponse({ error: 'Validation failed.', issues: result.error.issues }, 400)
    }

    const venue = await getVenue(env.PICKLEBALL_DB, result.data.venueId, session.activeOrgId)
    if (!venue) {
      return jsonResponse({ error: 'Venue not found in this organization.' }, 400)
    }

    // Both foreign keys on this row are client-supplied, so both need the
    // same tenancy check — a global (organization_id IS NULL) ruleset is
    // allowed, another org's private ruleset is not.
    const ruleset = await getScoringRuleset(env.PICKLEBALL_DB, result.data.scoringRulesetId, session.activeOrgId)
    if (!ruleset) {
      return jsonResponse({ error: 'Scoring ruleset not found in this organization.' }, 400)
    }

    // Session creation and court seeding must commit or fail together — a
    // court-seed failure after a standalone session INSERT already committed
    // would leave a permanent session with zero session_courts rows and no
    // way to add them later, exactly the failure mode this feature exists to
    // prevent. The id/timestamp are generated up front so both the session
    // statement and every court statement can be composed into one
    // db.batch() call, following the same build*Statement convention as
    // SessionCoordinatorDO.ts.
    const sessionId = crypto.randomUUID()
    const timestamp = nowIso()

    const sessionStatement = buildCreateSessionStatement(env.PICKLEBALL_DB, {
      id: sessionId,
      organizationId: session.activeOrgId,
      createdByUserId: session.userId,
      timestamp,
      ...result.data,
    })

    // A read, so it happens before the batch; a venue with zero courts is
    // legitimate and yields zero court statements below.
    const venueCourts = await listCourtsForVenue(env.PICKLEBALL_DB, result.data.venueId, session.activeOrgId)
    const courtStatements = buildSeedSessionCourtsStatements(env.PICKLEBALL_DB, sessionId, venueCourts)

    await env.PICKLEBALL_DB.batch([sessionStatement, ...courtStatements])

    const created = await getSession(env.PICKLEBALL_DB, sessionId, session.activeOrgId)
    if (!created) {
      return jsonResponse({ error: 'Failed to create session.' }, 500)
    }

    return jsonResponse({ session: created }, 201)
  } catch (error: any) {
    return jsonResponse({ error: error.message }, error.status || 500)
  }
}
