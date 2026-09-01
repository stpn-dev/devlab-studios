// src/pages/api/pickleball/platform/org-invites/index.ts
import type { APIRoute } from 'astro'
import { requirePickleballSession } from '../../../../../worker/pickleball/authContext.js'
import { createOrganizationInvite, listOrganizationInvites } from '../../../../../worker/repositories/pickleball/organizationInvites.js'
import { createOrgInviteSchema } from '../../../../../lib/schemas/pickleball/platform'
import { jsonResponse, apiErrorResponse } from '../../../../../worker/utils/responses.js'
import { getEnv } from '../../../../../lib/env'

export const GET: APIRoute = async ({ request }) => {
  const env = getEnv()
  try {
    const session = await requirePickleballSession(request, env)
    if (!session.isPlatformAdmin) return jsonResponse({ error: 'Forbidden.' }, 403)

    const invites = await listOrganizationInvites(env.PICKLEBALL_DB)
    return jsonResponse({ invites }, 200)
  } catch (error) {
    return apiErrorResponse(error)
  }
}

export const POST: APIRoute = async ({ request }) => {
  const env = getEnv()
  try {
    const session = await requirePickleballSession(request, env)
    if (!session.isPlatformAdmin) return jsonResponse({ error: 'Forbidden.' }, 403)

    const body = await request.json().catch(() => null)
    const result = createOrgInviteSchema.safeParse(body)
    if (!result.success) {
      return jsonResponse({ error: 'Validation failed.', issues: result.error.issues }, 400)
    }

    // createOrganizationInvite is plain JS (no JSDoc types), so TS infers its
    // maxAdmins/maxFacilitators/maxScorekeepers parameter types purely from
    // their `= null` defaults (i.e. `null | undefined`) rather than the
    // `number | null` the function actually accepts and stores. The `as`
    // below documents that known interop gap instead of widening to `any`.
    const invite = await createOrganizationInvite(env.PICKLEBALL_DB, {
      invitedEmail: result.data.invitedEmail,
      maxAdmins: result.data.maxAdmins ?? null,
      maxFacilitators: result.data.maxFacilitators ?? null,
      maxScorekeepers: result.data.maxScorekeepers ?? null,
      createdByUserId: session.userId,
    } as {
      invitedEmail: string
      maxAdmins: number | null
      maxFacilitators: number | null
      maxScorekeepers: number | null
      createdByUserId: string
    } as Parameters<typeof createOrganizationInvite>[1])

    if (!invite) {
      return jsonResponse({ error: 'Failed to create invite.' }, 500)
    }

    const acceptUrl = `${env.PICKLEBALL_OAUTH_REDIRECT_BASE_URL}/pickleball/accept-invite/${invite.token}`
    return jsonResponse({ invite, acceptUrl }, 201)
  } catch (error) {
    return apiErrorResponse(error)
  }
}
