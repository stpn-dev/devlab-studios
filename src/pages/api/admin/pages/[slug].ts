import type { APIRoute } from 'astro'
import { getPage, replacePage } from '../../../../worker/repositories/pages.js'
import { pageSingletonSchema } from '../../../../lib/schemas/singletons.js'
import { recordVersion } from '../../../../worker/repositories/contentVersions.js'
import { recordAuditEvent } from '../../../../worker/repositories/auditLog.js'
import { getEnv } from '../../../../lib/env'
import { jsonResponse, readJsonBody } from '../../../../lib/http'

export const GET: APIRoute = async ({ params }) => {
  const slug = params.slug as string
  const env = getEnv()
  if (!env.DB) return jsonResponse({ error: 'D1 DB binding is not configured.' }, 503)

  const page = await getPage(env.DB, slug, { includeDrafts: true })
  return jsonResponse(page || { slug, title: slug, status: 'draft', blocks: [] })
}

export const PUT: APIRoute = async ({ params, request, locals }) => {
  const slug = params.slug as string
  const env = getEnv()
  if (!env.DB) return jsonResponse({ error: 'D1 DB binding is not configured.' }, 503)

  const payload = await readJsonBody(request)
  const result = pageSingletonSchema.safeParse({ ...payload, slug })
  if (!result.success) return jsonResponse({ error: 'Validation failed.', issues: result.error.issues }, 400)

  const saved = await replacePage(env.DB, slug, result.data)
  await recordVersion(env.DB, { contentType: 'pages', contentId: slug, status: result.data.status, snapshot: saved, createdBy: locals.adminEmail || null })
  await recordAuditEvent(env.DB, { actorEmail: locals.adminEmail || null, action: 'replace', entityType: 'pages', entityId: slug, metadata: { blockCount: result.data.blocks.length } })

  return jsonResponse(saved)
}
