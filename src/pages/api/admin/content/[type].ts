import type { APIRoute } from 'astro'
import {
  getProfileContent,
  getResourcesContent,
  getSeoContent,
  getServicesContent,
  getSiteSettingsContent,
  replaceProfileContent,
  replaceResourcesContent,
  replaceSeoContent,
  replaceServicesContent,
  replaceSiteSettingsContent,
} from '../../../../worker/repositories/content.js'
import { getEnv } from '../../../../lib/env'

interface ContentTypeHandlers {
  get: (db: D1Database, options?: { includeDrafts?: boolean }) => Promise<unknown>
  replace: (db: D1Database, payload: unknown) => Promise<unknown>
}

const CONTENT_TYPES: Record<string, ContentTypeHandlers> = {
  services: { get: getServicesContent, replace: replaceServicesContent },
  resources: { get: getResourcesContent, replace: replaceResourcesContent },
  profile: { get: getProfileContent, replace: replaceProfileContent },
  'site-settings': { get: getSiteSettingsContent, replace: replaceSiteSettingsContent },
  seo: { get: getSeoContent, replace: replaceSeoContent },
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

export const GET: APIRoute = async ({ params }) => {
  const handlers = CONTENT_TYPES[params.type as string]
  if (!handlers) return jsonResponse({ error: 'Unknown content type.' }, 404)

  const env = getEnv()
  if (!env.DB) return jsonResponse({ error: 'D1 DB binding is not configured.' }, 503)

  const data = await handlers.get(env.DB, { includeDrafts: true })
  return jsonResponse(data)
}

export const PUT: APIRoute = async ({ params, request }) => {
  const handlers = CONTENT_TYPES[params.type as string]
  if (!handlers) return jsonResponse({ error: 'Unknown content type.' }, 404)

  const env = getEnv()
  if (!env.DB) return jsonResponse({ error: 'D1 DB binding is not configured.' }, 503)

  try {
    const payload = await request.json()
    const data = await handlers.replace(env.DB, payload)
    return jsonResponse(data)
  } catch (error) {
    const status = error && typeof error === 'object' && 'status' in error ? Number(error.status) : 500
    const message = error instanceof Error ? error.message : 'Unknown error'
    return jsonResponse({ error: message }, status)
  }
}
