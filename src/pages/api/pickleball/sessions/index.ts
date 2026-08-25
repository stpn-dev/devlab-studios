import type { APIRoute } from 'astro'
import { requirePickleballSession } from '../../../../worker/pickleball/authContext.js'
import { can } from '../../../../lib/pickleball/permissions'
import { listSessions, createSession, getScoringRuleset } from '../../../../worker/repositories/pickleball/sessions.js'
import { getVenue } from '../../../../worker/repositories/pickleball/venues.js'
import { listCourtsForVenue } from '../../../../worker/repositories/pickleball/courts.js'
import { seedSessionCourtsFromVenue } from '../../../../worker/repositories/pickleball/sessionCourts.js'
import { createSessionSchema } from '../../../../lib/schemas/pickleball/sessions'
import { getEnv } from '../../../../lib/env'
import { jsonResponse } from '../../../../worker/utils/responses.js'

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

    const created = await createSession(env.PICKLEBALL_DB, {
      organizationId: session.activeOrgId,
      createdByUserId: session.userId,
      ...result.data,
    })
    if (!created) {
      return jsonResponse({ error: 'Failed to create session.' }, 500)
    }

    // Seed one session_courts row per court already defined on the venue so
    // the queue/court-assignment feature has courts to assign to as soon as
    // the session goes LIVE — a venue with zero courts is legitimate and
    // seeds zero rows.
    const venueCourts = await listCourtsForVenue(env.PICKLEBALL_DB, result.data.venueId, session.activeOrgId)
    await seedSessionCourtsFromVenue(env.PICKLEBALL_DB, created.id, venueCourts)

    return jsonResponse({ session: created }, 201)
  } catch (error: any) {
    return jsonResponse({ error: error.message }, error.status || 500)
  }
}
