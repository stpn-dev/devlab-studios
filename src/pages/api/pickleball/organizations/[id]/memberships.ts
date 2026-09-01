import type { APIRoute } from 'astro'
import { requirePickleballSession } from '../../../../../worker/pickleball/authContext.js'
import { hasPermission } from '../../../../../lib/pickleball/permissions'
import { canAddOperator } from '../../../../../lib/pickleball/quota'
import { createMembership, getMembershipByEmail, listMembershipsForOrganization } from '../../../../../worker/repositories/pickleball/memberships.js'
import { countActiveMembershipsByRole, getOrganization } from '../../../../../worker/repositories/pickleball/organizations.js'
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
    if (!hasPermission(session, 'MANAGE_OPERATORS')) {
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
    if (session.activeOrgId !== params.id || !hasPermission(session, 'MANAGE_OPERATORS')) {
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

    // Only checked when this invite would add a NEW active operator of that
    // role — an existing ACTIVE member being re-invited to the SAME role is
    // a no-op re-send, not a new seat, so it must not be blocked by a cap
    // that's already at capacity because of that very member.
    const isNewActiveSeatForRole = !existing || existing.status !== 'ACTIVE' || existing.role !== result.data.role
    if (isNewActiveSeatForRole) {
      const organization = await getOrganization(env.PICKLEBALL_DB, organizationId)
      if (organization) {
        const currentCount = await countActiveMembershipsByRole(env.PICKLEBALL_DB, organizationId, result.data.role)
        if (!canAddOperator(organization, result.data.role, currentCount)) {
          return jsonResponse({ error: `Role quota reached for this organization (${result.data.role}).` }, 409)
        }
      }
    }

    const membership = await createMembership(env.PICKLEBALL_DB, { organizationId, ...result.data })
    if (!membership) return jsonResponse({ error: 'Failed to create membership.' }, 500)

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
