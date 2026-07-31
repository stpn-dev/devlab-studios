import type { APIRoute } from 'astro'
import { deleteProject, getProject, upsertProject } from '../../../../worker/repositories/projects.js'
import { getEnv } from '../../../../lib/env'
import { normalizeProjectMedia } from '../../../../lib/media'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

export const GET: APIRoute = async ({ params }) => {
  const env = getEnv()
  if (!env.DB) return jsonResponse({ error: 'D1 DB binding is not configured.' }, 503)

  const project = await getProject(env.DB, params.id as string, { includeDrafts: true })
  if (!project) return jsonResponse({ error: 'Project not found.' }, 404)
  return jsonResponse(normalizeProjectMedia(project, env))
}

export const PUT: APIRoute = async ({ params, request }) => {
  const env = getEnv()
  if (!env.DB) return jsonResponse({ error: 'D1 DB binding is not configured.' }, 503)

  try {
    const payload = await request.json()
    const project = await upsertProject(env.DB, { ...payload, id: params.id })
    return jsonResponse(normalizeProjectMedia(project, env))
  } catch (error) {
    const status = error && typeof error === 'object' && 'status' in error ? Number(error.status) : 500
    const message = error instanceof Error ? error.message : 'Unknown error'
    return jsonResponse({ error: message }, status)
  }
}

export const PATCH: APIRoute = async ({ params, request }) => {
  const env = getEnv()
  if (!env.DB) return jsonResponse({ error: 'D1 DB binding is not configured.' }, 503)

  try {
    const existing = await getProject(env.DB, params.id as string, { includeDrafts: true })
    if (!existing) return jsonResponse({ error: 'Project not found.' }, 404)
    const payload = await request.json()
    const project = await upsertProject(env.DB, { ...existing, ...payload, id: params.id })
    return jsonResponse(normalizeProjectMedia(project, env))
  } catch (error) {
    const status = error && typeof error === 'object' && 'status' in error ? Number(error.status) : 500
    const message = error instanceof Error ? error.message : 'Unknown error'
    return jsonResponse({ error: message }, status)
  }
}

export const DELETE: APIRoute = async ({ params }) => {
  const env = getEnv()
  if (!env.DB) return jsonResponse({ error: 'D1 DB binding is not configured.' }, 503)

  const deleted = await deleteProject(env.DB, params.id as string)
  return jsonResponse(deleted)
}
