import type { APIRoute } from 'astro'
import { requirePickleballSession } from '../../../../../../worker/pickleball/authContext.js'
import { can } from '../../../../../../lib/pickleball/permissions'
import { getMembershipById, revokeMembership } from '../../../../../../worker/repositories/pickleball/memberships.js'
import { recordAuditEvent } from '../../../../../../worker/repositories/pickleball/auditEvents.js'
import { jsonResponse } from '../../../../../../worker/utils/responses.js'
import { getEnv } from '../../../../../../lib/env'

export const DELETE: APIRoute = async ({ request, params }) => {
  const env = getEnv()
  try {
    const session = await requirePickleballSession(request, env)
    const organizationId = params.id as string
    if (session.activeOrgId !== organizationId || !can(session.role, 'MANAGE_OPERATORS')) {
      return jsonResponse({ error: 'Forbidden.' }, 403)
    }

    const membershipId = params.membershipId as string
    const membership = await getMembershipById(env.PICKLEBALL_DB, organizationId, membershipId)
    if (!membership) return jsonResponse({ error: 'Not found.' }, 404)

    // Guards against an admin accidentally locking themselves out of the org
    // they're managing. membership.userId is only set once the invited
    // person has signed in at least once (see linkMembershipUser), so a
    // not-yet-accepted invite's userId is null and can never equal
    // session.userId here.
    if (membership.userId === session.userId) {
      return jsonResponse({ error: 'You cannot revoke your own membership.' }, 400)
    }

    const revoked = await revokeMembership(env.PICKLEBALL_DB, organizationId, membershipId)
    if (!revoked) return jsonResponse({ error: 'Not found.' }, 404)

    await recordAuditEvent(env.PICKLEBALL_DB, {
      organizationId,
      sessionId: null,
      actorUserId: session.userId,
      action: 'OPERATOR_REVOKED',
      entityType: 'organization_membership',
      entityId: membershipId,
      previousState: membership,
      newState: { ...membership, status: 'REVOKED' },
      metadata: {},
    })

    return jsonResponse({ ok: true }, 200)
  } catch (error: any) {
    return jsonResponse({ error: error.message }, error.status || 500)
  }
}
