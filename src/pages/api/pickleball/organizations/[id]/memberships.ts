import type { APIRoute } from 'astro'
import { requirePickleballSession } from '../../../../../worker/pickleball/authContext.js'
import { can } from '../../../../../lib/pickleball/permissions'
import { createMembership, getMembershipByEmail, listMembershipsForOrganization } from '../../../../../worker/repositories/pickleball/memberships.js'
import { recordAuditEvent } from '../../../../../worker/repositories/pickleball/auditEvents.js'
import { inviteMembershipSchema } from '../../../../../lib/schemas/pickleball/organizations'
import { getEnv } from '../../../../../lib/env'
import { jsonResponse, apiErrorResponse } from '../../../../../worker/utils/responses.js'

export const GET: APIRoute = async ({ request, params }) => {
  const env = getEnv()
  try {
    const session = await requirePickleballSession(request, env)
    if (session.activeOrgId !== params.id) {
      return jsonResponse({ error: 'Not found.' }, 404)
    }
    // The operator roster exposes every member's invited_email and role, which
    // is operator-management data — the same MANAGE_OPERATORS permission the
    // POST below requires. Without this check a SCOREKEEPER, whose role grants
    // only scoring-adjacent permissions, could enumerate the whole org.
    if (!can(session.role, 'MANAGE_OPERATORS')) {
      return jsonResponse({ error: 'Forbidden.' }, 403)
    }
    const memberships = await listMembershipsForOrganization(env.PICKLEBALL_DB, params.id)
    return jsonResponse({ memberships }, 200)
  } catch (error) {
    return apiErrorResponse(error)
  }
}

export const POST: APIRoute = async ({ request, params }) => {
  const env = getEnv()
  try {
    const session = await requirePickleballSession(request, env)
    if (session.activeOrgId !== params.id || !can(session.role, 'MANAGE_OPERATORS')) {
      return jsonResponse({ error: 'Forbidden.' }, 403)
    }

    const body = await request.json().catch(() => null)
    const result = inviteMembershipSchema.safeParse(body)
    if (!result.success) {
      return jsonResponse({ error: 'Validation failed.', issues: result.error.issues }, 400)
    }

    const organizationId = params.id as string
    const existing = await getMembershipByEmail(env.PICKLEBALL_DB, organizationId, result.data.invitedEmail)

    // Mirrors the DELETE route's self-revoke guard: a sole ADMIN downgrading
    // their own membership via this upsert-based invite endpoint would
    // permanently lock the organization out of MANAGE_OPERATORS and
    // VIEW_AUDIT_LOG, with no recovery path (memberships are invite-only).
    if (existing && existing.userId === session.userId && result.data.role !== 'ADMIN') {
      return jsonResponse({ error: 'You cannot change your own role away from ADMIN.' }, 400)
    }

    const membership = await createMembership(env.PICKLEBALL_DB, { organizationId, ...result.data })

    await recordAuditEvent(env.PICKLEBALL_DB, {
      organizationId,
      sessionId: null,
      actorUserId: session.userId,
      action: existing ? 'OPERATOR_ROLE_CHANGED' : 'OPERATOR_INVITED',
      entityType: 'organization_membership',
      entityId: membership.id,
      previousState: existing,
      newState: membership,
      metadata: {},
    })

    return jsonResponse({ membership }, 201)
  } catch (error) {
    return apiErrorResponse(error)
  }
}
