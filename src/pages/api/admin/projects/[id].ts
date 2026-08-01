import type { APIRoute } from 'astro'
import { deleteProject, getProject, upsertProject } from '../../../../worker/repositories/projects.js'
import { recordVersion } from '../../../../worker/repositories/contentVersions.js'
import { recordAuditEvent } from '../../../../worker/repositories/auditLog.js'
import { projectRequestSchema } from '../../../../lib/schemas/collections'
import { getEnv } from '../../../../lib/env'
import { normalizeProjectMedia } from '../../../../lib/media'
import { jsonResponse, readJsonBody } from '../../../../lib/http'

export const GET: APIRoute = async ({ params }) => {
  const env = getEnv()
  if (!env.DB) return jsonResponse({ error: 'D1 DB binding is not configured.' }, 503)

  const project = await getProject(env.DB, params.id as string, { includeDrafts: true })
  if (!project) return jsonResponse({ error: 'Project not found.' }, 404)
  return jsonResponse(normalizeProjectMedia(project, env))
}

export const PUT: APIRoute = async ({ params, request, locals }) => {
  const env = getEnv()
  if (!env.DB) return jsonResponse({ error: 'D1 DB binding is not configured.' }, 503)

  try {
    const rawPayload = await readJsonBody(request)
    const result = projectRequestSchema.safeParse({ ...rawPayload, id: params.id })
    if (!result.success) return jsonResponse({ error: 'Validation failed.', issues: result.error.issues }, 400)

    const project = await upsertProject(env.DB, result.data) as { id?: string; status?: string } | null
    if (!project) return jsonResponse({ error: 'Project could not be saved.' }, 500)
    await recordVersion(env.DB, { contentType: 'projects', contentId: params.id as string, status: project.status || 'draft', snapshot: project, createdBy: locals.adminEmail || null })
    await recordAuditEvent(env.DB, { actorEmail: locals.adminEmail || null, action: 'update', entityType: 'projects', entityId: params.id as string, metadata: {} })
    return jsonResponse(normalizeProjectMedia(project, env))
  } catch (error) {
    const status = error && typeof error === 'object' && 'status' in error ? Number(error.status) : 500
    const message = error instanceof Error ? error.message : 'Unknown error'
    return jsonResponse({ error: message }, status)
  }
}

export const PATCH: APIRoute = async ({ params, request, locals }) => {
  const env = getEnv()
  if (!env.DB) return jsonResponse({ error: 'D1 DB binding is not configured.' }, 503)

  try {
    const existing = await getProject(env.DB, params.id as string, { includeDrafts: true })
    if (!existing) return jsonResponse({ error: 'Project not found.' }, 404)
    const payload = await readJsonBody(request)
    const result = projectRequestSchema.safeParse({ ...existing, ...payload, id: params.id })
    if (!result.success) return jsonResponse({ error: 'Validation failed.', issues: result.error.issues }, 400)

    const project = await upsertProject(env.DB, result.data) as { id?: string; status?: string } | null
    if (!project) return jsonResponse({ error: 'Project could not be saved.' }, 500)
    await recordVersion(env.DB, { contentType: 'projects', contentId: params.id as string, status: project.status || 'draft', snapshot: project, createdBy: locals.adminEmail || null })
    await recordAuditEvent(env.DB, { actorEmail: locals.adminEmail || null, action: 'update', entityType: 'projects', entityId: params.id as string, metadata: {} })
    return jsonResponse(normalizeProjectMedia(project, env))
  } catch (error) {
    const status = error && typeof error === 'object' && 'status' in error ? Number(error.status) : 500
    const message = error instanceof Error ? error.message : 'Unknown error'
    return jsonResponse({ error: message }, status)
  }
}

export const DELETE: APIRoute = async ({ params, locals }) => {
  const env = getEnv()
  if (!env.DB) return jsonResponse({ error: 'D1 DB binding is not configured.' }, 503)

  const deleted = await deleteProject(env.DB, params.id as string)
  await recordAuditEvent(env.DB, { actorEmail: locals.adminEmail || null, action: 'delete', entityType: 'projects', entityId: params.id as string, metadata: {} })
  return jsonResponse(deleted)
}
