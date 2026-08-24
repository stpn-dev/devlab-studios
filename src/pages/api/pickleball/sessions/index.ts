import type { APIRoute } from 'astro'
import { requirePickleballSession } from '../../../../worker/pickleball/authContext.js'
import { can } from '../../../../lib/pickleball/permissions'
import { listSessions, createSession } from '../../../../worker/repositories/pickleball/sessions.js'
import { getVenue } from '../../../../worker/repositories/pickleball/venues.js'
import { createSessionSchema } from '../../../../lib/schemas/pickleball/sessions'
import { getEnv } from '../../../../lib/env'

export const GET: APIRoute = async ({ request }) => {
  const env = getEnv()
  try {
    const session = await requirePickleballSession(request, env)
    const sessions = await listSessions(env.PICKLEBALL_DB, session.activeOrgId)
    return new Response(JSON.stringify({ sessions }), { status: 200 })
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: error.status || 500 })
  }
}

export const POST: APIRoute = async ({ request }) => {
  const env = getEnv()
  try {
    const session = await requirePickleballSession(request, env)
    if (!can(session.role, 'MANAGE_SESSIONS')) {
      return new Response(JSON.stringify({ error: 'Forbidden.' }), { status: 403 })
    }

    const result = createSessionSchema.safeParse(await request.json().catch(() => null))
    if (!result.success) {
      return new Response(JSON.stringify({ error: 'Validation failed.', issues: result.error.issues }), { status: 400 })
    }

    const venue = await getVenue(env.PICKLEBALL_DB, result.data.venueId, session.activeOrgId)
    if (!venue) {
      return new Response(JSON.stringify({ error: 'Venue not found in this organization.' }), { status: 400 })
    }

    const created = await createSession(env.PICKLEBALL_DB, {
      organizationId: session.activeOrgId,
      createdByUserId: session.userId,
      ...result.data,
    })
    return new Response(JSON.stringify({ session: created }), { status: 201 })
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: error.status || 500 })
  }
}
