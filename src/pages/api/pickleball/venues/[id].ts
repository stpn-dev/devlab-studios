import type { APIRoute } from 'astro'
import { requirePickleballSession } from '../../../../worker/pickleball/authContext.js'
import { hasPermission } from '../../../../lib/pickleball/permissions'
import { deleteVenue, findVenueUsage, getVenue } from '../../../../worker/repositories/pickleball/venues.js'
import { getEnv } from '../../../../lib/env'
import { jsonResponse, apiErrorResponse, forbiddenResponse } from '../../../../worker/utils/responses.js'

export const GET: APIRoute = async ({ request, params }) => {
  const env = getEnv()
  try {
    const session = await requirePickleballSession(request, env)
    const venue = await getVenue(env.PICKLEBALL_DB, params.id, session.activeOrgId)
    if (!venue) return jsonResponse({ error: 'Not found.' }, 404)
    return jsonResponse({ venue }, 200)
  } catch (error) {
    return apiErrorResponse(error)
  }
}

export const DELETE: APIRoute = async ({ request, params }) => {
  const env = getEnv()
  const id = params.id as string
  try {
    const session = await requirePickleballSession(request, env)
    if (!hasPermission(session, 'MANAGE_VENUES_COURTS')) {
      return await forbiddenResponse(request)
    }

    const venue = await getVenue(env.PICKLEBALL_DB, id, session.activeOrgId)
    if (!venue) return jsonResponse({ error: 'Not found.' }, 404)

    const deleted = await deleteVenue(env.PICKLEBALL_DB, id, session.activeOrgId)
    if (deleted) return jsonResponse({ id, deleted: true }, 200)

    const usage = await findVenueUsage(env.PICKLEBALL_DB, id, session.activeOrgId)
    return jsonResponse(
      {
        error: usage.liveSessions > 0
          ? 'This venue has a session that is still under way. Finish or cancel it before deleting the venue.'
          : 'This venue has sessions played at it, and deleting it would erase them. A venue can only be deleted before its first session.',
        usage,
      },
      409,
    )
  } catch (error) {
    return apiErrorResponse(error)
  }
}
