import type { APIRoute } from 'astro'
import { requirePickleballSession } from '../../../../../worker/pickleball/authContext.js'
import { can } from '../../../../../lib/pickleball/permissions'
import { createMembership, listMembershipsForOrganization } from '../../../../../worker/repositories/pickleball/memberships.js'
import { inviteMembershipSchema } from '../../../../../lib/schemas/pickleball/organizations'
import { getEnv } from '../../../../../lib/env'

export const GET: APIRoute = async ({ request, params }) => {
  const env = getEnv()
  try {
    const session = await requirePickleballSession(request, env)
    if (session.activeOrgId !== params.id) {
      return new Response(JSON.stringify({ error: 'Not found.' }), { status: 404 })
    }
    const memberships = await listMembershipsForOrganization(env.PICKLEBALL_DB, params.id)
    return new Response(JSON.stringify({ memberships }), { status: 200 })
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: error.status || 500 })
  }
}

export const POST: APIRoute = async ({ request, params }) => {
  const env = getEnv()
  try {
    const session = await requirePickleballSession(request, env)
    if (session.activeOrgId !== params.id || !can(session.role, 'MANAGE_OPERATORS')) {
      return new Response(JSON.stringify({ error: 'Forbidden.' }), { status: 403 })
    }

    const body = await request.json().catch(() => null)
    const result = inviteMembershipSchema.safeParse(body)
    if (!result.success) {
      return new Response(JSON.stringify({ error: 'Validation failed.', issues: result.error.issues }), { status: 400 })
    }

    const membership = await createMembership(env.PICKLEBALL_DB, { organizationId: params.id, ...result.data })
    return new Response(JSON.stringify({ membership }), { status: 201 })
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: error.status || 500 })
  }
}
