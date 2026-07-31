import type { APIRoute } from 'astro'
import { getPerItemCollection } from '../../../../../worker/adminRegistry.js'
import { recordAuditEvent } from '../../../../../worker/repositories/auditLog.js'
import { getEnv } from '../../../../../lib/env'
import { jsonResponse } from '../../../../../lib/http'

export const DELETE: APIRoute = async ({ params, locals }) => {
  const type = params.type as string
  const id = params.id as string
  const collection = getPerItemCollection(type)
  if (!collection) return jsonResponse({ error: 'Unknown per-item collection type.' }, 404)

  const env = getEnv()
  if (!env.DB) return jsonResponse({ error: 'D1 DB binding is not configured.' }, 503)

  await collection.delete(env.DB, id)
  await recordAuditEvent(env.DB, { actorEmail: locals.adminEmail || null, action: 'delete', entityType: type, entityId: id, metadata: {} })

  return jsonResponse({ id })
}
