// src/pages/api/pickleball/auth/org-invites/[token]/accept.ts
import type { APIRoute } from 'astro'
import { requireGoogleIdentity } from '../../../../../../worker/pickleball/authContext.js'
import { getInviteByToken, markInviteAccepted, setInviteOrganizationId } from '../../../../../../worker/repositories/pickleball/organizationInvites.js'
import { createOrganization } from '../../../../../../worker/repositories/pickleball/organizations.js'
import { createMembership, linkMembershipUser } from '../../../../../../worker/repositories/pickleball/memberships.js'
import { getUserByGoogleSub } from '../../../../../../worker/repositories/pickleball/users.js'
import { acceptOrgInviteSchema } from '../../../../../../lib/schemas/pickleball/platform'
import { validateInviteForAccept } from '../../../../../../lib/pickleball/inviteValidation'
import { signSession, buildSetCookieHeader, SESSION_COOKIE_NAME } from '../../../../../../worker/pickleball/session.js'
import { jsonResponse, apiErrorResponse } from '../../../../../../worker/utils/responses.js'
import { getEnv } from '../../../../../../lib/env'

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8

export const POST: APIRoute = async ({ request, params }) => {
  const env = getEnv()
  try {
    const identity = await requireGoogleIdentity(request, env)

    const invite = await getInviteByToken(env.PICKLEBALL_DB, params.token as string)
    const user = await getUserByGoogleSub(env.PICKLEBALL_DB, identity.googleSub)

    // A missing user folds into the same "wrong email" outcome as an actual
    // email mismatch below, matching this route's original combined check
    // (`!user || user.email.toLowerCase() !== invite.invitedEmail.toLowerCase()`).
    const validation = validateInviteForAccept(invite, user ? user.email : '')
    if (validation.outcome === 'not-found' || validation.outcome === 'already-used') {
      return jsonResponse({ error: 'This invite is no longer valid.' }, 404)
    }
    if (validation.outcome === 'expired') {
      return jsonResponse({ error: 'This invite has expired.' }, 410)
    }
    if (validation.outcome === 'wrong-email') {
      return jsonResponse({ error: 'This invite was issued to a different email address.' }, 403)
    }
    // validation.outcome === 'ok' here. That's only reachable when invite is
    // non-null and user's email matched it (so user is non-null too) -- this
    // guard is purely for TypeScript narrowing below, not a reachable branch.
    if (!invite || !user) {
      return jsonResponse({ error: 'This invite is no longer valid.' }, 404)
    }

    const body = await request.json().catch(() => null)
    const result = acceptOrgInviteSchema.safeParse(body)
    if (!result.success) {
      return jsonResponse({ error: 'Validation failed.', issues: result.error.issues }, 400)
    }

    // Claim the invite (CAS on status = 'PENDING') before doing any writes
    // that create real resources. Two concurrent/retried accept requests for
    // the same token both pass the checks above, but only one of them can
    // win this claim -- the loser is told the invite was already used
    // instead of also creating a duplicate organization.
    const claimed = await markInviteAccepted(env.PICKLEBALL_DB, invite.id)
    if (!claimed) {
      return jsonResponse({ error: 'This invite has already been used.' }, 409)
    }

    const organization = await createOrganization(env.PICKLEBALL_DB, {
      name: result.data.name,
      slug: result.data.slug,
      maxAdmins: invite.maxAdmins,
      maxFacilitators: invite.maxFacilitators,
      maxScorekeepers: invite.maxScorekeepers,
    })
    if (!organization) {
      return jsonResponse({ error: 'That club slug is already taken.' }, 409)
    }

    await createMembership(env.PICKLEBALL_DB, { organizationId: organization.id, invitedEmail: user.email, role: 'ADMIN' })
    // createMembership inserts with user_id = NULL (it's keyed by invited_email
    // only) -- without linking it now, requirePickleballSession's getMembership()
    // lookup (by organizationId + userId) would find nothing and reject every
    // subsequent request as unauthorized, same as google/callback.ts and
    // test-login.ts do immediately after resolving a membership at sign-in.
    await linkMembershipUser(env.PICKLEBALL_DB, { organizationId: organization.id, invitedEmail: user.email, userId: user.id })
    await setInviteOrganizationId(env.PICKLEBALL_DB, invite.id, organization.id)

    const now = Math.floor(Date.now() / 1000)
    const token = await signSession(
      { userId: user.id, googleSub: user.googleSub, activeOrgId: organization.id, iat: now, exp: now + SESSION_MAX_AGE_SECONDS },
      env.PICKLEBALL_SESSION_SECRET,
    )
    const secure = new URL(request.url).protocol === 'https:'

    return jsonResponse({ ok: true, activeOrgId: organization.id }, 200, {
      'Set-Cookie': buildSetCookieHeader(SESSION_COOKIE_NAME, token, { secure, maxAgeSeconds: SESSION_MAX_AGE_SECONDS }),
    })
  } catch (error) {
    return apiErrorResponse(error)
  }
}
