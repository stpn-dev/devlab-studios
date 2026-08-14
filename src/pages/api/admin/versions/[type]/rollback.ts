import type { APIRoute } from 'astro'
import { getReplaceAllCollection, getPerItemCollection, getSingletonContentType } from '../../../../../worker/adminRegistry.js'
import { getVersion, recordVersion } from '../../../../../worker/repositories/contentVersions.js'
import { recordAuditEvent } from '../../../../../worker/repositories/auditLog.js'
import { getEnv } from '../../../../../lib/env'
import { jsonResponse, readJsonBody } from '../../../../../lib/http'

/**
 * Rollback never rewrites history — it re-applies an old snapshot as a
 * brand-new version, so the version list always reads chronologically.
 */
export const POST: APIRoute = async ({ params, request, locals }) => {
  const type = params.type as string
  const body = (await readJsonBody(request)) as { contentId?: string | null; versionNumber?: number }
  const contentId = body.contentId ?? null
  const versionNumber = Number(body.versionNumber)

  if (!Number.isFinite(versionNumber)) return jsonResponse({ error: 'versionNumber is required.' }, 400)

  const env = getEnv()
  if (!env.DB) return jsonResponse({ error: 'D1 DB binding is not configured.' }, 503)

  const version = await getVersion(env.DB, type, contentId, versionNumber)
  if (!version) return jsonResponse({ error: 'Version not found.' }, 404)

  const replaceAll = getReplaceAllCollection(type)
  const perItem = getPerItemCollection(type)
  const singleton = getSingletonContentType(type)

  let restored: unknown
  if (replaceAll) {
    await replaceAll.replaceAll(env.DB, version.snapshot)
    restored = await replaceAll.list(env.DB)
  } else if (perItem) {
    restored = await perItem.upsert(env.DB, version.snapshot)
  } else if (singleton) {
    restored = await singleton.replace(env.DB, version.snapshot)
  } else {
    return jsonResponse({ error: 'Unknown content type.' }, 404)
  }

  await recordVersion(env.DB, { contentType: type, contentId, status: version.status, snapshot: version.snapshot, createdBy: locals.adminEmail || null })
  await recordAuditEvent(env.DB, { actorEmail: locals.adminEmail || null, action: 'restore', entityType: type, entityId: contentId, metadata: { summary: `Restored ${type}${contentId ? ` ${contentId}` : ''} from version ${versionNumber}.`, restoredVersion: versionNumber } })

  return jsonResponse(restored)
}
