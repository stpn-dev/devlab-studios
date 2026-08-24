import type { APIRoute } from 'astro'
import { requirePickleballSession } from '../../../../worker/pickleball/authContext.js'
import { can } from '../../../../lib/pickleball/permissions'
import { listVenues, createVenue } from '../../../../worker/repositories/pickleball/venues.js'
import { createVenueSchema } from '../../../../lib/schemas/pickleball/venues'
import { getEnv } from '../../../../lib/env'

export const GET: APIRoute = async ({ request }) => {
  const env = getEnv()
  try {
    const session = await requirePickleballSession(request, env)
    const venues = await listVenues(env.PICKLEBALL_DB, session.activeOrgId)
    return new Response(JSON.stringify({ venues }), { status: 200 })
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: error.status || 500 })
  }
}

export const POST: APIRoute = async ({ request }) => {
  const env = getEnv()
  try {
    const session = await requirePickleballSession(request, env)
    if (!can(session.role, 'MANAGE_VENUES_COURTS')) {
      return new Response(JSON.stringify({ error: 'Forbidden.' }), { status: 403 })
    }

    const result = createVenueSchema.safeParse(await request.json().catch(() => null))
    if (!result.success) {
      return new Response(JSON.stringify({ error: 'Validation failed.', issues: result.error.issues }), { status: 400 })
    }

    const venue = await createVenue(env.PICKLEBALL_DB, { organizationId: session.activeOrgId, ...result.data })
    return new Response(JSON.stringify({ venue }), { status: 201 })
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: error.status || 500 })
  }
}
