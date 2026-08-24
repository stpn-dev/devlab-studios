import type { APIRoute } from 'astro'
import { requirePickleballSession } from '../../../../worker/pickleball/authContext.js'
import { can } from '../../../../lib/pickleball/permissions'
import { listCourtsForVenue, createCourt } from '../../../../worker/repositories/pickleball/courts.js'
import { createCourtSchema } from '../../../../lib/schemas/pickleball/courts'
import { getEnv } from '../../../../lib/env'

export const GET: APIRoute = async ({ request, url }) => {
  const env = getEnv()
  try {
    const session = await requirePickleballSession(request, env)
    const venueId = url.searchParams.get('venueId')
    if (!venueId) return new Response(JSON.stringify({ error: 'venueId query param is required.' }), { status: 400 })
    const courts = await listCourtsForVenue(env.PICKLEBALL_DB, venueId, session.activeOrgId)
    return new Response(JSON.stringify({ courts }), { status: 200 })
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

    const result = createCourtSchema.safeParse(await request.json().catch(() => null))
    if (!result.success) {
      return new Response(JSON.stringify({ error: 'Validation failed.', issues: result.error.issues }), { status: 400 })
    }

    const court = await createCourt(env.PICKLEBALL_DB, { organizationId: session.activeOrgId, ...result.data })
    return new Response(JSON.stringify({ court }), { status: 201 })
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: error.status || 500 })
  }
}
