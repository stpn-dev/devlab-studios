// src/pages/api/pickleball/platform/organizations/index.ts
import type { APIRoute } from 'astro'
import { requirePlatformAdmin } from '../../../../../worker/pickleball/authContext.js'
import { listAllOrganizationsWithCounts } from '../../../../../worker/repositories/pickleball/organizations.js'
import { jsonResponse, apiErrorResponse } from '../../../../../worker/utils/responses.js'
import { getEnv } from '../../../../../lib/env'

export const GET: APIRoute = async ({ request }) => {
  const env = getEnv()
  try {
    await requirePlatformAdmin(request, env)

    const organizations = await listAllOrganizationsWithCounts(env.PICKLEBALL_DB)
    return jsonResponse({ organizations }, 200)
  } catch (error) {
    return apiErrorResponse(error)
  }
}
