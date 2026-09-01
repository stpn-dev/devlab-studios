// src/pages/api/pickleball/platform/organizations/[id]/reactivate.ts
import type { APIRoute } from 'astro'
import { requirePickleballSession } from '../../../../../../worker/pickleball/authContext.js'
import { getOrganization, setOrganizationStatus } from '../../../../../../worker/repositories/pickleball/organizations.js'
import { jsonResponse, apiErrorResponse } from '../../../../../../worker/utils/responses.js'
import { getEnv } from '../../../../../../lib/env'

export const POST: APIRoute = async ({ request, params }) => {
  const env = getEnv()
  try {
    const session = await requirePickleballSession(request, env)
    if (!session.isPlatformAdmin) return jsonResponse({ error: 'Forbidden.' }, 403)

    const organizationId = params.id as string
    const organization = await getOrganization(env.PICKLEBALL_DB, organizationId)
    if (!organization) return jsonResponse({ error: 'Not found.' }, 404)

    await setOrganizationStatus(env.PICKLEBALL_DB, organizationId, 'ACTIVE')
    return jsonResponse({ ok: true }, 200)
  } catch (error) {
    return apiErrorResponse(error)
  }
}
