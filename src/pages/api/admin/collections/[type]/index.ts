import type { APIRoute } from 'astro'
import { z } from 'zod'
import { getReplaceAllCollection, getPerItemCollection } from '../../../../../worker/adminRegistry.js'
import { recordVersion } from '../../../../../worker/repositories/contentVersions.js'
import { recordAuditEvent } from '../../../../../worker/repositories/auditLog.js'
import { getEnv } from '../../../../../lib/env'
import { jsonResponse, readJsonBody } from '../../../../../lib/http'

export const GET: APIRoute = async ({ params }) => {
  const type = params.type as string
  const env = getEnv()
  if (!env.DB) return jsonResponse({ error: 'D1 DB binding is not configured.' }, 503)

  const replaceAll = getReplaceAllCollection(type)
  if (replaceAll) return jsonResponse(await replaceAll.list(env.DB))

  const perItem = getPerItemCollection(type)
  if (perItem) return jsonResponse(await perItem.list(env.DB))

  return jsonResponse({ error: 'Unknown collection type.' }, 404)
}

export const PUT: APIRoute = async ({ params, request, locals }) => {
  const type = params.type as string
  const collection = getReplaceAllCollection(type)
  if (!collection) return jsonResponse({ error: 'Unknown replace-all collection type.' }, 404)

  const env = getEnv()
  if (!env.DB) return jsonResponse({ error: 'D1 DB binding is not configured.' }, 503)

  const payload = await readJsonBody(request)
  const items = Array.isArray(payload) ? payload : (payload as { items?: unknown[] }).items
  const result = z.array(collection.schema).safeParse(items)
  if (!result.success) return jsonResponse({ error: 'Validation failed.', issues: result.error.issues }, 400)

  await collection.replaceAll(env.DB, result.data)
  await recordVersion(env.DB, { contentType: type, contentId: null, status: 'published', snapshot: result.data, createdBy: locals.adminEmail || null })
  await recordAuditEvent(env.DB, { actorEmail: locals.adminEmail || null, action: 'replace', entityType: type, entityId: null, metadata: { count: result.data.length } })

  return jsonResponse(await collection.list(env.DB))
}

export const POST: APIRoute = async ({ params, request, locals }) => {
  const type = params.type as string
  const collection = getPerItemCollection(type)
  if (!collection) return jsonResponse({ error: 'Unknown per-item collection type.' }, 404)

  const env = getEnv()
  if (!env.DB) return jsonResponse({ error: 'D1 DB binding is not configured.' }, 503)

  const payload = await readJsonBody(request)
  const result = collection.schema.safeParse(payload)
  if (!result.success) return jsonResponse({ error: 'Validation failed.', issues: result.error.issues }, 400)

  const isUpdate = Boolean((payload as { id?: string }).id)

  try {
    const saved = await collection.upsert(env.DB, result.data)
    const savedId = (saved as { id?: string } | null)?.id || null
    await recordVersion(env.DB, { contentType: type, contentId: savedId, status: (saved as { status?: string } | null)?.status || 'draft', snapshot: saved, createdBy: locals.adminEmail || null })
    await recordAuditEvent(env.DB, { actorEmail: locals.adminEmail || null, action: isUpdate ? 'update' : 'create', entityType: type, entityId: savedId, metadata: {} })
    return jsonResponse(saved, isUpdate ? 200 : 201)
  } catch (error) {
    const status = error && typeof error === 'object' && 'status' in error ? Number((error as { status: number }).status) : 500
    const message = error instanceof Error ? error.message : 'Unknown error'
    return jsonResponse({ error: message }, status)
  }
}
