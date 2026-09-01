import type { APIRoute } from 'astro'
import { requirePickleballSession } from '../../../../worker/pickleball/authContext.js'
import { hasPermission } from '../../../../lib/pickleball/permissions'
import { listVenues, createVenue } from '../../../../worker/repositories/pickleball/venues.js'
import { createVenueSchema } from '../../../../lib/schemas/pickleball/venues'
import { getEnv } from '../../../../lib/env'
import { jsonResponse, apiErrorResponse } from '../../../../worker/utils/responses.js'

export const GET: APIRoute = async ({ request }) => {
  const env = getEnv()
  try {
    const session = await requirePickleballSession(request, env)
    const venues = await listVenues(env.PICKLEBALL_DB, session.activeOrgId)
    return jsonResponse({ venues }, 200)
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

    const result = createVenueSchema.safeParse(await request.json().catch(() => null))
    if (!result.success) {
      return jsonResponse({ error: 'Validation failed.', issues: result.error.issues }, 400)
    }

    const venue = await createVenue(env.PICKLEBALL_DB, { organizationId: session.activeOrgId, ...result.data })
    return jsonResponse({ venue }, 201)
  } catch (error) {
    return apiErrorResponse(error)
  }
}
