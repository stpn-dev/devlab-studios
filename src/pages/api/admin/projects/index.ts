import type { APIRoute } from 'astro'
import { listProjects, upsertProject } from '../../../../worker/repositories/projects.js'
import { recordVersion } from '../../../../worker/repositories/contentVersions.js'
import { recordAuditEvent } from '../../../../worker/repositories/auditLog.js'
import { getEnv } from '../../../../lib/env'
import { normalizeProjectMedia } from '../../../../lib/media'
import { jsonResponse, readJsonBody } from '../../../../lib/http'

export const GET: APIRoute = async () => {
  const env = getEnv()
  if (!env.DB) return jsonResponse({ error: 'D1 DB binding is not configured.' }, 503)

  const projects = await listProjects(env.DB, { includeDrafts: true })
  return jsonResponse(
    projects.map((project: Record<string, unknown>) => normalizeProjectMedia(project, env)),
    200,
    { 'X-Total-Count': String(projects.length) },
  )
}

export const POST: APIRoute = async ({ request, locals }) => {
  const env = getEnv()
  if (!env.DB) return jsonResponse({ error: 'D1 DB binding is not configured.' }, 503)

  try {
    const payload = await readJsonBody(request)
    const project = await upsertProject(env.DB, payload) as { id?: string; status?: string } | null
    if (!project) return jsonResponse({ error: 'Project could not be saved.' }, 500)
    await recordVersion(env.DB, { contentType: 'projects', contentId: project.id || null, status: project.status || 'draft', snapshot: project, createdBy: locals.adminEmail || null })
    await recordAuditEvent(env.DB, { actorEmail: locals.adminEmail || null, action: 'create', entityType: 'projects', entityId: project.id || null, metadata: {} })
    return jsonResponse(normalizeProjectMedia(project, env), 201)
  } catch (error) {
    const status = error && typeof error === 'object' && 'status' in error ? Number(error.status) : 500
    const message = error instanceof Error ? error.message : 'Unknown error'
    return jsonResponse({ error: message }, status)
  }
}
