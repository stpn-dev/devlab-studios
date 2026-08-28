import type { APIRoute } from 'astro'
import { requirePickleballSession } from '../../../../../worker/pickleball/authContext.js'
import { can } from '../../../../../lib/pickleball/permissions'
import { listAuditEvents } from '../../../../../worker/repositories/pickleball/auditEvents.js'
import { jsonResponse, apiErrorResponse } from '../../../../../worker/utils/responses.js'
import { getEnv } from '../../../../../lib/env'

const PAGE_SIZE = 50

export const GET: APIRoute = async ({ request, params, url }) => {
  const env = getEnv()
  try {
    const session = await requirePickleballSession(request, env)
    const organizationId = params.id as string
    if (session.activeOrgId !== organizationId || !can(session.role, 'VIEW_AUDIT_LOG')) {
      return jsonResponse({ error: 'Forbidden.' }, 403)
    }

    const pageParam = Number(url.searchParams.get('page'))
    const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 0
    const events = await listAuditEvents(env.PICKLEBALL_DB, organizationId, { limit: PAGE_SIZE, offset: page * PAGE_SIZE })
    return jsonResponse({ events, page, pageSize: PAGE_SIZE }, 200)
  } catch (error) {
    return apiErrorResponse(error)
  }
}
