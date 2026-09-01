import type { APIRoute } from 'astro'
import { requirePickleballSession } from '../../../../worker/pickleball/authContext.js'
import { hasPermission } from '../../../../lib/pickleball/permissions'
import { listCourtsForVenue, createCourt } from '../../../../worker/repositories/pickleball/courts.js'
import { getVenue } from '../../../../worker/repositories/pickleball/venues.js'
import { createCourtSchema } from '../../../../lib/schemas/pickleball/courts'
import { getEnv } from '../../../../lib/env'
import { jsonResponse, apiErrorResponse } from '../../../../worker/utils/responses.js'

export const GET: APIRoute = async ({ request, url }) => {
  const env = getEnv()
  try {
    const session = await requirePickleballSession(request, env)
    const venueId = url.searchParams.get('venueId')
    if (!venueId) return jsonResponse({ error: 'venueId query param is required.' }, 400)
    const courts = await listCourtsForVenue(env.PICKLEBALL_DB, venueId, session.activeOrgId)
    return jsonResponse({ courts }, 200)
  } catch (error) {
    return apiErrorResponse(error)
  }
}

export const POST: APIRoute = async ({ request }) => {
  const env = getEnv()
  try {
    const session = await requirePickleballSession(request, env)
    if (!hasPermission(session, 'MANAGE_VENUES_COURTS')) {
      return jsonResponse({ error: 'Forbidden.' }, 403)
    }

    const result = createCourtSchema.safeParse(await request.json().catch(() => null))
    if (!result.success) {
      return jsonResponse({ error: 'Validation failed.', issues: result.error.issues }, 400)
    }

    const venue = await getVenue(env.PICKLEBALL_DB, result.data.venueId, session.activeOrgId)
    if (!venue) {
      return jsonResponse({ error: 'Venue not found in this organization.' }, 400)
    }

    const court = await createCourt(env.PICKLEBALL_DB, { organizationId: session.activeOrgId, ...result.data })
    return jsonResponse({ court }, 201)
  } catch (error) {
    return apiErrorResponse(error)
  }
}
