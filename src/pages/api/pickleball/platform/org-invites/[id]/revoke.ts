// src/pages/api/pickleball/platform/org-invites/[id]/revoke.ts
import type { APIRoute } from 'astro'
import { requirePickleballSession } from '../../../../../../worker/pickleball/authContext.js'
import { revokeInvite } from '../../../../../../worker/repositories/pickleball/organizationInvites.js'
import { jsonResponse, apiErrorResponse } from '../../../../../../worker/utils/responses.js'
import { getEnv } from '../../../../../../lib/env'

export const POST: APIRoute = async ({ request, params }) => {
  const env = getEnv()
  try {
    const session = await requirePickleballSession(request, env)
    if (!session.isPlatformAdmin) return jsonResponse({ error: 'Forbidden.' }, 403)

    const revoked = await revokeInvite(env.PICKLEBALL_DB, params.id as string)
    if (!revoked) return jsonResponse({ error: 'Invite not found or already resolved.' }, 409)

    return jsonResponse({ ok: true }, 200)
  } catch (error) {
    return apiErrorResponse(error)
  }
}
