import type { APIRoute } from 'astro'
import { listAuditEvents } from '../../../worker/repositories/auditLog.js'
import { getEnv } from '../../../lib/env'
import { jsonResponse } from '../../../lib/http'

export const GET: APIRoute = async ({ url }) => {
  const env = getEnv()
  if (!env.DB) return jsonResponse({ error: 'D1 DB binding is not configured.' }, 503)

  const entityType = url.searchParams.get('entityType') || null
  const entityId = url.searchParams.get('entityId') || null
  const limit = Number(url.searchParams.get('limit')) || 100

  const events = await listAuditEvents(env.DB, { entityType, entityId, limit })
  return jsonResponse(events)
}
