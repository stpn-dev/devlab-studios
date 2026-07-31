import type { APIRoute } from 'astro'
import { getSingletonContentType } from '../../../../worker/adminRegistry.js'
import { recordVersion } from '../../../../worker/repositories/contentVersions.js'
import { recordAuditEvent } from '../../../../worker/repositories/auditLog.js'
import { getEnv } from '../../../../lib/env'
import { jsonResponse, readJsonBody } from '../../../../lib/http'

export const GET: APIRoute = async ({ params }) => {
  const handlers = getSingletonContentType(params.type as string)
  if (!handlers) return jsonResponse({ error: 'Unknown content type.' }, 404)

  const env = getEnv()
  if (!env.DB) return jsonResponse({ error: 'D1 DB binding is not configured.' }, 503)

  const data = await handlers.get(env.DB, { includeDrafts: true })
  return jsonResponse(data)
}

export const PUT: APIRoute = async ({ params, request, locals }) => {
  const type = params.type as string
  const handlers = getSingletonContentType(type)
  if (!handlers) return jsonResponse({ error: 'Unknown content type.' }, 404)

  const env = getEnv()
  if (!env.DB) return jsonResponse({ error: 'D1 DB binding is not configured.' }, 503)

  try {
    const payload = await readJsonBody(request)
    const data = await handlers.replace(env.DB, payload)
    await recordVersion(env.DB, { contentType: type, contentId: null, status: 'published', snapshot: data, createdBy: locals.adminEmail || null })
    await recordAuditEvent(env.DB, { actorEmail: locals.adminEmail || null, action: 'replace', entityType: type, entityId: null, metadata: {} })
    return jsonResponse(data)
  } catch (error) {
    const status = error && typeof error === 'object' && 'status' in error ? Number(error.status) : 500
    const message = error instanceof Error ? error.message : 'Unknown error'
    return jsonResponse({ error: message }, status)
  }
}
