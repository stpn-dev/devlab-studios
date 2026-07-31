import type { APIRoute } from 'astro'
import { listProjects, upsertProject } from '../../../../worker/repositories/projects.js'
import { getEnv } from '../../../../lib/env'
import { normalizeProjectMedia } from '../../../../lib/media'

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })
}

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

export const POST: APIRoute = async ({ request }) => {
  const env = getEnv()
  if (!env.DB) return jsonResponse({ error: 'D1 DB binding is not configured.' }, 503)

  try {
    const project = await upsertProject(env.DB, await request.json())
    return jsonResponse(normalizeProjectMedia(project, env), 201)
  } catch (error) {
    const status = error && typeof error === 'object' && 'status' in error ? Number(error.status) : 500
    const message = error instanceof Error ? error.message : 'Unknown error'
    return jsonResponse({ error: message }, status)
  }
}
